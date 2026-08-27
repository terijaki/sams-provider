import { z } from "zod";

export const associationConfigSchema = z.object({
  name: z.string().min(1),
  shortName: z.string().optional(),
  uuid: z.string().optional(),
});

export const clubSubscriptionSchema = z.object({
  uuid: z.string().min(1),
  name: z.string().min(1),
  consumerIds: z.array(z.string().min(1)).default([]),
});

export const consumerSubscription = z.enum(["clubs", "teams", "matches", "rankings", "status"]);

export const consumerConfigSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().regex(/^\d{12}$/),
  queueArn: z.string().min(1),
  environment: z.enum(["dev", "prod"]).optional(),
  subscriptions: z.array(consumerSubscription).default(["clubs", "teams", "matches", "rankings"]),
});

export const matchRefreshPolicySchema = z.object({
  preMatchHours: z.number().positive().default(2),
  activeWindowHoursAfterStart: z.number().positive().default(7),
  recentlyFinishedMinutes: z.number().positive().default(45),
  settledAfterMinutes: z.number().positive().default(120),
  pollMinutes: z.object({
    none: z.null().optional(),
    preMatch: z.number().positive().default(90),
    approaching: z.number().positive().default(20),
    active: z.number().positive().default(8),
    recentlyFinished: z.number().positive().default(8),
    completedBackoff: z.number().positive().default(20),
  }),
});

export const providerRuntimeConfigSchema = z.object({
  associations: z.array(associationConfigSchema),
  clubs: z.array(clubSubscriptionSchema),
  consumers: z.array(consumerConfigSchema),
  matchRefreshPolicy: matchRefreshPolicySchema,
  samsApiKey: z.string().min(1),
});

export type AssociationConfig = z.infer<typeof associationConfigSchema>;
export type ClubSubscription = z.infer<typeof clubSubscriptionSchema>;
export type ConsumerConfig = z.infer<typeof consumerConfigSchema>;
export type MatchRefreshPolicy = z.infer<typeof matchRefreshPolicySchema>;
export type ProviderRuntimeConfig = z.infer<typeof providerRuntimeConfigSchema>;

export const DEFAULT_MATCH_REFRESH_POLICY: MatchRefreshPolicy = matchRefreshPolicySchema.parse({
  pollMinutes: {},
});

export const SSM_ROOT = "/sams-provider";

/** Account-scoped SAMS key. Same path in every account; isolation is the account. */
export function samsApiKeyParameterPath(): string {
  return `${SSM_ROOT}/sams/api-key`;
}

export function ssmPrefix(environment: string): string {
  return `${SSM_ROOT}/${environment}`;
}

export function ssmParameterPath(
  environment: string,
  key: "sync/associations" | "sync/clubs" | "sync/consumers" | "sync/match-refresh-policy",
): string {
  return `${ssmPrefix(environment)}/${key}`;
}
