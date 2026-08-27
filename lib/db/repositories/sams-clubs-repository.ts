import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { EntityRepository } from "dynamodb-toolbox/entity/actions/repository";
import { docClient } from "../client";
import { SamsClubEntity } from "../entities/sams/club";
import { isoTimestampNow, parseWithSchema } from "../repository-utils";
import { samsClubSchema, type SamsClubInput } from "../schemas";
import { SamsTableIndexes } from "../table-indexes";
import { getSamsTable } from "../toolbox-client";

export type SamsClubUpsertInput = Omit<
  SamsClubInput,
  "type" | "updatedAt" | "lastSyncedAt" | "source"
> & {
  updatedAt?: string;
  lastSyncedAt?: string;
};

export class SamsClubsRepository {
  constructor(
    private readonly documentClient: DynamoDBDocumentClient = docClient,
    private readonly tableName?: string,
  ) {}

  private entityRepository() {
    getSamsTable(this.documentClient, this.tableName);
    return SamsClubEntity.build(EntityRepository);
  }

  async listAll(): Promise<SamsClubInput[]> {
    const { Items } = await this.entityRepository().query(
      {
        index: SamsTableIndexes.gsi1,
        partition: "club",
      },
      { maxPages: Infinity },
    );
    return (Items ?? []).map((item) =>
      parseWithSchema(samsClubSchema, item, "Failed to parse SAMS club"),
    );
  }

  async getById(sportsclubUuid: string): Promise<SamsClubInput | null> {
    const { Item } = await this.entityRepository().get({ sportsclubUuid });
    return Item ? parseWithSchema(samsClubSchema, Item, "Failed to parse SAMS club") : null;
  }

  async getByNameSlug(nameSlug: string): Promise<SamsClubInput | null> {
    const { Items } = await this.entityRepository().query(
      {
        index: SamsTableIndexes.gsi1,
        partition: "club",
        range: { beginsWith: nameSlug },
      },
      { maxPages: Infinity },
    );
    const clubs = (Items ?? []).map((item) =>
      parseWithSchema(samsClubSchema, item, "Failed to parse SAMS club"),
    );
    return clubs.find((club) => club.nameSlug === nameSlug) ?? null;
  }

  async upsert(input: SamsClubUpsertInput): Promise<SamsClubInput> {
    const now = isoTimestampNow();
    const item = parseWithSchema(
      samsClubSchema,
      {
        ...input,
        type: "club",
        source: "sams",
        updatedAt: input.updatedAt ?? now,
        lastSyncedAt: input.lastSyncedAt ?? now,
      },
      "Failed to parse SAMS club upsert",
    );
    await this.entityRepository().put(item);
    return item;
  }

  async upsertMany(inputs: SamsClubUpsertInput[]): Promise<void> {
    await Promise.all(inputs.map((input) => this.upsert(input)));
  }
}
