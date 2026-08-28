import { randomUUID } from "node:crypto";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { captureLambdaHandler } from "@aws-lambda-powertools/tracer/middleware";
import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { SSMClient } from "@aws-sdk/client-ssm";
import middy from "@middy/core";
import { AWS } from "@project.config";
import { loadProviderRuntimeConfig } from "@src/config/load";
import { EventBridgePublisher } from "@src/events/eventbridge-publisher";
import { createEventEnvelope, EventType } from "@src/events/schemas";
import { syncAssociationsFromSams } from "@src/sync/associations";
import { getSamsClient } from "@utils/sams-client";
import { createSamsRepositories } from "@lib/db/repositories/create-sams-repositories";
import { parseLambdaEnv } from "./utils/env";
import { createDynamoDocClient, createLambdaResources } from "./utils/resources";
import { ClubsSyncCoordinatorEnvironmentSchema } from "./types";

const { logger, tracer } = createLambdaResources("clubs-sync-coordinator");
const env = parseLambdaEnv(ClubsSyncCoordinatorEnvironmentSchema);
const docClient = createDynamoDocClient(tracer);
const repos = createSamsRepositories(docClient, env.SAMS_TABLE_NAME);
const ssm = new SSMClient({});
const eventBridge = new EventBridgeClient({});
const lambda = new LambdaClient({ region: AWS.region });

const lambdaHandler = async () => {
  const sourceSyncId = randomUUID();
  const config = await loadProviderRuntimeConfig({
    environment: env.CDK_ENVIRONMENT,
    ssmPrefix: env.SSM_PREFIX,
    ssm,
  });
  const sams = getSamsClient(config.samsApiKey);
  const publisher = new EventBridgePublisher(eventBridge, env.EVENT_BUS_NAME);
  const registeredClubUuids = config.clubs.map((club) => club.uuid);
  const startedAt = Date.now();

  try {
    const { associations } = await syncAssociationsFromSams({
      sams,
      associationsRepo: repos.associations,
    });

    for (const association of associations) {
      await lambda.send(
        new InvokeCommand({
          FunctionName: env.CLUBS_SYNC_WORKER_FUNCTION_NAME,
          InvocationType: "Event",
          Payload: JSON.stringify({
            associationUuid: association.uuid,
            associationName: association.name,
            sourceSyncId,
            registeredClubUuids,
          }),
        }),
      );
    }

    await publisher.publish([
      createEventEnvelope({
        type: EventType.clubsSyncCompleted,
        sourceSyncId,
        payload: {
          associationsInvoked: associations.length,
          associationUuids: associations.map((association) => association.uuid),
        },
      }),
    ]);

    await repos.syncMeta.put({
      job: "clubs-coordinator",
      status: "success",
      durationMs: Date.now() - startedAt,
      itemCount: associations.length,
    });

    logger.info("Clubs sync coordinator completed", {
      associationsInvoked: associations.length,
      sourceSyncId,
    });

    return { associationsInvoked: associations.length, sourceSyncId };
  } catch (error) {
    logger.error("Clubs sync coordinator failed", { error });
    await repos.syncMeta.put({
      job: "clubs-coordinator",
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
