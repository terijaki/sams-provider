import { InvokeCommand, LambdaClient, type InvokeCommandOutput } from "@aws-sdk/client-lambda";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { AWS, RESOURCE_PREFIX } from "@project.config";
import type { ProviderEnvironment } from "@utils/provider-event-bus";
import { ssmParameterPath } from "../config/schema";

export const FULL_SYNC_USAGE =
  "Usage: sams-provider full-sync [--environment prod|dev] [--skip-clubs] [--skip-teams] [--skip-match]";

const DEFAULT_ENVIRONMENT = "prod" as const;
const DEFAULT_CLUBS_COOLDOWN_MS = 90_000;
const DEFAULT_INVOKE_RETRIES = 8;
const DEFAULT_INVOKE_RETRY_MS = 20_000;

export type FullSyncArgs = {
  environment: ProviderEnvironment;
  skipClubs: boolean;
  skipTeams: boolean;
  skipMatch: boolean;
  clubsCooldownMs: number;
  invokeRetries: number;
  invokeRetryMs: number;
};

export type FullSyncDeps = {
  getParameter: (name: string) => Promise<string>;
  invokeFunction: (args: {
    functionName: string;
    payload: Record<string, unknown>;
  }) => Promise<string>;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
};

export function parseFullSyncArgs(argv: string[]): FullSyncArgs {
  let environment: ProviderEnvironment = DEFAULT_ENVIRONMENT;
  let skipClubs = false;
  let skipTeams = false;
  let skipMatch = false;
  let clubsCooldownMs = DEFAULT_CLUBS_COOLDOWN_MS;
  let invokeRetries = DEFAULT_INVOKE_RETRIES;
  let invokeRetryMs = DEFAULT_INVOKE_RETRY_MS;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      continue;
    }
    if (arg === "--environment" || arg === "-e") {
      const value = argv[++i];
      if (value !== "prod" && value !== "dev") {
        throw new Error(`Invalid --environment (expected prod|dev): ${value ?? "(missing)"}`);
      }
      environment = value;
      continue;
    }
    if (arg === "--skip-clubs") {
      skipClubs = true;
      continue;
    }
    if (arg === "--skip-teams") {
      skipTeams = true;
      continue;
    }
    if (arg === "--skip-match") {
      skipMatch = true;
      continue;
    }
    if (arg === "--clubs-cooldown-seconds") {
      clubsCooldownMs = parsePositiveInt(argv[++i], "--clubs-cooldown-seconds") * 1000;
      continue;
    }
    if (arg === "--invoke-retries") {
      invokeRetries = parsePositiveInt(argv[++i], "--invoke-retries");
      continue;
    }
    if (arg === "--invoke-retry-seconds") {
      invokeRetryMs = parsePositiveInt(argv[++i], "--invoke-retry-seconds") * 1000;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      throw new Error(FULL_SYNC_USAGE);
    }
    throw new Error(`Unknown argument: ${arg}\n${FULL_SYNC_USAGE}`);
  }

  return {
    environment,
    skipClubs,
    skipTeams,
    skipMatch,
    clubsCooldownMs,
    invokeRetries,
    invokeRetryMs,
  };
}

export function syncFunctionName(baseName: string, environment: ProviderEnvironment): string {
  return `${RESOURCE_PREFIX}-${baseName}-${environment}`;
}

