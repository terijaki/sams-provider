import dayjs from "dayjs";
import type { SamsMatchInput, SamsClubInput } from "@lib/db/schemas";
import type { ClubSubscription } from "../config/schema";
import { createEventEnvelope, SamsEventType, type SamsEvent } from "../events/schemas";
import { publicLogoUrl } from "../logos/preserve";
import { toClubProjection, type ClubRecord } from "./club-season-teams";
import { toMatchProjection, type MatchBlockRepos, type SamsLeagueMatch } from "./match-block";
import type { ClubMatchScheduleProjection, MatchProjection } from "./types";

const SCHEDULE_LOOKBACK_DAYS = 14;
const SCHEDULE_LOOKAHEAD_DAYS = 365;

export function isClubScheduleWindow(args: {
  match: { date?: string; time?: string };
  now?: Date;
}): boolean {
  if (!args.match.date) {
    return false;
  }
  const now = dayjs(args.now ?? new Date());
  const start = dayjs(`${args.match.date}T${args.match.time ?? "00:00"}:00`);
  return (
    !start.isBefore(now.subtract(SCHEDULE_LOOKBACK_DAYS, "day")) &&
    !start.isAfter(now.add(SCHEDULE_LOOKAHEAD_DAYS, "day"))
  );
}

export function selectStoredClubScheduleMatches(args: {
  storedMatches: SamsMatchInput[];
  clubUuid: string;
  seasonUuid: string;
  now?: Date;
}): SamsMatchInput[] {
  return args.storedMatches
    .filter((match) => match.sportsclubUuids.includes(args.clubUuid))
    .filter((match) => !match.seasonUuid || match.seasonUuid === args.seasonUuid)
    .filter((match) => isClubScheduleWindow({ match, now: args.now }))
    .sort(compareStoredMatches);
}

export function compareMatchProjections(a: MatchProjection, b: MatchProjection): number {
  const dateCompare = (a.date ?? "").localeCompare(b.date ?? "");
  if (dateCompare !== 0) {
    return dateCompare;
  }
  return (a.time ?? "").localeCompare(b.time ?? "");
}

export function buildClubMatchScheduleProjection(args: {
  club: ClubRecord;
  season: { uuid: string; name: string; current: boolean };
  matches: MatchProjection[];
  cachedAt: string;
  isStale?: boolean;
  projectedAt?: string;
}): ClubMatchScheduleProjection {
  return {
    club: toClubProjection(args.club),
    season: args.season,
    matches: [...args.matches].sort(compareMatchProjections),
    projectedAt: args.projectedAt ?? new Date().toISOString(),
    cachedAt: args.cachedAt,
    isStale: args.isStale ?? false,
  };
}

export async function buildClubMatchScheduleEvents(args: {
  clubUuids: Iterable<string>;
  clubs: ClubSubscription[];
  storedMatches: SamsMatchInput[];
  repos: MatchBlockRepos;
  publicLogoBaseUrl: string;
  season: { uuid: string; name: string; current: boolean };
  sourceSyncId: string;
  cachedAt: string;
  now?: Date;
}): Promise<SamsEvent[]> {
  const storedClubs = await args.repos.clubs.listAll();
  const clubByUuid = new Map(storedClubs.map((club) => [club.sportsclubUuid, club]));
  const subscriptionByUuid = new Map(args.clubs.map((club) => [club.uuid, club]));
  const events: SamsEvent[] = [];

  for (const clubUuid of args.clubUuids) {
    const subscription = subscriptionByUuid.get(clubUuid);
    const storedClub = clubByUuid.get(clubUuid);
    if (!subscription || !storedClub) {
      continue;
    }

    const selected = selectStoredClubScheduleMatches({
      storedMatches: args.storedMatches,
      clubUuid,
      seasonUuid: args.season.uuid,
      now: args.now,
    });
    const matches = normalizeStoredMatches({
      storedMatches: selected,
      clubByUuid,
      publicLogoBaseUrl: args.publicLogoBaseUrl,
    });

    events.push(
      createEventEnvelope({
        type: SamsEventType.clubMatchScheduleUpdated,
        sourceSyncId: args.sourceSyncId,
        payload: buildClubMatchScheduleProjection({
          club: toClubRecord(storedClub, args.publicLogoBaseUrl),
          season: args.season,
          matches,
          cachedAt: args.cachedAt,
        }),
      }),
    );
  }

  return events;
}

function normalizeStoredMatches(args: {
  storedMatches: SamsMatchInput[];
  clubByUuid: Map<string, SamsClubInput>;
  publicLogoBaseUrl: string;
}): MatchProjection[] {
  const normalized: MatchProjection[] = [];
  for (const stored of args.storedMatches) {
    let parsed: SamsLeagueMatch;
    try {
      parsed = JSON.parse(stored.rawJson) as SamsLeagueMatch;
    } catch {
      continue;
    }
    const projection = toMatchProjection({
      match: parsed,
      clubByUuid: args.clubByUuid,
      publicLogoBaseUrl: args.publicLogoBaseUrl,
    });
    if (projection) {
      normalized.push(projection);
    }
  }
  return normalized;
}

function toClubRecord(club: SamsClubInput, publicLogoBaseUrl: string): ClubRecord {
  return {
    sportsclubUuid: club.sportsclubUuid,
    name: club.name,
    nameSlug: club.nameSlug,
    ...(club.associationUuid ? { associationUuid: club.associationUuid } : {}),
    ...(club.associationName ? { associationName: club.associationName } : {}),
    logoUrl: publicLogoUrl({
      publicBaseUrl: publicLogoBaseUrl,
      logoS3Key: club.logoS3Key,
      fallbackImageLink: club.logoImageLink,
    }),
  };
}

function compareStoredMatches(a: SamsMatchInput, b: SamsMatchInput): number {
  const dateCompare = (a.date ?? "").localeCompare(b.date ?? "");
  if (dateCompare !== 0) {
    return dateCompare;
  }
  return (a.time ?? "").localeCompare(b.time ?? "");
}
