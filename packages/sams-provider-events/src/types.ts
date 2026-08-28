import type { z } from "zod";
import type { EventEnvelope, EventTypeName } from "./schemas";
import {
  clubMatchSchedulePayloadSchema,
  clubProjectionSchema,
  clubSeasonTeamsPayloadSchema,
  clubsSyncCompletedPayloadSchema,
  leagueRankingEntrySchema,
  leagueRankingUpdatedPayloadSchema,
  matchBlockUpdatedPayloadSchema,
  matchLocationSchema,
  matchProjectionSchema,
  matchResultSchema,
  matchSetResultSchema,
  matchTeamSideSchema,
  syncFailedPayloadSchema,
  teamProjectionSchema,
  teamsSyncCompletedPayloadSchema,
} from "./schemas";

/** Volleyball club profile as delivered in projection events. */
export type Club = z.infer<typeof clubProjectionSchema>;

/** A club's team in a league for the current season. */
export type Team = z.infer<typeof teamProjectionSchema>;

/** Season metadata attached to club-scoped projections. */
export type Season = {
  /** SAMS season UUID. */
  uuid: string;
  /** Human-readable season label, for example `2026/27`. */
  name: string;
  /** Whether SAMS marks this season as current. */
  current: boolean;
};

/** One side of a match (team name, optional club UUID, optional logo URL). */
export type MatchTeam = z.infer<typeof matchTeamSideSchema>;

/** Venue where a match is played. */
export type MatchLocation = z.infer<typeof matchLocationSchema>;

/** Result of one set within a completed match. */
export type MatchSetResult = z.infer<typeof matchSetResultSchema>;

/** Aggregate match result (winner, set/ball points, per-set breakdown). */
export type MatchResult = z.infer<typeof matchResultSchema>;

/** Normalized match in provider projections. */
export type Match = z.infer<typeof matchProjectionSchema>;

/** Full team list for a registered club in the current season. */
export type ClubSeasonTeams = z.infer<typeof clubSeasonTeamsPayloadSchema>;

/** Rolling match schedule for a registered club (past and upcoming fixtures). */
export type ClubMatchSchedule = z.infer<typeof clubMatchSchedulePayloadSchema>;

/** Match block update: same league, date, and venue, played sequentially. */
export type MatchBlockUpdate = z.infer<typeof matchBlockUpdatedPayloadSchema>;

/** One row in a league ranking table. */
export type LeagueRankingEntry = z.infer<typeof leagueRankingEntrySchema>;

/** League standings update for a season. */
export type LeagueRankingUpdate = z.infer<typeof leagueRankingUpdatedPayloadSchema>;

/** Signal that an association-wide club sync pass finished. */
export type ClubsSyncCompleted = z.infer<typeof clubsSyncCompletedPayloadSchema>;

/** Signal that a teams sync pass finished for the current season. */
export type TeamsSyncCompleted = z.infer<typeof teamsSyncCompletedPayloadSchema>;

/** Signal that a provider sync job failed (schema reserved; not published yet). */
export type SyncFailed = z.infer<typeof syncFailedPayloadSchema>;

/** Signal that a provider sync job finished (schema reserved; not published yet). */
export type SyncCompleted = {
  /** Provider job identifier, for example `teams-sync`. */
  job: string;
};

/** Versioned projection event envelope from the SAMS provider. */
export type ProjectionEvent = EventEnvelope;

/** Common envelope fields shared by every projection event. */
export interface ProjectionEventBase {
  /** Contract version. Currently always `1.0.0`. */
  schemaVersion: "1.0.0";
  /** Unique event identifier (UUID). */
  eventId: string;
  /** ISO timestamp when the provider created the event. */
  occurredAt: string;
  /** Fixed event source. Always `sams-provider`. */
  source: "sams-provider";
  /** Correlates events emitted during one sync or refresh run. */
  sourceSyncId: string;
  /**
   * Hash of the payload for idempotent upserts.
   * Skip processing when this value is unchanged for the same projection key.
   */
  snapshotVersion: string;
}

/** Registered club profile changed (name, association, or logo). */
export type ClubUpdatedEvent = ProjectionEventBase & {
  type: "sams.club.updated";
  payload: Club;
};

/** Full current-season team list for a registered club. */
export type ClubSeasonTeamsUpdatedEvent = ProjectionEventBase & {
  type: "sams.club-season-teams.updated";
  payload: ClubSeasonTeams;
};

/** Registered club match schedule in the provider rolling window. */
export type ClubMatchScheduleUpdatedEvent = ProjectionEventBase & {
  type: "sams.club-match-schedule.updated";
  payload: ClubMatchSchedule;
};

/** Match block refresh with normalized match details. */
export type MatchBlockUpdatedEvent = ProjectionEventBase & {
  type: "sams.match-block.updated";
  payload: MatchBlockUpdate;
};

/** League ranking refresh with normalized table rows. */
export type LeagueRankingUpdatedEvent = ProjectionEventBase & {
  type: "sams.league-ranking.updated";
  payload: LeagueRankingUpdate;
};

/** Association-wide club index sync finished. */
export type ClubsSyncCompletedEvent = ProjectionEventBase & {
  type: "sams.clubs.sync.completed";
  payload: ClubsSyncCompleted;
};

/** Current-season teams sync finished. */
export type TeamsSyncCompletedEvent = ProjectionEventBase & {
  type: "sams.teams.sync.completed";
  payload: TeamsSyncCompleted;
};

/** Reserved alternate match update signal (not published yet). */
export type MatchesUpdatedEvent = ProjectionEventBase & {
  type: "sams.matches.updated";
  payload: MatchBlockUpdate;
};

/** Reserved provider job success signal (not published yet). */
export type SyncCompletedEvent = ProjectionEventBase & {
  type: "sams.sync.completed";
  payload: SyncCompleted;
};

/** Reserved provider job failure signal (not published yet). */
export type SyncFailedEvent = ProjectionEventBase & {
  type: "sams.sync.failed";
  payload: SyncFailed;
};

/**
 * Discriminated union of all projection event envelopes.
 * Narrow on `type` to access a typed `payload`.
 */
export type TypedProjectionEvent =
  | ClubUpdatedEvent
  | ClubSeasonTeamsUpdatedEvent
  | ClubMatchScheduleUpdatedEvent
  | MatchBlockUpdatedEvent
  | LeagueRankingUpdatedEvent
  | ClubsSyncCompletedEvent
  | TeamsSyncCompletedEvent
  | MatchesUpdatedEvent
  | SyncCompletedEvent
  | SyncFailedEvent;

/** Map from event type string to its payload shape. */
export type ProjectionEventPayloadByType = {
  "sams.club.updated": Club;
  "sams.club-season-teams.updated": ClubSeasonTeams;
  "sams.club-match-schedule.updated": ClubMatchSchedule;
  "sams.match-block.updated": MatchBlockUpdate;
  "sams.league-ranking.updated": LeagueRankingUpdate;
  "sams.clubs.sync.completed": ClubsSyncCompleted;
  "sams.teams.sync.completed": TeamsSyncCompleted;
  "sams.matches.updated": MatchBlockUpdate;
  "sams.sync.completed": SyncCompleted;
  "sams.sync.failed": SyncFailed;
};

/** Extract the payload type for a given projection event type string. */
export type ProjectionEventPayload<TType extends EventTypeName> =
  ProjectionEventPayloadByType[TType];
