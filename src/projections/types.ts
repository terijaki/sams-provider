import type {
  clubProjectionSchema,
  clubSeasonTeamsPayloadSchema,
  teamProjectionSchema,
} from "../events/schemas";
import type { z } from "zod";

export type ClubProjection = z.infer<typeof clubProjectionSchema>;
export type TeamProjection = z.infer<typeof teamProjectionSchema>;
export type ClubSeasonTeamsProjection = z.infer<typeof clubSeasonTeamsPayloadSchema>;
