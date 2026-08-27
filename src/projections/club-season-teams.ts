import type { ClubProjection, ClubSeasonTeamsProjection, TeamProjection } from "./types";

export type ClubRecord = {
  sportsclubUuid: string;
  name: string;
  nameSlug: string;
  associationUuid?: string;
  associationName?: string;
  logoUrl: string | null;
};

export type TeamRecord = {
  uuid: string;
  name: string;
  nameSlug: string;
  sportsclubUuid: string;
  leagueUuid: string;
  leagueName: string;
  leagueHierarchyLevel?: number;
  seasonUuid: string;
  seasonName: string;
};

export function toClubProjection(club: ClubRecord): ClubProjection {
  return {
    uuid: club.sportsclubUuid,
    name: club.name,
    slug: club.nameSlug,
    ...(club.associationUuid ? { associationUuid: club.associationUuid } : {}),
    ...(club.associationName ? { associationName: club.associationName } : {}),
    logoUrl: club.logoUrl,
  };
}

export function toTeamProjection(team: TeamRecord): TeamProjection {
  return {
    uuid: team.uuid,
    name: team.name,
    slug: team.nameSlug,
    leagueUuid: team.leagueUuid,
    leagueName: team.leagueName,
    ...(team.leagueHierarchyLevel !== undefined
      ? { leagueHierarchyLevel: team.leagueHierarchyLevel }
      : {}),
  };
}

export function buildClubSeasonTeamsProjection(args: {
  club: ClubRecord;
  teams: TeamRecord[];
  season: { uuid: string; name: string; current: boolean };
  projectedAt?: string;
}): ClubSeasonTeamsProjection {
  const teams = args.teams
    .filter((team) => team.sportsclubUuid === args.club.sportsclubUuid)
    .filter((team) => team.seasonUuid === args.season.uuid)
    .map(toTeamProjection);
  return {
    club: toClubProjection(args.club),
    season: args.season,
    teams,
    projectedAt: args.projectedAt ?? new Date().toISOString(),
  };
}
