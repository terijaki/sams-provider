import { describe, expect, it } from "vite-plus/test";
import { unixTtlFromNow } from "@lib/db/repository-utils";
import type { SamsClubInput, SamsMatchInput } from "@lib/db/schemas";
import {
  buildClubMatchScheduleEvents,
  buildClubMatchScheduleProjection,
  isClubScheduleWindow,
  selectStoredClubScheduleMatches,
} from "./club-match-schedule";
import { EventType } from "../events/schemas";

const now = new Date("2026-09-01T12:00:00.000Z");

function club(
  overrides: Partial<SamsClubInput> & Pick<SamsClubInput, "sportsclubUuid">,
): SamsClubInput {
  return {
    type: "club",
    name: "Example Club",
    nameSlug: "example-club",
    updatedAt: now.toISOString(),
    lastSyncedAt: now.toISOString(),
    source: "sams",
    ttl: unixTtlFromNow(30),
    ...overrides,
  };
}

function storedMatch(
  overrides: Partial<SamsMatchInput> & Pick<SamsMatchInput, "uuid" | "rawJson">,
): SamsMatchInput {
  return {
    type: "match",
    sportsclubUuids: ["club-1"],
    hasResult: false,
    updatedAt: now.toISOString(),
    lastSyncedAt: now.toISOString(),
    source: "sams",
    ttl: unixTtlFromNow(30),
    ...overrides,
  };
}

describe("club-match-schedule projection", () => {
  it("includes future and recent matches for the club in the current season", () => {
    const matches = selectStoredClubScheduleMatches({
      storedMatches: [
        storedMatch({
          uuid: "match-future",
          date: "2026-09-10",
          time: "18:00",
          seasonUuid: "season-1",
          sportsclubUuids: ["club-1"],
          rawJson: "{}",
        }),
        storedMatch({
          uuid: "match-recent",
          date: "2026-08-25",
          time: "18:00",
          seasonUuid: "season-1",
          sportsclubUuids: ["club-1"],
          rawJson: "{}",
        }),
        storedMatch({
          uuid: "match-old",
          date: "2026-07-01",
          time: "18:00",
          seasonUuid: "season-1",
          sportsclubUuids: ["club-1"],
          rawJson: "{}",
        }),
        storedMatch({
          uuid: "match-other-club",
          date: "2026-09-10",
          seasonUuid: "season-1",
          sportsclubUuids: ["club-2"],
          rawJson: "{}",
        }),
      ],
      clubUuid: "club-1",
      seasonUuid: "season-1",
      now,
    });

    expect(matches.map((match) => match.uuid)).toEqual(["match-recent", "match-future"]);
  });

  it("builds a club-scoped payload with normalized matches", () => {
    const projection = buildClubMatchScheduleProjection({
      club: {
        sportsclubUuid: "club-1",
        name: "Example Club",
        nameSlug: "example-club",
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
      cachedAt: "2026-09-01T12:00:00.000Z",
      projectedAt: "2026-09-01T12:00:00.000Z",
    });

    expect(projection.club.uuid).toBe("club-1");
    expect(projection.matches).toHaveLength(1);
    expect(projection.isStale).toBe(false);
  });

  it("excludes matches outside the schedule window", () => {
    expect(
      isClubScheduleWindow({
        match: { date: "2026-07-01", time: "18:00" },
        now,
      }),
    ).toBe(false);
    expect(
      isClubScheduleWindow({
        match: { date: "2026-09-10", time: "18:00" },
        now,
      }),
    ).toBe(true);
  });

  it("builds publishable club-match-schedule events for registered clubs", async () => {
    const rawMatch = {
      uuid: "match-1",
      date: "2026-09-10",
      time: "18:00",
      leagueUuid: "league-1",
      seasonUuid: "season-1",
      _embedded: {
        team1: { uuid: "team-1", name: "Example Club 1", sportsclubUuid: "club-1" },
        team2: { uuid: "team-2", name: "Opponent", sportsclubUuid: "club-2" },
      },
      results: null,
    };

    const events = await buildClubMatchScheduleEvents({
      clubUuids: ["club-1"],
      clubs: [{ uuid: "club-1", name: "Example Club", consumerIds: [] }],
      storedMatches: [
        storedMatch({
          uuid: "match-1",
          date: "2026-09-10",
          time: "18:00",
          seasonUuid: "season-1",
          sportsclubUuids: ["club-1", "club-2"],
          rawJson: JSON.stringify(rawMatch),
        }),
      ],
      repos: {
        clubs: {
          listAll: async () => [
            club({
              sportsclubUuid: "club-1",
              logoS3Key: "sams-logos/club-1.png",
            }),
          ],
        },
      },
      publicLogoBaseUrl: "https://cdn.example",
      season: { uuid: "season-1", name: "2026/27", current: true },
      sourceSyncId: "sync-1",
      cachedAt: "2026-09-01T12:00:00.000Z",
      now,
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe(EventType.clubMatchScheduleUpdated);
    expect(events[0]?.payload.club).toMatchObject({
      uuid: "club-1",
      name: "Example Club",
      logoUrl: "https://cdn.example/sams-logos/club-1.png",
    });
    const payload = events[0]?.payload as { matches: Array<{ uuid: string }> };
    expect(payload.matches[0]?.uuid).toBe("match-1");
  });
});
