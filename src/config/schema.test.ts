import { describe, expect, it } from "vite-plus/test";
import { samsApiKeyParameterPath, ssmParameterPath } from "./schema";

describe("SSM paths", () => {
  it("keeps the SAMS API key account-scoped", () => {
    expect(samsApiKeyParameterPath()).toBe("/sams-provider/sams/api-key");
  });

  it("keeps sync config env-scoped", () => {
    expect(ssmParameterPath("dev", "sync/clubs")).toBe("/sams-provider/dev/sync/clubs");
    expect(ssmParameterPath("prod", "sync/consumers")).toBe("/sams-provider/prod/sync/consumers");
  });
});
