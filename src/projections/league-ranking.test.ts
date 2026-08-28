import { describe, expect, it } from "vite-plus/test";
import { unixTtlFromNow } from "@lib/db/repository-utils";
import type { SamsClubInput, SamsTeamInput } from "@lib/db/schemas";
import {
  buildLeagueRankingProjection,
  type LeagueRankingRepos,
  type LeagueRankingSams,
} from "./league-ranking";

const publicLogoBaseUrl = "https://cdn.example";
const now = "2026-08-27T12:00:00.000Z";

function team(overrides: Partial<SamsTeamInput> & Pick<SamsTeamInput, "uuid">): SamsTeamInput {
  return {
    type: "team",
    name: "Example Team",
    nameSlug: "example-team",
    sportsclubUuid: "club-1",
    associationUuid: "assoc-1",
    leagueUuid: "league-1",
    leagueName: "Landesliga",
    seasonUuid: "season-1",
    seasonName: "2026/27",
    updatedAt: now,
    lastSyncedAt: now,
    source: "sams",
    ttl: unixTtlFromNow(30),
    ...overrides,
  };
}

function club(
  overrides: Partial<SamsClubInput> & Pick<SamsClubInput, "sportsclubUuid">,
): SamsClubInput {
  return {
    type: "club",
    name: "Example Club",
    nameSlug: "example-club",
    updatedAt: now,
    lastSyncedAt: now,
    source: "sams",
    ttl: unixTtlFromNow(30),
    ...overrides,
  };
}

function repos(args: {
  teams?: SamsTeamInput[];
  clubs?: SamsClubInput[];
  upsertedTeams?: SamsTeamInput[];
}): LeagueRankingRepos {
  const teams = args.teams ?? [];
  const upsertedTeams = args.upsertedTeams ?? [];
  return {
    teams: {
      listAll: async () => teams,
      upsert: async (input) => {
        const stored = team({ ...input, uuid: input.uuid });
        upsertedTeams.push(stored);
        teams.push(stored);
        return stored;
      },
    },
    clubs: {
      listAll: async () => args.clubs ?? [],
    },
    leagues: {
      listAll: async () => [
        {
          uuid: "league-1",
          type: "league",
          name: "Landesliga",
          associationUuid: "assoc-1",
          seasonUuid: "season-1",
          updatedAt: now,
          lastSyncedAt: now,
          source: "sams",
          ttl: unixTtlFromNow(30),
        },
      ],
    },
    seasons: {
      listAll: async () => [
        {
          uuid: "season-1",
          type: "season",
          name: "2026/27",
          currentSeason: true,
          updatedAt: now,
          lastSyncedAt: now,
          source: "sams",
          ttl: unixTtlFromNow(30),
        },
      ],
    },
  };
}

describe("league-ranking projection", () => {
  it("enriches ranking rows with team, club id, and logo on the happy path", async () => {
    const entries = await buildLeagueRankingProjection({
      entries: [
        {
          uuid: "team-1",
          teamName: "Example Club 1",
          rank: 1,
          points: 12,
          matchesPlayed: 4,
        },
      ],
      repos: repos({
        teams: [team({ uuid: "team-1", name: "Example Club 1" })],
        clubs: [
          club({
            sportsclubUuid: "club-1",
            logoS3Key: "sams-logos/club-1.png",
          }),
        ],
      }),
      sams: { getTeamByUuid: async () => ({ data: undefined }) },
      publicLogoBaseUrl,
      leagueUuid: "league-1",
      seasonUuid: "season-1",
      sleep: async () => undefined,
    });

    expect(entries).toEqual([
      {
        rank: 1,
        teamUuid: "team-1",
        teamName: "Example Club 1",
        sportsclubUuid: "club-1",
        logoUrl: "https://cdn.example/sams-logos/club-1.png",
        points: 12,
        matchesPlayed: 4,
      },
    ]);
  });

  it("omits sportsclubUuid when the team cannot be resolved", async () => {
    const entries = await buildLeagueRankingProjection({
      entries: [{ uuid: "team-missing", teamName: "Unknown Team", rank: 2, points: 8 }],
      repos: repos({ teams: [], clubs: [] }),
      sams: {
        getTeamByUuid: async () => ({ data: undefined, error: { message: "not found" } }),
      },
      publicLogoBaseUrl,
      leagueUuid: "league-1",
      seasonUuid: "season-1",
      sleep: async () => undefined,
    });

    expect(entries).toEqual([
      {
        rank: 2,
        teamUuid: "team-missing",
        teamName: "Unknown Team",
        points: 8,
      },
    ]);
  });

  it("includes sportsclubUuid but no logoUrl when the club row is missing", async () => {
    const entries = await buildLeagueRankingProjection({
      entries: [{ uuid: "team-1", teamName: "Example Club 1", rank: 3 }],
      repos: repos({
        teams: [team({ uuid: "team-1", sportsclubUuid: "club-missing" })],
        clubs: [],
      }),
      sams: { getTeamByUuid: async () => ({ data: undefined }) },
      publicLogoBaseUrl,
      leagueUuid: "league-1",
      seasonUuid: "season-1",
      sleep: async () => undefined,
    });

    expect(entries).toEqual([
      {
        rank: 3,
        teamUuid: "team-1",
        teamName: "Example Club 1",
        sportsclubUuid: "club-missing",
      },
    ]);
  });

  it("sets logoUrl to null when the club has no mirrored logo", async () => {
    const entries = await buildLeagueRankingProjection({
      entries: [{ uuid: "team-1", teamName: "Example Club 1", rank: 4 }],
      repos: repos({
        teams: [team({ uuid: "team-1" })],
        clubs: [club({ sportsclubUuid: "club-1" })],
      }),
      sams: { getTeamByUuid: async () => ({ data: undefined }) },
      publicLogoBaseUrl,
      leagueUuid: "league-1",
      seasonUuid: "season-1",
      sleep: async () => undefined,
    });

    expect(entries[0]?.logoUrl).toBeNull();
  });

  it("backfills team rows from SAMS when missing from the teams table", async () => {
    const upsertedTeams: SamsTeamInput[] = [];
    const sams: LeagueRankingSams = {
      getTeamByUuid: async () => ({
        data: {
          uuid: "team-new",
          name: "Backfilled Team",
          sportsclubUuid: "club-2",
          associationUuid: "assoc-1",
        },
        error: undefined,
      }),
    };

    const entries = await buildLeagueRankingProjection({
      entries: [{ uuid: "team-new", teamName: "Backfilled Team", rank: 5 }],
      repos: repos({
        teams: [],
        clubs: [club({ sportsclubUuid: "club-2", logoS3Key: "sams-logos/club-2.webp" })],
        upsertedTeams,
      }),
      sams,
      publicLogoBaseUrl,
      leagueUuid: "league-1",
      seasonUuid: "season-1",
      sleep: async () => undefined,
    });

    expect(upsertedTeams).toHaveLength(1);
    expect(upsertedTeams[0]?.uuid).toBe("team-new");
    expect(entries[0]?.sportsclubUuid).toBe("club-2");
    expect(entries[0]?.logoUrl).toBe("https://cdn.example/sams-logos/club-2.webp");
  });
});
