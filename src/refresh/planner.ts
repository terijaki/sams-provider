import dayjs from "dayjs";
import type { MatchRefreshPolicy } from "../config/schema";

export const MatchRefreshState = {
  scheduledFuture: "scheduled-future",
  preMatchWindow: "pre-match-window",
  activeWindow: "active-window",
  sequentialWindow: "sequential-window",
  recentlyFinished: "recently-finished",
  settled: "settled",
} as const;

export type MatchRefreshStateName = (typeof MatchRefreshState)[keyof typeof MatchRefreshState];

export type PlannedMatch = {
  uuid: string;
  date: string | null;
  time: string | null;
  leagueUuid: string | null;
  locationUuid?: string | null;
  hasResult: boolean;
  sportsclubUuids: string[];
};

export type MatchBlock = {
  id: string;
  leagueUuid: string;
  date: string;
  venueKey: string;
  scheduledStart: string;
  matchUuids: string[];
  sportsclubUuids: string[];
  allHaveResults: boolean;
};

export type RefreshDecision = {
  matchBlockId: string;
  leagueUuid: string;
  state: MatchRefreshStateName;
  shouldRefreshMatches: boolean;
  shouldRefreshRankings: boolean;
  pollIntervalMinutes: number | null;
  nextRefreshAfter: string | null;
};

export function buildMatchBlocks(matches: PlannedMatch[]): MatchBlock[] {
  const groups = new Map<string, PlannedMatch[]>();
  for (const match of matches) {
    if (!match.date || !match.leagueUuid) {
      continue;
    }
    const venueKey = match.locationUuid ?? "unknown";
    const scheduledStart = match.time ?? "00:00";
    const id = matchBlockId({
      leagueUuid: match.leagueUuid,
      date: match.date,
      venueKey,
      scheduledStart,
    });
    const existing = groups.get(id) ?? [];
    existing.push(match);
    groups.set(id, existing);
  }

  const blocks: MatchBlock[] = [];
  for (const [id, grouped] of groups) {
    const first = grouped[0];
    if (!first?.leagueUuid || !first.date) {
      continue;
    }
    const sportsclubUuids = [...new Set(grouped.flatMap((match) => match.sportsclubUuids))].sort();
    blocks.push({
      id,
      leagueUuid: first.leagueUuid,
      date: first.date,
      venueKey: first.locationUuid ?? "unknown",
      scheduledStart: toIso(first.date, first.time ?? "00:00"),
      matchUuids: grouped.map((match) => match.uuid),
      sportsclubUuids,
      allHaveResults: grouped.every((match) => match.hasResult),
    });
  }
  return blocks;
}

export function matchBlockId(input: {
  leagueUuid: string;
  date: string;
  venueKey: string;
  scheduledStart: string;
}): string {
  return [input.leagueUuid, input.date, input.venueKey, input.scheduledStart].join("|");
}

export function planMatchRefresh(args: {
  blocks: MatchBlock[];
  now?: Date;
  policy: MatchRefreshPolicy;
}): RefreshDecision[] {
  const now = dayjs(args.now ?? new Date());
  const decisions: RefreshDecision[] = [];
  for (const block of args.blocks) {
    decisions.push(decideBlock({ block, now, policy: args.policy }));
  }
  return decisions;
}

export function dueRefreshDecisions(decisions: RefreshDecision[]): RefreshDecision[] {
  return decisions.filter(
    (decision) => decision.shouldRefreshMatches || decision.shouldRefreshRankings,
  );
}

function decideBlock(args: {
  block: MatchBlock;
  now: dayjs.Dayjs;
  policy: MatchRefreshPolicy;
}): RefreshDecision {
  const start = dayjs(args.block.scheduledStart);
  const hoursUntilStart = start.diff(args.now, "minute") / 60;
  const hoursAfterStart = args.now.diff(start, "minute") / 60;
  const sequential = args.block.matchUuids.length > 1;
  const activeUntil = args.policy.activeWindowHoursAfterStart;

  let state: MatchRefreshStateName = MatchRefreshState.scheduledFuture;
  let pollIntervalMinutes: number | null = null;

  if (hoursUntilStart > 24) {
    state = MatchRefreshState.scheduledFuture;
    pollIntervalMinutes = null;
  } else if (hoursUntilStart > args.policy.preMatchHours) {
    state = MatchRefreshState.preMatchWindow;
    pollIntervalMinutes = args.policy.pollMinutes.preMatch;
  } else if (hoursUntilStart > 0) {
    state = sequential ? MatchRefreshState.sequentialWindow : MatchRefreshState.activeWindow;
    pollIntervalMinutes = args.policy.pollMinutes.approaching;
  } else if (hoursAfterStart <= activeUntil && !args.block.allHaveResults) {
    state = sequential ? MatchRefreshState.sequentialWindow : MatchRefreshState.activeWindow;
    pollIntervalMinutes = args.policy.pollMinutes.active;
  } else if (
    args.block.allHaveResults &&
    hoursAfterStart * 60 <= args.policy.recentlyFinishedMinutes
  ) {
    state = MatchRefreshState.recentlyFinished;
    pollIntervalMinutes = args.policy.pollMinutes.recentlyFinished;
  } else if (args.block.allHaveResults && hoursAfterStart * 60 <= args.policy.settledAfterMinutes) {
    state = MatchRefreshState.recentlyFinished;
    pollIntervalMinutes = args.policy.pollMinutes.completedBackoff;
  } else if (args.block.allHaveResults) {
    state = MatchRefreshState.settled;
    pollIntervalMinutes = null;
  } else if (hoursAfterStart > activeUntil) {
    state = MatchRefreshState.settled;
    pollIntervalMinutes = null;
  }

  const shouldRefreshMatches = pollIntervalMinutes !== null;
  const shouldRefreshRankings =
    shouldRefreshMatches &&
    (state === MatchRefreshState.activeWindow ||
      state === MatchRefreshState.sequentialWindow ||
      state === MatchRefreshState.recentlyFinished);

  return {
    matchBlockId: args.block.id,
    leagueUuid: args.block.leagueUuid,
    state,
    shouldRefreshMatches,
    shouldRefreshRankings,
    pollIntervalMinutes,
    nextRefreshAfter: pollIntervalMinutes
      ? args.now.add(pollIntervalMinutes, "minute").toISOString()
      : null,
  };
}

function toIso(date: string, time: string): string {
  return dayjs(`${date}T${time}:00`).toISOString();
}
