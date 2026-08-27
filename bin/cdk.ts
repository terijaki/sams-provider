import "varlock/auto-load";
import { ENV } from "varlock/env";
import { shouldDeployAccountOpsStacks } from "@utils/cdk-deploy";
import { getSanitizedBranch } from "@utils/deploy-branch";
import { getCdkNaming } from "@utils/cdk-naming";
import * as cdk from "aws-cdk-lib";
import { AWS } from "@/project.config";
import { BudgetStack } from "../lib/budget-stack";
import { DataStack } from "../lib/data-stack";
import { EventStack } from "../lib/event-stack";
import { MediaStack } from "../lib/media-stack";
import { MonitoringStack } from "../lib/monitoring-stack";
import { SyncStack } from "../lib/sync-stack";

const app = new cdk.App();

const environment = ENV.CDK_ENVIRONMENT || "dev";
const isProd = environment === "prod";
const branch = getSanitizedBranch();
const deployAccountOpsStacks = shouldDeployAccountOpsStacks({ isProd, branch });
const accountId = isProd ? AWS.accounts.prod : AWS.accounts.dev;

const commonStackProps = {
  env: {
    region: process.env.CDK_REGION || AWS.region,
    ...(accountId ? { account: accountId } : {}),
  },
  tags: {
    Environment: environment,
    ManagedBy: "AWS CDK",
    Branch: branch || "main",
  },
  stackProps: {
    environment,
    branch,
  },
};

const { stackName, envLabel } = getCdkNaming(isProd, branch);

const dataStack = new DataStack(app, stackName("DataStack"), {
  ...commonStackProps,
  description: `Provider DynamoDB tables (${envLabel})`,
});

const mediaStack = new MediaStack(app, stackName("MediaStack"), {
  ...commonStackProps,
  description: `Public SAMS club logos (${envLabel})`,
});

const eventStack = new EventStack(app, stackName("EventStack"), {
  ...commonStackProps,
  description: `Event bus and SSM sync configuration (${envLabel})`,
});

const syncStack = new SyncStack(app, stackName("SyncStack"), {
  ...commonStackProps,
  description: `SAMS sync and refresh jobs (${envLabel})`,
  samsDataTableName: dataStack.samsDataTableName,
  cacheTableName: dataStack.cacheTableName,
  logoBucketName: mediaStack.bucketName,
  publicLogoBaseUrl: mediaStack.publicBaseUrl,
  eventBusName: eventStack.eventBusName,
});

const budgetEmail = ENV.CDK_BUDGET_ALERT_EMAIL;
const monitoringEmail = ENV.CDK_MONITORING_ALERT_EMAIL || budgetEmail;

if (deployAccountOpsStacks) {
  if (budgetEmail) {
    new BudgetStack(app, stackName("BudgetStack"), {
      ...commonStackProps,
      description: `Cost budget (${envLabel})`,
      alertEmail: budgetEmail,
    });
  } else if (isProd) {
    console.error("CDK_BUDGET_ALERT_EMAIL is required for production");
    process.exit(1);
  }

  if (monitoringEmail) {
    new MonitoringStack(app, stackName("MonitoringStack"), {
      ...commonStackProps,
      description: `Monitoring (${envLabel})`,
      alertEmail: monitoringEmail,
      syncLambdas: [syncStack.clubsSync, syncStack.teamsSync, syncStack.matchRefresh],
    });
  } else if (isProd) {
    console.error("CDK_MONITORING_ALERT_EMAIL is required for production");
    process.exit(1);
  }
}
