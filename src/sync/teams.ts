import type { SamsClient } from "sams-rest-v2";
import type { ClubSubscription } from "../config/schema";
import type { DomainEventPublisher } from "../events/publisher";
import { createEventEnvelope, SamsEventType, snapshotVersion } from "../events/schemas";
import { publicLogoUrl } from "../logos/preserve";
import { buildClubSeasonTeamsProjection, type TeamRecord } from "../projections/club-season-teams";
import {
  buildClubSeasonRostersProjection,
  buildTeamRosterProjection,
  rosterProjectionSnapshot,
} from "../projections/team-roster";
import { isSamsNotFoundResult } from "../sams/not-found";
import { unwrapSamsResult } from "../sams/result";
import { mapRosterOfficials, mapRosterPlayers } from "./roster-mapping";
import type { SamsRepositories } from "@lib/db/repositories/create-sams-repositories";
import { unixTtlFromNow } from "@lib/db/repository-utils";
import { slugify } from "@utils/slugify";

export async function syncTeams(args: {
  sams: SamsClient;
  repos: SamsRepositories;
  publisher: DomainEventPublisher;
  clubs: ClubSubscription[];
  publicLogoBaseUrl: string;
  sourceSyncId: string;
  sleep?: (ms: number) => Promise<void>;
}): Promise<{
  teamsCount: number;
  changedTeamUuids: string[];
  seasonUuid?: string;
  seasonName?: string;
}> {
  const sleep = args.sleep ?? defaultSleep;
  const startedAt = Date.now();
  if (args.clubs.length === 0) {
    await args.repos.syncMeta.put({
      job: "teams",
      status: "success",
      durationMs: Date.now() - startedAt,
      itemCount: 0,
    });
    return { teamsCount: 0, changedTeamUuids: [] };
  }

  const storedClubs = await args.repos.clubs.listAll();
  const configured = storedClubs.filter((club) =>
    args.clubs.some((subscription) => subscription.uuid === club.sportsclubUuid),
  );
  if (configured.length === 0) {
    throw new Error(
      "Configured clubs are not present in the provider data table. Run clubs sync first.",
    );
  }

  const sportsclubUuids = new Set(configured.map((club) => club.sportsclubUuid));
  const associationUuids = [
    ...new Set(configured.flatMap((club) => (club.associationUuid ? [club.associationUuid] : []))),
  ];
  if (associationUuids.length === 0) {
    throw new Error("Configured clubs have no associationUuid");
  }

  const { data: seasons, error: seasonsError } = unwrapSamsResult(
    await args.sams.getAllSeasons({}),
  );
  if (seasonsError) {
    throw new Error("Failed to fetch seasons");
  }
  const currentSeason = seasons?.find((season) => season.currentSeason);
  if (!currentSeason?.uuid || !currentSeason.name) {
    throw new Error("Current season not found");
  }
  const seasonUuid = currentSeason.uuid;
  const seasonName = currentSeason.name;

  await args.repos.seasons.upsert({
    uuid: seasonUuid,
    name: seasonName,
    currentSeason: true,
    ttl: unixTtlFromNow(30),
  });

  const hierarchyLevelByUuid = new Map<string, number>();
  const allLeagues = [];
  for (const associationUuid of associationUuids) {
    let hierarchyPage = 0;
    let hasMoreHierarchies = true;
    while (hasMoreHierarchies) {
      const { data: hierarchyData } = await args.sams.getAllLeagueHierarchies({
        query: {
          association: associationUuid,
          "for-season": seasonUuid,
          page: hierarchyPage,
          size: 100,
        },
      });
      for (const hierarchy of hierarchyData?.content ?? []) {
        if (hierarchy.uuid && hierarchy.level !== undefined) {
          hierarchyLevelByUuid.set(hierarchy.uuid, hierarchy.level);
        }
      }
      hasMoreHierarchies = hierarchyData?.last !== true;
      hierarchyPage += 1;
    }

    let leaguePage = 0;
    let hasMoreLeagues = true;
    while (hasMoreLeagues) {
      const { data: leagueData } = await args.sams.getAllLeagues({
        query: { association: associationUuid, page: leaguePage, size: 100 },
      });
      const currentSeasonLeagues = (leagueData?.content ?? []).filter(
        (league) => league.seasonUuid === seasonUuid,
      );
      allLeagues.push(...currentSeasonLeagues);
      leaguePage += 1;
      hasMoreLeagues = leagueData?.last !== true;
      if (hasMoreLeagues) {
        await sleep(500);
      }
    }
  }

  for (const league of allLeagues) {
    if (!league.uuid || !league.name) {
      continue;
    }
    await args.repos.leagues.upsert({
      uuid: league.uuid,
      name: league.name,
      associationUuid: league.associationUuid ?? associationUuids[0] ?? "",
      seasonUuid: seasonUuid,
      ...(league.leagueHierarchyUuid ? { leagueHierarchyUuid: league.leagueHierarchyUuid } : {}),
      ...(league.leagueHierarchyUuid && hierarchyLevelByUuid.has(league.leagueHierarchyUuid)
        ? { leagueHierarchyLevel: hierarchyLevelByUuid.get(league.leagueHierarchyUuid) }
        : {}),
      ttl: unixTtlFromNow(30),
    });
  }

  const previousTeams = await args.repos.teams.listAll();
  const previousHashByUuid = new Map(
    previousTeams.map((team) => [team.uuid, snapshotVersion(team)]),
  );
  const previousRosters = await args.repos.rosters.listAll();
  const previousRosterHashByTeamUuid = new Map(
    previousRosters.map((roster) => [roster.teamUuid, rosterProjectionSnapshot(roster)]),
  );
  const syncedTeamUuids = new Set<string>();
  const changedTeamUuids: string[] = [];
  const changedRosterTeamUuids = new Set<string>();
  const teamContextByUuid = new Map<string, TeamRecord>(
    previousTeams.map((team) => [
      team.uuid,
      {
        uuid: team.uuid,
        name: team.name,
        nameSlug: team.nameSlug,
        sportsclubUuid: team.sportsclubUuid,
        leagueUuid: team.leagueUuid,
        leagueName: team.leagueName,
        ...(team.leagueHierarchyLevel !== undefined
          ? { leagueHierarchyLevel: team.leagueHierarchyLevel }
          : {}),
        seasonUuid: seasonUuid,
        seasonName,
      },
    ]),
  );

  for (const league of allLeagues) {
    if (!league.uuid || !league.name) {
      continue;
    }
    let teamPage = 0;
    let hasMoreTeams = true;
    while (hasMoreTeams) {
      const { data: teamData } = await args.sams.getTeamsForLeague({
        path: { uuid: league.uuid },
        query: { page: teamPage, size: 100 },
      });
      for (const team of teamData?.content ?? []) {
        if (
          team.masterTeamUuid ||
          !team.uuid ||
          !team.name ||
          !team.sportsclubUuid ||
          !team.associationUuid
        ) {
          continue;
        }
        if (!sportsclubUuids.has(team.sportsclubUuid)) {
          continue;
        }
        const leagueHierarchyLevel = league.leagueHierarchyUuid
          ? hierarchyLevelByUuid.get(league.leagueHierarchyUuid)
          : undefined;
        const item = {
          uuid: team.uuid,
          name: team.name,
          nameSlug: slugify(team.name),
          sportsclubUuid: team.sportsclubUuid,
          associationUuid: team.associationUuid,
          leagueUuid: league.uuid,
          leagueName: league.name,
          ...(leagueHierarchyLevel !== undefined ? { leagueHierarchyLevel } : {}),
          seasonUuid: seasonUuid,
          seasonName: seasonName,
          ttl: unixTtlFromNow(365),
        };
        await args.repos.teams.upsert(item);
        syncedTeamUuids.add(team.uuid);
        teamContextByUuid.set(team.uuid, item);
        if (snapshotVersion(item) !== previousHashByUuid.get(team.uuid)) {
          changedTeamUuids.push(team.uuid);
        }

        const rosterResult = await args.sams.getTeamRosterByTeamUuid({
          path: { uuid: team.uuid },
        });
        if (isSamsNotFoundResult(rosterResult)) {
          // SAMS 404 is unreliable for rosters — keep the stored squad like club logos.
        } else if ("error" in rosterResult && rosterResult.error) {
          // Transient failures should not wipe roster data.
        } else {
          const rosterData = rosterResult.data ?? { players: [], officials: [] };
          const players = mapRosterPlayers(team.uuid, rosterData.players ?? []);
          const officials = mapRosterOfficials(team.uuid, rosterData.officials ?? []);
          const upsertedRoster = await args.repos.rosters.upsert({
            teamUuid: team.uuid,
            players,
            officials,
            ttl: unixTtlFromNow(365),
          });
          if (
            rosterProjectionSnapshot(upsertedRoster) !== previousRosterHashByTeamUuid.get(team.uuid)
          ) {
            changedRosterTeamUuids.add(team.uuid);
          }
        }
        await sleep(500);
      }
      teamPage += 1;
      hasMoreTeams = teamData?.last !== true;
      if (hasMoreTeams) {
        await sleep(500);
      }
    }
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  for (const existing of previousTeams) {
    if (!syncedTeamUuids.has(existing.uuid) && existing.updatedAt < oneHourAgo) {
      if (previousRosterHashByTeamUuid.has(existing.uuid)) {
        changedRosterTeamUuids.add(existing.uuid);
        teamContextByUuid.set(existing.uuid, {
          uuid: existing.uuid,
          name: existing.name,
          nameSlug: existing.nameSlug,
          sportsclubUuid: existing.sportsclubUuid,
          leagueUuid: existing.leagueUuid,
          leagueName: existing.leagueName,
          ...(existing.leagueHierarchyLevel !== undefined
            ? { leagueHierarchyLevel: existing.leagueHierarchyLevel }
            : {}),
          seasonUuid: existing.seasonUuid,
          seasonName: existing.seasonName,
        });
      }
      await args.repos.teams.delete(existing.uuid);
      await args.repos.rosters.delete(existing.uuid);
    }
  }

  const countsBySportsclubUuid: Record<string, number> = {};
  for (const uuid of sportsclubUuids) {
    countsBySportsclubUuid[uuid] = [...syncedTeamUuids].filter((teamUuid) => {
      const previous = previousTeams.find((team) => team.uuid === teamUuid);
      return previous?.sportsclubUuid === uuid;
    }).length;
  }

  const events = [
    createEventEnvelope({
      type: SamsEventType.teamsSyncCompleted,
      sourceSyncId: args.sourceSyncId,
      payload: {
        seasonUuid: seasonUuid,
        seasonName,
        teamsCount: syncedTeamUuids.size,
        countsBySportsclubUuid,
        changedTeamUuids,
      },
    }),
  ];

  const season = { uuid: seasonUuid, name: seasonName, current: true };

  for (const club of configured) {
    const teams = await args.repos.teams.listBySportsclub(club.sportsclubUuid);
    events.push(
      createEventEnvelope({
        type: SamsEventType.clubSeasonTeamsUpdated,
        sourceSyncId: args.sourceSyncId,
        payload: buildClubSeasonTeamsProjection({
          club: {
            sportsclubUuid: club.sportsclubUuid,
            name: club.name,
            nameSlug: club.nameSlug,
            associationUuid: club.associationUuid,
            associationName: club.associationName,
            logoUrl: publicLogoUrl({
              publicBaseUrl: args.publicLogoBaseUrl,
              logoS3Key: club.logoS3Key,
              fallbackImageLink: club.logoImageLink,
            }),
          },
          teams,
          season,
        }),
      }),
    );

    const rostersByTeamUuid = new Map(
      (
        await Promise.all(
          teams.map(async (team) => {
            const roster = await args.repos.rosters.get(team.uuid);
            return roster ? ([team.uuid, roster] as const) : undefined;
          }),
        )
      ).filter((entry) => entry !== undefined),
    );
    events.push(
      createEventEnvelope({
        type: SamsEventType.clubSeasonRostersUpdated,
        sourceSyncId: args.sourceSyncId,
        payload: buildClubSeasonRostersProjection({
          club: {
            sportsclubUuid: club.sportsclubUuid,
            name: club.name,
            nameSlug: club.nameSlug,
            associationUuid: club.associationUuid,
            associationName: club.associationName,
            logoUrl: publicLogoUrl({
              publicBaseUrl: args.publicLogoBaseUrl,
              logoS3Key: club.logoS3Key,
              fallbackImageLink: club.logoImageLink,
            }),
          },
          teams,
          rostersByTeamUuid,
          season,
        }),
      }),
    );
  }

  for (const teamUuid of changedRosterTeamUuids) {
    const team = teamContextByUuid.get(teamUuid);
    if (!team || !sportsclubUuids.has(team.sportsclubUuid)) {
      continue;
    }
    const roster = await args.repos.rosters.get(teamUuid);
    events.push(
      createEventEnvelope({
        type: SamsEventType.teamRosterUpdated,
        sourceSyncId: args.sourceSyncId,
        payload: buildTeamRosterProjection({
          team,
          roster,
          season,
        }),
      }),
    );
  }

  await args.publisher.publish(events);
  await args.repos.syncMeta.put({
    job: "teams",
    status: "success",
    durationMs: Date.now() - startedAt,
    itemCount: syncedTeamUuids.size,
  });

  return {
    teamsCount: syncedTeamUuids.size,
    changedTeamUuids,
    seasonUuid: seasonUuid,
    seasonName: seasonName,
  };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
