import type { SamsClient } from "sams-rest-v2";
import type { ClubSubscription, MatchRefreshPolicy } from "../config/schema";
import type { DomainEventPublisher } from "../events/publisher";
import { createEventEnvelope, EventType } from "../events/schemas";
import {
  buildMatchBlocks,
  dueRefreshDecisions,
  planMatchRefresh,
  type PlannedMatch,
} from "../refresh/planner";
import { buildLeagueRankingProjection } from "../projections/league-ranking";
import { buildMatchBlockProjection } from "../projections/match-block";
import { unwrapSamsResult } from "../sams/result";
import type { SamsRepositories } from "@lib/db/repositories/create-sams-repositories";
import { unixTtlFromNow } from "@lib/db/repository-utils";

export async function refreshMatchesAndRankings(args: {
  sams: SamsClient;
  repos: SamsRepositories;
  publisher: DomainEventPublisher;
  clubs: ClubSubscription[];
  policy: MatchRefreshPolicy;
  publicLogoBaseUrl: string;
  sourceSyncId: string;
  now?: Date;
  sleep?: (ms: number) => Promise<void>;
}): Promise<{ dueBlocks: number; published: number }> {
  const sleep = args.sleep ?? defaultSleep;
  const startedAt = Date.now();
  if (args.clubs.length === 0) {
    return { dueBlocks: 0, published: 0 };
  }

  const storedMatches = await args.repos.matches.listAll();
  let planned: PlannedMatch[] = storedMatches.map((match) => ({
    uuid: match.uuid,
    date: match.date ?? null,
    time: match.time ?? null,
    leagueUuid: match.leagueUuid ?? null,
    locationUuid: match.locationUuid,
    hasResult: match.hasResult,
    sportsclubUuids: match.sportsclubUuids,
  }));

  if (planned.length === 0) {
    planned = await fetchScheduleForClubs(args);
  }

  const blocks = buildMatchBlocks(planned);
  const decisions = dueRefreshDecisions(
    planMatchRefresh({ blocks, now: args.now, policy: args.policy }),
  );
  const events = [];

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
        type: EventType.matchBlockUpdated,
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
      const entries = await buildLeagueRankingProjection({
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
          type: EventType.leagueRankingUpdated,
          sourceSyncId: args.sourceSyncId,
          payload: {
            leagueUuid: block.leagueUuid,
            seasonUuid,
            cachedAt,
            refreshState: decision.state,
            nextRefreshAfter: decision.nextRefreshAfter,
            isStale: false,
            sourceMatchBlockId: block.id,
            entries,
          },
        }),
      );
    }
  }

  await args.publisher.publish(events);
  await args.repos.syncMeta.put({
    job: "match-refresh",
    status: "success",
    durationMs: Date.now() - startedAt,
    itemCount: events.length,
  });
  return { dueBlocks: decisions.length, published: events.length };
}

async function fetchScheduleForClubs(args: {
  sams: SamsClient;
  clubs: ClubSubscription[];
  repos: SamsRepositories;
  sleep?: (ms: number) => Promise<void>;
}): Promise<PlannedMatch[]> {
  const sleep = args.sleep ?? defaultSleep;
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
        await sleep(500);
      }
    }
  }
  return planned;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
