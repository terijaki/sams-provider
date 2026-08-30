import * as cdk from "aws-cdk-lib";
import * as events from "aws-cdk-lib/aws-events";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ssm from "aws-cdk-lib/aws-ssm";
import type { Construct } from "constructs";
import { RESOURCE_PREFIX } from "@project.config";
import { DEFAULT_MATCH_REFRESH_POLICY, ssmParameterPath } from "../../src/config/schema";
import { computeResourceBranchSuffix } from "../db/env";

interface EventStackProps extends cdk.StackProps {
  stackProps?: {
    environment: string;
    branch: string;
  };
}

export class EventStack extends cdk.Stack {
  public readonly eventBus: events.EventBus;
  public readonly eventBusName: string;
  public readonly eventDeliveryRole: iam.Role;

  constructor(scope: Construct, id: string, props: EventStackProps) {
    super(scope, id, props);

    const environment = props.stackProps?.environment || "dev";
    const branch = props.stackProps?.branch || "";
    const branchSuffix = computeResourceBranchSuffix(environment, branch);
    const isProd = environment === "prod";

    this.eventBusName = `sams-provider${branchSuffix}`;
    this.eventBus = new events.EventBus(this, "ProviderBus", {
      eventBusName: this.eventBusName,
      description: "Normalized SAMS domain events for consumer apps",
    });

    const account = cdk.Stack.of(this).account;
    const region = cdk.Stack.of(this).region;

    this.eventDeliveryRole = new iam.Role(this, "EventDeliveryRole", {
      ...(isProd ? { roleName: `${RESOURCE_PREFIX}-event-delivery-prod` } : {}),
      description: "EventBridge execution role for cross-account consumer SQS targets",
      assumedBy: new iam.ServicePrincipal("events.amazonaws.com").withConditions({
        StringEquals: {
          "aws:SourceAccount": account,
        },
        ArnLike: {
          "aws:SourceArn": `arn:aws:events:${region}:${account}:rule/${this.eventBusName}/*`,
        },
      }),
    });
    this.eventDeliveryRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sqs:SendMessage"],
        resources: [`arn:aws:sqs:${region}:*:*`],
      }),
    );

    new ssm.StringParameter(this, "EventDeliveryRoleArnParam", {
      parameterName: ssmParameterPath(environment, "sync/event-delivery-role-arn", branch),
      stringValue: this.eventDeliveryRole.roleArn,
      description: "IAM role EventBridge assumes when delivering events to consumer SQS queues",
    });

    new ssm.StringParameter(this, "MatchRefreshPolicyParam", {
      parameterName: ssmParameterPath(environment, "sync/match-refresh-policy", branch),
      stringValue: JSON.stringify(DEFAULT_MATCH_REFRESH_POLICY),
      description: "Adaptive match/ranking refresh windows",
    });
  }
}
