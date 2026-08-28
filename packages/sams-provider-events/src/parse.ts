import { z } from "zod";
import { eventEnvelopeSchema, type EventEnvelope } from "./schemas";

const eventBridgeSqsMessageSchema = z.object({
  version: z.string().optional(),
  id: z.string().optional(),
  "detail-type": z.string().optional(),
  source: z.string().optional(),
  account: z.string().optional(),
  time: z.string().optional(),
  region: z.string().optional(),
  detail: z.unknown(),
});

/**
 * Parse and validate a projection event envelope.
 * Use this when you already extracted the EventBridge `detail` object.
 */
export function parseProjectionEvent(value: unknown): EventEnvelope {
  return eventEnvelopeSchema.parse(value);
}

/**
 * Parse an SQS record body from EventBridge → SQS delivery.
 * The provider publishes envelopes as the EventBridge `detail` field.
 */
export function parseProjectionEventFromSqsBody(body: string): EventEnvelope {
  const parsed = JSON.parse(body) as unknown;
  if (parsed && typeof parsed === "object" && "detail" in parsed) {
    const message = eventBridgeSqsMessageSchema.parse(parsed);
    return parseProjectionEvent(message.detail);
  }
  return parseProjectionEvent(parsed);
}

/**
 * Parse an SQS record body and return `null` when validation fails.
 * Useful for DLQ triage or logging malformed messages without throwing.
 */
export function tryParseProjectionEventFromSqsBody(body: string): EventEnvelope | null {
  try {
    return parseProjectionEventFromSqsBody(body);
  } catch {
    return null;
  }
}
