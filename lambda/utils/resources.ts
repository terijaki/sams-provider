import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export function createLambdaResources(serviceName: string): {
  logger: Logger;
  tracer: Tracer;
  metrics: Metrics;
} {
  const logger = new Logger({ serviceName });
  const tracer = new Tracer({ serviceName });
  const metrics = new Metrics({ namespace: "SamsProvider", serviceName });
  return { logger, tracer, metrics };
}

export function createDynamoDocClient(tracer: Tracer): DynamoDBDocumentClient {
  const baseClient = new DynamoDBClient({});
  const dynamoClient = tracer.captureAWSv3Client(baseClient);
  return DynamoDBDocumentClient.from(dynamoClient, {
    marshallOptions: {
      removeUndefinedValues: true,
      convertClassInstanceToMap: true,
    },
  });
}
