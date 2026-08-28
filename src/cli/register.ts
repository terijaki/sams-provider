import { PutParameterCommand, GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { EventBridgeClient, PutRuleCommand, PutTargetsCommand } from "@aws-sdk/client-eventbridge";
import { AWS, CONSUMER_QUEUE_NAME } from "@project.config";
import { computeSamsDataTableName } from "@lib/db/env";
import { SamsAssociationsRepository } from "@lib/db/repositories/sams-associations-repository";
import { SamsClubsRepository } from "@lib/db/repositories/sams-clubs-repository";
import { SAMS_ENTITY_TTL_DAYS } from "../config/constants";
import { unixTtlFromNow } from "@lib/db/repository-utils";
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
import { listAllAssociations } from "../sams/list-associations";
import { resolveAssociationName } from "../sams/resolve-association";
import { unwrapSamsResult } from "../sams/result";

export const REGISTER_USAGE =
  'Usage: sams-provider register --club "Club Name" --account 123456789012';

/** Public consumers are registered on prod. `dev` is maintainer testing only. */
export const DEFAULT_REGISTER_ENVIRONMENT = "prod" as const;

export type RegisterArgs = {
  club: string;
  account: string;
  consumerId?: string;
  environment?: ProviderEnvironment;
  queueArn?: string;
  eventBusName?: string;
  tableName?: string;
};

export type ResolvedClub = {
  uuid: string;
  name: string;
  associationUuid?: string;
  associationName?: string;
};

export type RegisterClubResolverSams = {
  getSportsclub(args: { path: { uuid: string } }): Promise<{
    data?: {
      uuid?: string;
      name?: string;
      associationUuid?: string | null;
    };
    error?: unknown;
  }>;
  getAllSportsclubs(args: { query: { association: string; page: number; size: number } }): Promise<{
    data?: {
      content?: Array<{
        uuid?: string;
        name?: string;
        associationUuid?: string | null;
      }>;
      last?: boolean;
    };
    error?: unknown;
  }>;
  getAssociations(args: { query: { page: number; size: number } }): Promise<{
    data?: { content?: Array<{ name?: string; uuid?: string }>; last?: boolean };
    error?: unknown;
  }>;
  getAssociationByUuid(args: { path: { uuid: string } }): Promise<{
    data?: { name?: string; uuid?: string };
    error?: unknown;
  }>;
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
    tableName: readFlag(argv, "table-name"),
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
  const associationsRepo = new SamsAssociationsRepository(documentClient, tableName);

  const ssm = new SSMClient({ region: AWS.region });
  const sams = getSamsClient();
  const resolvedClub = await resolveClub({
    sams,
    clubsRepo,
    associationsRepo,
    nameOrUuid: args.club,
  });
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
  });

  const registered = clubs.find((item) => item.uuid === resolvedClub.uuid);
  if (!registered) {
    throw new Error(`Failed to persist club ${resolvedClub.uuid}`);
  }
  return { club: registered, consumer };
}

export async function resolveClub(args: {
  sams: RegisterClubResolverSams;
  clubsRepo: Pick<SamsClubsRepository, "getByNameSlug">;
  associationsRepo: Pick<SamsAssociationsRepository, "listAll">;
  nameOrUuid: string;
}): Promise<ResolvedClub> {
  if (/^[0-9a-f-]{36}$/i.test(args.nameOrUuid)) {
    const { data, error } = unwrapSamsResult(
      await args.sams.getSportsclub({ path: { uuid: args.nameOrUuid } }),
    );
    if (error || !data?.uuid || !data.name) {
      throw new Error(`Club UUID ${args.nameOrUuid} was not found`);
    }
    const associationUuid = data.associationUuid ?? undefined;
    const associationName = associationUuid
      ? await resolveAssociationName(args.sams, associationUuid)
      : undefined;
    return {
      uuid: data.uuid,
      name: data.name,
      ...(associationUuid ? { associationUuid } : {}),
      ...(associationName ? { associationName } : {}),
    };
  }

  const indexed = await args.clubsRepo.getByNameSlug(slugify(args.nameOrUuid));
  if (indexed) {
    return {
      uuid: indexed.sportsclubUuid,
      name: indexed.name,
      ...(indexed.associationUuid ? { associationUuid: indexed.associationUuid } : {}),
      ...(indexed.associationName ? { associationName: indexed.associationName } : {}),
    };
  }

  const cachedAssociations = await args.associationsRepo.listAll();
  const associations =
    cachedAssociations.length > 0
      ? cachedAssociations.map((association) => ({
          uuid: association.uuid,
          name: association.name,
        }))
      : await listAllAssociations(args.sams);

  if (associations.length === 0) {
    throw new Error(
      "No associations in the provider index yet. Run clubs sync or pass the club UUID.",
    );
  }

  const matches: ResolvedClub[] = [];
  const wanted = slugify(args.nameOrUuid);

  for (const association of associations) {
    let page = 0;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = unwrapSamsResult(
        await args.sams.getAllSportsclubs({
          query: { association: association.uuid, page, size: 100 },
        }),
      );
      if (error) {
        throw new Error("Failed to search clubs in SAMS");
      }
      for (const club of data?.content ?? []) {
        if (club.uuid && club.name && slugify(club.name) === wanted) {
          matches.push({
            uuid: club.uuid,
            name: club.name,
            associationUuid: association.uuid,
            associationName: association.name,
          });
        }
      }
      page += 1;
      hasMore = data?.last !== true;
    }
  }

  if (matches.length === 0) {
    throw new Error(`Club "${args.nameOrUuid}" was not found`);
  }
  if (matches.length > 1) {
    const details = matches
      .map(
        (item) => `${item.name} (${item.uuid}, ${item.associationName ?? "unknown association"})`,
      )
      .join("; ");
    throw new Error(`Club "${args.nameOrUuid}" is ambiguous (${details}). Pass the club UUID.`);
  }
  const match = matches[0];
  if (!match) {
    throw new Error(`Club "${args.nameOrUuid}" was not found`);
  }
  return match;
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
