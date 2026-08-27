/**
 * Account-scoped GitHub Actions OIDC identity (singleton per AWS account).
 *
 * Deploy with `cdk:deploy:shared` (`CDK_STACK_GROUP=shared`) together with
 * BudgetStack. Never via default `cdk deploy --all` or GitHub Actions.
 * The role must already exist before Actions can assume it, so the first
 * deploy is local (SSO) into each account.
 */
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import { GITHUB, githubActionsOidcTrustSubjects, parseGitHubEnvironment } from "@utils/github-oidc";

const GITHUB_ACTIONS_MANAGED_POLICIES = [
  "AWSCloudFormationFullAccess",
  "IAMFullAccess",
  "AWSLambda_FullAccess",
  "AmazonDynamoDBFullAccess",
  "AmazonEventBridgeFullAccess",
  "AmazonS3FullAccess",
  "CloudFrontFullAccess",
  "AmazonSSMFullAccess",
  "CloudWatchFullAccess",
  "AmazonSNSFullAccess",
  "AWSXrayFullAccess",
  "AWSBudgetsActionsWithAWSResourceControlAccess",
] as const;

export interface GitHubOidcStackProps extends cdk.StackProps {
  stackProps?: {
    environment?: string;
  };
}

export class GitHubOidcStack extends cdk.Stack {
  public readonly role: iam.Role;

  constructor(scope: Construct, id: string, props?: GitHubOidcStackProps) {
    super(scope, id, props);

    const githubEnvironment = parseGitHubEnvironment(props?.stackProps?.environment);

    const provider = githubOidcProvider(this);

    this.role = new iam.Role(this, "GitHubActionsCDKRole", {
      roleName: GITHUB.oidcRoleName,
      description: `GitHub Actions OIDC role for ${githubEnvironment} CDK deploys`,
      assumedBy: new iam.OpenIdConnectPrincipal(provider, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        },
        StringLike: {
          "token.actions.githubusercontent.com:sub":
            githubActionsOidcTrustSubjects(githubEnvironment),
        },
      }),
      maxSessionDuration: cdk.Duration.hours(1),
    });

    for (const policyName of GITHUB_ACTIONS_MANAGED_POLICIES) {
      this.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName(policyName));
    }

    new cdk.CfnOutput(this, "RoleArn", {
      value: this.role.roleArn,
      description: `Set GitHub Environment "${githubEnvironment}" secret ${GITHUB.roleArnVariable} to this ARN`,
    });
  }
}

function githubOidcProvider(scope: Construct): iam.IOpenIdConnectProvider {
  const existingArn = process.env.GITHUB_OIDC_PROVIDER_ARN?.trim();
  if (existingArn) {
    return iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(scope, "GitHubOidc", existingArn);
  }

  return new iam.OpenIdConnectProvider(scope, "GitHubOidc", {
    url: "https://token.actions.githubusercontent.com",
    clientIds: ["sts.amazonaws.com"],
  });
}
