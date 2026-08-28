import { PutParameterCommand, GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { EventBridgeClient, PutRuleCommand, PutTargetsCommand } from "@aws-sdk/client-eventbridge";
import { AWS, CONSUMER_QUEUE_NAME, SAMS } from "@project.config";
import { getSamsClient } from "@utils/sams-client";
import { slugify } from "@utils/slugify";
import { providerEventBusArn, type ProviderEnvironment } from "@utils/provider-event-bus";
import {
  clubSubscriptionSchema,
  consumerConfigSchema,
  ssmParameterPath,
  type ClubSubscription,
  type ConsumerConfig,
} from "../config/schema";
import { EventType } from "../events/schemas";
import { unwrapSamsResult } from "../sams/result";

export const REGISTER_USAGE = `Usage: sams-provider register --club "Club Name" --account 123456789012`;

/** Public consumers are registered on prod. `dev` is maintainer testing only. */
export const DEFAULT_REGISTER_ENVIRONMENT = "prod" as const;

export type RegisterArgs = {
  club: string;
  account: string;
  consumerId?: string;
  environment?: ProviderEnvironment;
  queueArn?: string;
  eventBusName?: string;
};

function readFlag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  if (index === -1) {
    return undefined;
  }
  return argv[index + 1];
}

export function parseRegisterEnvironment(value: string | undefined): ProviderEnvironment {
  const environment = value ?? DEFAULT_REGISTER_ENVIRONMENT;
  if (environment === "dev" || environment === "prod") {
    return environment;
  }
  throw new Error(`--environment must be "dev" or "prod"`);
}

export function parseRegisterArgs(argv: string[]): RegisterArgs {
  const club = readFlag(argv, "club");
  const account = readFlag(argv, "account");
  if (!club || !account) {
    throw new Error(REGISTER_USAGE);
  }
  if (!/^\d{12}$/.test(account)) {
    throw new Error("--account must be a 12-digit AWS account ID");
  }
  return {
    club,
    account,
    consumerId: readFlag(argv, "consumer-id"),
    queueArn: readFlag(argv, "queue-arn"),
    environment: parseRegisterEnvironment(readFlag(argv, "environment")),
  };
}

export async function registerConsumer(args: RegisterArgs): Promise<{
  club: ClubSubscription;
  consumer: ConsumerConfig;
}> {
  const environment = parseRegisterEnvironment(args.environment);
  const ssm = new SSMClient({ region: AWS.region });
  const sams = getSamsClient();
  const club = await resolveClub(sams, args.club);
  const consumerId =
    args.consumerId ?? `${slugify(args.club)}-${environment}`.replace(/[^a-z0-9-]/g, "-");
  const queueArn =
    args.queueArn ?? `arn:aws:sqs:${AWS.region}:${args.account}:${CONSUMER_QUEUE_NAME}`;

  const consumer = consumerConfigSchema.parse({
    id: consumerId,
    accountId: args.account,
    queueArn,
    environment,
    subscriptions: ["clubs", "teams", "matches", "rankings", "status"],
  });

  const clubs = await readClubs(ssm, environment);
  const existingClub = clubs.find((item) => item.uuid === club.uuid);
  if (existingClub) {
    if (!existingClub.consumerIds.includes(consumer.id)) {
      existingClub.consumerIds.push(consumer.id);
    }
  } else {
    clubs.push(
      clubSubscriptionSchema.parse({
        uuid: club.uuid,
        name: club.name,
        consumerIds: [consumer.id],
      }),
    );
  }

  const consumers = await readConsumers(ssm, environment);
  const existingConsumerIndex = consumers.findIndex((item) => item.id === consumer.id);
  if (existingConsumerIndex >= 0) {
    consumers[existingConsumerIndex] = consumer;
  } else {
    consumers.push(consumer);
  }

  await putJson(ssm, ssmParameterPath(environment, "sync/clubs"), clubs);
  await putJson(ssm, ssmParameterPath(environment, "sync/consumers"), consumers);
  await upsertEventBridgeTargets({
    environment,
    eventBusName: args.eventBusName ?? "sams-provider",
    consumer,
  });

  const registered = clubs.find((item) => item.uuid === club.uuid);
  if (!registered) {
    throw new Error(`Failed to persist club ${club.uuid}`);
  }
  return { club: registered, consumer };
}

