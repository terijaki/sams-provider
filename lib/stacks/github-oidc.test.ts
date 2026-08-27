import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vite-plus/test";
import { GitHubOidcStack } from "./github-oidc";
import { GITHUB } from "@utils/github-oidc";

describe("GitHubOidcStack", () => {
  it("creates GitHubActionsCDKRole trusted for the GitHub prod environment", () => {
    const app = new App();
    const stack = new GitHubOidcStack(app, "GitHubOidcStack-Prod", {
      stackProps: { environment: "prod" },
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::IAM::Role", {
      RoleName: GITHUB.oidcRoleName,
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "sts:AssumeRoleWithWebIdentity",
            Condition: {
              StringEquals: {
                "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
                "token.actions.githubusercontent.com:sub":
                  "repo:terijaki/sams-provider:environment:prod",
              },
            },
          }),
        ]),
      },
    });
  });

  it("trusts the GitHub dev environment in the dev account", () => {
    const app = new App();
    const stack = new GitHubOidcStack(app, "GitHubOidcStack-Dev", {
      stackProps: { environment: "dev" },
    });
    const template = Template.fromStack(stack);
    const roles = template.findResources("AWS::IAM::Role");
    const documents = Object.values(roles).map((resource) =>
      JSON.stringify(resource.Properties?.AssumeRolePolicyDocument ?? {}),
    );
    expect(documents.some((document) => document.includes("environment:dev"))).toBe(true);
    expect(documents.some((document) => document.includes("environment:prod"))).toBe(false);
  });
});
