import { describe, expect, it } from "vite-plus/test";
import { unixTtlFromNow } from "@lib/db/repository-utils";
import type {
  SamsClubInput,
  SamsLeagueInput,
  SamsMatchInput,
  SamsSeasonInput,
  SamsTeamInput,
} from "@lib/db/schemas";
import { DEFAULT_MATCH_REFRESH_POLICY } from "../config/schema";
import { InMemoryEventPublisher } from "../events/publisher";
import { SamsEventType } from "../events/schemas";
import { SNAPSHOT_REFRESH_STATE } from "./mode";
import {
  refreshMatchesAndRankings,
  type MatchRefreshRepos,
  type MatchRefreshSams,
} from "./refresh-matches";

const now = new Date("2026-08-30T12:00:00.000Z");
const isoNow = now.toISOString();
const clubUuid = "club-1";
const leagueUuid = "league-1";
const seasonUuid = "season-1";

const rawMatch = {
  uuid: "match-1",
  date: "2026-10-04",
  time: "16:00",
  leagueUuid,
  seasonUuid,
  location: { uuid: "venue-1" },
  _embedded: {
    team1: { uuid: "team-1", name: "Example Club 1", sportsclubUuid: clubUuid },
    team2: { uuid: "team-2", name: "Opponent", sportsclubUuid: "club-2" },
  },
  results: null,
};

function clubRow(): SamsClubInput {
  return {
    sportsclubUuid: clubUuid,
    type: "club",
    name: "Example Club",
    nameSlug: "example-club",
    associationUuid: "assoc-1",
    associationName: "Assoc",
    updatedAt: isoNow,
    lastSyncedAt: isoNow,
    source: "sams",
    ttl: unixTtlFromNow(30),
  };
}

function teamRow(uuid: string, name: string): SamsTeamInput {
  return {
    uuid,
    type: "team",
    name,
    nameSlug: name.toLowerCase().replaceAll(" ", "-"),
    sportsclubUuid: uuid === "team-1" ? clubUuid : "club-2",
    associationUuid: "assoc-1",
    leagueUuid,
    leagueName: "Landesliga",
    seasonUuid,
    seasonName: "2026/27",
    updatedAt: isoNow,
    lastSyncedAt: isoNow,
    source: "sams",
    ttl: unixTtlFromNow(30),
  };
}

function seasonRow(): SamsSeasonInput {
  return {
    uuid: seasonUuid,
    type: "season",
    name: "2026/27",
    currentSeason: true,
    updatedAt: isoNow,
    lastSyncedAt: isoNow,
    source: "sams",
    ttl: unixTtlFromNow(30),
  };
}

function leagueRow(): SamsLeagueInput {
  return {
    uuid: leagueUuid,
    type: "league",
    name: "Landesliga",
    associationUuid: "assoc-1",
    seasonUuid,
    updatedAt: isoNow,
    lastSyncedAt: isoNow,
    source: "sams",
    ttl: unixTtlFromNow(30),
  };
}

function storedMatch(overrides: Partial<SamsMatchInput> = {}): SamsMatchInput {
  return {
    uuid: "match-1",
    type: "match",
    date: "2026-10-04",
    time: "16:00",
    leagueUuid,
    seasonUuid,
    locationUuid: "venue-1",
    sportsclubUuids: [clubUuid, "club-2"],
    hasResult: false,
    rawJson: JSON.stringify(rawMatch),
    updatedAt: isoNow,
    lastSyncedAt: isoNow,
    source: "sams",
    ttl: unixTtlFromNow(30),
    ...overrides,
  };
}

function memoryRepos(seedMatches: SamsMatchInput[] = []): MatchRefreshRepos {
  const matches = [...seedMatches];
  const teams = [teamRow("team-1", "Example Club 1"), teamRow("team-2", "Opponent")];
  return {
    matches: {
      listAll: async () => matches,
      upsert: async (input) => {
        const item = storedMatch({
          uuid: input.uuid,
          ...(input.date ? { date: input.date } : {}),
          ...(input.time ? { time: input.time } : {}),
          ...(input.leagueUuid ? { leagueUuid: input.leagueUuid } : {}),
          ...(input.seasonUuid ? { seasonUuid: input.seasonUuid } : {}),
          sportsclubUuids: input.sportsclubUuids,
          hasResult: input.hasResult,
          rawJson: input.rawJson,
          ttl: input.ttl,
        });
        const index = matches.findIndex((match) => match.uuid === item.uuid);
        if (index >= 0) {
          matches[index] = item;
        } else {
          matches.push(item);
        }
        return item;
      },
    },
    clubs: { listAll: async () => [clubRow()] },
    teams: {
      listAll: async () => teams,
      upsert: async (input) => {
        const stored = teamRow(input.uuid, input.name);
        teams.push(stored);
        return stored;
      },
    },
    leagues: { listAll: async () => [leagueRow()] },
    seasons: { listAll: async () => [seasonRow()] },
    syncMeta: { put: async () => ({}) },
  };
}

