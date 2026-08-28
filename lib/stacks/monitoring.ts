import * as cdk from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sns from "aws-cdk-lib/aws-sns";
import * as snsSubscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import type { Construct } from "constructs";
import { computeResourceBranchSuffix } from "../db/env";

interface MonitoringStackProps extends cdk.StackProps {
  stackProps?: {
    environment: string;
    branch: string;
  };
  alertEmail: string;
  syncLambdaTargets: SyncLambdaMonitorTarget[];
}

export type SyncLambdaMonitorTarget = {
  /** Stable construct id for alarms and dashboard widgets. */
  id: string;
  functionName: string;
};

export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const environment = props.stackProps?.environment || "dev";
    const branch = props.stackProps?.branch || "";
    const branchSuffix = computeResourceBranchSuffix(environment, branch);
    const resourceLabel = `sams-provider-${environment}${branchSuffix}`;
    const topic = new sns.Topic(this, "AlertTopic", {
      displayName: `${resourceLabel}-alerts`,
    });
    topic.addSubscription(new snsSubscriptions.EmailSubscription(props.alertEmail));

    const widgets: cloudwatch.IWidget[] = [];
    for (const target of props.syncLambdaTargets) {
      const fn = lambda.Function.fromFunctionName(this, target.id, target.functionName);
      const errors = fn.metricErrors({ period: cdk.Duration.minutes(5) });
      const alarm = new cloudwatch.Alarm(this, `${target.id}Errors`, {
        metric: errors,
        threshold: 1,
        evaluationPeriods: 1,
        alarmDescription: `SAMS provider ${target.functionName} errors`,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(new cloudwatchActions.SnsAction(topic));
      widgets.push(
        new cloudwatch.GraphWidget({
          title: `${target.functionName} errors`,
          left: [errors],
        }),
      );
    }

    new cloudwatch.Dashboard(this, "Dashboard", {
      dashboardName: resourceLabel,
      widgets: [widgets],
    });
  }
}

/**
 * CloudWatch alarm construct id for a Lambda.
 *
 * `SpNodejsFunction` wraps `NodejsFunction` as `"Function"`, so `fn.node.id`
 * is the same for every sync job. Use the parent construct id instead.
 */
export function lambdaErrorAlarmId(fn: lambda.IFunction): string {
  const parent = fn.node.scope;
  const uniqueId = parent && parent !== fn.stack ? parent.node.id : fn.node.id;
  return `${uniqueId}Errors`;
}
