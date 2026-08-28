export {
  EVENT_SCHEMA_VERSION,
  EVENT_SOURCE,
  EventType,
  clubMatchSchedulePayloadSchema,
  clubProjectionSchema,
  clubSeasonTeamsPayloadSchema,
  clubsSyncCompletedPayloadSchema,
  createEventEnvelope,
  eventEnvelopeSchema,
  leagueRankingEntrySchema,
  leagueRankingProjectionSchema,
  leagueRankingUpdatedPayloadSchema,
  matchBlockUpdatedPayloadSchema,
  matchLocationSchema,
  matchProjectionSchema,
  matchResultSchema,
  matchSetResultSchema,
  matchTeamSideSchema,
  snapshotVersion,
  stableStringify,
  syncFailedPayloadSchema,
  teamProjectionSchema,
  teamsSyncCompletedPayloadSchema,
} from "./schemas";
export type { EventEnvelope, EventTypeName } from "./schemas";

export {
  parseProjectionEvent,
  parseProjectionEventFromSqsBody,
  tryParseProjectionEventFromSqsBody,
} from "./parse";

export type {
  Club,
  ClubMatchSchedule,
  ClubMatchScheduleUpdatedEvent,
  ClubSeasonTeams,
  ClubSeasonTeamsUpdatedEvent,
  ClubUpdatedEvent,
  ClubsSyncCompleted,
  ClubsSyncCompletedEvent,
  LeagueRankingEntry,
  LeagueRankingUpdate,
  LeagueRankingUpdatedEvent,
  Match,
  MatchBlockUpdate,
  MatchBlockUpdatedEvent,
  MatchLocation,
  MatchResult,
  MatchSetResult,
  MatchTeam,
  MatchesUpdatedEvent,
  ProjectionEvent,
  ProjectionEventBase,
  ProjectionEventPayload,
  ProjectionEventPayloadByType,
  Season,
  SyncCompleted,
  SyncCompletedEvent,
  SyncFailed,
  SyncFailedEvent,
  Team,
  TeamsSyncCompleted,
  TeamsSyncCompletedEvent,
  TypedProjectionEvent,
} from "./types";

/**
 * Projection event type strings with editor hover documentation.
 * Prefer these names in consumer code over raw string literals.
 */
export const ProjectionEventType = {
  /** Registered club profile changed (name, association, or logo). */
  clubUpdated: "sams.club.updated",
  /** Full current-season team list for a registered club. */
  clubSeasonTeamsUpdated: "sams.club-season-teams.updated",
  /** Registered club match schedule in the provider rolling window. */
  clubMatchScheduleUpdated: "sams.club-match-schedule.updated",
  /** Match block refresh with normalized match details. */
  matchBlockUpdated: "sams.match-block.updated",
  /** League ranking refresh with normalized table rows. */
  leagueRankingUpdated: "sams.league-ranking.updated",
  /** Association-wide club index sync finished. */
  clubsSyncCompleted: "sams.clubs.sync.completed",
  /** Current-season teams sync finished. */
  teamsSyncCompleted: "sams.teams.sync.completed",
  /** Reserved alternate match update signal (not published yet). */
  matchesUpdated: "sams.matches.updated",
  /** Reserved provider job success signal (not published yet). */
  syncCompleted: "sams.sync.completed",
  /** Reserved provider job failure signal (not published yet). */
  syncFailed: "sams.sync.failed",
} as const;

export type ProjectionEventTypeName =
  (typeof ProjectionEventType)[keyof typeof ProjectionEventType];
