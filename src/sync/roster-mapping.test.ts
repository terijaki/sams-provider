import { describe, expect, it } from "vite-plus/test";
import { mapRosterOfficials, mapRosterPlayers } from "./roster-mapping";

describe("roster mapping", () => {
  it("maps players and officials with pseudo UUIDs when SAMS omits ids", () => {
    const players = mapRosterPlayers("team-1", [
      { name: "Jane Player", jerseyNumber: 7, position: "OH" },
    ]);
    const officials = mapRosterOfficials("team-1", [{ name: "Coach Example", role: "Coach" }]);

    expect(players).toHaveLength(1);
    expect(players[0]?.uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(players[0]?.name).toBe("Jane Player");
    expect(officials[0]?.role).toBe("Coach");
  });

  it("honors an empty roster from SAMS", () => {
    expect(mapRosterPlayers("team-1", [])).toEqual([]);
    expect(mapRosterOfficials("team-1", [])).toEqual([]);
  });
});