function samsClient(args: { listCalls?: string[]; rankingCalls?: string[] }): MatchRefreshSams {
  const listCalls = args.listCalls ?? [];
  const rankingCalls = args.rankingCalls ?? [];
  return {
    getAllSeasons: async () => ({
      data: [{ uuid: seasonUuid, name: "2026/27", currentSeason: true }],
    }),
    getAllLeagueMatches: async () => {
      listCalls.push("list");
      return { data: { content: [rawMatch], last: true } };
    },
    getLeagueMatchByUuid: async () => ({ data: rawMatch }),
    getRankingsForLeague: async ({ path }) => {
      rankingCalls.push(path.uuid);
      return {
        data: {
          content: [{ uuid: "team-1", teamName: "Example Club 1", rank: 1, points: 6 }],
        },
      };
    },
    getTeamByUuid: async () => ({
      data: {
        uuid: "team-1",
        name: "Example Club 1",
        sportsclubUuid: clubUuid,
        associationUuid: "assoc-1",
      },
    }),
  };
}

describe("refreshMatchesAndRankings", () => {
  const clubs = [{ uuid: clubUuid, name: "Example Club", consumerIds: ["consumer-1"] }];

  it("does not fetch SAMS when adaptive refresh has stored matches that are not due", async () => {
    const listCalls: string[] = [];
    const rankingCalls: string[] = [];
    const publisher = new InMemoryEventPublisher();
    const result = await refreshMatchesAndRankings({
      sams: samsClient({ listCalls, rankingCalls }),
      repos: memoryRepos([storedMatch()]),
      publisher,
      clubs,
      policy: DEFAULT_MATCH_REFRESH_POLICY,
      publicLogoBaseUrl: "https://cdn.example",
      sourceSyncId: "sync-1",
      now,
      sleep: async () => {},
    });

    expect(result).toEqual({ dueBlocks: 0, published: 0, mode: "adaptive" });
    expect(listCalls).toEqual([]);
    expect(rankingCalls).toEqual([]);
    expect(publisher.published).toEqual([]);
  });

  it("publishes schedule and rankings in snapshot mode even when no match is due", async () => {
    const listCalls: string[] = [];
    const rankingCalls: string[] = [];
    const publisher = new InMemoryEventPublisher();
    const result = await refreshMatchesAndRankings({
      sams: samsClient({ listCalls, rankingCalls }),
      repos: memoryRepos([storedMatch()]),
      publisher,
      clubs,
      policy: DEFAULT_MATCH_REFRESH_POLICY,
      publicLogoBaseUrl: "https://cdn.example",
      sourceSyncId: "sync-1",
      mode: "snapshot",
      now,
      sleep: async () => {},
    });

    expect(result.mode).toBe("snapshot");
    expect(result.dueBlocks).toBe(0);
    expect(listCalls).toEqual(["list"]);
    expect(rankingCalls).toEqual([leagueUuid]);
    expect(publisher.published.map((event) => event.type)).toEqual([
      SamsEventType.leagueRankingUpdated,
      SamsEventType.clubMatchScheduleUpdated,
    ]);

    const ranking = publisher.published.find(
      (event) => event.type === SamsEventType.leagueRankingUpdated,
    );
    if (!ranking || ranking.type !== SamsEventType.leagueRankingUpdated) {
      throw new Error("expected ranking event");
    }
    expect(ranking.payload.refreshState).toBe(SNAPSHOT_REFRESH_STATE);
    expect(ranking.payload.leagueUuid).toBe(leagueUuid);
    expect(ranking.payload.entries).toHaveLength(1);

    const schedule = publisher.published.find(
      (event) => event.type === SamsEventType.clubMatchScheduleUpdated,
    );
    if (!schedule || schedule.type !== SamsEventType.clubMatchScheduleUpdated) {
      throw new Error("expected schedule event");
    }
    expect(schedule.payload.club.uuid).toBe(clubUuid);
    expect(schedule.payload.matches).toHaveLength(1);
  });

  it("returns zeros when no clubs are registered", async () => {
    const publisher = new InMemoryEventPublisher();
    const result = await refreshMatchesAndRankings({
      sams: samsClient({}),
      repos: memoryRepos(),
      publisher,
      clubs: [],
      policy: DEFAULT_MATCH_REFRESH_POLICY,
      publicLogoBaseUrl: "https://cdn.example",
      sourceSyncId: "sync-1",
      mode: "snapshot",
      now,
      sleep: async () => {},
    });
    expect(result).toEqual({ dueBlocks: 0, published: 0, mode: "snapshot" });
    expect(publisher.published).toEqual([]);
  });
});
