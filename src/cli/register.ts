import { PutParameterCommand, GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  EventBridgeClient,
  PutRuleCommand,
  PutTargetsCommand,
  type Target,
} from "@aws-sdk/client-eventbridge";
import { AWS, CONSUMER_QUEUE_NAME } from "@project.config";
import { computeSamsDataTableName } from "@lib/db/env";
import { SamsClubsRepository } from "@lib/db/repositories/sams-clubs-repository";
import type { SamsClubInput } from "@lib/db/schemas";
import { SAMS_ENTITY_TTL_DAYS } from "../config/constants";
import { unixTtlFromNow } from "@lib/db/repository-utils";
import { slugify } from "@utils/slugify";
import { type ProviderEnvironment } from "@utils/provider-event-bus";
import {
  clubSubscriptionSchema,
  consumerConfigSchema,
  ssmParameterPath,
  type ClubSubscription,
  type ConsumerConfig,
} from "../config/schema";

export const REGISTER_USAGE =
  'Usage: sams-provider register --club "Club Name" --account 123456789012';

/** Public consumers are registered on prod. `dev` is maintainer testing only. */
export const DEFAULT_REGISTER_ENVIRONMENT = "prod" as const;

const INDEX_MISS_HINT =
  "Run the weekly clubs sync (or invoke clubs-sync-coordinator) so the provider index is populated.";

export type RegisterArgs = {
  club: string;
  account: string;
  consumerId?: string;
  environment?: ProviderEnvironment;
  queueArn?: string;
  deliveryRoleArn?: string;
  eventBusName?: string;
  tableName?: string;
};

export type ResolvedClub = {
  uuid: string;
  name: string;
  associationUuid?: string;
  associationName?: string;
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
    deliveryRoleArn: readFlag(argv, "delivery-role-arn"),
    environment: parseRegisterEnvironment(readFlag(argv, "environment")),
    tableName: readFlag(argv, "table-name"),
  };
}

export function queueAccountId(queueArn: string): string | undefined {
  const match = /^arn:aws:sqs:[^:]+:(\d{12}):/.exec(queueArn);
  return match?.[1];
}

export function assertConsumerQueueArn(queueArn: string, accountId: string): void {
  const match = /^arn:aws:sqs:([^:]+):(\d{12}):.+$/.exec(queueArn);
  if (!match) {
    throw new Error(`Invalid SQS queue ARN: ${queueArn}`);
  }
  const region = match[1];
  const account = match[2];
  if (region !== AWS.region) {
    throw new Error(`Queue ARN region must be ${AWS.region}, got ${region}`);
  }
  if (account !== accountId) {
    throw new Error(`Queue ARN account ${account} does not match --account ${accountId}`);
  }
}

export function isCrossAccountQueue(queueArn: string, environment: ProviderEnvironment): boolean {
  const accountId = queueAccountId(queueArn);
  if (!accountId) {
    throw new Error(`Invalid SQS queue ARN: ${queueArn}`);
  }
  return accountId !== AWS.accounts[environment];
}

export function clubUuidsForConsumer(clubs: ClubSubscription[], consumerId: string): string[] {
  return clubs.filter((club) => club.consumerIds.includes(consumerId)).map((club) => club.uuid);
}

export function buildConsumerEventPattern(clubUuids: string[]): Record<string, unknown> {
  return {
    source: ["sams-provider"],
    detail: {
      clubUuids,
    },
  };
}

