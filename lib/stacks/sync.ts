import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import type { Construct } from "constructs";
import { samsApiKeyParameterPath, ssmPrefix } from "../../src/config/schema";
import { buildLambdaFunctionName, SpNodejsFunction } from "../construct/sp-nodejs-function";
import { computeResourceBranchSuffix } from "../db/env";

interface SyncStackProps extends cdk.StackProps {
  stackProps?: {
    environment: string;
    branch: string;
  };
  samsDataTable: dynamodb.ITable;
  logoBucketName: string;
  publicLogoBaseUrl: string;
  eventBusName: string;
}

export class SyncStack extends cdk.Stack {
  public readonly associationsSync: NodejsFunction;
  public readonly clubsSyncCoordinator: NodejsFunction;
  public readonly clubsSyncWorker: NodejsFunction;
  public readonly teamsSync: NodejsFunction;
  public readonly matchRefresh: NodejsFunction;

  constructor(scope: Construct, id: string, props: SyncStackProps) {
    super(scope, id, props);

    const environment = props.stackProps?.environment || "dev";
    const branch = props.stackProps?.branch || "";
    const branchSuffix = computeResourceBranchSuffix(environment, branch);
    const prefix = ssmPrefix(environment, branch);
    const samsDataTable = props.samsDataTable;
    const logoBucket = s3.Bucket.fromBucketName(this, "LogoBucket", props.logoBucketName);
    const eventBus = events.EventBus.fromEventBusName(this, "ProviderBus", props.eventBusName);

    const commonEnvironment = {
      CDK_ENVIRONMENT: environment,
      SAMS_TABLE_NAME: samsDataTable.tableName,
      LOGO_BUCKET_NAME: props.logoBucketName,
      LOGO_PUBLIC_BASE_URL: props.publicLogoBaseUrl,
      EVENT_BUS_NAME: props.eventBusName,
      SSM_PREFIX: prefix,
      POWERTOOLS_SERVICE_NAME: "sams-provider",
      POWERTOOLS_METRICS_NAMESPACE: "SamsProvider",
    };

    this.associationsSync = new SpNodejsFunction(this, "AssociationsSync", {
      namespace: "sams",
      name: "associations-sync",
      entry: path.join(__dirname, "../../lambda/associations-sync.ts"),
      timeout: cdk.Duration.minutes(5),
      environment: commonEnvironment,
    }).lambdaFunction;

    this.clubsSyncWorker = new SpNodejsFunction(this, "ClubsSyncWorker", {
      namespace: "sams",
      name: "clubs-sync-worker",
      entry: path.join(__dirname, "../../lambda/clubs-sync-worker.ts"),
      timeout: cdk.Duration.minutes(15),
      environment: commonEnvironment,
    }).lambdaFunction;

    this.clubsSyncCoordinator = new SpNodejsFunction(this, "ClubsSyncCoordinator", {
      namespace: "sams",
      name: "clubs-sync-coordinator",
      entry: path.join(__dirname, "../../lambda/clubs-sync-coordinator.ts"),
      timeout: cdk.Duration.minutes(5),
      environment: {
        ...commonEnvironment,
        CLUBS_SYNC_WORKER_FUNCTION_NAME: this.clubsSyncWorker.functionName,
      },
    }).lambdaFunction;

    this.teamsSync = new SpNodejsFunction(this, "TeamsSync", {
      namespace: "sams",
      name: "teams-sync",
      entry: path.join(__dirname, "../../lambda/teams-sync.ts"),
      timeout: cdk.Duration.minutes(10),
      environment: commonEnvironment,
    }).lambdaFunction;

    this.matchRefresh = new SpNodejsFunction(this, "MatchRefresh", {
      namespace: "sams",
      name: "match-refresh",
      entry: path.join(__dirname, "../../lambda/match-refresh.ts"),
      timeout: cdk.Duration.minutes(15),
      environment: commonEnvironment,
    }).lambdaFunction;

    for (const fn of [
      this.associationsSync,
      this.clubsSyncCoordinator,
      this.clubsSyncWorker,
      this.teamsSync,
      this.matchRefresh,
    ]) {
      samsDataTable.grantReadWriteData(fn);
      eventBus.grantPutEventsTo(fn);
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"],
          resources: [
            `arn:aws:ssm:${this.region}:${this.account}:parameter${prefix}/*`,
            `arn:aws:ssm:${this.region}:${this.account}:parameter${samsApiKeyParameterPath()}`,
          ],
        }),
      );
    }

    this.clubsSyncCoordinator.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["lambda:InvokeFunction"],
        resources: [this.clubsSyncWorker.functionArn],
      }),
    );

    logoBucket.grantReadWrite(this.clubsSyncWorker);

    new events.Rule(this, "AssociationsSyncRule", {
      ruleName: `sams-associations-weekly-sync-${environment}${branchSuffix}`,
      description: `Weekly associations refresh (${environment}${branchSuffix})`,
      schedule: events.Schedule.cron({
        weekDay: "TUE",
        hour: "22",
        minute: "0",
      }),
    }).addTarget(new targets.LambdaFunction(this.associationsSync));

    new events.Rule(this, "ClubsSyncRule", {
      ruleName: `sams-clubs-weekly-sync-${environment}${branchSuffix}`,
      description: `Weekly clubs sync (${environment}${branchSuffix})`,
      schedule: events.Schedule.cron({
        weekDay: "WED",
        hour: "2",
        minute: "0",
      }),
    }).addTarget(new targets.LambdaFunction(this.clubsSyncCoordinator));

    new events.Rule(this, "TeamsSyncRule", {
      ruleName: `sams-teams-nightly-sync-${environment}${branchSuffix}`,
      description: `Nightly teams sync (${environment}${branchSuffix})`,
      schedule: events.Schedule.cron({
        hour: "3",
        minute: "0",
      }),
    }).addTarget(new targets.LambdaFunction(this.teamsSync));

    new events.Rule(this, "MatchRefreshRule", {
      ruleName: `sams-match-refresh-${environment}${branchSuffix}`,
      description: `Adaptive match/ranking planner every 5 minutes (${environment}${branchSuffix})`,
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
    }).addTarget(new targets.LambdaFunction(this.matchRefresh));

    new events.Rule(this, "MatchSnapshotRule", {
      ruleName: `sams-match-snapshot-weekly-${environment}${branchSuffix}`,
      description: `Weekly full match and ranking snapshot (${environment}${branchSuffix})`,
      schedule: events.Schedule.cron({
        weekDay: "WED",
        hour: "4",
        minute: "0",
      }),
    }).addTarget(
      new targets.LambdaFunction(this.matchRefresh, {
        event: events.RuleTargetInput.fromObject({ mode: "snapshot" }),
      }),
    );

    new cdk.CfnOutput(this, "AssociationsSyncFunctionName", {
      value: buildLambdaFunctionName("associations-sync"),
    });
    new cdk.CfnOutput(this, "ClubsSyncCoordinatorFunctionName", {
      value: buildLambdaFunctionName("clubs-sync-coordinator"),
    });
    new cdk.CfnOutput(this, "ClubsSyncWorkerFunctionName", {
      value: buildLambdaFunctionName("clubs-sync-worker"),
    });
    new cdk.CfnOutput(this, "TeamsSyncFunctionName", {
      value: buildLambdaFunctionName("teams-sync"),
    });
  }
}
