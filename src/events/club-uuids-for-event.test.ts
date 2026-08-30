import { describe, expect, it } from "vite-plus/test";
import { SamsEventType } from "sams-provider-events";
import { contractPayloadFixtures } from "../../packages/sams-provider-events/src/contract-fixtures";
import { createEventEnvelope } from "./envelope";
import { clubUuidsForEvent } from "./club-uuids-for-event";

describe("clubUuidsForEvent", () => {
  it("extracts the club uuid from club.updated", () => {
    const event = createEventEnvelope({
      type: SamsEventType.clubUpdated,
      payload: contractPayloadFixtures[SamsEventType.clubUpdated],
      sourceSyncId: "sync-1",
    });
    expect(clubUuidsForEvent(event)).toEqual(["club-1"]);
  });

  it("extracts club uuid from club-scoped payloads", () => {
    const event = createEventEnvelope({
      type: SamsEventType.clubSeasonTeamsUpdated,
      payload: contractPayloadFixtures[SamsEventType.clubSeasonTeamsUpdated],
      sourceSyncId: "sync-1",
    });
    expect(clubUuidsForEvent(event)).toEqual(["club-1"]);
  });

  it("extracts both clubs from a match block", () => {
    const event = createEventEnvelope({
      type: SamsEventType.matchBlockUpdated,
      payload: contractPayloadFixtures[SamsEventType.matchBlockUpdated],
      sourceSyncId: "sync-1",
    });
    expect(clubUuidsForEvent(event)).toEqual(["club-1", "club-2"]);
  });

  it("extracts sportsclub uuids from league ranking entries", () => {
    const event = createEventEnvelope({
      type: SamsEventType.leagueRankingUpdated,
      payload: contractPayloadFixtures[SamsEventType.leagueRankingUpdated],
      sourceSyncId: "sync-1",
    });
    expect(clubUuidsForEvent(event)).toEqual(["club-1"]);
  });

  it("returns an empty list for operational sync-completed events", () => {
    const event = createEventEnvelope({
      type: SamsEventType.teamsSyncCompleted,
      payload: {
        seasonUuid: "season-1",
        seasonName: "2026/27",
        teamsCount: 1,
        countsBySportsclubUuid: { "club-1": 1 },
        changedTeamUuids: ["team-1"],
      },
      sourceSyncId: "sync-1",
    });
    expect(clubUuidsForEvent(event)).toEqual([]);
  });
});
