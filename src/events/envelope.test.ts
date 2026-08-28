import { describe, expect, it } from "vite-plus/test";
import { SamsEventType } from "sams-provider-events";
import { contractPayloadFixtures } from "../../packages/sams-provider-events/src/contract-fixtures";
import { createEventEnvelope } from "./envelope";

describe("createEventEnvelope", () => {
  it("creates a versioned club-season-teams envelope", () => {
    const event = createEventEnvelope({
      type: SamsEventType.clubSeasonTeamsUpdated,
      sourceSyncId: "sync-1",
      occurredAt: "2026-08-27T12:00:00.000Z",
      eventId: "event-1",
      payload: contractPayloadFixtures[SamsEventType.clubSeasonTeamsUpdated],
    });

    expect(event.type).toBe(SamsEventType.clubSeasonTeamsUpdated);
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
    const event = createEventEnvelope({
      type: SamsEventType.leagueRankingUpdated,
      sourceSyncId: "sync-1",
      payload: contractPayloadFixtures[SamsEventType.leagueRankingUpdated],
    });

    expect(event.type).toBe(SamsEventType.leagueRankingUpdated);
    if (event.type !== SamsEventType.leagueRankingUpdated) {
      throw new Error("expected league ranking event");
    }
    expect(event.payload.entries).toHaveLength(1);
    expect(event.snapshotVersion).toHaveLength(16);
  });

  it("creates a versioned match-block envelope with normalized matches", () => {
    const event = createEventEnvelope({
      type: SamsEventType.matchBlockUpdated,
      sourceSyncId: "sync-1",
      payload: contractPayloadFixtures[SamsEventType.matchBlockUpdated],
    });

    expect(event.type).toBe(SamsEventType.matchBlockUpdated);
    if (event.type !== SamsEventType.matchBlockUpdated) {
      throw new Error("expected match block event");
    }
    expect(event.payload.matches).toHaveLength(1);
    expect(event.snapshotVersion).toHaveLength(16);
  });

  it("creates a versioned club-match-schedule envelope", () => {
    const event = createEventEnvelope({
      type: SamsEventType.clubMatchScheduleUpdated,
      sourceSyncId: "sync-1",
      payload: contractPayloadFixtures[SamsEventType.clubMatchScheduleUpdated],
    });

    expect(event.type).toBe(SamsEventType.clubMatchScheduleUpdated);
    if (event.type !== SamsEventType.clubMatchScheduleUpdated) {
      throw new Error("expected club match schedule event");
    }
    expect(event.payload.matches).toHaveLength(1);
    expect(event.snapshotVersion).toHaveLength(16);
  });

  it("creates roster event envelopes", () => {
    const clubRosters = createEventEnvelope({
      type: SamsEventType.clubSeasonRostersUpdated,
      sourceSyncId: "sync-1",
      payload: contractPayloadFixtures[SamsEventType.clubSeasonRostersUpdated],
    });
    const teamRoster = createEventEnvelope({
      type: SamsEventType.teamRosterUpdated,
      sourceSyncId: "sync-1",
      payload: contractPayloadFixtures[SamsEventType.teamRosterUpdated],
    });

    expect(clubRosters.type).toBe(SamsEventType.clubSeasonRostersUpdated);
    expect(teamRoster.type).toBe(SamsEventType.teamRosterUpdated);
    if (teamRoster.type !== SamsEventType.teamRosterUpdated) {
      throw new Error("expected team roster event");
    }
    expect(teamRoster.payload.players).toHaveLength(1);
  });
});
