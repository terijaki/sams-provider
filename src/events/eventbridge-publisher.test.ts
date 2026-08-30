import { describe, expect, it, vi } from "vite-plus/test";
import { SamsEventType } from "sams-provider-events";
import { contractPayloadFixtures } from "../../packages/sams-provider-events/src/contract-fixtures";
import { EventBridgePublisher } from "./eventbridge-publisher";
import { createEventEnvelope } from "./envelope";

describe("EventBridgePublisher", () => {
  it("includes clubUuids routing metadata in PutEvents detail", async () => {
    const send = vi.fn().mockResolvedValue({ FailedEntryCount: 0 });
    const client = { send } as never;
    const publisher = new EventBridgePublisher(client, "sams-provider");
    const event = createEventEnvelope({
      type: SamsEventType.clubUpdated,
      payload: contractPayloadFixtures[SamsEventType.clubUpdated],
      sourceSyncId: "sync-1",
    });

    await publisher.publish([event]);

    expect(send).toHaveBeenCalledOnce();
    const command = send.mock.calls[0]?.[0];
    const detail = JSON.parse(command.input.Entries[0].Detail) as {
      clubUuids?: string[];
      type: string;
    };
    expect(detail.clubUuids).toEqual(["club-1"]);
    expect(detail.type).toBe(SamsEventType.clubUpdated);
  });

  it("omits clubUuids for operational events", async () => {
    const send = vi.fn().mockResolvedValue({ FailedEntryCount: 0 });
    const client = { send } as never;
    const publisher = new EventBridgePublisher(client, "sams-provider");
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

    await publisher.publish([event]);

    const command = send.mock.calls[0]?.[0];
    const detail = JSON.parse(command.input.Entries[0].Detail) as Record<string, unknown>;
    expect(detail.clubUuids).toBeUndefined();
  });
});
