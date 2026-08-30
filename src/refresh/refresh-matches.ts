import type { ClubSubscription, MatchRefreshPolicy } from "../config/schema";
import type { DomainEventPublisher } from "../events/publisher";
import { createEventEnvelope, SamsEventType, type SamsEvent } from "../events/schemas";
import {
  buildMatchBlocks,
  dueRefreshDecisions,
  planMatchRefresh,
  type PlannedMatch,
} from "../refresh/planner";
import { SNAPSHOT_REFRESH_STATE, type MatchRefreshMode } from "../refresh/mode";
import {
  buildLeagueRankingProjection,
  type LeagueRankingRepos,
  type LeagueRankingSams,
  type SamsLeagueRankingEntry,
} from "../projections/league-ranking";
import { buildClubMatchScheduleEvents } from "../projections/club-match-schedule";
import { buildMatchBlockProjection, type SamsLeagueMatch } from "../projections/match-block";
import { unwrapSamsResult } from "../sams/result";
import type { SamsMatchInput } from "@lib/db/schemas";
import type { SamsMatchUpsertInput } from "@lib/db/repositories/sams-matches-repository";
import { unixTtlFromNow } from "@lib/db/repository-utils";

export type MatchRefreshSams = LeagueRankingSams & {
  getAllSeasons(args: object): Promise<{
    data?: Array<{ uuid?: string; name?: string; currentSeason?: boolean }>;
  }>;
  getAllLeagueMatches(args: {
    query: {
      page: number;
      size: number;
      "for-sportsclub": string;
      "for-season": string;
    };
  }): Promise<{
    data?: {
      content?: Array<{
        uuid?: string;
        date?: string | null;
        time?: string | null;
        leagueUuid?: string | null;
        seasonUuid?: string | null;
        location?: { uuid?: string | null } | null;
        _embedded?: {
          team1?: { sportsclubUuid?: string | null } | null;
          team2?: { sportsclubUuid?: string | null } | null;
        } | null;
        results?: { winner?: string | null } | null;
      }>;
      last?: boolean;
    };
  }>;
  getLeagueMatchByUuid(args: { path: { uuid: string } }): Promise<{
    data?: SamsLeagueMatch;
    error?: unknown;
  }>;
  getRankingsForLeague(args: {
    path: { uuid: string };
    query: { page: number; size: number };
  }): Promise<{
    data?: { content?: SamsLeagueRankingEntry[] };
  }>;
};

export type MatchRefreshRepos = LeagueRankingRepos & {
  matches: {
    listAll(): Promise<SamsMatchInput[]>;
    upsert(input: SamsMatchUpsertInput): Promise<SamsMatchInput>;
  };
  syncMeta: {
    put(input: {
      job: string;
      status: "success" | "failure";
      durationMs: number;
      itemCount?: number;
      errorMessage?: string;
    }): Promise<unknown>;
  };
};

