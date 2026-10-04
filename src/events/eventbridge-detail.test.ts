import { describe, expect, it } from "vite-plus/test";
import { eventBridgeDetail } from "./eventbridge-detail";
import { createEventEnvelope } from "./envelope";
import { SamsEventType } from "./schemas";
import { contractPayloadFixtures } from "../../packages/sams-provider-events/src/contract-fixtures";

describe("eventBridgeDetail", () => {
  it("adds clubUuids for club-scoped events", () => {
    const event = createEventEnvelope({
      type: SamsEventType.clubUpdated,
      payload: contractPayloadFixtures[SamsEventType.clubUpdated],
      sourceSyncId: "sync-1",
    });
    const detail = JSON.parse(eventBridgeDetail(event)) as { clubUuids?: string[] };
    expect(detail.clubUuids).toEqual(["club-1"]);
  });

  it("omits clubUuids for operational events", () => {
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
    const detail = JSON.parse(eventBridgeDetail(event)) as Record<string, unknown>;
    expect(detail.clubUuids).toBeUndefined();
  });

  it("merges additional club UUIDs into ranking routing metadata", () => {
    const fixture = contractPayloadFixtures[SamsEventType.leagueRankingUpdated];
    const event = createEventEnvelope({
      type: SamsEventType.leagueRankingUpdated,
      payload: {
        ...fixture,
        entries: fixture.entries.map(({ sportsclubUuid: _ignored, ...entry }) => entry),
      },
      sourceSyncId: "sync-1",
    });
    const detail = JSON.parse(eventBridgeDetail(event, ["club-1"])) as { clubUuids?: string[] };
    expect(detail.clubUuids).toEqual(["club-1"]);
  });
});
