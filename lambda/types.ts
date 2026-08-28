import { z } from "zod";
import { optionalEnvString, requiredEnvString } from "./utils/env";

const syncLambdaEnvironmentSchema = z.object({
  CDK_ENVIRONMENT: z.enum(["dev", "prod"]).or(z.string().min(1)),
  SAMS_TABLE_NAME: requiredEnvString,
  LOGO_BUCKET_NAME: requiredEnvString,
  LOGO_PUBLIC_BASE_URL: requiredEnvString,
  EVENT_BUS_NAME: requiredEnvString,
  SSM_PREFIX: requiredEnvString,
  POWERTOOLS_SERVICE_NAME: optionalEnvString,
});

export const SyncLambdaEnvironmentSchema = syncLambdaEnvironmentSchema;
export type SyncLambdaEnvironment = z.infer<typeof SyncLambdaEnvironmentSchema>;

export const ClubsSyncCoordinatorEnvironmentSchema = syncLambdaEnvironmentSchema.extend({
  CLUBS_SYNC_WORKER_FUNCTION_NAME: requiredEnvString,
});

export const ClubsSyncWorkerEnvironmentSchema = syncLambdaEnvironmentSchema;
