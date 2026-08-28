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
import { createEventEnvelope, SamsEventType } from "@src/events/schemas";
import { syncAssociationsFromSams } from "@src/sync/associations";
import {
  fanOutClubsSyncWorkers,
  resolveAssociationsForClubsSync,
} from "@src/sync/clubs-coordinator";
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
  const publisher = new EventBridgePublisher(eventBridge, env.EVENT_BUS_NAME);
  const registeredClubUuids = config.clubs.map((club) => club.uuid);
  const startedAt = Date.now();

  try {
    const { associations, devBootstrapped } = await resolveAssociationsForClubsSync({
      environment: env.CDK_ENVIRONMENT,
      associationsRepo: repos.associations,
      refreshAssociationsFromSams:
        env.CDK_ENVIRONMENT === "dev"
          ? async () => {
              const sams = getSamsClient(config.samsApiKey);
              await syncAssociationsFromSams({
                sams,
                associationsRepo: repos.associations,
              });
            }
          : undefined,
    });

    if (devBootstrapped) {
      logger.info("Dev bootstrap refreshed associations from SAMS before club fan-out", {
        associationsFound: associations.length,
      });
    }

    if (associations.length === 0) {
      logger.warn("No associations in DynamoDB index; skipping club worker fan-out", {
        environment: env.CDK_ENVIRONMENT,
        devBootstrapped,
      });
    }

    await fanOutClubsSyncWorkers({
      associations,
      invokeWorker: async (association) => {
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
      },
    });

    await publisher.publish([
      createEventEnvelope({
        type: SamsEventType.clubsSyncCompleted,
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