export async function registerConsumer(args: RegisterArgs): Promise<{
  club: ClubSubscription;
  consumer: ConsumerConfig;
}> {
  const environment = parseRegisterEnvironment(args.environment);
  const tableName = args.tableName ?? computeSamsDataTableName(environment, "");
  const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: AWS.region }));
  const clubsRepo = new SamsClubsRepository(documentClient, tableName);

  const ssm = new SSMClient({ region: AWS.region });
  const resolvedClub = await resolveClub({
    clubsRepo,
    nameOrUuid: args.club,
  });
  const consumerId =
    args.consumerId ?? `${slugify(args.club)}-${environment}`.replace(/[^a-z0-9-]/g, "-");
  const queueArn =
    args.queueArn ?? `arn:aws:sqs:${AWS.region}:${args.account}:${CONSUMER_QUEUE_NAME}`;
  assertConsumerQueueArn(queueArn, args.account);

  const consumer = consumerConfigSchema.parse({
    id: consumerId,
    accountId: args.account,
    queueArn,
    environment,
    subscriptions: ["clubs", "teams", "matches", "rankings", "status"],
  });

  const clubs = await readClubs(ssm, environment);
  const existingClub = clubs.find((item) => item.uuid === resolvedClub.uuid);
  if (existingClub) {
    if (!existingClub.consumerIds.includes(consumer.id)) {
      existingClub.consumerIds.push(consumer.id);
    }
  } else {
    clubs.push(
      clubSubscriptionSchema.parse({
        uuid: resolvedClub.uuid,
        name: resolvedClub.name,
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
  await upsertClubStub({ clubsRepo, club: resolvedClub });
  await upsertEventBridgeTargets({
    environment,
    eventBusName: args.eventBusName ?? "sams-provider",
    consumer,
    clubs,
    deliveryRoleArn: args.deliveryRoleArn,
    ssm,
  });

  const registered = clubs.find((item) => item.uuid === resolvedClub.uuid);
  if (!registered) {
    throw new Error(`Failed to persist club ${resolvedClub.uuid}`);
  }
  return { club: registered, consumer };
}

export async function resolveClub(args: {
  clubsRepo: Pick<SamsClubsRepository, "getById" | "listAll">;
  nameOrUuid: string;
}): Promise<ResolvedClub> {
  if (/^[0-9a-f-]{36}$/i.test(args.nameOrUuid)) {
    const indexed = await args.clubsRepo.getById(args.nameOrUuid);
    if (!indexed) {
      throw new Error(
        `Club UUID ${args.nameOrUuid} was not found in the provider index. ${INDEX_MISS_HINT}`,
      );
    }
    return clubFromIndex(indexed);
  }

  const wanted = slugify(args.nameOrUuid);
  const matches = (await args.clubsRepo.listAll()).filter((club) => club.nameSlug === wanted);

  if (matches.length === 0) {
    throw new Error(
      `Club "${args.nameOrUuid}" was not found in the provider index. ${INDEX_MISS_HINT}`,
    );
  }
  if (matches.length > 1) {
    const details = matches
      .map(
        (item) =>
          `${item.name} (${item.sportsclubUuid}, ${item.associationName ?? "unknown association"})`,
      )
      .join("; ");
    throw new Error(`Club "${args.nameOrUuid}" is ambiguous (${details}). Pass the club UUID.`);
  }
  const match = matches[0];
  if (!match) {
    throw new Error(
      `Club "${args.nameOrUuid}" was not found in the provider index. ${INDEX_MISS_HINT}`,
    );
  }
  return clubFromIndex(match);
}

function clubFromIndex(club: SamsClubInput): ResolvedClub {
  return {
    uuid: club.sportsclubUuid,
    name: club.name,
    ...(club.associationUuid ? { associationUuid: club.associationUuid } : {}),
    ...(club.associationName ? { associationName: club.associationName } : {}),
  };
}

async function upsertClubStub(args: {
  clubsRepo: SamsClubsRepository;
  club: ResolvedClub;
}): Promise<void> {
  await args.clubsRepo.upsert({
    sportsclubUuid: args.club.uuid,
    name: args.club.name,
    nameSlug: slugify(args.club.name),
    ...(args.club.associationUuid ? { associationUuid: args.club.associationUuid } : {}),
    ...(args.club.associationName ? { associationName: args.club.associationName } : {}),
    ttl: unixTtlFromNow(SAMS_ENTITY_TTL_DAYS),
  });
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
  clubs: ClubSubscription[];
  deliveryRoleArn?: string;
  ssm: SSMClient;
}): Promise<void> {
  const events = new EventBridgeClient({ region: AWS.region });
  const ruleName = `sams-provider-${args.consumer.id}`;
  const clubUuids = clubUuidsForConsumer(args.clubs, args.consumer.id);
  if (clubUuids.length === 0) {
    throw new Error(`No club subscriptions found for consumer ${args.consumer.id}`);
  }
  const target: Target = { Id: args.consumer.id, Arn: args.consumer.queueArn };
  if (isCrossAccountQueue(args.consumer.queueArn, args.environment)) {
    const roleArn = args.deliveryRoleArn ?? (await readDeliveryRoleArn(args.ssm, args.environment));
    if (!roleArn) {
      throw new Error(
        `Cross-account SQS target ${args.consumer.queueArn} requires an EventBridge delivery role. Deploy EventStack (writes ${ssmParameterPath(args.environment, "sync/event-delivery-role-arn")}) or pass --delivery-role-arn.`,
      );
    }
    target.RoleArn = roleArn;
  }
  try {
    await events.send(
      new PutRuleCommand({
        Name: ruleName,
        EventBusName: args.eventBusName,
        State: "ENABLED",
        EventPattern: JSON.stringify(buildConsumerEventPattern(clubUuids)),
      }),
    );
    await events.send(
      new PutTargetsCommand({
        Rule: ruleName,
        EventBusName: args.eventBusName,
        Targets: [target],
      }),
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    throw new Error(
      `Failed to wire EventBridge on ${args.eventBusName} to ${args.consumer.queueArn}. Confirm the queue exists in account ${args.consumer.accountId} (${AWS.region}) and allows the provider delivery role to sqs:SendMessage. ${detail}`,
    );
  }
}

async function readDeliveryRoleArn(
  ssm: SSMClient,
  environment: ProviderEnvironment,
): Promise<string | undefined> {
  try {
    const result = await ssm.send(
      new GetParameterCommand({
        Name: ssmParameterPath(environment, "sync/event-delivery-role-arn"),
      }),
    );
    const arn = result.Parameter?.Value?.trim();
    return arn || undefined;
  } catch {
    return undefined;
  }
}
