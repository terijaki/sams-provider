import { randomUUID } from "node:crypto";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { captureLambdaHandler } from "@aws-lambda-powertools/tracer/middleware";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { SSMClient } from "@aws-sdk/client-ssm";
import middy from "@middy/core";
import { loadProviderRuntimeConfig } from "@src/config/load";
import { buildSyncAssociations } from "@src/config/associations";
import { EventBridgePublisher } from "@src/events/eventbridge-publisher";
import { fetchLogoAndKey, syncClubs } from "@src/sync/clubs";
import { getSamsClient } from "@utils/sams-client";
import { createSamsRepositories } from "@lib/db/repositories/create-sams-repositories";
import { parseLambdaEnv } from "./utils/env";
import { createDynamoDocClient, createLambdaResources } from "./utils/resources";
import { SyncLambdaEnvironmentSchema } from "./types";

const { logger, tracer } = createLambdaResources("clubs-sync");
const env = parseLambdaEnv(SyncLambdaEnvironmentSchema);
const docClient = createDynamoDocClient(tracer);
const repos = createSamsRepositories(docClient, env.SAMS_TABLE_NAME);
const s3 = new S3Client({});
const ssm = new SSMClient({});
const eventBridge = new EventBridgeClient({});

const lambdaHandler = async () => {
  const sourceSyncId = randomUUID();
  const config = await loadProviderRuntimeConfig({
    environment: env.CDK_ENVIRONMENT,
    ssmPrefix: env.SSM_PREFIX,
    ssm,
  });
  const sams = getSamsClient(config.samsApiKey);
  const publisher = new EventBridgePublisher(eventBridge, env.EVENT_BUS_NAME);
  const storedClubs = await repos.clubs.listAll();
  const associations = buildSyncAssociations(config.associations, config.clubs, storedClubs);

  try {
    const result = await syncClubs({
      sams,
      repos,
      publisher,
      associations,
      publicLogoBaseUrl: env.LOGO_PUBLIC_BASE_URL,
      sourceSyncId,
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
    logger.info("Clubs sync completed", result);
    return result;
  } catch (error) {
    logger.error("Clubs sync failed", { error });
    await repos.syncMeta.put({
      job: "clubs",
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
