import type {
  clubMatchSchedulePayloadSchema,
  clubProjectionSchema,
  clubSeasonTeamsPayloadSchema,
  leagueRankingEntrySchema,
  matchProjectionSchema,
  matchTeamSideSchema,
  teamProjectionSchema,
} from "../events/schemas";
import type { z } from "zod";

export type ClubProjection = z.infer<typeof clubProjectionSchema>;
export type TeamProjection = z.infer<typeof teamProjectionSchema>;
export type ClubSeasonTeamsProjection = z.infer<typeof clubSeasonTeamsPayloadSchema>;
export type ClubMatchScheduleProjection = z.infer<typeof clubMatchSchedulePayloadSchema>;
export type LeagueRankingEntry = z.infer<typeof leagueRankingEntrySchema>;
export type MatchProjection = z.infer<typeof matchProjectionSchema>;
export type MatchTeamSide = z.infer<typeof matchTeamSideSchema>;
