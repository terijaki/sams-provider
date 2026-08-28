import { describe, expect, it } from "vite-plus/test";
import { SamsEventType } from "./constants";
import {
  createEventEnvelope,
  clubSeasonTeamsPayloadSchema,
  eventEnvelopeSchema,
  leagueRankingUpdatedPayloadSchema,
  matchBlockUpdatedPayloadSchema,
  clubMatchSchedulePayloadSchema,
} from "./schemas";

describe("event contracts", () => {
  it("creates a versioned club-season-teams envelope", () => {
    const payload = clubSeasonTeamsPayloadSchema.parse({
      club: {
        uuid: "club-1",
        name: "Example Club",
        slug: "example-club",
        logoUrl: "https://cdn.example/sams-logos/club-1.png",
      },
      season: { uuid: "season-1", name: "2026/27", current: true },
      teams: [
        {
          uuid: "team-1",
          name: "Example Club 1",
          slug: "example-club-1",
          leagueUuid: "league-1",
          leagueName: "Landesliga",
          leagueHierarchyLevel: 3,
        },
      ],
      projectedAt: "2026-08-27T12:00:00.000Z",
    });

    const event = createEventEnvelope({
      type: SamsEventType.clubSeasonTeamsUpdated,
      sourceSyncId: "sync-1",
      occurredAt: "2026-08-27T12:00:00.000Z",
      eventId: "event-1",
      payload,
    });

    expect(eventEnvelopeSchema.parse(event).type).toBe("sams.club-season-teams.updated");
    expect(event.schemaVersion).toBe("1.0.0");
    expect(event.snapshotVersion).toHaveLength(16);
  });

  it("rejects payloads missing required projection fields", () => {
    expect(() =>
      createEventEnvelope({
        type: SamsEventType.clubUpdated,
        sourceSyncId: "sync-1",
        payload: { uuid: "club-1" },
      }),
    ).toThrow();
  });

  it("creates a versioned league-ranking envelope with normalized entries", () => {
    const payload = leagueRankingUpdatedPayloadSchema.parse({
      leagueUuid: "league-1",
      seasonUuid: "season-1",
      cachedAt: "2026-08-27T12:00:00.000Z",
      refreshState: "active",
      nextRefreshAfter: null,
      isStale: false,
      sourceMatchBlockId: "block-1",
      entries: [
        {
          rank: 1,
          teamUuid: "team-1",
          teamName: "Example Club 1",
          sportsclubUuid: "club-1",
          logoUrl: "https://cdn.example/sams-logos/club-1.png",
          points: 12,
        },
      ],
    });

    const event = createEventEnvelope({
      type: SamsEventType.leagueRankingUpdated,
      sourceSyncId: "sync-1",
      payload,
    });

    expect(event.type).toBe(SamsEventType.leagueRankingUpdated);
    if (event.type !== SamsEventType.leagueRankingUpdated) {
      throw new Error("expected league ranking event");
    }
    expect(event.payload.entries).toHaveLength(1);
    expect(event.snapshotVersion).toHaveLength(16);
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

  it("creates a versioned match-block envelope with normalized matches", () => {
    const payload = matchBlockUpdatedPayloadSchema.parse({
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
          date: "2026-09-01",
          time: "18:00",
          leagueUuid: "league-1",
          seasonUuid: "season-1",
          team1: {
            uuid: "team-1",
            name: "Example Club 1",
            sportsclubUuid: "club-1",
            logoUrl: "https://cdn.example/sams-logos/club-1.png",
          },
          team2: {
            uuid: "team-2",
            name: "Opponent Club 1",
            sportsclubUuid: "club-2",
          },
          location: { uuid: "venue-1", name: "Sports Hall" },
          hasResult: false,
        },
      ],
    });

    const event = createEventEnvelope({
      type: SamsEventType.matchBlockUpdated,
      sourceSyncId: "sync-1",
      payload,
    });

    expect(event.type).toBe(SamsEventType.matchBlockUpdated);
    if (event.type !== SamsEventType.matchBlockUpdated) {
      throw new Error("expected match block event");
    }
    expect(event.payload.matches).toHaveLength(1);
    expect(event.snapshotVersion).toHaveLength(16);
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

  it("creates a versioned club-match-schedule envelope", () => {
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

    const event = createEventEnvelope({
      type: SamsEventType.clubMatchScheduleUpdated,
      sourceSyncId: "sync-1",
      payload,
    });

    expect(event.type).toBe(SamsEventType.clubMatchScheduleUpdated);
    if (event.type !== SamsEventType.clubMatchScheduleUpdated) {
      throw new Error("expected club match schedule event");
    }
    expect(event.payload.matches).toHaveLength(1);
    expect(event.snapshotVersion).toHaveLength(16);
  });
});