export async function refreshMatchesAndRankings(args: {
  sams: MatchRefreshSams;
  repos: MatchRefreshRepos;
  publisher: DomainEventPublisher;
  clubs: ClubSubscription[];
  policy: MatchRefreshPolicy;
  publicLogoBaseUrl: string;
  sourceSyncId: string;
  mode?: MatchRefreshMode;
  now?: Date;
  sleep?: (ms: number) => Promise<void>;
}): Promise<{ dueBlocks: number; published: number; mode: MatchRefreshMode }> {
  const mode = args.mode ?? "adaptive";
  const sleep = args.sleep ?? defaultSleep;
  const startedAt = Date.now();
  if (args.clubs.length === 0) {
    return { dueBlocks: 0, published: 0, mode };
  }

  const storedMatches = await args.repos.matches.listAll();
  let planned: PlannedMatch[] = storedMatches.map(toPlannedMatch);

  let bootstrapped = false;
  if (mode === "snapshot" || planned.length === 0) {
    planned = await fetchScheduleForClubs({ ...args, sleep });
    bootstrapped = mode === "adaptive";
  }

  if (mode === "snapshot") {
    const events = await buildSnapshotEvents({
      ...args,
      planned,
      sleep,
    });
    await args.publisher.publish(events);
    await args.repos.syncMeta.put({
      job: "match-snapshot",
      status: "success",
      durationMs: Date.now() - startedAt,
      itemCount: events.length,
    });
    return { dueBlocks: 0, published: events.length, mode };
  }

  const blocks = buildMatchBlocks(planned);
  const decisions = dueRefreshDecisions(
    planMatchRefresh({ blocks, now: args.now, policy: args.policy }),
  );
  const events: SamsEvent[] = [];
  const affectedClubUuids = new Set<string>();

  if (bootstrapped) {
    for (const club of args.clubs) {
      affectedClubUuids.add(club.uuid);
    }
  }

  for (const decision of decisions) {
    const block = blocks.find((item) => item.id === decision.matchBlockId);
    if (!block) {
      continue;
    }
    const rawMatches = [];
    for (const matchUuid of block.matchUuids) {
      const { data, error } = unwrapSamsResult(
        await args.sams.getLeagueMatchByUuid({ path: { uuid: matchUuid } }),
      );
      if (error || !data?.uuid) {
        continue;
      }
      const sportsclubUuids = [
        ...new Set(
          [data._embedded?.team1?.sportsclubUuid, data._embedded?.team2?.sportsclubUuid].filter(
            (uuid): uuid is string => !!uuid,
          ),
        ),
      ];
      await args.repos.matches.upsert({
        uuid: data.uuid,
        ...(data.date ? { date: data.date } : {}),
        ...(data.time ? { time: data.time } : {}),
        ...(data.leagueUuid ? { leagueUuid: data.leagueUuid } : {}),
        ...(data.seasonUuid ? { seasonUuid: data.seasonUuid } : {}),
        ...(data.location?.uuid ? { locationUuid: data.location.uuid } : {}),
        sportsclubUuids,
        hasResult: Boolean(data.results?.winner),
        matchBlockId: block.id,
        rawJson: JSON.stringify(data),
        ttl: unixTtlFromNow(30),
      });
      rawMatches.push(data);
      await sleep(200);
    }

    const matches = await buildMatchBlockProjection({
      matches: rawMatches,
      repos: args.repos,
      publicLogoBaseUrl: args.publicLogoBaseUrl,
    });

    const cachedAt = new Date().toISOString();
    events.push(
      createEventEnvelope({
        type: SamsEventType.matchBlockUpdated,
        sourceSyncId: args.sourceSyncId,
        payload: {
          matchBlockId: block.id,
          leagueUuid: block.leagueUuid,
          date: block.date,
          refreshState: decision.state,
          cachedAt,
          nextRefreshAfter: decision.nextRefreshAfter,
          isStale: false,
          matchUuids: block.matchUuids,
          matches,
        },
      }),
    );

    if (decision.shouldRefreshRankings) {
      const { data: rankingData } = await args.sams.getRankingsForLeague({
        path: { uuid: block.leagueUuid },
        query: { page: 0, size: 100 },
      });
      const seasonUuid = rawMatches[0]?.seasonUuid ?? storedMatches[0]?.seasonUuid ?? "unknown";
      const ranking = await buildLeagueRankingProjection({
        entries: rankingData?.content ?? [],
        repos: args.repos,
        sams: args.sams,
        publicLogoBaseUrl: args.publicLogoBaseUrl,
        leagueUuid: block.leagueUuid,
        seasonUuid,
        sleep,
      });
      events.push(
        createEventEnvelope({
          type: SamsEventType.leagueRankingUpdated,
          sourceSyncId: args.sourceSyncId,
          payload: {
            leagueUuid: block.leagueUuid,
            ...(ranking.leagueName ? { leagueName: ranking.leagueName } : {}),
            seasonUuid,
            ...(ranking.seasonName ? { seasonName: ranking.seasonName } : {}),
            cachedAt,
            refreshState: decision.state,
            nextRefreshAfter: decision.nextRefreshAfter,
            isStale: false,
            sourceMatchBlockId: block.id,
            entries: ranking.entries,
          },
        }),
      );
    }

    for (const clubUuid of block.sportsclubUuids) {
      if (args.clubs.some((club) => club.uuid === clubUuid)) {
        affectedClubUuids.add(clubUuid);
      }
    }
  }

  if (affectedClubUuids.size > 0) {
    const scheduleEvents = await scheduleEventsForClubs({
      ...args,
      clubUuids: affectedClubUuids,
    });
    events.push(...scheduleEvents);
  }

  await args.publisher.publish(events);
  await args.repos.syncMeta.put({
    job: "match-refresh",
    status: "success",
    durationMs: Date.now() - startedAt,
    itemCount: events.length,
  });
  return { dueBlocks: decisions.length, published: events.length, mode };
}

async function buildSnapshotEvents(args: {
  sams: MatchRefreshSams;
  repos: MatchRefreshRepos;
  clubs: ClubSubscription[];
  publicLogoBaseUrl: string;
  sourceSyncId: string;
  planned: PlannedMatch[];
  now?: Date;
  sleep: (ms: number) => Promise<void>;
}): Promise<SamsEvent[]> {
  const events: SamsEvent[] = [];
  const season = await resolveCurrentSeason(args);
  const cachedAt = new Date().toISOString();
  const leagueUuids = [
    ...new Set(args.planned.flatMap((match) => (match.leagueUuid ? [match.leagueUuid] : []))),
  ].sort();

  if (season) {
    for (const leagueUuid of leagueUuids) {
      const { data: rankingData } = await args.sams.getRankingsForLeague({
        path: { uuid: leagueUuid },
        query: { page: 0, size: 100 },
      });
      const ranking = await buildLeagueRankingProjection({
        entries: rankingData?.content ?? [],
        repos: args.repos,
        sams: args.sams,
        publicLogoBaseUrl: args.publicLogoBaseUrl,
        leagueUuid,
        seasonUuid: season.uuid,
        sleep: args.sleep,
      });
      events.push(
        createEventEnvelope({
          type: SamsEventType.leagueRankingUpdated,
          sourceSyncId: args.sourceSyncId,
          payload: {
            leagueUuid,
            ...(ranking.leagueName ? { leagueName: ranking.leagueName } : {}),
            seasonUuid: season.uuid,
            ...(ranking.seasonName ? { seasonName: ranking.seasonName } : {}),
            cachedAt,
            refreshState: SNAPSHOT_REFRESH_STATE,
            nextRefreshAfter: null,
            isStale: false,
            entries: ranking.entries,
          },
        }),
      );
      await args.sleep(200);
    }
  }

  const clubUuids = new Set(args.clubs.map((club) => club.uuid));
  const scheduleEvents = await scheduleEventsForClubs({
    ...args,
    clubUuids,
  });
  events.push(...scheduleEvents);
  return events;
}

