import { describe, expect, it } from "vite-plus/test";
import { shouldDeployMonitoringStack } from "./cdk-deploy";

describe("shouldDeployMonitoringStack", () => {
  it("always deploys in prod", () => {
    expect(shouldDeployMonitoringStack({ isProd: true, branch: "feature" })).toBe(true);
  });

  it("deploys shared-dev when the branch is empty", () => {
    expect(shouldDeployMonitoringStack({ isProd: false, branch: "" })).toBe(true);
  });

  it("skips feature-branch deploys in the dev account", () => {
    expect(shouldDeployMonitoringStack({ isProd: false, branch: "feature" })).toBe(false);
  });
});
