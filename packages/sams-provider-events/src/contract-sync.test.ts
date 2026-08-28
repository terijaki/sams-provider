import { describe, expect, it } from "vite-plus/test";
import type { z } from "zod";
import { contractPayloadFixtures } from "./contract-fixtures";
import { SamsEventType } from "./constants";
import {
  clubMatchSchedulePayloadSchema,
  clubProjectionSchema,
  clubSeasonRostersPayloadSchema,
  clubSeasonTeamsPayloadSchema,
  leagueRankingUpdatedPayloadSchema,
  matchBlockUpdatedPayloadSchema,
  teamRosterUpdatedPayloadSchema,
} from "./schemas";
import type {
  Club,
  ClubMatchSchedule,
  ClubSeasonRosters,
  ClubSeasonTeams,
  LeagueRankingUpdate,
  MatchBlockUpdate,
  TeamRosterUpdate,
} from "./types";

type AssertEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type SchemaClub = z.infer<typeof clubProjectionSchema>;
type SchemaClubSeasonTeams = z.infer<typeof clubSeasonTeamsPayloadSchema>;
type SchemaClubSeasonRosters = z.infer<typeof clubSeasonRostersPayloadSchema>;
type SchemaTeamRosterUpdate = z.infer<typeof teamRosterUpdatedPayloadSchema>;
type SchemaClubMatchSchedule = z.infer<typeof clubMatchSchedulePayloadSchema>;
type SchemaMatchBlockUpdate = z.infer<typeof matchBlockUpdatedPayloadSchema>;
type SchemaLeagueRankingUpdate = z.infer<typeof leagueRankingUpdatedPayloadSchema>;

const _clubSync: AssertEqual<Club, SchemaClub> = true;
const _clubSeasonTeamsSync: AssertEqual<ClubSeasonTeams, SchemaClubSeasonTeams> = true;
const _clubSeasonRostersSync: AssertEqual<ClubSeasonRosters, SchemaClubSeasonRosters> = true;
const _teamRosterSync: AssertEqual<TeamRosterUpdate, SchemaTeamRosterUpdate> = true;
const _clubMatchScheduleSync: AssertEqual<ClubMatchSchedule, SchemaClubMatchSchedule> = true;
const _matchBlockSync: AssertEqual<MatchBlockUpdate, SchemaMatchBlockUpdate> = true;
const _leagueRankingSync: AssertEqual<LeagueRankingUpdate, SchemaLeagueRankingUpdate> = true;

describe("contract sync between hand-written types and Zod schemas", () => {
  it("accepts typed fixtures through payload schemas", () => {
    expect(clubProjectionSchema.parse(contractPayloadFixtures[SamsEventType.clubUpdated])).toEqual(
      contractPayloadFixtures[SamsEventType.clubUpdated],
    );
    expect(
      clubSeasonTeamsPayloadSchema.parse(
        contractPayloadFixtures[SamsEventType.clubSeasonTeamsUpdated],
      ),
    ).toEqual(contractPayloadFixtures[SamsEventType.clubSeasonTeamsUpdated]);
    expect(
      clubSeasonRostersPayloadSchema.parse(
        contractPayloadFixtures[SamsEventType.clubSeasonRostersUpdated],
      ),
    ).toEqual(contractPayloadFixtures[SamsEventType.clubSeasonRostersUpdated]);
    expect(
      teamRosterUpdatedPayloadSchema.parse(
        contractPayloadFixtures[SamsEventType.teamRosterUpdated],
      ),
    ).toEqual(contractPayloadFixtures[SamsEventType.teamRosterUpdated]);
    expect(
      clubMatchSchedulePayloadSchema.parse(
        contractPayloadFixtures[SamsEventType.clubMatchScheduleUpdated],
      ),
    ).toEqual(contractPayloadFixtures[SamsEventType.clubMatchScheduleUpdated]);
    expect(
      matchBlockUpdatedPayloadSchema.parse(
        contractPayloadFixtures[SamsEventType.matchBlockUpdated],
      ),
    ).toEqual(contractPayloadFixtures[SamsEventType.matchBlockUpdated]);
    expect(
      leagueRankingUpdatedPayloadSchema.parse(
        contractPayloadFixtures[SamsEventType.leagueRankingUpdated],
      ),
    ).toEqual(contractPayloadFixtures[SamsEventType.leagueRankingUpdated]);
  });
});
