import { SamsEventType } from "./constants";
import type {
  Club,
  ClubMatchSchedule,
  ClubSeasonRosters,
  ClubSeasonTeams,
  LeagueRankingUpdate,
  MatchBlockUpdate,
  TeamRosterUpdate,
} from "./types";

export const sampleClub: Club = {
  uuid: "club-1",
  name: "Example Club",
  slug: "example-club",
  logoUrl: "https://cdn.example/sams-logos/club-1.png",
};

export const sampleClubSeasonTeams: ClubSeasonTeams = {
  club: sampleClub,
  season: { uuid: "season-1", name: "2026/27", current: true },
  teams: [
    {
      uuid: "team-1",
      name: "Example Club 1",
      slug: "example-club-1",
      leagueUuid: "league-1",
      leagueName: "Landesliga",
      leagueHierarchyLevel: 3,
    },
  ],
  projectedAt: "2026-08-27T12:00:00.000Z",
};

export const sampleTeamRosterUpdate: TeamRosterUpdate = {
  team: {
    uuid: "team-1",
    name: "Example Club 1",
    slug: "example-club-1",
    sportsclubUuid: "club-1",
    leagueUuid: "league-1",
    leagueName: "Landesliga",
    leagueHierarchyLevel: 3,
  },
  season: { uuid: "season-1", name: "2026/27", current: true },
  players: [
    {
      uuid: "player-1",
      name: "Jane Player",
      jerseyNumber: 7,
      position: "OH",
      portraitUrl: "https://sams.example/portraits/player-1.jpg",
    },
  ],
  officials: [{ uuid: "official-1", name: "Coach Example", role: "Coach" }],
  projectedAt: "2026-08-27T12:00:00.000Z",
  cachedAt: "2026-08-27T12:00:00.000Z",
  isStale: false,
};

export const sampleClubSeasonRosters: ClubSeasonRosters = {
  club: sampleClub,
  season: { uuid: "season-1", name: "2026/27", current: true },
  rosters: [
    {
      team: sampleTeamRosterUpdate.team,
      players: sampleTeamRosterUpdate.players,
      officials: sampleTeamRosterUpdate.officials,
    },
  ],
  projectedAt: "2026-08-27T12:00:00.000Z",
  cachedAt: "2026-08-27T12:00:00.000Z",
  isStale: false,
};

export const sampleLeagueRankingUpdate: LeagueRankingUpdate = {
  leagueUuid: "league-1",
  leagueName: "Landesliga",
  seasonUuid: "season-1",
  seasonName: "2026/27",
  cachedAt: "2026-08-27T12:00:00.000Z",
  refreshState: "active",
  nextRefreshAfter: null,
  isStale: false,
  sourceMatchBlockId: "block-1",
  entries: [
    {
      rank: 1,
      teamUuid: "team-1",
      teamName: "Example Club 1",
      sportsclubUuid: "club-1",
      logoUrl: "https://cdn.example/sams-logos/club-1.png",
      points: 12,
    },
  ],
};

export const sampleMatchBlockUpdate: MatchBlockUpdate = {
  matchBlockId: "block-1",
  leagueUuid: "league-1",
  date: "2026-09-01",
  refreshState: "active",
  cachedAt: "2026-08-27T12:00:00.000Z",
  nextRefreshAfter: null,
  isStale: false,
  matchUuids: ["match-1"],
  matches: [
    {
      uuid: "match-1",
      date: "2026-09-01",
      time: "18:00",
      leagueUuid: "league-1",
      seasonUuid: "season-1",
      team1: {
        uuid: "team-1",
        name: "Example Club 1",
        sportsclubUuid: "club-1",
        logoUrl: "https://cdn.example/sams-logos/club-1.png",
      },
      team2: {
        uuid: "team-2",
        name: "Opponent Club 1",
        sportsclubUuid: "club-2",
      },
      location: { uuid: "venue-1", name: "Sports Hall" },
      hasResult: false,
    },
  ],
};

export const sampleClubMatchSchedule: ClubMatchSchedule = {
  club: sampleClub,
  season: { uuid: "season-1", name: "2026/27", current: true },
  matches: [
    {
      uuid: "match-1",
      date: "2026-09-10",
      time: "18:00",
      team1: { uuid: "team-1", name: "Example Club 1", sportsclubUuid: "club-1" },
      team2: { uuid: "team-2", name: "Opponent", sportsclubUuid: "club-2" },
      hasResult: false,
    },
  ],
  projectedAt: "2026-09-01T12:00:00.000Z",
  cachedAt: "2026-09-01T12:00:00.000Z",
  isStale: false,
};

export const contractPayloadFixtures = {
  [SamsEventType.clubUpdated]: sampleClub,
  [SamsEventType.clubSeasonTeamsUpdated]: sampleClubSeasonTeams,
  [SamsEventType.clubSeasonRostersUpdated]: sampleClubSeasonRosters,
  [SamsEventType.teamRosterUpdated]: sampleTeamRosterUpdate,
  [SamsEventType.clubMatchScheduleUpdated]: sampleClubMatchSchedule,
  [SamsEventType.matchBlockUpdated]: sampleMatchBlockUpdate,
  [SamsEventType.leagueRankingUpdated]: sampleLeagueRankingUpdate,
} as const;
