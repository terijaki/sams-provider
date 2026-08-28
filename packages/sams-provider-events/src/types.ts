import type { SamsEventTypeName } from "./constants";

/** Volleyball club profile delivered in SAMS provider events. */
export interface Club {
  /** SAMS club UUID. */
  uuid: string;
  /** Club display name. */
  name: string;
  /** URL-safe slug derived from the club name. */
  slug: string;
  /** Regional federation UUID, when known. */
  associationUuid?: string;
  /** Regional federation display name, when known. */
  associationName?: string;
  /** Public CDN URL for the club logo, or `null` when none is stored. */
  logoUrl: string | null;
}

/** A club's team in a league for a season. */
export interface Team {
  /** Team UUID. */
  uuid: string;
  /** Team display name. */
  name: string;
  /** URL-safe slug derived from the team name. */
  slug: string;
  /** League UUID. */
  leagueUuid: string;
  /** League display name. */
  leagueName: string;
  /** League tier within the federation hierarchy, when available. */
  leagueHierarchyLevel?: number;
}

/** Season metadata attached to club-scoped event payloads. */
export interface Season {
  /** SAMS season UUID. */
  uuid: string;
  /** Human-readable season label, for example `2026/27`. */
  name: string;
  /** Whether SAMS marks this season as current. */
  current: boolean;
}

/** One side of a match (team name, optional club UUID, optional logo URL). */
export interface MatchTeam {
  /** Team UUID. */
  uuid: string;
  /** Team display name. */
  name: string;
  /** Owning club UUID, when known. */
  sportsclubUuid?: string;
  /** Public logo URL for the owning club, when known. */
  logoUrl?: string | null;
}

/** Venue where a match is played. */
export interface MatchLocation {
  /** Venue UUID. */
  uuid: string;
  /** Venue display name, when known. */
  name?: string;
}

/** Result of one set within a completed match. */
export interface MatchSetResult {
  /** Set number (1-based). */
  number: number;
  /** Ball points string for this set, when recorded. */
  ballPoints?: string;
  /** Winning team UUID for this set, when recorded. */
  winner?: string;
  /** Winning team name for this set, when recorded. */
  winnerName?: string;
  /** Set duration in seconds, when recorded. */
  duration?: number;
}

/** Aggregate match result (winner, set/ball points, per-set breakdown). */
export interface MatchResult {
  /** Winning team UUID, when the match is complete. */
  winner?: string | null;
  /** Winning team name, when the match is complete. */
  winnerName?: string | null;
  /** Set points summary string, when available. */
  setPoints?: string | null;
  /** Ball points summary string, when available. */
  ballPoints?: string | null;
  /** Per-set results, when available. */
  sets?: MatchSetResult[];
}

/** Normalized match in SAMS provider events. */
export interface Match {
  /** Match UUID. */
  uuid: string;
  /** Scheduled date (`YYYY-MM-DD`), when known. */
  date?: string | null;
  /** Scheduled start time, when known. */
  time?: string | null;
  /** League UUID, when known. */
  leagueUuid?: string;
  /** Season UUID, when known. */
  seasonUuid?: string;
  /** Home or first-listed team. */
  team1: MatchTeam;
  /** Away or second-listed team. */
  team2: MatchTeam;
  /** Venue, when known. */
  location?: MatchLocation;
  /** Final or partial result, when available. */
  result?: MatchResult;
  /** Whether a final result exists. */
  hasResult: boolean;
}

/** Full team list for a registered club in the current season. */
export interface ClubSeasonTeams {
  club: Club;
  season: Season;
  teams: Team[];
  /** When the provider built this payload. */
  projectedAt: string;
}

/** Rolling match schedule for a registered club. */
export interface ClubMatchSchedule {
  club: Club;
  season: Season;
  matches: Match[];
  /** When the provider built this payload. */
  projectedAt: string;
  /** When underlying match data was cached. */
  cachedAt: string;
  /** `true` when refresh could not run in time. */
  isStale: boolean;
}

/** Match block update: same league, date, and venue, played sequentially. */
export interface MatchBlockUpdate {
  /** Stable block identifier. */
  matchBlockId: string;
  leagueUuid: string;
  /** Block date (`YYYY-MM-DD`). */
  date: string;
  /** Provider refresh phase, for example `active` or `preMatch`. */
  refreshState: string;
  /** When match data was fetched. */
  cachedAt: string;
  /** When the provider plans the next refresh, if scheduled. */
  nextRefreshAfter: string | null;
  /** `true` when cache exceeded its refresh window. */
  isStale: boolean;
  /** Match UUIDs in this block. */
  matchUuids: string[];
  /** Normalized match details for the block. */
  matches: Match[];
}

