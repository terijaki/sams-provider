import {
  clubMatchSchedulePayloadSchema,
  clubProjectionSchema,
  clubSeasonRostersPayloadSchema,
  clubSeasonTeamsPayloadSchema,
  clubsSyncCompletedPayloadSchema,
  eventEnvelopeSchema,
  leagueRankingUpdatedPayloadSchema,
  matchBlockUpdatedPayloadSchema,
  syncFailedPayloadSchema,
  teamsSyncCompletedPayloadSchema,
  teamRosterUpdatedPayloadSchema,
} from "./schemas";
import {
  EVENT_SCHEMA_VERSION,
  EVENT_SOURCE,
  SamsEventType,
  type SamsEventTypeName,
} from "./constants";
import type { SamsEvent } from "./types";
import { z } from "zod";

const syncCompletedPayloadSchema = z.object({ job: z.string().min(1) });

function buildSamsEvent(args: {
  type: SamsEventTypeName;
  payload: unknown;
  sourceSyncId: string;
  occurredAt: string;
  eventId: string;
  snapshotVersion: string;
}): SamsEvent {
  const envelopeBase = {
    schemaVersion: EVENT_SCHEMA_VERSION,
    eventId: args.eventId,
    occurredAt: args.occurredAt,
    source: EVENT_SOURCE,
    sourceSyncId: args.sourceSyncId,
    snapshotVersion: args.snapshotVersion,
  };

  switch (args.type) {
    case SamsEventType.clubUpdated: {
      const payload = clubProjectionSchema.parse(args.payload);
      return { ...envelopeBase, type: SamsEventType.clubUpdated, payload };
    }
    case SamsEventType.clubSeasonTeamsUpdated: {
      const payload = clubSeasonTeamsPayloadSchema.parse(args.payload);
      return { ...envelopeBase, type: SamsEventType.clubSeasonTeamsUpdated, payload };
    }
    case SamsEventType.clubSeasonRostersUpdated: {
      const payload = clubSeasonRostersPayloadSchema.parse(args.payload);
      return { ...envelopeBase, type: SamsEventType.clubSeasonRostersUpdated, payload };
    }
    case SamsEventType.teamRosterUpdated: {
      const payload = teamRosterUpdatedPayloadSchema.parse(args.payload);
      return { ...envelopeBase, type: SamsEventType.teamRosterUpdated, payload };
    }
    case SamsEventType.clubMatchScheduleUpdated: {
      const payload = clubMatchSchedulePayloadSchema.parse(args.payload);
      return { ...envelopeBase, type: SamsEventType.clubMatchScheduleUpdated, payload };
    }
    case SamsEventType.matchBlockUpdated: {
      const payload = matchBlockUpdatedPayloadSchema.parse(args.payload);
      return { ...envelopeBase, type: SamsEventType.matchBlockUpdated, payload };
    }
    case SamsEventType.matchesUpdated: {
      const payload = matchBlockUpdatedPayloadSchema.parse(args.payload);
      return { ...envelopeBase, type: SamsEventType.matchesUpdated, payload };
    }
    case SamsEventType.leagueRankingUpdated: {
      const payload = leagueRankingUpdatedPayloadSchema.parse(args.payload);
      return { ...envelopeBase, type: SamsEventType.leagueRankingUpdated, payload };
    }
    case SamsEventType.clubsSyncCompleted: {
      const payload = clubsSyncCompletedPayloadSchema.parse(args.payload);
      return { ...envelopeBase, type: SamsEventType.clubsSyncCompleted, payload };
    }
    case SamsEventType.teamsSyncCompleted: {
      const payload = teamsSyncCompletedPayloadSchema.parse(args.payload);
      return { ...envelopeBase, type: SamsEventType.teamsSyncCompleted, payload };
    }
    case SamsEventType.syncCompleted: {
      const payload = syncCompletedPayloadSchema.parse(args.payload);
      return { ...envelopeBase, type: SamsEventType.syncCompleted, payload };
    }
    case SamsEventType.syncFailed: {
      const payload = syncFailedPayloadSchema.parse(args.payload);
      return { ...envelopeBase, type: SamsEventType.syncFailed, payload };
    }
  }
}

export function parseValidatedSamsEvent(value: unknown): SamsEvent {
  const envelope = eventEnvelopeSchema.parse(value);
  return buildSamsEvent({
    type: envelope.type,
    payload: envelope.payload,
    sourceSyncId: envelope.sourceSyncId,
    occurredAt: envelope.occurredAt,
    eventId: envelope.eventId,
    snapshotVersion: envelope.snapshotVersion,
  });
}
