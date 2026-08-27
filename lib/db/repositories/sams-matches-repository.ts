import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { EntityRepository } from "dynamodb-toolbox/entity/actions/repository";
import { docClient } from "../client";
import { SamsMatchEntity } from "../entities/sams/match";
import { isoTimestampNow, parseWithSchema } from "../repository-utils";
import { samsMatchSchema, type SamsMatchInput } from "../schemas";
import { SamsTableIndexes } from "../table-indexes";
import { getSamsTable } from "../toolbox-client";

export type SamsMatchUpsertInput = Omit<
  SamsMatchInput,
  "type" | "updatedAt" | "lastSyncedAt" | "source"
> & {
  updatedAt?: string;
  lastSyncedAt?: string;
};

export class SamsMatchesRepository {
  constructor(
    private readonly documentClient: DynamoDBDocumentClient = docClient,
    private readonly tableName?: string,
  ) {}

  private entityRepository() {
    getSamsTable(this.documentClient, this.tableName);
    return SamsMatchEntity.build(EntityRepository);
  }

  async listAll(): Promise<SamsMatchInput[]> {
    const { Items } = await this.entityRepository().query(
      {
        index: SamsTableIndexes.gsi1,
        partition: "match",
      },
      { maxPages: Infinity },
    );
    return (Items ?? []).map((item) =>
      parseWithSchema(samsMatchSchema, item, "Failed to parse SAMS match"),
    );
  }

  async upsert(input: SamsMatchUpsertInput): Promise<SamsMatchInput> {
    const now = isoTimestampNow();
    const item = parseWithSchema(
      samsMatchSchema,
      {
        ...input,
        type: "match",
        source: "sams",
        updatedAt: input.updatedAt ?? now,
        lastSyncedAt: input.lastSyncedAt ?? now,
      },
      "Failed to parse SAMS match upsert",
    );
    await this.entityRepository().put(item);
    return item;
  }
}
