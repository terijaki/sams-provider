import { Tracer } from "@aws-lambda-powertools/tracer";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const dynamoDBClient = new DynamoDBClient({});
const tracer = new Tracer({ serviceName: "sams-provider" });
const tracedDynamoDBClient = tracer.captureAWSv3Client(dynamoDBClient);

export const docClient = DynamoDBDocumentClient.from(tracedDynamoDBClient, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  },
  unmarshallOptions: {
    wrapNumbers: false,
  },
});

export { tracedDynamoDBClient as dynamoDBClient };
