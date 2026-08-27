import { z } from "zod";
import { optionalEnvString, requiredEnvString } from "./utils/env";

export const SyncLambdaEnvironmentSchema = z.object({
  CDK_ENVIRONMENT: z.enum(["dev", "prod"]).or(z.string().min(1)),
  SAMS_TABLE_NAME: requiredEnvString,
  CACHE_TABLE_NAME: requiredEnvString,
  LOGO_BUCKET_NAME: requiredEnvString,
  LOGO_PUBLIC_BASE_URL: requiredEnvString,
  EVENT_BUS_NAME: requiredEnvString,
  SSM_PREFIX: requiredEnvString,
  POWERTOOLS_SERVICE_NAME: optionalEnvString,
});

export type SyncLambdaEnvironment = z.infer<typeof SyncLambdaEnvironmentSchema>;
