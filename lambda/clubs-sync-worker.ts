import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { captureLambdaHandler } from "@aws-lambda-powertools/tracer/middleware";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { SSMClient } from "@aws-sdk/client-ssm";
import middy from "@middy/core";
import { z } from "zod";
import { loadProviderRuntimeConfig } from "@src/config/load";
import { EventBridgePublisher } from "@src/events/eventbridge-publisher";
import { fetchLogoAndKey, syncAssociationClubs } from "@src/sync/clubs";
import { getSamsClient } from "@utils/sams-client";
import { createSamsRepositories } from "@lib/db/repositories/create-sams-repositories";
import { parseLambdaEnv } from "./utils/env";
import { createDynamoDocClient, createLambdaResources } from "./utils/resources";
import { ClubsSyncWorkerEnvironmentSchema } from "./types";

const ClubsSyncWorkerEventSchema = z.object({
  associationUuid: z.string().min(1),
  associationName: z.string().min(1),
  sourceSyncId: z.string().min(1),
  registeredClubUuids: z.array(z.string().min(1)).default([]),
});

const { logger, tracer } = createLambdaResources("clubs-sync-worker");
const env = parseLambdaEnv(ClubsSyncWorkerEnvironmentSchema);
const docClient = createDynamoDocClient(tracer);
const repos = createSamsRepositories(docClient, env.SAMS_TABLE_NAME);
const s3 = new S3Client({});
const ssm = new SSMClient({});
const eventBridge = new EventBridgeClient({});

const lambdaHandler = async (event: unknown) => {
  const payload = ClubsSyncWorkerEventSchema.parse(event);
  const config = await loadProviderRuntimeConfig({
    environment: env.CDK_ENVIRONMENT,
    ssmPrefix: env.SSM_PREFIX,
    ssm,
  });
  const sams = getSamsClient(config.samsApiKey);
  const publisher = new EventBridgePublisher(eventBridge, env.EVENT_BUS_NAME);

  try {
    const result = await syncAssociationClubs({
      sams,
      repos,
      publisher,
      associationUuid: payload.associationUuid,
      associationName: payload.associationName,
      registeredClubUuids: new Set(payload.registeredClubUuids),
      publicLogoBaseUrl: env.LOGO_PUBLIC_BASE_URL,
      sourceSyncId: payload.sourceSyncId,
      uploadLogo: async ({ sportsclubUuid, logoUrl }) => {
        const uploaded = await fetchLogoAndKey({ sportsclubUuid, logoUrl });
        if (!uploaded) {
          return undefined;
        }
        await s3.send(
          new PutObjectCommand({
            Bucket: env.LOGO_BUCKET_NAME,
            Key: uploaded.key,
            Body: uploaded.body,
            ContentType: uploaded.contentType,
            CacheControl: "public, max-age=604800",
          }),
        );
        return uploaded.key;
      },
    });
    logger.info("Clubs sync worker completed", {
      associationUuid: payload.associationUuid,
      ...result,
    });
    return result;
  } catch (error) {
    logger.error("Clubs sync worker failed", {
      associationUuid: payload.associationUuid,
      error,
    });
    await repos.syncMeta.put({
      job: `clubs-${payload.associationUuid}`,
      status: "failure",
      durationMs: 0,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
};

export const handler = middy(lambdaHandler)
  .use(injectLambdaContext(logger))
  .use(captureLambdaHandler(tracer));