/** One row in a league ranking table. */
export interface LeagueRankingEntry {
  rank: number;
  teamUuid: string;
  teamName: string;
  sportsclubUuid?: string;
  logoUrl?: string | null;
  matchesPlayed?: number | null;
  points?: number | null;
  scoreIncludingLosses?: string | null;
  wins?: number | null;
  losses?: number | null;
  setWins?: number | null;
  setLosses?: number | null;
  setDifference?: number | null;
  setRatio?: number | string | null;
  ballWins?: number | null;
  ballLosses?: number | null;
  ballDifference?: number | null;
  ballRatio?: number | string | null;
}

/** League standings update for a season. */
export interface LeagueRankingUpdate {
  leagueUuid: string;
  seasonUuid: string;
  cachedAt: string;
  refreshState: string;
  nextRefreshAfter: string | null;
  isStale: boolean;
  /** Block that triggered this ranking refresh, when applicable. */
  sourceMatchBlockId?: string;
  entries: LeagueRankingEntry[];
}

/** Signal that an association-wide club sync pass finished. */
export interface ClubsSyncCompleted {
  associationsInvoked: number;
  associationUuids: string[];
}

/** Signal that a teams sync pass finished for the current season. */
export interface TeamsSyncCompleted {
  seasonUuid: string;
  seasonName: string;
  teamsCount: number;
  countsBySportsclubUuid: Record<string, number>;
  changedTeamUuids: string[];
}

/** Signal that a provider sync job failed (schema reserved; not published yet). */
export interface SyncFailed {
  /** Provider job identifier, for example `teams-sync`. */
  job: string;
  /** Failure message. */
  message: string;
}

/** Signal that a provider sync job finished (schema reserved; not published yet). */
export interface SyncCompleted {
  /** Provider job identifier, for example `teams-sync`. */
  job: string;
}

/** Common envelope fields shared by every SAMS provider event. */
export interface SamsEventBase {
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
   * Skip processing when this value is unchanged for the same logical key.
   */
  snapshotVersion: string;
}

/** Registered club profile changed (name, association, or logo). */
export type ClubUpdatedEvent = SamsEventBase & {
  type: "sams.club.updated";
  payload: Club;
};

/** Full current-season team list for a registered club. */
export type ClubSeasonTeamsUpdatedEvent = SamsEventBase & {
  type: "sams.club-season-teams.updated";
  payload: ClubSeasonTeams;
};

/** Registered club match schedule in the provider rolling window. */
export type ClubMatchScheduleUpdatedEvent = SamsEventBase & {
  type: "sams.club-match-schedule.updated";
  payload: ClubMatchSchedule;
};

/** Match block refresh with normalized match details. */
export type MatchBlockUpdatedEvent = SamsEventBase & {
  type: "sams.match-block.updated";
  payload: MatchBlockUpdate;
};

/** League ranking refresh with normalized table rows. */
export type LeagueRankingUpdatedEvent = SamsEventBase & {
  type: "sams.league-ranking.updated";
  payload: LeagueRankingUpdate;
};

/** Association-wide club index sync finished. */
export type ClubsSyncCompletedEvent = SamsEventBase & {
  type: "sams.clubs.sync.completed";
  payload: ClubsSyncCompleted;
};

/** Current-season teams sync finished. */
export type TeamsSyncCompletedEvent = SamsEventBase & {
  type: "sams.teams.sync.completed";
  payload: TeamsSyncCompleted;
};

/** Reserved alternate match update signal (not published yet). */
export type MatchesUpdatedEvent = SamsEventBase & {
  type: "sams.matches.updated";
  payload: MatchBlockUpdate;
};

/** Reserved provider job success signal (not published yet). */
export type SyncCompletedEvent = SamsEventBase & {
  type: "sams.sync.completed";
  payload: SyncCompleted;
};

/** Reserved provider job failure signal (not published yet). */
export type SyncFailedEvent = SamsEventBase & {
  type: "sams.sync.failed";
  payload: SyncFailed;
};

/**
 * Discriminated union of all SAMS provider event envelopes.
 * Narrow on `type` to access a typed `payload`.
 */
export type SamsEvent =
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
export type SamsEventPayloadByType = {
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

/** Extract the payload type for a given event type string. */
export type SamsEventPayload<TType extends SamsEventTypeName> = SamsEventPayloadByType[TType];
