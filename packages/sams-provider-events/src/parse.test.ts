import { describe, expect, it } from "vite-plus/test";
import { createEventEnvelope, SamsEventType } from "./schemas";
import { parseSamsEventFromSqsBody } from "./parse";

describe("parseSamsEventFromSqsBody", () => {
  it("parses an EventBridge SQS wrapper", () => {
    const envelope = createEventEnvelope({
      type: SamsEventType.clubUpdated,
      sourceSyncId: "sync-1",
      payload: {
        uuid: "club-1",
        name: "Example Club",
        slug: "example-club",
        logoUrl: null,
      },
    });

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
    const envelope = createEventEnvelope({
      type: SamsEventType.clubUpdated,
      sourceSyncId: "sync-1",
      payload: {
        uuid: "club-1",
        name: "Example Club",
        slug: "example-club",
        logoUrl: null,
      },
    });

    expect(parseSamsEventFromSqsBody(JSON.stringify(envelope))).toEqual(envelope);
  });
});
