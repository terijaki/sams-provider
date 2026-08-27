import { createHash } from "node:crypto";
import type { SamsClient } from "sams-rest-v2";
import type { ClubSubscription } from "../config/schema";
import type { DomainEventPublisher } from "../events/publisher";
import { createEventEnvelope, EventType, snapshotVersion } from "../events/schemas";
import { publicLogoUrl } from "../logos/preserve";
import { buildClubSeasonTeamsProjection } from "../projections/club-season-teams";
import { unwrapSamsResult } from "../sams/result";
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

  await args.repos.seasons.upsert({
    uuid: currentSeason.uuid,
    name: currentSeason.name,
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
          "for-season": currentSeason.uuid,
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
        (league) => league.seasonUuid === currentSeason.uuid,
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
      seasonUuid: currentSeason.uuid,
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
  const syncedTeamUuids = new Set<string>();
  const changedTeamUuids: string[] = [];

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
          seasonUuid: currentSeason.uuid,
          seasonName: currentSeason.name,
          ttl: unixTtlFromNow(365),
        };
        await args.repos.teams.upsert(item);
        syncedTeamUuids.add(team.uuid);
        if (snapshotVersion(item) !== previousHashByUuid.get(team.uuid)) {
          changedTeamUuids.push(team.uuid);
        }

        try {
          const { data: rosterData, error: rosterError } = unwrapSamsResult(
            await args.sams.getTeamRosterByTeamUuid({
              path: { uuid: team.uuid },
            }),
          );
          if (rosterError || !rosterData) {
            throw rosterError ?? new Error("empty roster");
          }
          await args.repos.rosters.upsert({
            teamUuid: team.uuid,
            players: mapRosterPlayers(team.uuid, rosterData.players ?? []),
            officials: mapRosterOfficials(team.uuid, rosterData.officials ?? []),
            ttl: unixTtlFromNow(365),
          });
        } catch {
          await args.repos.rosters.delete(team.uuid);
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
      type: EventType.teamsSyncCompleted,
      sourceSyncId: args.sourceSyncId,
      payload: {
        seasonUuid: currentSeason.uuid,
        seasonName: currentSeason.name,
        teamsCount: syncedTeamUuids.size,
        countsBySportsclubUuid,
        changedTeamUuids,
      },
    }),
  ];

  for (const club of configured) {
    const teams = await args.repos.teams.listBySportsclub(club.sportsclubUuid);
    events.push(
      createEventEnvelope({
        type: EventType.clubSeasonTeamsUpdated,
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
          season: { uuid: currentSeason.uuid, name: currentSeason.name, current: true },
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
    seasonUuid: currentSeason.uuid,
    seasonName: currentSeason.name,
  };
}

function mapRosterPlayers(
  teamUuid: string,
  players: Array<{
    uuid?: string;
    name?: string | null;
    jerseyNumber?: number | null;
    position?: string | null;
    portraitImageLink?: string | null;
  }>,
) {
  const mapped = [];
  for (const player of players) {
    if (!player.name?.trim()) {
      continue;
    }
    mapped.push({
      uuid:
        player.uuid ??
        pseudoRosterUuid(teamUuid, "player", player.name, player.jerseyNumber ?? undefined),
      name: player.name,
      ...(player.jerseyNumber != null ? { jerseyNumber: player.jerseyNumber } : {}),
      ...(player.position ? { position: player.position } : {}),
      ...(player.portraitImageLink ? { portraitImageLink: player.portraitImageLink } : {}),
    });
  }
  return mapped;
}

function mapRosterOfficials(
  teamUuid: string,
  officials: Array<{ uuid?: string; name?: string | null; role?: string | null }>,
) {
  const mapped = [];
  for (const official of officials) {
    if (!official.name?.trim()) {
      continue;
    }
    mapped.push({
      uuid:
        official.uuid ??
        pseudoRosterUuid(teamUuid, "official", official.name, official.role ?? undefined),
      name: official.name,
      ...(official.role ? { role: official.role } : {}),
    });
  }
  return mapped;
}

function pseudoRosterUuid(
  teamUuid: string,
  kind: "player" | "official",
  ...parts: (string | number | undefined)[]
): string {
  const input = [teamUuid, kind, ...parts.map((part) => String(part ?? ""))].join("|");
  const hex = createHash("sha256").update(input).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
