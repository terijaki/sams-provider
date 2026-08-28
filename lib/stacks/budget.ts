/**
 * Account-scoped monthly cost budget (singleton per AWS account).
 *
 * Deploy with `cdk:deploy:shared` (`CDK_STACK_GROUP=shared`) together with
 * GitHubOidcStack, or via prod CI after merge to `main`. Budget names are
 * account-global, so this is not part of default `cdk deploy --all` or
 * feature-branch deploys.
 */
import * as cdk from "aws-cdk-lib";
import * as budgets from "aws-cdk-lib/aws-budgets";
import type { Construct } from "constructs";

interface BudgetStackProps extends cdk.StackProps {
  alertEmail: string;
  monthlyLimitUsd?: number;
}

export class BudgetStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BudgetStackProps) {
    super(scope, id, props);

    new budgets.CfnBudget(this, "MonthlyBudget", {
      budget: {
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: {
          amount: props.monthlyLimitUsd ?? 25,
          unit: "USD",
        },
        budgetName: "sams-provider-monthly",
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: "ACTUAL",
            comparisonOperator: "GREATER_THAN",
            threshold: 80,
            thresholdType: "PERCENTAGE",
          },
          subscribers: [{ subscriptionType: "EMAIL", address: props.alertEmail }],
        },
      ],
    });
  }
}
