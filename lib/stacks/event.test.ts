import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vite-plus/test";
import { EventStack } from "./event";

describe("EventStack", () => {
  it("creates a prod delivery role with a stable name and confused-deputy conditions", () => {
    const app = new App();
    const stack = new EventStack(app, "EventStack-Prod", {
      env: { account: "550271577754", region: "eu-central-1" },
      stackProps: { environment: "prod", branch: "main" },
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::IAM::Role", {
      RoleName: "sp-event-delivery-prod",
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "sts:AssumeRole",
            Principal: { Service: "events.amazonaws.com" },
            Condition: {
              StringEquals: {
                "aws:SourceAccount": "550271577754",
              },
              ArnLike: {
                "aws:SourceArn": "arn:aws:events:eu-central-1:550271577754:rule/sams-provider/*",
              },
            },
          }),
        ]),
      },
    });
  });

  it("omits a fixed role name on non-prod stacks", () => {
    const app = new App();
    const stack = new EventStack(app, "EventStack-Dev", {
      env: { account: "449952321849", region: "eu-central-1" },
      stackProps: { environment: "dev", branch: "my-feature" },
    });
    const template = Template.fromStack(stack);
    const roles = template.findResources("AWS::IAM::Role");
    const deliveryRoleKey = Object.keys(roles).find((key) => key.startsWith("EventDeliveryRole"));
    expect(deliveryRoleKey).toBeDefined();
    const deliveryRole = deliveryRoleKey ? roles[deliveryRoleKey] : undefined;
    expect(deliveryRole?.Properties?.RoleName).toBeUndefined();
  });

  it("scopes the delivery role to sqs SendMessage in this region", () => {
    const app = new App();
    const stack = new EventStack(app, "EventStack-Prod", {
      env: { account: "550271577754", region: "eu-central-1" },
      stackProps: { environment: "prod", branch: "main" },
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "sqs:SendMessage",
            Resource: "arn:aws:sqs:eu-central-1:*:*",
          }),
        ]),
      },
    });
  });
});
