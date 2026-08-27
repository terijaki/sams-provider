import "varlock/auto-load";
import { ENV } from "varlock/env";
import { shouldDeployMonitoringStack } from "@utils/cdk-deploy";
import { getSanitizedBranch } from "@utils/deploy-branch";
import { getCdkNaming, sharedAccountStackName } from "@utils/cdk-naming";
import * as cdk from "aws-cdk-lib";
import { AWS } from "@/project.config";
import { BudgetStack } from "../lib/stacks/budget";
import { DataStack } from "../lib/stacks/data";
import { EventStack } from "../lib/stacks/event";
import { GitHubOidcStack } from "../lib/stacks/github-oidc";
import { MediaStack } from "../lib/stacks/media";
import { MonitoringStack } from "../lib/stacks/monitoring";
import { SyncStack } from "../lib/stacks/sync";

const app = new cdk.App();

const environment = ENV.CDK_ENVIRONMENT || "dev";
const isProd = environment === "prod";
const branch = getSanitizedBranch();
const stackGroup = ENV.CDK_STACK_GROUP || "app";
const isShared = stackGroup === "shared";
const deployMonitoring = shouldDeployMonitoringStack({ isProd, branch });
const accountId = isProd ? AWS.accounts.prod : AWS.accounts.dev;
const alertEmail = ENV.CDK_ALERT_EMAIL;

const commonStackProps = {
  env: {
    region: process.env.CDK_REGION || AWS.region,
    ...(accountId ? { account: accountId } : {}),
  },
  tags: {
    Environment: environment,
    ManagedBy: "AWS CDK",
    Branch: branch || "main",
    StackGroup: stackGroup,
  },
  stackProps: {
    environment,
    branch,
  },
};

if (isShared) {
  new GitHubOidcStack(app, sharedAccountStackName(isProd, "GitHubOidcStack"), {
    ...commonStackProps,
    description: `GitHub Actions OIDC role (${environment})`,
    stackProps: { environment },
    terminationProtection: true,
  });

  if (alertEmail) {
    new BudgetStack(app, sharedAccountStackName(isProd, "BudgetStack"), {
      ...commonStackProps,
      description: `Account cost budget (${environment})`,
      alertEmail,
      terminationProtection: true,
    });
  } else if (isProd) {
    console.error("CDK_ALERT_EMAIL is required for production");
    process.exit(1);
  }
} else {
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

  if (deployMonitoring) {
    if (alertEmail) {
      new MonitoringStack(app, stackName("MonitoringStack"), {
        ...commonStackProps,
        description: `Monitoring (${envLabel})`,
        alertEmail,
        syncLambdas: [syncStack.clubsSync, syncStack.teamsSync, syncStack.matchRefresh],
      });
    } else if (isProd) {
      console.error("CDK_ALERT_EMAIL is required for production");
      process.exit(1);
    }
  }
}
