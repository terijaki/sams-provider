import { describe, expect, it } from "vite-plus/test";
import { unixTtlFromNow } from "@lib/db/repository-utils";
import type { SamsClubInput } from "@lib/db/schemas";
import {
  buildMatchBlockProjection,
  type MatchBlockRepos,
  type SamsLeagueMatch,
} from "./match-block";

const publicLogoBaseUrl = "https://cdn.example";
const now = "2026-08-27T12:00:00.000Z";

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

function repos(clubs: SamsClubInput[] = []): MatchBlockRepos {
  return {
    clubs: {
      listAll: async () => clubs,
    },
  };
}

function samsMatch(
  overrides: Partial<SamsLeagueMatch> & Pick<SamsLeagueMatch, "uuid">,
): SamsLeagueMatch {
  return {
    date: "2026-09-01",
    time: "18:00",
    leagueUuid: "league-1",
    seasonUuid: "season-1",
    location: { uuid: "venue-1", name: "Sports Hall" },
    _embedded: {
      team1: { uuid: "team-1", name: "Example Club 1", sportsclubUuid: "club-1" },
      team2: { uuid: "team-2", name: "Opponent Club 1", sportsclubUuid: "club-2" },
    },
    results: null,
    ...overrides,
  };
}

describe("match-block projection", () => {
  it("normalizes matches with team sides, location, and logos on the happy path", async () => {
    const matches = await buildMatchBlockProjection({
      matches: [
        samsMatch({
          uuid: "match-1",
          results: {
            winner: "team-1",
            winnerName: "Example Club 1",
            setPoints: "3:1",
            ballPoints: "98:87",
            sets: [
              { number: 1, ballPoints: "25:20", winner: "team-1", winnerName: "Example Club 1" },
              { number: 2, ballPoints: "22:25", winner: "team-2", winnerName: "Opponent Club 1" },
            ],
          },
        }),
      ],
      repos: repos([
        club({ sportsclubUuid: "club-1", logoS3Key: "sams-logos/club-1.png" }),
        club({ sportsclubUuid: "club-2", logoS3Key: "sams-logos/club-2.webp" }),
      ]),
      publicLogoBaseUrl,
    });

    expect(matches).toEqual([
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
          logoUrl: "https://cdn.example/sams-logos/club-2.webp",
        },
        location: { uuid: "venue-1", name: "Sports Hall" },
        result: {
          winner: "team-1",
          winnerName: "Example Club 1",
          setPoints: "3:1",
          ballPoints: "98:87",
          sets: [
            { number: 1, ballPoints: "25:20", winner: "team-1", winnerName: "Example Club 1" },
            { number: 2, ballPoints: "22:25", winner: "team-2", winnerName: "Opponent Club 1" },
          ],
        },
        hasResult: true,
      },
    ]);
  });

  it("omits logoUrl when the club row is missing but keeps sportsclubUuid", async () => {
    const matches = await buildMatchBlockProjection({
      matches: [samsMatch({ uuid: "match-1" })],
      repos: repos([club({ sportsclubUuid: "club-1", logoS3Key: "sams-logos/club-1.png" })]),
      publicLogoBaseUrl,
    });

    expect(matches[0]?.team1).toEqual({
      uuid: "team-1",
      name: "Example Club 1",
      sportsclubUuid: "club-1",
      logoUrl: "https://cdn.example/sams-logos/club-1.png",
    });
    expect(matches[0]?.team2).toEqual({
      uuid: "team-2",
      name: "Opponent Club 1",
      sportsclubUuid: "club-2",
    });
  });

  it("sets logoUrl to null when the club has no mirrored logo", async () => {
    const matches = await buildMatchBlockProjection({
      matches: [samsMatch({ uuid: "match-1" })],
      repos: repos([club({ sportsclubUuid: "club-1" }), club({ sportsclubUuid: "club-2" })]),
      publicLogoBaseUrl,
    });

    expect(matches[0]?.team1?.logoUrl).toBeNull();
    expect(matches[0]?.team2?.logoUrl).toBeNull();
  });

  it("skips matches when a team side is missing", async () => {
    const matches = await buildMatchBlockProjection({
      matches: [
        samsMatch({
          uuid: "match-incomplete",
          _embedded: {
            team1: { uuid: "team-1", name: "Example Club 1", sportsclubUuid: "club-1" },
            team2: null,
          },
        }),
        samsMatch({ uuid: "match-complete" }),
      ],
      repos: repos([
        club({ sportsclubUuid: "club-1", logoS3Key: "sams-logos/club-1.png" }),
        club({ sportsclubUuid: "club-2", logoS3Key: "sams-logos/club-2.png" }),
      ]),
      publicLogoBaseUrl,
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]?.uuid).toBe("match-complete");
  });

  it("normalizes every match in a multi-match block", async () => {
    const matches = await buildMatchBlockProjection({
      matches: [
        samsMatch({ uuid: "match-1", time: "16:00" }),
        samsMatch({
          uuid: "match-2",
          time: "18:00",
          results: { winner: "team-2", winnerName: "Opponent Club 1", setPoints: "3:0" },
        }),
      ],
      repos: repos([
        club({ sportsclubUuid: "club-1", logoS3Key: "sams-logos/club-1.png" }),
        club({ sportsclubUuid: "club-2", logoS3Key: "sams-logos/club-2.png" }),
      ]),
      publicLogoBaseUrl,
    });

    expect(matches).toHaveLength(2);
    expect(matches.map((match) => match.uuid)).toEqual(["match-1", "match-2"]);
    expect(matches[0]?.hasResult).toBe(false);
    expect(matches[0]?.result).toBeUndefined();
    expect(matches[1]?.hasResult).toBe(true);
    expect(matches[1]?.result?.winner).toBe("team-2");
  });
});
