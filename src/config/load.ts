import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import {
  clubSubscriptionSchema,
  consumerConfigSchema,
  DEFAULT_MATCH_REFRESH_POLICY,
  matchRefreshPolicySchema,
  providerRuntimeConfigSchema,
  samsApiKeyParameterPath,
  type ProviderRuntimeConfig,
} from "./schema";

type SyncParameterKey = "sync/clubs" | "sync/consumers" | "sync/match-refresh-policy";

function syncParameterPath(ssmPrefix: string, key: SyncParameterKey): string {
  return `${ssmPrefix}/${key}`;
}

let cached: { loadedAt: number; value: ProviderRuntimeConfig } | undefined;
const CACHE_MS = 30_000;

export async function loadProviderRuntimeConfig(args: {
  environment: string;
  ssmPrefix: string;
  ssm: SSMClient;
  now?: number;
}): Promise<ProviderRuntimeConfig> {
  const now = args.now ?? Date.now();
  if (cached && now - cached.loadedAt < CACHE_MS) {
    return cached.value;
  }

  const [apiKey, clubsRaw, consumersRaw, policyRaw] = await Promise.all([
    getParameter(args.ssm, samsApiKeyParameterPath(), true),
    getOptionalParameter(args.ssm, syncParameterPath(args.ssmPrefix, "sync/clubs")),
    getOptionalParameter(args.ssm, syncParameterPath(args.ssmPrefix, "sync/consumers")),
    getOptionalParameter(args.ssm, syncParameterPath(args.ssmPrefix, "sync/match-refresh-policy")),
  ]);

  const value = providerRuntimeConfigSchema.parse({
    samsApiKey: apiKey,
    clubs: parseJsonArray(clubsRaw, clubSubscriptionSchema, []),
    consumers: parseJsonArray(consumersRaw, consumerConfigSchema, []),
    matchRefreshPolicy: policyRaw
      ? matchRefreshPolicySchema.parse(JSON.parse(policyRaw))
      : DEFAULT_MATCH_REFRESH_POLICY,
  });

  cached = { loadedAt: now, value };
  return value;
}

export function clearRuntimeConfigCache(): void {
  cached = undefined;
}

async function getParameter(
  ssm: SSMClient,
  name: string,
  withDecryption: boolean,
): Promise<string> {
  const result = await ssm.send(
    new GetParameterCommand({ Name: name, WithDecryption: withDecryption }),
  );
  const value = result.Parameter?.Value;
  if (!value) {
    throw new Error(`SSM parameter ${name} is missing or empty`);
  }
  return value;
}

async function getOptionalParameter(ssm: SSMClient, name: string): Promise<string | undefined> {
  try {
    return await getParameter(ssm, name, false);
  } catch {
    return undefined;
  }
}

function parseJsonArray<T>(
  raw: string | undefined,
  schema: { parse: (value: unknown) => T },
  fallback: T[],
): T[] {
  if (!raw) {
    return fallback;
  }
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    return fallback;
  }
  return parsed.map((item) => schema.parse(item));
}
