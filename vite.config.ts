import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: ["env.d.ts", "cdk.out/**"],
  },
  lint: {
    ignorePatterns: ["cdk.out/**", "env.d.ts"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    root: ".",
    silent: true,
    include: ["**/*.test.ts"],
    reporters: process.env.GITHUB_ACTIONS === "true" ? ["agent", "github-actions"] : ["agent"],
    env: {
      POWERTOOLS_LOG_LEVEL: "SILENT",
      JSII_DEPRECATED: "quiet",
      VARLOCK_ENV: "test",
      CDK_ENVIRONMENT: "dev",
      SAMS_TABLE_NAME: "test-sams-table",
      CACHE_TABLE_NAME: "test-cache-table",
      SAMS_API_KEY: "test-sams-api-key",
      SSM_PREFIX: "/sams-provider/dev",
      EVENT_BUS_NAME: "sams-provider",
      LOGO_BUCKET_NAME: "test-logo-bucket",
      LOGO_PUBLIC_BASE_URL: "https://cdn.example",
    },
  },
  run: {
    tasks: {
      deploy: {
        command: "bun run cdk:deploy:all",
        dependsOn: ["lint", "test"],
        cache: false,
      },
    },
  },
});