async function resolveClub(sams: ReturnType<typeof getSamsClient>, nameOrUuid: string) {
  if (/^[0-9a-f-]{36}$/i.test(nameOrUuid)) {
    const { data, error } = unwrapSamsResult(
      await sams.getSportsclub({ path: { uuid: nameOrUuid } }),
    );
    if (error || !data?.uuid || !data.name) {
      throw new Error(`Club UUID ${nameOrUuid} was not found`);
    }
    return { uuid: data.uuid, name: data.name };
  }

  const { data: associations } = await sams.getAssociationByUuid({
    path: { uuid: SAMS.defaultAssociation.uuid },
  });
  const associationUuid = associations?.uuid ?? SAMS.defaultAssociation.uuid;
  const matches: Array<{ uuid: string; name: string }> = [];
  let page = 0;
  let hasMore = true;
  const wanted = slugify(nameOrUuid);

  while (hasMore) {
    const { data, error } = unwrapSamsResult(
      await sams.getAllSportsclubs({
        query: { association: associationUuid, page, size: 100 },
      }),
    );
    if (error) {
      throw new Error("Failed to search clubs in SAMS");
    }
    for (const club of data?.content ?? []) {
      if (club.uuid && club.name && slugify(club.name) === wanted) {
        matches.push({ uuid: club.uuid, name: club.name });
      }
    }
    page += 1;
    hasMore = data?.last !== true;
  }

  if (matches.length === 0) {
    throw new Error(`Club "${nameOrUuid}" was not found`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Club "${nameOrUuid}" is ambiguous (${matches.map((item) => item.uuid).join(", ")})`,
    );
  }
  const match = matches[0];
  if (!match) {
    throw new Error(`Club "${nameOrUuid}" was not found`);
  }
  return match;
}

async function readClubs(ssm: SSMClient, environment: string): Promise<ClubSubscription[]> {
  const parsed = await readJson(ssm, ssmParameterPath(environment, "sync/clubs"));
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.map((item) => clubSubscriptionSchema.parse(item));
}

async function readConsumers(ssm: SSMClient, environment: string): Promise<ConsumerConfig[]> {
  const parsed = await readJson(ssm, ssmParameterPath(environment, "sync/consumers"));
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.map((item) => consumerConfigSchema.parse(item));
}

async function readJson(ssm: SSMClient, name: string): Promise<unknown> {
  try {
    const result = await ssm.send(new GetParameterCommand({ Name: name }));
    return JSON.parse(result.Parameter?.Value ?? "[]");
  } catch {
    return [];
  }
}

async function putJson(ssm: SSMClient, name: string, value: unknown): Promise<void> {
  await ssm.send(
    new PutParameterCommand({
      Name: name,
      Value: JSON.stringify(value),
      Type: "String",
      Overwrite: true,
    }),
  );
}

async function upsertEventBridgeTargets(args: {
  environment: ProviderEnvironment;
  eventBusName: string;
  consumer: ConsumerConfig;
}): Promise<void> {
  const events = new EventBridgeClient({ region: AWS.region });
  const ruleName = `sams-provider-${args.consumer.id}`;
  try {
    await events.send(
      new PutRuleCommand({
        Name: ruleName,
        EventBusName: args.eventBusName,
        State: "ENABLED",
        EventPattern: JSON.stringify({
          source: ["sams-provider"],
          "detail-type": Object.values(EventType),
        }),
      }),
    );
    await events.send(
      new PutTargetsCommand({
        Rule: ruleName,
        EventBusName: args.eventBusName,
        Targets: [{ Id: args.consumer.id, Arn: args.consumer.queueArn }],
      }),
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    throw new Error(
      `Failed to wire EventBridge on ${args.eventBusName} to ${args.consumer.queueArn}. Confirm the queue exists in account ${args.consumer.accountId} (${AWS.region}) and allows events.amazonaws.com to sqs:SendMessage from ${providerEventBusArn(args.environment)}. ${detail}`,
    );
  }
}
