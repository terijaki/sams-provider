import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { SAMS } from "@project.config";
import {
  associationConfigSchema,
  clubSubscriptionSchema,
  consumerConfigSchema,
  DEFAULT_MATCH_REFRESH_POLICY,
  matchRefreshPolicySchema,
  providerRuntimeConfigSchema,
  samsApiKeyParameterPath,
  ssmParameterPath,
  type ProviderRuntimeConfig,
} from "./schema";

let cached: { loadedAt: number; value: ProviderRuntimeConfig } | undefined;
const CACHE_MS = 30_000;

export async function loadProviderRuntimeConfig(args: {
  environment: string;
  ssm: SSMClient;
  now?: number;
}): Promise<ProviderRuntimeConfig> {
  const now = args.now ?? Date.now();
  if (cached && now - cached.loadedAt < CACHE_MS) {
    return cached.value;
  }

  const [apiKey, associationsRaw, clubsRaw, consumersRaw, policyRaw] = await Promise.all([
    getParameter(args.ssm, samsApiKeyParameterPath(), true),
    getOptionalParameter(args.ssm, ssmParameterPath(args.environment, "sync/associations")),
    getOptionalParameter(args.ssm, ssmParameterPath(args.environment, "sync/clubs")),
    getOptionalParameter(args.ssm, ssmParameterPath(args.environment, "sync/consumers")),
    getOptionalParameter(args.ssm, ssmParameterPath(args.environment, "sync/match-refresh-policy")),
  ]);

  const value = providerRuntimeConfigSchema.parse({
    samsApiKey: apiKey,
    associations: parseJsonArray(associationsRaw, associationConfigSchema, [
      {
        name: SAMS.defaultAssociation.name,
        shortName: SAMS.defaultAssociation.shortName,
        uuid: SAMS.defaultAssociation.uuid,
      },
    ]),
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
