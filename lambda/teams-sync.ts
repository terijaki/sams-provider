import { randomUUID } from "node:crypto";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { captureLambdaHandler } from "@aws-lambda-powertools/tracer/middleware";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { SSMClient } from "@aws-sdk/client-ssm";
import middy from "@middy/core";
import { loadProviderRuntimeConfig } from "@src/config/load";
import { EventBridgePublisher } from "@src/events/eventbridge-publisher";
import { syncTeams } from "@src/sync/teams";
import { getSamsClient } from "@utils/sams-client";
import { createSamsRepositories } from "@lib/db/repositories/create-sams-repositories";
import { parseLambdaEnv } from "./utils/env";
import { createDynamoDocClient, createLambdaResources } from "./utils/resources";
import { SyncLambdaEnvironmentSchema } from "./types";

const { logger, tracer } = createLambdaResources("teams-sync");
const env = parseLambdaEnv(SyncLambdaEnvironmentSchema);
const docClient = createDynamoDocClient(tracer);
const repos = createSamsRepositories(docClient, env.SAMS_TABLE_NAME);
const ssm = new SSMClient({});
const eventBridge = new EventBridgeClient({});

const lambdaHandler = async () => {
  const sourceSyncId = randomUUID();
  const config = await loadProviderRuntimeConfig({ environment: env.CDK_ENVIRONMENT, ssm });
  const sams = getSamsClient(config.samsApiKey);
  const publisher = new EventBridgePublisher(eventBridge, env.EVENT_BUS_NAME);

  try {
    const result = await syncTeams({
      sams,
      repos,
      publisher,
      clubs: config.clubs,
      publicLogoBaseUrl: env.LOGO_PUBLIC_BASE_URL,
      sourceSyncId,
    });
    logger.info("Teams sync completed", result);
    return result;
  } catch (error) {
    logger.error("Teams sync failed", { error });
    await repos.syncMeta.put({
      job: "teams",
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
