import { z } from "zod";
import { EVENT_SCHEMA_VERSION, EVENT_SOURCE, SAMS_EVENT_TYPE_VALUES } from "./constants";

export {
  EVENT_SCHEMA_VERSION,
  EVENT_SOURCE,
  SamsEventType,
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

export const rosterPlayerSchema = z.object({
  uuid: z.string().min(1),
  name: z.string().min(1),
  jerseyNumber: z.number().int().optional(),
  position: z.string().optional(),
  portraitUrl: z.string().optional(),
});

export const rosterOfficialSchema = z.object({
  uuid: z.string().min(1),
  name: z.string().min(1),
  role: z.string().optional(),
});

export const teamRosterTeamSchema = teamProjectionSchema.extend({
  sportsclubUuid: z.string().min(1),
});

export const teamRosterEntrySchema = z.object({
  team: teamRosterTeamSchema,
  players: z.array(rosterPlayerSchema),
  officials: z.array(rosterOfficialSchema),
});

export const teamRosterUpdatedPayloadSchema = z.object({
  team: teamRosterTeamSchema,
  season: z.object({
    uuid: z.string().min(1),
    name: z.string().min(1),
    current: z.boolean(),
  }),
  players: z.array(rosterPlayerSchema),
  officials: z.array(rosterOfficialSchema),
  projectedAt: z.iso.datetime(),
  cachedAt: z.iso.datetime(),
  isStale: z.boolean(),
});

export const clubSeasonRostersPayloadSchema = z.object({
  club: clubProjectionSchema,
  season: z.object({
    uuid: z.string().min(1),
    name: z.string().min(1),
    current: z.boolean(),
  }),
  rosters: z.array(teamRosterEntrySchema),
  projectedAt: z.iso.datetime(),
  cachedAt: z.iso.datetime(),
  isStale: z.boolean(),
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
  leagueName: z
    .string()
    .min(1)
    .optional()
    .describe(
      "League display name, for example `Bezirksliga Herren Süd`. Omitted until the provider read model has synced league metadata.",
    ),
  seasonUuid: z.string().min(1),
  seasonName: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Season display name, for example `2026/27`. Omitted until the provider read model has synced season metadata.",
    ),
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
