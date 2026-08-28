import { App, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { describe, expect, it } from "vite-plus/test";
import { lambdaErrorAlarmId, MonitoringStack } from "./monitoring";

function nestedFunction(scope: Construct, id: string, name: string): lambda.Function {
  const parent = new Construct(scope, id);
  return new lambda.Function(parent, "Function", {
    runtime: lambda.Runtime.NODEJS_24_X,
    handler: "index.handler",
    code: lambda.Code.fromInline("exports.handler = async () => ({})"),
    functionName: name,
  });
}

describe("lambdaErrorAlarmId", () => {
  it("uses the parent construct id when the Lambda itself is named Function", () => {
    const app = new App();
    const stack = new Stack(app, "SyncStack-Prod");
    const fn = nestedFunction(stack, "ClubsSync", "sams-provider-clubs-sync-prod");
    expect(fn.node.id).toBe("Function");
    expect(lambdaErrorAlarmId(fn)).toBe("ClubsSyncErrors");
  });
});

describe("MonitoringStack", () => {
  it("creates a unique error alarm for each nested sync Lambda", () => {
    const app = new App();
    const functions = new Stack(app, "SyncStack-Prod");
    const stack = new MonitoringStack(app, "MonitoringStack-Prod", {
      alertEmail: "ops@example.com",
      stackProps: { environment: "prod", branch: "main" },
      syncLambdas: [
        nestedFunction(functions, "ClubsSync", "sams-provider-clubs-sync-prod"),
        nestedFunction(functions, "TeamsSync", "sams-provider-teams-sync-prod"),
        nestedFunction(functions, "MatchRefresh", "sams-provider-match-refresh-prod"),
      ],
    });

    const template = Template.fromStack(stack);
    template.resourceCountIs("AWS::CloudWatch::Alarm", 3);
    const alarmIds = Object.keys(template.findResources("AWS::CloudWatch::Alarm"));
    expect(alarmIds.some((id) => id.startsWith("ClubsSyncErrors"))).toBe(true);
    expect(alarmIds.some((id) => id.startsWith("TeamsSyncErrors"))).toBe(true);
    expect(alarmIds.some((id) => id.startsWith("MatchRefreshErrors"))).toBe(true);
  });
});
