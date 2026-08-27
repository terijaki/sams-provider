import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_MATCH_REFRESH_POLICY } from "../config/schema";
import {
  buildMatchBlocks,
  MatchRefreshState,
  planMatchRefresh,
  type PlannedMatch,
} from "./planner";

const baseMatch: PlannedMatch = {
  uuid: "m1",
  date: "2026-08-27",
  time: "14:00",
  leagueUuid: "league-1",
  locationUuid: "venue-1",
  hasResult: false,
  sportsclubUuids: ["club-1"],
};

describe("match refresh planner", () => {
  it("groups sequential matches that share league, date, venue, and start time", () => {
    const blocks = buildMatchBlocks([
      baseMatch,
      { ...baseMatch, uuid: "m2" },
      { ...baseMatch, uuid: "m3", time: "16:00" },
    ]);
    expect(blocks).toHaveLength(2);
    const sequential = blocks.find((block) => block.matchUuids.includes("m1"));
    expect(sequential?.matchUuids).toEqual(["m1", "m2"]);
  });

  it("does not poll frequently when the match is more than 24h away", () => {
    const blocks = buildMatchBlocks([baseMatch]);
    const [decision] = planMatchRefresh({
      blocks,
      now: new Date("2026-08-25T12:00:00.000Z"),
      policy: DEFAULT_MATCH_REFRESH_POLICY,
    });
    expect(decision?.state).toBe(MatchRefreshState.scheduledFuture);
    expect(decision?.shouldRefreshMatches).toBe(false);
  });

  it("polls the sequential window until all results exist", () => {
    const blocks = buildMatchBlocks([baseMatch, { ...baseMatch, uuid: "m2" }]);
    const [decision] = planMatchRefresh({
      blocks,
      now: new Date("2026-08-27T14:30:00.000Z"),
      policy: DEFAULT_MATCH_REFRESH_POLICY,
    });
    expect(decision?.state).toBe(MatchRefreshState.sequentialWindow);
    expect(decision?.shouldRefreshMatches).toBe(true);
    expect(decision?.shouldRefreshRankings).toBe(true);
  });

  it("settles after the correction window when all results are present", () => {
    const blocks = buildMatchBlocks([
      { ...baseMatch, hasResult: true },
      { ...baseMatch, uuid: "m2", hasResult: true },
    ]);
    const [decision] = planMatchRefresh({
      blocks,
      now: new Date("2026-08-27T18:00:00.000Z"),
      policy: DEFAULT_MATCH_REFRESH_POLICY,
    });
    expect(decision?.state).toBe(MatchRefreshState.settled);
    expect(decision?.shouldRefreshMatches).toBe(false);
  });
});