export async function runFullSync(args: FullSyncArgs, deps: FullSyncDeps): Promise<void> {
  const sleep = deps.sleep ?? defaultSleep;
  const log = deps.log ?? ((message: string) => console.log(message));

  const clubsPath = ssmParameterPath(args.environment, "sync/clubs");
  const consumersPath = ssmParameterPath(args.environment, "sync/consumers");

  log(`Environment: ${args.environment}`);
  log(`--- consumers (${consumersPath}) ---`);
  log(await deps.getParameter(consumersPath));
  log(`--- clubs (${clubsPath}) ---`);
  log(await deps.getParameter(clubsPath));

  const clubsFn = syncFunctionName("clubs-sync-coordinator", args.environment);
  const teamsFn = syncFunctionName("teams-sync", args.environment);
  const matchFn = syncFunctionName("match-refresh", args.environment);
  log(`Functions: clubs=${clubsFn} teams=${teamsFn} match=${matchFn}`);

  if (!args.skipClubs) {
    await invokeWithRetry({
      label: "clubs-coordinator",
      functionName: clubsFn,
      payload: {},
      retries: args.invokeRetries,
      retryMs: args.invokeRetryMs,
      invokeFunction: deps.invokeFunction,
      sleep,
      log,
    });
    log("Club workers run async; clubUpdated events may arrive shortly after.");
    if (!args.skipTeams || !args.skipMatch) {
      log(`Waiting ${args.clubsCooldownMs / 1000}s for invoke rate limit to cool down...`);
      await sleep(args.clubsCooldownMs);
    }
  }

  if (!args.skipTeams) {
    await invokeWithRetry({
      label: "teams",
      functionName: teamsFn,
      payload: {},
      retries: args.invokeRetries,
      retryMs: args.invokeRetryMs,
      invokeFunction: deps.invokeFunction,
      sleep,
      log,
    });
  }

  if (!args.skipMatch) {
    await invokeWithRetry({
      label: "match-snapshot",
      functionName: matchFn,
      payload: { mode: "snapshot" },
      retries: args.invokeRetries,
      retryMs: args.invokeRetryMs,
      invokeFunction: deps.invokeFunction,
      sleep,
      log,
    });
  }

  log("DONE");
}

async function invokeWithRetry(args: {
  label: string;
  functionName: string;
  payload: Record<string, unknown>;
  retries: number;
  retryMs: number;
  invokeFunction: FullSyncDeps["invokeFunction"];
  sleep: (ms: number) => Promise<void>;
  log: (message: string) => void;
}): Promise<void> {
  args.log(`--- invoke ${args.label} (${args.functionName}) ---`);
  let attempt = 1;
  while (true) {
    try {
      const result = await args.invokeFunction({
        functionName: args.functionName,
        payload: args.payload,
      });
      args.log(`result:\n${result}`);
      return;
    } catch (error) {
      if (!isRetryableInvokeError(error) || attempt >= args.retries) {
        throw error;
      }
      args.log(
        `Invoke rate-limited or failed; retry ${attempt}/${args.retries} in ${args.retryMs / 1000}s...`,
      );
      await args.sleep(args.retryMs);
      attempt += 1;
    }
  }
}

function assertInvokeOk(result: InvokeCommandOutput, label: string): void {
  if (result.FunctionError) {
    throw new Error(
      `${label} Lambda reported ${result.FunctionError}: ${decodePayload(result.Payload)}`,
    );
  }
  if (result.StatusCode !== undefined && result.StatusCode >= 300) {
    throw new Error(`${label} Lambda invoke status ${result.StatusCode}`);
  }
}

function decodePayload(payload: InvokeCommandOutput["Payload"]): string {
  if (!payload) {
    return "(empty)";
  }
  return Buffer.from(payload).toString("utf8");
}

function isRetryableInvokeError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const name = "name" in error && typeof error.name === "string" ? error.name : "";
  return (
    name === "TooManyRequestsException" ||
    name === "ThrottlingException" ||
    name === "ServiceUnavailableException"
  );
}

function parsePositiveInt(value: string | undefined, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${flag}: ${value ?? "(missing)"}`);
  }
  return parsed;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createFullSyncDeps(): FullSyncDeps {
  const ssm = new SSMClient({ region: AWS.region });
  const lambda = new LambdaClient({ region: AWS.region });

  return {
    getParameter: async (name) => {
      const result = await ssm.send(new GetParameterCommand({ Name: name }));
      const value = result.Parameter?.Value;
      if (!value) {
        throw new Error(`SSM parameter missing or empty: ${name}`);
      }
      return value;
    },
    invokeFunction: async ({ functionName, payload }) => {
      const result = await lambda.send(
        new InvokeCommand({
          FunctionName: functionName,
          Payload: Buffer.from(JSON.stringify(payload)),
        }),
      );
      assertInvokeOk(result, functionName);
      return decodePayload(result.Payload);
    },
  };
}
