import { describe, expect, it } from "vite-plus/test";
import { samsApiKeyParameterPath, ssmParameterPath, ssmPrefix } from "./schema";

describe("SSM paths", () => {
  it("keeps the SAMS API key account-scoped", () => {
    expect(samsApiKeyParameterPath()).toBe("/sams-provider/sams/api-key");
  });

  it("keeps sync config env-scoped", () => {
    expect(ssmParameterPath("dev", "sync/clubs")).toBe("/sams-provider/dev/sync/clubs");
    expect(ssmParameterPath("prod", "sync/consumers")).toBe("/sams-provider/prod/sync/consumers");
  });

  it("scopes sync config to feature branches in dev", () => {
    expect(ssmParameterPath("dev", "sync/clubs", "my-feature")).toBe(
      "/sams-provider/dev/my-feature/sync/clubs",
    );
    expect(ssmPrefix("dev", "my-feature")).toBe("/sams-provider/dev/my-feature");
  });

  it("does not branch-scope prod paths", () => {
    expect(ssmParameterPath("prod", "sync/clubs", "ignored")).toBe(
      "/sams-provider/prod/sync/clubs",
    );
  });
});
