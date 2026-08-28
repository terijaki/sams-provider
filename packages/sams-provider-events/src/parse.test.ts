import { describe, expect, it } from "vite-plus/test";
import { SamsEventType } from "sams-provider-events";
import { contractPayloadFixtures } from "./contract-fixtures";
import { parseSamsEventFromSqsBody } from "./parse";

describe("parseSamsEventFromSqsBody", () => {
  it("parses an EventBridge SQS wrapper", () => {
    const envelope = {
      schemaVersion: "1.0.0" as const,
      eventId: "event-1",
      occurredAt: "2026-08-27T12:00:00.000Z",
      source: "sams-provider" as const,
      type: SamsEventType.clubUpdated,
      sourceSyncId: "sync-1",
      snapshotVersion: "0123456789abcdef",
      payload: contractPayloadFixtures[SamsEventType.clubUpdated],
    };

    const sqsBody = JSON.stringify({
      version: "0",
      id: "evt-1",
      "detail-type": SamsEventType.clubUpdated,
      source: "sams-provider",
      detail: envelope,
    });

    expect(parseSamsEventFromSqsBody(sqsBody)).toEqual(envelope);
  });

  it("parses a bare envelope body", () => {
    const envelope = {
      schemaVersion: "1.0.0" as const,
      eventId: "event-1",
      occurredAt: "2026-08-27T12:00:00.000Z",
      source: "sams-provider" as const,
      type: SamsEventType.clubUpdated,
      sourceSyncId: "sync-1",
      snapshotVersion: "0123456789abcdef",
      payload: contractPayloadFixtures[SamsEventType.clubUpdated],
    };

    expect(parseSamsEventFromSqsBody(JSON.stringify(envelope))).toEqual(envelope);
  });
});