async function scheduleEventsForClubs(args: {
  repos: MatchRefreshRepos;
  clubs: ClubSubscription[];
  publicLogoBaseUrl: string;
  sourceSyncId: string;
  sams: MatchRefreshSams;
  clubUuids: Iterable<string>;
  now?: Date;
}): Promise<SamsEvent[]> {
  const season = await resolveCurrentSeason(args);
  if (!season) {
    return [];
  }
  return buildClubMatchScheduleEvents({
    clubUuids: args.clubUuids,
    clubs: args.clubs,
    storedMatches: await args.repos.matches.listAll(),
    repos: args.repos,
    publicLogoBaseUrl: args.publicLogoBaseUrl,
    season,
    sourceSyncId: args.sourceSyncId,
    cachedAt: new Date().toISOString(),
    now: args.now,
  });
}

function toPlannedMatch(match: SamsMatchInput): PlannedMatch {
  return {
    uuid: match.uuid,
    date: match.date ?? null,
    time: match.time ?? null,
    leagueUuid: match.leagueUuid ?? null,
    locationUuid: match.locationUuid,
    hasResult: match.hasResult,
    sportsclubUuids: match.sportsclubUuids,
  };
}

async function fetchScheduleForClubs(args: {
  sams: MatchRefreshSams;
  clubs: ClubSubscription[];
  repos: MatchRefreshRepos;
  sleep: (ms: number) => Promise<void>;
}): Promise<PlannedMatch[]> {
  const planned: PlannedMatch[] = [];
  const { data: seasons } = await args.sams.getAllSeasons({});
  const currentSeason = seasons?.find((season) => season.currentSeason);
  if (!currentSeason?.uuid) {
    return planned;
  }

  for (const club of args.clubs) {
    let page = 0;
    let hasMore = true;
    while (hasMore) {
      const { data } = await args.sams.getAllLeagueMatches({
        query: {
          page,
          size: 100,
          "for-sportsclub": club.uuid,
          "for-season": currentSeason.uuid,
        },
      });
      for (const match of data?.content ?? []) {
        if (!match.uuid) {
          continue;
        }
        const sportsclubUuids = [
          ...new Set(
            [match._embedded?.team1?.sportsclubUuid, match._embedded?.team2?.sportsclubUuid].filter(
              (uuid): uuid is string => !!uuid,
            ),
          ),
        ];
        await args.repos.matches.upsert({
          uuid: match.uuid,
          ...(match.date ? { date: match.date } : {}),
          ...(match.time ? { time: match.time } : {}),
          ...(match.leagueUuid ? { leagueUuid: match.leagueUuid } : {}),
          ...(match.seasonUuid ? { seasonUuid: match.seasonUuid } : {}),
          ...(match.location?.uuid ? { locationUuid: match.location.uuid } : {}),
          sportsclubUuids,
          hasResult: Boolean(match.results?.winner),
          rawJson: JSON.stringify(match),
          ttl: unixTtlFromNow(30),
        });
        planned.push({
          uuid: match.uuid,
          date: match.date ?? null,
          time: match.time ?? null,
          leagueUuid: match.leagueUuid ?? null,
          locationUuid: match.location?.uuid,
          hasResult: Boolean(match.results?.winner),
          sportsclubUuids,
        });
      }
      page += 1;
      hasMore = data?.last !== true;
      if (hasMore) {
        await args.sleep(500);
      }
    }
  }
  return planned;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveCurrentSeason(args: {
  sams: MatchRefreshSams;
  repos: MatchRefreshRepos;
}): Promise<{ uuid: string; name: string; current: boolean } | undefined> {
  const storedSeasons = await args.repos.seasons.listAll();
  const storedCurrent = storedSeasons.find((season) => season.currentSeason);
  if (storedCurrent?.uuid && storedCurrent.name) {
    return { uuid: storedCurrent.uuid, name: storedCurrent.name, current: true };
  }

  const { data: seasons } = await args.sams.getAllSeasons({});
  const currentSeason = seasons?.find((season) => season.currentSeason);
  if (currentSeason?.uuid && currentSeason.name) {
    return { uuid: currentSeason.uuid, name: currentSeason.name, current: true };
  }
  return undefined;
}
