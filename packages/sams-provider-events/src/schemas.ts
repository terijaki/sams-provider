import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  EVENT_SCHEMA_VERSION,
  EVENT_SOURCE,
  SamsEventType,
  SAMS_EVENT_TYPE_VALUES,
  type SamsEventTypeName,
} from "./constants";
import type { SamsEvent } from "./types";

export {
  EVENT_SCHEMA_VERSION,
  EVENT_SOURCE,
  EventType,
  SamsEventType,
  type EventTypeName,
  type SamsEventTypeName,
} from "./constants";

export const eventEnvelopeSchema = z.object({
  schemaVersion: z.literal(EVENT_SCHEMA_VERSION),
  eventId: z.string().min(1),
  occurredAt: z.iso.datetime(),
  source: z.literal(EVENT_SOURCE),
  type: z.enum(SAMS_EVENT_TYPE_VALUES),
  sourceSyncId: z.string().min(1),
  snapshotVersion: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

export const clubProjectionSchema = z.object({
  uuid: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  associationUuid: z.string().optional(),
  associationName: z.string().optional(),
  logoUrl: z.string().nullable(),
});

export const teamProjectionSchema = z.object({
  uuid: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  leagueUuid: z.string().min(1),
  leagueName: z.string().min(1),
  leagueHierarchyLevel: z.number().nonnegative().optional(),
});

export const clubSeasonTeamsPayloadSchema = z.object({
  club: clubProjectionSchema,
  season: z.object({
    uuid: z.string().min(1),
    name: z.string().min(1),
    current: z.boolean(),
  }),
  teams: z.array(teamProjectionSchema),
  projectedAt: z.iso.datetime(),
});

export const clubsSyncCompletedPayloadSchema = z.object({
  associationsInvoked: z.number().int().nonnegative(),
  associationUuids: z.array(z.string().min(1)),
});

export const teamsSyncCompletedPayloadSchema = z.object({
  seasonUuid: z.string().min(1),
  seasonName: z.string().min(1),
  teamsCount: z.number().int().nonnegative(),
  countsBySportsclubUuid: z.record(z.string(), z.number().int().nonnegative()),
  changedTeamUuids: z.array(z.string().min(1)),
});

export const matchTeamSideSchema = z.object({
  uuid: z.string().min(1),
  name: z.string().min(1),
  sportsclubUuid: z.string().min(1).optional(),
  logoUrl: z.string().nullable().optional(),
});

export const matchLocationSchema = z.object({
  uuid: z.string().min(1),
  name: z.string().min(1).optional(),
});

export const matchSetResultSchema = z.object({
  number: z.number().int(),
  ballPoints: z.string().optional(),
  winner: z.string().optional(),
  winnerName: z.string().optional(),
  duration: z.number().int().optional(),
});

export const matchResultSchema = z.object({
  winner: z.string().nullable().optional(),
  winnerName: z.string().nullable().optional(),
  setPoints: z.string().nullable().optional(),
  ballPoints: z.string().nullable().optional(),
  sets: z.array(matchSetResultSchema).optional(),
});

export const matchProjectionSchema = z.object({
  uuid: z.string().min(1),
  date: z.string().nullable().optional(),
  time: z.string().nullable().optional(),
  leagueUuid: z.string().min(1).optional(),
  seasonUuid: z.string().min(1).optional(),
  team1: matchTeamSideSchema,
  team2: matchTeamSideSchema,
  location: matchLocationSchema.optional(),
  result: matchResultSchema.optional(),
  hasResult: z.boolean(),
});

export const clubMatchSchedulePayloadSchema = z.object({
  club: clubProjectionSchema,
  season: z.object({
    uuid: z.string().min(1),
    name: z.string().min(1),
    current: z.boolean(),
  }),
  matches: z.array(matchProjectionSchema),
  projectedAt: z.iso.datetime(),
  cachedAt: z.iso.datetime(),
  isStale: z.boolean(),
});

export const matchBlockUpdatedPayloadSchema = z.object({
  matchBlockId: z.string().min(1),
  leagueUuid: z.string().min(1),
  date: z.string().min(1),
  refreshState: z.string().min(1),
  cachedAt: z.iso.datetime(),
  nextRefreshAfter: z.iso.datetime().nullable(),
  isStale: z.boolean(),
  matchUuids: z.array(z.string().min(1)),
  matches: z.array(matchProjectionSchema),
});

export const leagueRankingEntrySchema = z.object({
  rank: z.number().int(),
  teamUuid: z.string().min(1),
  teamName: z.string().min(1),
  sportsclubUuid: z.string().min(1).optional(),
  logoUrl: z.string().nullable().optional(),
  matchesPlayed: z.number().int().nullable().optional(),
  points: z.number().int().nullable().optional(),
  scoreIncludingLosses: z.string().nullable().optional(),
  wins: z.number().int().nullable().optional(),
  losses: z.number().int().nullable().optional(),
  setWins: z.number().int().nullable().optional(),
  setLosses: z.number().int().nullable().optional(),
  setDifference: z.number().int().nullable().optional(),
  setRatio: z.union([z.number(), z.string()]).nullable().optional(),
  ballWins: z.number().int().nullable().optional(),
  ballLosses: z.number().int().nullable().optional(),
  ballDifference: z.number().int().nullable().optional(),
  ballRatio: z.union([z.number(), z.string()]).nullable().optional(),
});

export const leagueRankingProjectionSchema = z.object({
  entries: z.array(leagueRankingEntrySchema),
});

export const leagueRankingUpdatedPayloadSchema = z.object({
  leagueUuid: z.string().min(1),
  seasonUuid: z.string().min(1),
  cachedAt: z.iso.datetime(),
  refreshState: z.string().min(1),
  nextRefreshAfter: z.iso.datetime().nullable(),
  isStale: z.boolean(),
  sourceMatchBlockId: z.string().optional(),
  entries: z.array(leagueRankingEntrySchema),
});

export const syncFailedPayloadSchema = z.object({
  job: z.string().min(1),
  message: z.string().min(1),
});

const syncCompletedPayloadSchema = z.object({ job: z.string().min(1) });

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
