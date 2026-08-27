import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { EntityRepository } from "dynamodb-toolbox/entity/actions/repository";
import { docClient } from "../client";
import { SamsSeasonEntity } from "../entities/sams/season";
import { isoTimestampNow, parseWithSchema } from "../repository-utils";
import { samsSeasonSchema, type SamsSeasonInput } from "../schemas";
import { SamsTableIndexes } from "../table-indexes";
import { getSamsTable } from "../toolbox-client";

export type SamsSeasonUpsertInput = Omit<
  SamsSeasonInput,
  "type" | "updatedAt" | "lastSyncedAt" | "source"
> & {
  updatedAt?: string;
  lastSyncedAt?: string;
};

export class SamsSeasonsRepository {
  constructor(
    private readonly documentClient: DynamoDBDocumentClient = docClient,
    private readonly tableName?: string,
  ) {}

  private entityRepository() {
    getSamsTable(this.documentClient, this.tableName);
    return SamsSeasonEntity.build(EntityRepository);
  }

  async listAll(): Promise<SamsSeasonInput[]> {
    const { Items } = await this.entityRepository().query(
      {
        index: SamsTableIndexes.gsi1,
        partition: "season",
      },
      { maxPages: Infinity },
    );
    return (Items ?? []).map((item) =>
      parseWithSchema(samsSeasonSchema, item, "Failed to parse SAMS season"),
    );
  }

  async upsert(input: SamsSeasonUpsertInput): Promise<SamsSeasonInput> {
    const now = isoTimestampNow();
    const item = parseWithSchema(
      samsSeasonSchema,
      {
        ...input,
        type: "season",
        source: "sams",
        updatedAt: input.updatedAt ?? now,
        lastSyncedAt: input.lastSyncedAt ?? now,
      },
      "Failed to parse SAMS season upsert",
    );
    await this.entityRepository().put(item);
    return item;
  }
}
