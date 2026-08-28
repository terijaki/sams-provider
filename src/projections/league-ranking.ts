import type { SamsTeamUpsertInput } from "@lib/db/repositories/sams-teams-repository";
import { publicLogoUrl } from "../logos/preserve";
import { unwrapSamsResult } from "../sams/result";
import type {
  SamsClubInput,
  SamsLeagueInput,
  SamsSeasonInput,
  SamsTeamInput,
} from "@lib/db/schemas";
import { unixTtlFromNow } from "@lib/db/repository-utils";
import { slugify } from "@utils/slugify";
import type { LeagueRankingEntry } from "./types";

export type SamsLeagueRankingEntry = {
  uuid?: string;
  teamName?: string | null;
  rank?: number;
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
};

export type LeagueRankingRepos = {
  teams: {
    listAll(): Promise<SamsTeamInput[]>;
    upsert(input: SamsTeamUpsertInput): Promise<SamsTeamInput>;
  };
  clubs: {
    listAll(): Promise<SamsClubInput[]>;
  };
  leagues: {
    listAll(): Promise<SamsLeagueInput[]>;
  };
  seasons: {
    listAll(): Promise<SamsSeasonInput[]>;
  };
};

export type LeagueRankingSams = {
  getTeamByUuid(args: { path: { uuid: string } }): Promise<{
    data?: {
      uuid?: string;
      name?: string;
      sportsclubUuid?: string | null;
      associationUuid?: string | null;
    };
    error?: unknown;
  }>;
};

export async function buildLeagueRankingProjection(args: {
  entries: SamsLeagueRankingEntry[];
  repos: LeagueRankingRepos;
  sams: LeagueRankingSams;
  publicLogoBaseUrl: string;
  leagueUuid: string;
  seasonUuid: string;
  sleep?: (ms: number) => Promise<void>;
}): Promise<LeagueRankingEntry[]> {
  const sleep = args.sleep ?? defaultSleep;
  const [teams, clubs, leagues, seasons] = await Promise.all([
    args.repos.teams.listAll(),
    args.repos.clubs.listAll(),
    args.repos.leagues.listAll(),
    args.repos.seasons.listAll(),
  ]);
  const teamByUuid = new Map(teams.map((team) => [team.uuid, team]));
  const clubByUuid = new Map(clubs.map((club) => [club.sportsclubUuid, club]));
  const league = leagues.find((item) => item.uuid === args.leagueUuid);
  const season = seasons.find((item) => item.uuid === args.seasonUuid);

  const normalized: LeagueRankingEntry[] = [];
  for (const entry of args.entries) {
    if (!entry.uuid || entry.rank === undefined) {
      continue;
    }
    const teamName = entry.teamName?.trim() || teamByUuid.get(entry.uuid)?.name;
    if (!teamName) {
      continue;
    }

    const team = await resolveTeam({
      teamUuid: entry.uuid,
      teamName,
      teamByUuid,
      repos: args.repos,
      sams: args.sams,
      leagueUuid: args.leagueUuid,
      leagueName: league?.name ?? args.leagueUuid,
      seasonUuid: args.seasonUuid,
      seasonName: season?.name ?? args.seasonUuid,
      sleep,
    });

    const sportsclubUuid = team?.sportsclubUuid;
    const club = sportsclubUuid ? clubByUuid.get(sportsclubUuid) : undefined;
    normalized.push({
      rank: entry.rank,
      teamUuid: entry.uuid,
      teamName,
      ...(sportsclubUuid ? { sportsclubUuid } : {}),
      ...(club
        ? {
            logoUrl: publicLogoUrl({
              publicBaseUrl: args.publicLogoBaseUrl,
              logoS3Key: club.logoS3Key,
              fallbackImageLink: club.logoImageLink,
            }),
          }
        : {}),
      ...rankingStats(entry),
    });
  }
  return normalized;
}

async function resolveTeam(args: {
  teamUuid: string;
  teamName: string;
  teamByUuid: Map<string, SamsTeamInput>;
  repos: LeagueRankingRepos;
  sams: LeagueRankingSams;
  leagueUuid: string;
  leagueName: string;
  seasonUuid: string;
  seasonName: string;
  sleep: (ms: number) => Promise<void>;
}): Promise<SamsTeamInput | undefined> {
  const cached = args.teamByUuid.get(args.teamUuid);
  if (cached) {
    return cached;
  }

  const { data, error } = unwrapSamsResult(
    await args.sams.getTeamByUuid({ path: { uuid: args.teamUuid } }),
  );
  if (error || !data?.uuid || !data.sportsclubUuid || !data.associationUuid) {
    return undefined;
  }

  const item = {
    uuid: data.uuid,
    name: data.name?.trim() || args.teamName,
    nameSlug: slugify(data.name?.trim() || args.teamName),
    sportsclubUuid: data.sportsclubUuid,
    associationUuid: data.associationUuid,
    leagueUuid: args.leagueUuid,
    leagueName: args.leagueName,
    seasonUuid: args.seasonUuid,
    seasonName: args.seasonName,
    ttl: unixTtlFromNow(365),
  };
  const stored = await args.repos.teams.upsert(item);
  args.teamByUuid.set(stored.uuid, stored);
  await args.sleep(200);
  return stored;
}

function rankingStats(entry: SamsLeagueRankingEntry): Partial<LeagueRankingEntry> {
  return {
    ...(entry.matchesPlayed != null ? { matchesPlayed: entry.matchesPlayed } : {}),
    ...(entry.points != null ? { points: entry.points } : {}),
    ...(entry.scoreIncludingLosses != null
      ? { scoreIncludingLosses: entry.scoreIncludingLosses }
      : {}),
    ...(entry.wins != null ? { wins: entry.wins } : {}),
    ...(entry.losses != null ? { losses: entry.losses } : {}),
    ...(entry.setWins != null ? { setWins: entry.setWins } : {}),
    ...(entry.setLosses != null ? { setLosses: entry.setLosses } : {}),
    ...(entry.setDifference != null ? { setDifference: entry.setDifference } : {}),
    ...(entry.setRatio != null ? { setRatio: entry.setRatio } : {}),
    ...(entry.ballWins != null ? { ballWins: entry.ballWins } : {}),
    ...(entry.ballLosses != null ? { ballLosses: entry.ballLosses } : {}),
    ...(entry.ballDifference != null ? { ballDifference: entry.ballDifference } : {}),
    ...(entry.ballRatio != null ? { ballRatio: entry.ballRatio } : {}),
  };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
