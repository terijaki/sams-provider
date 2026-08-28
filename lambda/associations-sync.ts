import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { captureLambdaHandler } from "@aws-lambda-powertools/tracer/middleware";
import { SSMClient } from "@aws-sdk/client-ssm";
import middy from "@middy/core";
import { loadProviderRuntimeConfig } from "@src/config/load";
import { syncAssociationsFromSams } from "@src/sync/associations";
import { getSamsClient } from "@utils/sams-client";
import { createSamsRepositories } from "@lib/db/repositories/create-sams-repositories";
import { parseLambdaEnv } from "./utils/env";
import { createDynamoDocClient, createLambdaResources } from "./utils/resources";
import { SyncLambdaEnvironmentSchema } from "./types";

const { logger, tracer } = createLambdaResources("associations-sync");
const env = parseLambdaEnv(SyncLambdaEnvironmentSchema);
const docClient = createDynamoDocClient(tracer);
const repos = createSamsRepositories(docClient, env.SAMS_TABLE_NAME);
const ssm = new SSMClient({});

const lambdaHandler = async () => {
  const config = await loadProviderRuntimeConfig({
    environment: env.CDK_ENVIRONMENT,
    ssmPrefix: env.SSM_PREFIX,
    ssm,
  });
  const sams = getSamsClient(config.samsApiKey);
  const startedAt = Date.now();

  try {
    const { associations } = await syncAssociationsFromSams({
      sams,
      associationsRepo: repos.associations,
    });

    await repos.syncMeta.put({
      job: "associations",
      status: "success",
      durationMs: Date.now() - startedAt,
      itemCount: associations.length,
    });

    logger.info("Associations sync completed", {
      associationsSynced: associations.length,
    });

    return { associationsSynced: associations.length };
  } catch (error) {
    logger.error("Associations sync failed", { error });
    await repos.syncMeta.put({
      job: "associations",
      status: "failure",
      durationMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
};

export const handler = middy(lambdaHandler)
  .use(injectLambdaContext(logger))
  .use(captureLambdaHandler(tracer));
