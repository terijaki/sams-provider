/** Contract version embedded in every event envelope. */
export const EVENT_SCHEMA_VERSION = "1.0.0" as const;

/** Fixed `source` field on every event envelope. */
export const EVENT_SOURCE = "sams-provider" as const;

/**
 * SAMS provider event type strings.
 * Prefer these over raw string literals in consumer code.
 */
export const SamsEventType = {
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

export type SamsEventTypeName = (typeof SamsEventType)[keyof typeof SamsEventType];

/** @deprecated Use {@link SamsEventType}. Kept for provider internals. */
export const EventType = SamsEventType;

/** @deprecated Use {@link SamsEventTypeName}. */
export type EventTypeName = SamsEventTypeName;

export const SAMS_EVENT_TYPE_VALUES = [
  SamsEventType.clubsSyncCompleted,
  SamsEventType.clubUpdated,
  SamsEventType.teamsSyncCompleted,
  SamsEventType.clubSeasonTeamsUpdated,
  SamsEventType.clubMatchScheduleUpdated,
  SamsEventType.matchBlockUpdated,
  SamsEventType.matchesUpdated,
  SamsEventType.leagueRankingUpdated,
  SamsEventType.syncCompleted,
  SamsEventType.syncFailed,
] as const;
