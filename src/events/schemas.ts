import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

export const EVENT_SCHEMA_VERSION = "1.0.0" as const;
export const EVENT_SOURCE = "sams-provider" as const;

export const EventType = {
  clubsSyncCompleted: "sams.clubs.sync.completed",
  clubUpdated: "sams.club.updated",
  teamsSyncCompleted: "sams.teams.sync.completed",
  clubSeasonTeamsUpdated: "sams.club-season-teams.updated",
  clubMatchScheduleUpdated: "sams.club-match-schedule.updated",
  matchBlockUpdated: "sams.match-block.updated",
  matchesUpdated: "sams.matches.updated",
  leagueRankingUpdated: "sams.league-ranking.updated",
  syncCompleted: "sams.sync.completed",
  syncFailed: "sams.sync.failed",
} as const;

export type EventTypeName = (typeof EventType)[keyof typeof EventType];

const EVENT_TYPE_VALUES = [
  EventType.clubsSyncCompleted,
  EventType.clubUpdated,
  EventType.teamsSyncCompleted,
  EventType.clubSeasonTeamsUpdated,
  EventType.clubMatchScheduleUpdated,
  EventType.matchBlockUpdated,
  EventType.matchesUpdated,
  EventType.leagueRankingUpdated,
  EventType.syncCompleted,
  EventType.syncFailed,
] as const;

export const eventEnvelopeSchema = z.object({
  schemaVersion: z.literal(EVENT_SCHEMA_VERSION),
  eventId: z.string().min(1),
  occurredAt: z.iso.datetime(),
  source: z.literal(EVENT_SOURCE),
  type: z.enum(EVENT_TYPE_VALUES),
  sourceSyncId: z.string().min(1),
  snapshotVersion: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

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

const PAYLOAD_SCHEMAS = {
  [EventType.clubsSyncCompleted]: clubsSyncCompletedPayloadSchema,
  [EventType.clubUpdated]: clubProjectionSchema,
  [EventType.teamsSyncCompleted]: teamsSyncCompletedPayloadSchema,
  [EventType.clubSeasonTeamsUpdated]: clubSeasonTeamsPayloadSchema,
  [EventType.clubMatchScheduleUpdated]: clubMatchSchedulePayloadSchema,
  [EventType.matchBlockUpdated]: matchBlockUpdatedPayloadSchema,
  [EventType.matchesUpdated]: matchBlockUpdatedPayloadSchema,
  [EventType.leagueRankingUpdated]: leagueRankingUpdatedPayloadSchema,
  [EventType.syncCompleted]: z.object({ job: z.string().min(1) }),
  [EventType.syncFailed]: syncFailedPayloadSchema,
} as const;

export function snapshotVersion(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex").slice(0, 16);
}

export function createEventEnvelope<TType extends EventTypeName>(args: {
  type: TType;
  payload: unknown;
  sourceSyncId: string;
  occurredAt?: string;
  eventId?: string;
}): EventEnvelope {
  const payloadSchema = PAYLOAD_SCHEMAS[args.type];
  const payload = payloadSchema.parse(args.payload) as Record<string, unknown>;
  return eventEnvelopeSchema.parse({
    schemaVersion: EVENT_SCHEMA_VERSION,
    eventId: args.eventId ?? randomUUID(),
    occurredAt: args.occurredAt ?? new Date().toISOString(),
    source: EVENT_SOURCE,
    type: args.type,
    sourceSyncId: args.sourceSyncId,
    snapshotVersion: snapshotVersion(payload),
    payload,
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
