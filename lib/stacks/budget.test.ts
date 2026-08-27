import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, it } from "vite-plus/test";
import { BudgetStack } from "./budget";

describe("BudgetStack", () => {
  it("creates an account-level monthly cost budget with an email subscriber", () => {
    const app = new App();
    const stack = new BudgetStack(app, "BudgetStack-Dev", {
      alertEmail: "ops@example.com",
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::Budgets::Budget", {
      Budget: Match.objectLike({
        BudgetName: "sams-provider-monthly",
        BudgetType: "COST",
        TimeUnit: "MONTHLY",
      }),
      NotificationsWithSubscribers: Match.arrayWith([
        Match.objectLike({
          Subscribers: Match.arrayWith([
            Match.objectLike({ SubscriptionType: "EMAIL", Address: "ops@example.com" }),
          ]),
        }),
      ]),
    });
  });
});
