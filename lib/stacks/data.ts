import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import type { Construct } from "constructs";
import { computeSamsDataTableName } from "../db/env";
import { SamsTableIndexes } from "../db/table-indexes";

interface DataStackProps extends cdk.StackProps {
  stackProps?: {
    environment: string;
    branch: string;
  };
}

export class DataStack extends cdk.Stack {
  public readonly samsDataTable: dynamodb.Table;
  public readonly samsDataTableName: string;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const environment = props.stackProps?.environment || "dev";
    const isProd = environment === "prod";
    const branch = props.stackProps?.branch || "";

    this.samsDataTableName = computeSamsDataTableName(environment, branch);
    this.samsDataTable = new dynamodb.Table(this, "SamsDataTable", {
      tableName: this.samsDataTableName,
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: "ttl",
    });
    this.samsDataTable.addGlobalSecondaryIndex({
      indexName: SamsTableIndexes.gsi1,
      partitionKey: { name: "gsi1pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "gsi1sk", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    this.samsDataTable.addGlobalSecondaryIndex({
      indexName: SamsTableIndexes.gsi2,
      partitionKey: { name: "gsi2pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "gsi2sk", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
  }
}
