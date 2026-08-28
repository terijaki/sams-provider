import * as cdk from "aws-cdk-lib";
import * as events from "aws-cdk-lib/aws-events";
import * as ssm from "aws-cdk-lib/aws-ssm";
import type { Construct } from "constructs";
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

  constructor(scope: Construct, id: string, props: EventStackProps) {
    super(scope, id, props);

    const environment = props.stackProps?.environment || "dev";
    const branch = props.stackProps?.branch || "";
    const branchSuffix = computeResourceBranchSuffix(environment, branch);

    this.eventBusName = `sams-provider${branchSuffix}`;
    this.eventBus = new events.EventBus(this, "ProviderBus", {
      eventBusName: this.eventBusName,
      description: "Normalized SAMS domain events for consumer apps",
    });

    new ssm.StringParameter(this, "MatchRefreshPolicyParam", {
      parameterName: ssmParameterPath(environment, "sync/match-refresh-policy", branch),
      stringValue: JSON.stringify(DEFAULT_MATCH_REFRESH_POLICY),
      description: "Adaptive match/ranking refresh windows",
    });
  }
}
