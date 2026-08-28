import { describe, expect, it } from "vite-plus/test";
import { createEventEnvelope, EventType } from "./schemas";
import { parseProjectionEventFromSqsBody } from "./parse";

describe("parseProjectionEventFromSqsBody", () => {
  it("parses an EventBridge SQS wrapper", () => {
    const envelope = createEventEnvelope({
      type: EventType.clubUpdated,
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
      "detail-type": EventType.clubUpdated,
      source: "sams-provider",
      detail: envelope,
    });

    expect(parseProjectionEventFromSqsBody(sqsBody)).toEqual(envelope);
  });

  it("parses a bare envelope body", () => {
    const envelope = createEventEnvelope({
      type: EventType.clubUpdated,
      sourceSyncId: "sync-1",
      payload: {
        uuid: "club-1",
        name: "Example Club",
        slug: "example-club",
        logoUrl: null,
      },
    });

    expect(parseProjectionEventFromSqsBody(JSON.stringify(envelope))).toEqual(envelope);
  });
});
