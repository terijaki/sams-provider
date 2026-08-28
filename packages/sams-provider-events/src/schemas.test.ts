import { describe, expect, it } from "vite-plus/test";
import {
  clubSeasonTeamsPayloadSchema,
  leagueRankingUpdatedPayloadSchema,
  matchBlockUpdatedPayloadSchema,
  clubMatchSchedulePayloadSchema,
} from "sams-provider-events";

describe("event payload schemas", () => {
  it("rejects payloads missing required projection fields", () => {
    expect(() =>
      clubSeasonTeamsPayloadSchema.parse({
        club: { uuid: "club-1" },
      }),
    ).toThrow();
  });

  it("rejects raw SAMS ranking objects in league-ranking payloads", () => {
    expect(() =>
      leagueRankingUpdatedPayloadSchema.parse({
        leagueUuid: "league-1",
        seasonUuid: "season-1",
        cachedAt: "2026-08-27T12:00:00.000Z",
        refreshState: "active",
        nextRefreshAfter: null,
        isStale: false,
        entries: [{ uuid: "team-1", teamName: "Example", rank: 1 }],
      }),
    ).toThrow();
  });

  it("rejects raw SAMS match objects in match-block payloads", () => {
    expect(() =>
      matchBlockUpdatedPayloadSchema.parse({
        matchBlockId: "block-1",
        leagueUuid: "league-1",
        date: "2026-09-01",
        refreshState: "active",
        cachedAt: "2026-08-27T12:00:00.000Z",
        nextRefreshAfter: null,
        isStale: false,
        matchUuids: ["match-1"],
        matches: [
          {
            uuid: "match-1",
            _embedded: {
              team1: { uuid: "team-1", name: "Example", sportsclubUuid: "club-1" },
            },
          },
        ],
      }),
    ).toThrow();
  });

  it("accepts normalized club-match-schedule payloads", () => {
    const payload = clubMatchSchedulePayloadSchema.parse({
      club: {
        uuid: "club-1",
        name: "Example Club",
        slug: "example-club",
        logoUrl: "https://cdn.example/sams-logos/club-1.png",
      },
      season: { uuid: "season-1", name: "2026/27", current: true },
      matches: [
        {
          uuid: "match-1",
          date: "2026-09-10",
          time: "18:00",
          team1: { uuid: "team-1", name: "Example Club 1", sportsclubUuid: "club-1" },
          team2: { uuid: "team-2", name: "Opponent", sportsclubUuid: "club-2" },
          hasResult: false,
        },
      ],
      projectedAt: "2026-09-01T12:00:00.000Z",
      cachedAt: "2026-09-01T12:00:00.000Z",
      isStale: false,
    });

    expect(payload.matches).toHaveLength(1);
  });
});
