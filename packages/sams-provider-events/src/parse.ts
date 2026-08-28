import { z } from "zod";
import { parseValidatedSamsEvent } from "./validate-event";
import type { SamsEvent } from "./types";

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
 * Parse and validate a SAMS provider event envelope.
 * Use this when you already extracted the EventBridge `detail` object.
 */
export function parseSamsEvent(value: unknown): SamsEvent {
  return parseValidatedSamsEvent(value);
}

/**
 * Parse an SQS record body from EventBridge → SQS delivery.
 * The provider publishes envelopes as the EventBridge `detail` field.
 */
export function parseSamsEventFromSqsBody(body: string): SamsEvent {
  const parsed = JSON.parse(body) as unknown;
  if (parsed && typeof parsed === "object" && "detail" in parsed) {
    const message = eventBridgeSqsMessageSchema.parse(parsed);
    return parseSamsEvent(message.detail);
  }
  return parseSamsEvent(parsed);
}

/**
 * Parse an SQS record body and return `null` when validation fails.
 * Useful for DLQ triage or logging malformed messages without throwing.
 */
export function tryParseSamsEventFromSqsBody(body: string): SamsEvent | null {
  try {
    return parseSamsEventFromSqsBody(body);
  } catch {
    return null;
  }
}

/** @deprecated Use {@link parseSamsEvent}. */
export const parseProjectionEvent = parseSamsEvent;

/** @deprecated Use {@link parseSamsEventFromSqsBody}. */
export const parseProjectionEventFromSqsBody = parseSamsEventFromSqsBody;

/** @deprecated Use {@link tryParseSamsEventFromSqsBody}. */
export const tryParseProjectionEventFromSqsBody = tryParseSamsEventFromSqsBody;
