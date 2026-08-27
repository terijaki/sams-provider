import { describe, expect, it } from "vite-plus/test";
import { getCdkNaming, sharedAccountStackName } from "./cdk-naming";

describe("cdk naming", () => {
  it("uses Prod without a branch suffix", () => {
    const naming = getCdkNaming(true, "anything");
    expect(naming.stackName("DataStack")).toBe("DataStack-Prod");
    expect(naming.envLabel).toBe("prod");
  });

  it("uses Dev with a branch identifier", () => {
    const naming = getCdkNaming(false, "feature");
    expect(naming.stackName("DataStack")).toBe("DataStack-Dev-feature");
  });

  it("names shared account stacks without a branch suffix", () => {
    expect(sharedAccountStackName(true, "BudgetStack")).toBe("BudgetStack-Prod");
    expect(sharedAccountStackName(false, "GitHubOidcStack")).toBe("GitHubOidcStack-Dev");
  });
});
