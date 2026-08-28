import { describe, expect, it } from "vite-plus/test";
import { GITHUB, cdkBootstrapRoleArns, githubActionsOidcSubject } from "./github-oidc";

describe("githubActionsOidcSubject", () => {
  it("locks the prod role to the GitHub prod environment", () => {
    expect(githubActionsOidcSubject("prod")).toBe("repo:terijaki/sams-provider:environment:prod");
  });

  it("locks the dev role to the GitHub dev environment", () => {
    expect(githubActionsOidcSubject("dev")).toBe("repo:terijaki/sams-provider:environment:dev");
  });

  it("uses a single role-ARN variable name in both environments", () => {
    expect(GITHUB.roleArnVariable).toBe("AWS_ROLE_ARN");
  });

  it("builds CDK bootstrap role ARNs for sts:AssumeRole", () => {
    expect(cdkBootstrapRoleArns("449952321849", "eu-central-1")).toEqual([
      "arn:aws:iam::449952321849:role/cdk-hnb659fds-deploy-role-449952321849-eu-central-1",
      "arn:aws:iam::449952321849:role/cdk-hnb659fds-file-publishing-role-449952321849-eu-central-1",
      "arn:aws:iam::449952321849:role/cdk-hnb659fds-lookup-role-449952321849-eu-central-1",
    ]);
  });
});
