import { describe, expect, it } from "vite-plus/test";
import { buildClubSeasonTeamsProjection } from "./club-season-teams";

describe("club-season-teams projection", () => {
  it("joins current-season teams onto the owning club", () => {
    const projection = buildClubSeasonTeamsProjection({
      club: {
        sportsclubUuid: "club-1",
        name: "Example Club",
        nameSlug: "example-club",
        associationName: "SBVV",
        logoUrl: "https://cdn.example/sams-logos/club-1.png",
      },
      season: { uuid: "season-1", name: "2026/27", current: true },
      teams: [
        {
          uuid: "team-1",
          name: "Example Club 1",
          nameSlug: "example-club-1",
          sportsclubUuid: "club-1",
          leagueUuid: "league-1",
          leagueName: "Landesliga",
          seasonUuid: "season-1",
          seasonName: "2026/27",
        },
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
      projectedAt: "2026-08-27T12:00:00.000Z",
    });

    expect(projection.teams).toHaveLength(1);
    expect(projection.teams[0]?.uuid).toBe("team-1");
    expect(projection.club.logoUrl).toBe("https://cdn.example/sams-logos/club-1.png");
  });
});
