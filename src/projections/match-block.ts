import type { SamsClubInput } from "@lib/db/schemas";
import { publicLogoUrl } from "../logos/preserve";
import type { MatchProjection, MatchTeamSide } from "./types";

export type SamsMatchTeamSide = {
  uuid: string;
  name: string;
  sportsclubUuid?: string | null;
};

export type SamsMatchSetResult = {
  number?: number;
  ballPoints?: string;
  winner?: string;
  winnerName?: string;
  duration?: number;
};

export type SamsMatchResults = {
  winner?: string | null;
  winnerName?: string | null;
  setPoints?: string | null;
  ballPoints?: string | null;
  sets?: SamsMatchSetResult[] | null;
};

export type SamsLeagueMatch = {
  uuid: string;
  date?: string | null;
  time?: string | null;
  leagueUuid?: string | null;
  seasonUuid?: string | null;
  location?: {
    uuid?: string | null;
    name?: string | null;
  } | null;
  _embedded?: {
    team1?: SamsMatchTeamSide | null;
    team2?: SamsMatchTeamSide | null;
  } | null;
  results?: SamsMatchResults | null;
};

export type MatchBlockRepos = {
  clubs: {
    listAll(): Promise<SamsClubInput[]>;
  };
};

export async function buildMatchBlockProjection(args: {
  matches: SamsLeagueMatch[];
  repos: MatchBlockRepos;
  publicLogoBaseUrl: string;
}): Promise<MatchProjection[]> {
  const clubs = await args.repos.clubs.listAll();
  const clubByUuid = new Map(clubs.map((club) => [club.sportsclubUuid, club]));

  const normalized: MatchProjection[] = [];
  for (const match of args.matches) {
    const projection = toMatchProjection({
      match,
      clubByUuid,
      publicLogoBaseUrl: args.publicLogoBaseUrl,
    });
    if (projection) {
      normalized.push(projection);
    }
  }
  return normalized;
}

export function toMatchProjection(args: {
  match: SamsLeagueMatch;
  clubByUuid: Map<string, SamsClubInput>;
  publicLogoBaseUrl: string;
}): MatchProjection | undefined {
  const team1 = toMatchTeamSide({
    team: args.match._embedded?.team1 ?? undefined,
    clubByUuid: args.clubByUuid,
    publicLogoBaseUrl: args.publicLogoBaseUrl,
  });
  const team2 = toMatchTeamSide({
    team: args.match._embedded?.team2 ?? undefined,
    clubByUuid: args.clubByUuid,
    publicLogoBaseUrl: args.publicLogoBaseUrl,
  });
  if (!team1 || !team2) {
    return undefined;
  }

  const hasResult = Boolean(args.match.results?.winner);
  const location = normalizeLocation(args.match.location);
  return {
    uuid: args.match.uuid,
    ...(args.match.date != null ? { date: args.match.date } : {}),
    ...(args.match.time != null ? { time: args.match.time } : {}),
    ...(args.match.leagueUuid ? { leagueUuid: args.match.leagueUuid } : {}),
    ...(args.match.seasonUuid ? { seasonUuid: args.match.seasonUuid } : {}),
    team1,
    team2,
    ...(location ? { location } : {}),
    ...(hasResult ? { result: normalizeMatchResult(args.match.results) } : {}),
    hasResult,
  };
}

function toMatchTeamSide(args: {
  team: SamsMatchTeamSide | undefined;
  clubByUuid: Map<string, SamsClubInput>;
  publicLogoBaseUrl: string;
}): MatchTeamSide | undefined {
  if (!args.team?.uuid || !args.team.name?.trim()) {
    return undefined;
  }

  const sportsclubUuid = args.team.sportsclubUuid?.trim() || undefined;
  const club = sportsclubUuid ? args.clubByUuid.get(sportsclubUuid) : undefined;
  return {
    uuid: args.team.uuid,
    name: args.team.name.trim(),
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
  };
}

function normalizeLocation(
  location: SamsLeagueMatch["location"],
): MatchProjection["location"] | undefined {
  const uuid = location?.uuid?.trim();
  if (!uuid) {
    return undefined;
  }
  const name = location?.name?.trim();
  return {
    uuid,
    ...(name ? { name } : {}),
  };
}

function normalizeMatchResult(
  results: SamsMatchResults | null | undefined,
): MatchProjection["result"] | undefined {
  if (!results?.winner) {
    return undefined;
  }

  const sets =
    results.sets
      ?.filter((set) => set.number !== undefined)
      .map((set) => ({
        number: set.number as number,
        ...(set.ballPoints ? { ballPoints: set.ballPoints } : {}),
        ...(set.winner ? { winner: set.winner } : {}),
        ...(set.winnerName ? { winnerName: set.winnerName } : {}),
        ...(set.duration !== undefined ? { duration: set.duration } : {}),
      })) ?? [];

  return {
    winner: results.winner,
    ...(results.winnerName != null ? { winnerName: results.winnerName } : {}),
    ...(results.setPoints != null ? { setPoints: results.setPoints } : {}),
    ...(results.ballPoints != null ? { ballPoints: results.ballPoints } : {}),
    ...(sets.length > 0 ? { sets } : {}),
  };
}
