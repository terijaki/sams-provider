import { z } from "zod";

export const samsClubSchema = z.object({
  sportsclubUuid: z.string().min(1),
  type: z.literal("club").default("club"),
  name: z.string().min(1),
  nameSlug: z.string().min(1),
  associationUuid: z.string().optional(),
  associationName: z.string().optional(),
  logoImageLink: z.string().optional(),
  logoS3Key: z.string().optional(),
  updatedAt: z.iso.datetime(),
  lastSyncedAt: z.iso.datetime(),
  source: z.literal("sams").default("sams"),
  ttl: z.number().int().positive(),
});

export const samsAssociationSchema = z.object({
  uuid: z.string().min(1),
  type: z.literal("association").default("association"),
  name: z.string().min(1),
  nameSlug: z.string().min(1),
  updatedAt: z.iso.datetime(),
  lastSyncedAt: z.iso.datetime(),
  source: z.literal("sams").default("sams"),
  ttl: z.number().int().positive(),
});

export const samsTeamSchema = z.object({
  uuid: z.string().min(1),
  type: z.literal("team").default("team"),
  name: z.string().min(1),
  nameSlug: z.string().min(1),
  sportsclubUuid: z.string().min(1),
  associationUuid: z.string().min(1),
  leagueUuid: z.string().min(1),
  leagueName: z.string().min(1),
  leagueHierarchyLevel: z.number().nonnegative().optional(),
  seasonUuid: z.string().min(1),
  seasonName: z.string().min(1),
  updatedAt: z.iso.datetime(),
  lastSyncedAt: z.iso.datetime(),
  source: z.literal("sams").default("sams"),
  ttl: z.number().int().positive(),
});

export const samsRosterPlayerSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  jerseyNumber: z.number().optional(),
  position: z.string().optional(),
  portraitImageLink: z.string().optional(),
});

export const samsRosterOfficialSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  role: z.string().optional(),
});

export const samsRosterSchema = z.object({
  teamUuid: z.string().min(1),
  type: z.literal("roster").default("roster"),
  players: z.array(samsRosterPlayerSchema).default([]),
  officials: z.array(samsRosterOfficialSchema).default([]),
  updatedAt: z.iso.datetime(),
  lastSyncedAt: z.iso.datetime(),
  source: z.literal("sams").default("sams"),
  ttl: z.number().int().positive(),
});

export const samsSeasonSchema = z.object({
  uuid: z.string().min(1),
  type: z.literal("season").default("season"),
  name: z.string().min(1),
  currentSeason: z.boolean(),
  updatedAt: z.iso.datetime(),
  lastSyncedAt: z.iso.datetime(),
  source: z.literal("sams").default("sams"),
  ttl: z.number().int().positive(),
});

export const samsLeagueSchema = z.object({
  uuid: z.string().min(1),
  type: z.literal("league").default("league"),
  name: z.string().min(1),
  associationUuid: z.string().min(1),
  seasonUuid: z.string().min(1),
  leagueHierarchyUuid: z.string().optional(),
  leagueHierarchyLevel: z.number().nonnegative().optional(),
  updatedAt: z.iso.datetime(),
  lastSyncedAt: z.iso.datetime(),
  source: z.literal("sams").default("sams"),
  ttl: z.number().int().positive(),
});

export const samsMatchSchema = z.object({
  uuid: z.string().min(1),
  type: z.literal("match").default("match"),
  date: z.string().optional(),
  time: z.string().optional(),
  leagueUuid: z.string().optional(),
  seasonUuid: z.string().optional(),
  locationUuid: z.string().optional(),
  sportsclubUuids: z.array(z.string()).default([]),
  hasResult: z.boolean().default(false),
  matchBlockId: z.string().optional(),
  rawJson: z.string().min(1),
  updatedAt: z.iso.datetime(),
  lastSyncedAt: z.iso.datetime(),
  source: z.literal("sams").default("sams"),
  ttl: z.number().int().positive(),
});

export const samsSyncMetaSchema = z.object({
  job: z.string().min(1),
  type: z.literal("sync-meta").default("sync-meta"),
  status: z.enum(["success", "failure"]),
  itemCount: z.number().int().nonnegative().optional(),
  durationMs: z.number().nonnegative(),
  errorMessage: z.string().optional(),
  updatedAt: z.iso.datetime(),
  lastSyncedAt: z.iso.datetime(),
  source: z.literal("sams-provider").default("sams-provider"),
  ttl: z.number().int().positive(),
});

export type SamsClubInput = z.infer<typeof samsClubSchema>;
export type SamsAssociationInput = z.infer<typeof samsAssociationSchema>;
export type SamsTeamInput = z.infer<typeof samsTeamSchema>;
export type SamsRosterInput = z.infer<typeof samsRosterSchema>;
export type SamsSeasonInput = z.infer<typeof samsSeasonSchema>;
export type SamsLeagueInput = z.infer<typeof samsLeagueSchema>;
export type SamsMatchInput = z.infer<typeof samsMatchSchema>;
export type SamsSyncMetaInput = z.infer<typeof samsSyncMetaSchema>;
