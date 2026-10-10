import type { ClubSubscription, MatchRefreshPolicy } from "../config/schema";
import type { DomainEventPublisher, PublishBatchItem } from "../events/publisher";
import { createEventEnvelope, SamsEventType, type SamsEvent } from "../events/schemas";
import {
  buildMatchBlocks,
  dueRefreshDecisions,
  planMatchRefresh,
  rankingDueLeagueDecisions,
  type MatchBlock,
  type PlannedMatch,
  type RefreshDecision,
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
import type { SamsMatchInput, SamsSyncMetaInput } from "@lib/db/schemas";
import type { SamsMatchUpsertInput } from "@lib/db/repositories/sams-matches-repository";
import { unixTtlFromNow } from "@lib/db/repository-utils";

const LEAGUE_SCHEDULE_STALE_MS = 12 * 60 * 60 * 1000;

export type MatchRefreshSams = LeagueRankingSams & {
  getAllSeasons(args: object): Promise<{
    data?: Array<{ uuid?: string; name?: string; currentSeason?: boolean }>;
  }>;
  getAllLeagueMatches(args: {
    query: {
      page: number;
      size: number;
      "for-sportsclub"?: string;
      "for-league"?: string;
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
        host?: string | null;
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
    get(job: string): Promise<SamsSyncMetaInput | null>;
    put(input: {
      job: string;
      status: "success" | "failure";
      durationMs: number;
      itemCount?: number;
      errorMessage?: string;
    }): Promise<unknown>;
  };
};

type LeagueMatchListItem = {
  uuid?: string;
  date?: string | null;
  time?: string | null;
  leagueUuid?: string | null;
  seasonUuid?: string | null;
  host?: string | null;
  location?: { uuid?: string | null } | null;
  _embedded?: {
    team1?: { sportsclubUuid?: string | null } | null;
    team2?: { sportsclubUuid?: string | null } | null;
  } | null;
  results?: { winner?: string | null } | null;
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
  const now = args.now ?? new Date();
  const startedAt = Date.now();
  if (args.clubs.length === 0) {
    return { dueBlocks: 0, published: 0, mode };
  }

  const registeredClubUuids = new Set(args.clubs.map((club) => club.uuid));
  const storedMatches = await args.repos.matches.listAll();
  let planned: PlannedMatch[] = storedMatches.map(toPlannedMatch);

  let bootstrapped = false;
  if (mode === "snapshot" || planned.length === 0) {
    planned = await fetchScheduleForClubs({ ...args, sleep });
    planned = await ensureLeagueSchedules({
      ...args,
      planned,
      leagueUuids: leagueUuidsFromPlanned(planned),
      force: true,
      sleep,
      now,
    });
    bootstrapped = mode === "adaptive";
  }

  if (mode === "snapshot") {
    const publishBatch = await buildSnapshotEvents({
      ...args,
      planned,
      sleep,
    });
    await args.publisher.publish(publishBatch);
    await args.repos.syncMeta.put({
      job: "match-snapshot",
      status: "success",
      durationMs: Date.now() - startedAt,
      itemCount: publishBatch.length,
    });
    return { dueBlocks: 0, published: publishBatch.length, mode };
  }

  let blocks = buildMatchBlocks(planned);
  let allDecisions = planMatchRefresh({ blocks, now, policy: args.policy });
  const hotLeagueUuids = hotRegisteredClubLeagueUuids({
    blocks,
    decisions: allDecisions,
    registeredClubUuids,
  });
  if (hotLeagueUuids.length > 0) {
    planned = await ensureLeagueSchedules({
      ...args,
      planned,
      leagueUuids: hotLeagueUuids,
      force: false,
      sleep,
      now,
    });
    blocks = buildMatchBlocks(planned);
    allDecisions = planMatchRefresh({ blocks, now, policy: args.policy });
  }

  const decisions = dueRefreshDecisions(allDecisions);
  const publishBatch: PublishBatchItem[] = [];
  const affectedClubUuids = new Set<string>();

  if (bootstrapped) {
    for (const club of args.clubs) {
      affectedClubUuids.add(club.uuid);
    }
  }

  for (const decision of decisions) {
    const block = blocks.find((item) => item.id === decision.matchBlockId);
    if (!block || !blockIntersectsRegisteredClubs(block, registeredClubUuids)) {
      continue;
    }
    if (!decision.shouldRefreshMatches) {
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
    publishBatch.push({
      event: createEventEnvelope({
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
    });

    for (const clubUuid of block.sportsclubUuids) {
      if (registeredClubUuids.has(clubUuid)) {
        affectedClubUuids.add(clubUuid);
      }
    }
  }

  const preferredRankingBlockIds = new Set(
    blocks
      .filter((block) => blockIntersectsRegisteredClubs(block, registeredClubUuids))
      .map((block) => block.id),
  );
  const rankingDecisions = rankingDueLeagueDecisions(allDecisions, preferredRankingBlockIds);
  const resolvedSeasonUuid =
    storedMatches.find((match) => match.seasonUuid)?.seasonUuid ??
    (await resolveCurrentSeason(args))?.uuid ??
    "unknown";

  for (const decision of rankingDecisions) {
    const block = blocks.find((item) => item.id === decision.matchBlockId);
    const { data: rankingData } = await args.sams.getRankingsForLeague({
      path: { uuid: decision.leagueUuid },
      query: { page: 0, size: 100 },
    });
    const ranking = await buildLeagueRankingProjection({
      entries: rankingData?.content ?? [],
      repos: args.repos,
      sams: args.sams,
      publicLogoBaseUrl: args.publicLogoBaseUrl,
      leagueUuid: decision.leagueUuid,
      seasonUuid: resolvedSeasonUuid,
      sleep,
    });
    const interestedClubUuids = interestedRegisteredClubUuids({
      planned,
      leagueUuid: decision.leagueUuid,
      registeredClubUuids,
    });
    const cachedAt = new Date().toISOString();
    publishBatch.push({
      event: createEventEnvelope({
        type: SamsEventType.leagueRankingUpdated,
        sourceSyncId: args.sourceSyncId,
        payload: {
          leagueUuid: decision.leagueUuid,
          ...(ranking.leagueName ? { leagueName: ranking.leagueName } : {}),
          seasonUuid: resolvedSeasonUuid,
          ...(ranking.seasonName ? { seasonName: ranking.seasonName } : {}),
          cachedAt,
          refreshState: decision.state,
          nextRefreshAfter: decision.nextRefreshAfter,
          isStale: false,
          ...(block ? { sourceMatchBlockId: block.id } : {}),
          entries: ranking.entries,
        },
      }),
      additionalClubUuids: interestedClubUuids,
    });
    await sleep(200);
  }

  if (affectedClubUuids.size > 0) {
    const scheduleEvents = await scheduleEventsForClubs({
      ...args,
      clubUuids: affectedClubUuids,
    });
    for (const event of scheduleEvents) {
      publishBatch.push({ event });
    }
  }

  await args.publisher.publish(publishBatch);
  await args.repos.syncMeta.put({
    job: "match-refresh",
    status: "success",
    durationMs: Date.now() - startedAt,
    itemCount: publishBatch.length,
  });
  return { dueBlocks: decisions.length, published: publishBatch.length, mode };
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
}): Promise<PublishBatchItem[]> {
  const publishBatch: PublishBatchItem[] = [];
  const season = await resolveCurrentSeason(args);
  const cachedAt = new Date().toISOString();
  const leagueUuids = leagueUuidsFromPlanned(args.planned);
  const registeredClubUuids = new Set(args.clubs.map((club) => club.uuid));

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
      publishBatch.push({
        event: createEventEnvelope({
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
        additionalClubUuids: interestedRegisteredClubUuids({
          planned: args.planned,
          leagueUuid,
          registeredClubUuids,
        }),
      });
      await args.sleep(200);
    }
  }

  const clubUuids = new Set(args.clubs.map((club) => club.uuid));
  const scheduleEvents = await scheduleEventsForClubs({
    ...args,
    clubUuids,
  });
  for (const event of scheduleEvents) {
    publishBatch.push({ event });
  }
  return publishBatch;
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

function leagueUuidsFromPlanned(planned: PlannedMatch[]): string[] {
  return [
    ...new Set(planned.flatMap((match) => (match.leagueUuid ? [match.leagueUuid] : []))),
  ].sort();
}

function leagueScheduleJobKey(leagueUuid: string): string {
  return `league-schedule-${leagueUuid}`;
}

function blockIntersectsRegisteredClubs(
  block: MatchBlock,
  registeredClubUuids: ReadonlySet<string>,
): boolean {
  return block.sportsclubUuids.some((uuid) => registeredClubUuids.has(uuid));
}

function hotRegisteredClubLeagueUuids(args: {
  blocks: MatchBlock[];
  decisions: RefreshDecision[];
  registeredClubUuids: ReadonlySet<string>;
}): string[] {
  const decisionByBlockId = new Map(
    args.decisions.map((decision) => [decision.matchBlockId, decision]),
  );
  const leagueUuids = new Set<string>();
  for (const block of args.blocks) {
    if (!blockIntersectsRegisteredClubs(block, args.registeredClubUuids)) {
      continue;
    }
    const decision = decisionByBlockId.get(block.id);
    if (!decision?.shouldRefreshMatches) {
      continue;
    }
    leagueUuids.add(block.leagueUuid);
  }
  return [...leagueUuids].sort();
}

function interestedRegisteredClubUuids(args: {
  planned: PlannedMatch[];
  leagueUuid: string;
  registeredClubUuids: ReadonlySet<string>;
}): string[] {
  const interested = new Set<string>();
  for (const match of args.planned) {
    if (match.leagueUuid !== args.leagueUuid) {
      continue;
    }
    for (const clubUuid of match.sportsclubUuids) {
      if (args.registeredClubUuids.has(clubUuid)) {
        interested.add(clubUuid);
      }
    }
  }
  return [...interested].sort();
}

function hasLeagueWideCoverage(args: {
  planned: PlannedMatch[];
  leagueUuid: string;
  registeredClubUuids: ReadonlySet<string>;
}): boolean {
  return args.planned.some(
    (match) =>
      match.leagueUuid === args.leagueUuid &&
      match.sportsclubUuids.every((uuid) => !args.registeredClubUuids.has(uuid)),
  );
}

async function ensureLeagueSchedules(args: {
  sams: MatchRefreshSams;
  repos: MatchRefreshRepos;
  clubs: ClubSubscription[];
  planned: PlannedMatch[];
  leagueUuids: string[];
  force: boolean;
  sleep: (ms: number) => Promise<void>;
  now: Date;
}): Promise<PlannedMatch[]> {
  if (args.leagueUuids.length === 0) {
    return args.planned;
  }

  const { data: seasons } = await args.sams.getAllSeasons({});
  const currentSeason = seasons?.find((season) => season.currentSeason);
  if (!currentSeason?.uuid) {
    return args.planned;
  }

  const registeredClubUuids = new Set(args.clubs.map((club) => club.uuid));
  const plannedByUuid = new Map(args.planned.map((match) => [match.uuid, match]));

  for (const leagueUuid of args.leagueUuids) {
    const meta = await args.repos.syncMeta.get(leagueScheduleJobKey(leagueUuid));
    const stale =
      !meta?.updatedAt ||
      args.now.getTime() - new Date(meta.updatedAt).getTime() >= LEAGUE_SCHEDULE_STALE_MS;
    const missingCoverage = !hasLeagueWideCoverage({
      planned: [...plannedByUuid.values()],
      leagueUuid,
      registeredClubUuids,
    });
    if (!args.force && !stale && !missingCoverage) {
      continue;
    }

    const fetched = await fetchMatchesForQuery({
      sams: args.sams,
      repos: args.repos,
      sleep: args.sleep,
      query: {
        "for-league": leagueUuid,
        "for-season": currentSeason.uuid,
      },
    });
    for (const match of fetched) {
      plannedByUuid.set(match.uuid, match);
    }
    await args.repos.syncMeta.put({
      job: leagueScheduleJobKey(leagueUuid),
      status: "success",
      durationMs: 0,
      itemCount: fetched.length,
    });
  }

  return [...plannedByUuid.values()];
}

async function fetchScheduleForClubs(args: {
  sams: MatchRefreshSams;
  clubs: ClubSubscription[];
  repos: MatchRefreshRepos;
  sleep: (ms: number) => Promise<void>;
}): Promise<PlannedMatch[]> {
  const { data: seasons } = await args.sams.getAllSeasons({});
  const currentSeason = seasons?.find((season) => season.currentSeason);
  if (!currentSeason?.uuid) {
    return [];
  }

  const plannedByUuid = new Map<string, PlannedMatch>();
  for (const club of args.clubs) {
    const fetched = await fetchMatchesForQuery({
      sams: args.sams,
      repos: args.repos,
      sleep: args.sleep,
      query: {
        "for-sportsclub": club.uuid,
        "for-season": currentSeason.uuid,
      },
    });
    for (const match of fetched) {
      plannedByUuid.set(match.uuid, match);
    }
  }
  return [...plannedByUuid.values()];
}

async function fetchMatchesForQuery(args: {
  sams: MatchRefreshSams;
  repos: MatchRefreshRepos;
  sleep: (ms: number) => Promise<void>;
  query: {
    "for-sportsclub"?: string;
    "for-league"?: string;
    "for-season": string;
  };
}): Promise<PlannedMatch[]> {
  const planned: PlannedMatch[] = [];
  let page = 0;
  let hasMore = true;
  while (hasMore) {
    const { data } = await args.sams.getAllLeagueMatches({
      query: {
        page,
        size: 100,
        ...args.query,
      },
    });
    for (const match of data?.content ?? []) {
      const plannedMatch = await upsertListedMatch({ repos: args.repos, match });
      if (plannedMatch) {
        planned.push(plannedMatch);
      }
    }
    page += 1;
    hasMore = data?.last !== true;
    if (hasMore) {
      await args.sleep(500);
    }
  }
  return planned;
}

async function upsertListedMatch(args: {
  repos: MatchRefreshRepos;
  match: LeagueMatchListItem;
}): Promise<PlannedMatch | null> {
  if (!args.match.uuid) {
    return null;
  }
  const sportsclubUuids = [
    ...new Set(
      [
        args.match._embedded?.team1?.sportsclubUuid,
        args.match._embedded?.team2?.sportsclubUuid,
      ].filter((uuid): uuid is string => !!uuid),
    ),
  ];
  await args.repos.matches.upsert({
    uuid: args.match.uuid,
    ...(args.match.date ? { date: args.match.date } : {}),
    ...(args.match.time ? { time: args.match.time } : {}),
    ...(args.match.leagueUuid ? { leagueUuid: args.match.leagueUuid } : {}),
    ...(args.match.seasonUuid ? { seasonUuid: args.match.seasonUuid } : {}),
    ...(args.match.location?.uuid ? { locationUuid: args.match.location.uuid } : {}),
    sportsclubUuids,
    hasResult: Boolean(args.match.results?.winner),
    rawJson: JSON.stringify(args.match),
    ttl: unixTtlFromNow(30),
  });
  return {
    uuid: args.match.uuid,
    date: args.match.date ?? null,
    time: args.match.time ?? null,
    leagueUuid: args.match.leagueUuid ?? null,
    locationUuid: args.match.location?.uuid,
    hasResult: Boolean(args.match.results?.winner),
    sportsclubUuids,
  };
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
