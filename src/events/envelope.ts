import { createHash, randomUUID } from "node:crypto";
import {
  clubMatchSchedulePayloadSchema,
  clubProjectionSchema,
  clubSeasonTeamsPayloadSchema,
  clubsSyncCompletedPayloadSchema,
  EVENT_SCHEMA_VERSION,
  EVENT_SOURCE,
  eventEnvelopeSchema,
  leagueRankingUpdatedPayloadSchema,
  matchBlockUpdatedPayloadSchema,
  SamsEventType,
  syncFailedPayloadSchema,
  teamsSyncCompletedPayloadSchema,
  type SamsEvent,
  type SamsEventTypeName,
} from "sams-provider-events";
import { z } from "zod";

const syncCompletedPayloadSchema = z.object({ job: z.string().min(1) });

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const sorted: Record<string, unknown> = {};
    for (const [key, nested] of entries) {
      sorted[key] = sortValue(nested);
    }
    return sorted;
  }
  return value;
}

export function snapshotVersion(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex").slice(0, 16);
}

function buildSamsEvent(args: {
  type: SamsEventTypeName;
  payload: unknown;
  sourceSyncId: string;
  occurredAt: string;
  eventId: string;
  snapshotVersion?: string;
}): SamsEvent {
  const envelopeBase = {
    schemaVersion: EVENT_SCHEMA_VERSION,
    eventId: args.eventId,
    occurredAt: args.occurredAt,
    source: EVENT_SOURCE,
    sourceSyncId: args.sourceSyncId,
  };

  switch (args.type) {
    case SamsEventType.clubUpdated: {
      const payload = clubProjectionSchema.parse(args.payload);
      return {
        ...envelopeBase,
        type: SamsEventType.clubUpdated,
        snapshotVersion: args.snapshotVersion ?? snapshotVersion(payload),
        payload,
      };
    }
    case SamsEventType.clubSeasonTeamsUpdated: {
      const payload = clubSeasonTeamsPayloadSchema.parse(args.payload);
      return {
        ...envelopeBase,
        type: SamsEventType.clubSeasonTeamsUpdated,
        snapshotVersion: args.snapshotVersion ?? snapshotVersion(payload),
        payload,
      };
    }
    case SamsEventType.clubMatchScheduleUpdated: {
      const payload = clubMatchSchedulePayloadSchema.parse(args.payload);
      return {
        ...envelopeBase,
        type: SamsEventType.clubMatchScheduleUpdated,
        snapshotVersion: args.snapshotVersion ?? snapshotVersion(payload),
        payload,
      };
    }
    case SamsEventType.matchBlockUpdated: {
      const payload = matchBlockUpdatedPayloadSchema.parse(args.payload);
      return {
        ...envelopeBase,
        type: SamsEventType.matchBlockUpdated,
        snapshotVersion: args.snapshotVersion ?? snapshotVersion(payload),
        payload,
      };
    }
    case SamsEventType.matchesUpdated: {
      const payload = matchBlockUpdatedPayloadSchema.parse(args.payload);
      return {
        ...envelopeBase,
        type: SamsEventType.matchesUpdated,
        snapshotVersion: args.snapshotVersion ?? snapshotVersion(payload),
        payload,
      };
    }
    case SamsEventType.leagueRankingUpdated: {
      const payload = leagueRankingUpdatedPayloadSchema.parse(args.payload);
      return {
        ...envelopeBase,
        type: SamsEventType.leagueRankingUpdated,
        snapshotVersion: args.snapshotVersion ?? snapshotVersion(payload),
        payload,
      };
    }
    case SamsEventType.clubsSyncCompleted: {
      const payload = clubsSyncCompletedPayloadSchema.parse(args.payload);
      return {
        ...envelopeBase,
        type: SamsEventType.clubsSyncCompleted,
        snapshotVersion: args.snapshotVersion ?? snapshotVersion(payload),
        payload,
      };
    }
    case SamsEventType.teamsSyncCompleted: {
      const payload = teamsSyncCompletedPayloadSchema.parse(args.payload);
      return {
        ...envelopeBase,
        type: SamsEventType.teamsSyncCompleted,
        snapshotVersion: args.snapshotVersion ?? snapshotVersion(payload),
        payload,
      };
    }
    case SamsEventType.syncCompleted: {
      const payload = syncCompletedPayloadSchema.parse(args.payload);
      return {
        ...envelopeBase,
        type: SamsEventType.syncCompleted,
        snapshotVersion: args.snapshotVersion ?? snapshotVersion(payload),
        payload,
      };
    }
    case SamsEventType.syncFailed: {
      const payload = syncFailedPayloadSchema.parse(args.payload);
      return {
        ...envelopeBase,
        type: SamsEventType.syncFailed,
        snapshotVersion: args.snapshotVersion ?? snapshotVersion(payload),
        payload,
      };
    }
  }
}

export function createEventEnvelope(args: {
  type: SamsEventTypeName;
  payload: unknown;
  sourceSyncId: string;
  occurredAt?: string;
  eventId?: string;
}): SamsEvent {
  const event = buildSamsEvent({
    type: args.type,
    payload: args.payload,
    sourceSyncId: args.sourceSyncId,
    occurredAt: args.occurredAt ?? new Date().toISOString(),
    eventId: args.eventId ?? randomUUID(),
  });
  eventEnvelopeSchema.parse(event);
  return event;
}
