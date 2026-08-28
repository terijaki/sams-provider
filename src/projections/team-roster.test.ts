import { describe, expect, it } from "vite-plus/test";
import {
  buildClubSeasonRostersProjection,
  buildTeamRosterProjection,
  rosterProjectionSnapshot,
} from "./team-roster";

describe("team-roster projection", () => {
  const club = {
    sportsclubUuid: "club-1",
    name: "Example Club",
    nameSlug: "example-club",
    logoUrl: "https://cdn.example/sams-logos/club-1.png",
  };
  const team = {
    uuid: "team-1",
    name: "Example Club 1",
    nameSlug: "example-club-1",
    sportsclubUuid: "club-1",
    leagueUuid: "league-1",
    leagueName: "Landesliga",
    seasonUuid: "season-1",
    seasonName: "2026/27",
  };
  const season = { uuid: "season-1", name: "2026/27", current: true };

  it("builds a per-team roster projection with normalized portrait URLs", () => {
    const projection = buildTeamRosterProjection({
      team,
      roster: {
        players: [
          {
            uuid: "player-1",
            name: "Jane Player",
            jerseyNumber: 7,
            portraitImageLink: "https://sams.example/portraits/player-1.jpg",
          },
        ],
        officials: [{ uuid: "official-1", name: "Coach Example", role: "Coach" }],
        lastSyncedAt: "2026-08-27T12:00:00.000Z",
      },
      season,
      projectedAt: "2026-08-27T12:00:00.000Z",
    });

    expect(projection.team.sportsclubUuid).toBe("club-1");
    expect(projection.players[0]?.portraitUrl).toBe("https://sams.example/portraits/player-1.jpg");
    expect(projection.officials[0]?.role).toBe("Coach");
  });

  it("builds club-scoped roster snapshots for current-season teams", () => {
    const projection = buildClubSeasonRostersProjection({
      club,
      teams: [
        team,
        {
          uuid: "team-other",
          name: "Other",
          nameSlug: "other",
          sportsclubUuid: "club-2",
          leagueUuid: "league-1",
          leagueName: "Landesliga",
          seasonUuid: "season-1",
          seasonName: "2026/27",
        },
      ],
      rostersByTeamUuid: new Map([
        [
          "team-1",
          {
            players: [{ uuid: "player-1", name: "Jane Player" }],
            officials: [],
            lastSyncedAt: "2026-08-27T11:00:00.000Z",
          },
        ],
      ]),
      season,
      projectedAt: "2026-08-27T12:00:00.000Z",
    });

    expect(projection.rosters).toHaveLength(1);
    expect(projection.rosters[0]?.team.uuid).toBe("team-1");
    expect(projection.cachedAt).toBe("2026-08-27T11:00:00.000Z");
  });

  it("tracks roster snapshot changes for empty squads", () => {
    const before = rosterProjectionSnapshot({
      players: [{ uuid: "player-1", name: "Jane Player" }],
      officials: [],
    });
    const after = rosterProjectionSnapshot({ players: [], officials: [] });
    expect(before).not.toBe(after);
  });
});
