import { describe, expect, it } from "vite-plus/test";
import { parseFullSyncArgs, runFullSync, syncFunctionName, type FullSyncDeps } from "./full-sync";

describe("parseFullSyncArgs", () => {
  it("defaults to prod with all jobs enabled", () => {
    expect(parseFullSyncArgs([])).toEqual({
      environment: "prod",
      skipClubs: false,
      skipTeams: false,
      skipMatch: false,
      clubsCooldownMs: 90_000,
      invokeRetries: 8,
      invokeRetryMs: 20_000,
    });
  });

  it("parses skips and timing flags", () => {
    expect(
      parseFullSyncArgs([
        "--environment",
        "dev",
        "--skip-clubs",
        "--clubs-cooldown-seconds",
        "30",
        "--invoke-retries",
        "3",
        "--invoke-retry-seconds",
        "5",
      ]),
    ).toEqual({
      environment: "dev",
      skipClubs: true,
      skipTeams: false,
      skipMatch: false,
      clubsCooldownMs: 30_000,
      invokeRetries: 3,
      invokeRetryMs: 5_000,
    });
  });
});

describe("syncFunctionName", () => {
  it("builds prod and dev names", () => {
    expect(syncFunctionName("teams-sync", "prod")).toBe("sp-teams-sync-prod");
    expect(syncFunctionName("match-refresh", "dev")).toBe("sp-match-refresh-dev");
  });
});

describe("runFullSync", () => {
  it("invokes clubs, waits, then teams and match snapshot", async () => {
    const invokes: Array<{ functionName: string; payload: Record<string, unknown> }> = [];
    const parameters: string[] = [];
    const sleeps: number[] = [];
    const logs: string[] = [];

    const deps: FullSyncDeps = {
      getParameter: async (name) => {
        parameters.push(name);
        return JSON.stringify([{ id: "demo" }]);
      },
      invokeFunction: async ({ functionName, payload }) => {
        invokes.push({ functionName, payload });
        return JSON.stringify({ ok: true, fn: functionName });
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      log: (message) => {
        logs.push(message);
      },
    };

    await runFullSync(
      {
        environment: "prod",
        skipClubs: false,
        skipTeams: false,
        skipMatch: false,
        clubsCooldownMs: 1_000,
        invokeRetries: 2,
        invokeRetryMs: 100,
      },
      deps,
    );

    expect(parameters).toEqual([
      "/sams-provider/prod/sync/consumers",
      "/sams-provider/prod/sync/clubs",
    ]);
    expect(invokes.map((entry) => entry.functionName)).toEqual([
      "sp-clubs-sync-coordinator-prod",
      "sp-teams-sync-prod",
      "sp-match-refresh-prod",
    ]);
    expect(invokes[2]?.payload).toEqual({ mode: "snapshot" });
    expect(sleeps).toEqual([1_000]);
    expect(logs.at(-1)).toBe("DONE");
  });

  it("retries throttled team invokes after clubs", async () => {
    let teamAttempts = 0;
    const sleeps: number[] = [];

    const deps: FullSyncDeps = {
      getParameter: async () => "[]",
      invokeFunction: async ({ functionName }) => {
        if (functionName === "sp-teams-sync-prod") {
          teamAttempts += 1;
          if (teamAttempts === 1) {
            const error = new Error("Rate Exceeded");
            error.name = "TooManyRequestsException";
            throw error;
          }
        }
        return "{}";
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      log: () => undefined,
    };

    await runFullSync(
      {
        environment: "prod",
        skipClubs: true,
        skipTeams: false,
        skipMatch: true,
        clubsCooldownMs: 90_000,
        invokeRetries: 3,
        invokeRetryMs: 50,
      },
      deps,
    );

    expect(teamAttempts).toBe(2);
    expect(sleeps).toEqual([50]);
  });
});
