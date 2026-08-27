import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { EntityRepository } from "dynamodb-toolbox/entity/actions/repository";
import { docClient } from "../client";
import { SamsLeagueEntity } from "../entities/sams/league";
import { isoTimestampNow, parseWithSchema } from "../repository-utils";
import { samsLeagueSchema, type SamsLeagueInput } from "../schemas";
import { SamsTableIndexes } from "../table-indexes";
import { getSamsTable } from "../toolbox-client";

export type SamsLeagueUpsertInput = Omit<
  SamsLeagueInput,
  "type" | "updatedAt" | "lastSyncedAt" | "source"
> & {
  updatedAt?: string;
  lastSyncedAt?: string;
};

export class SamsLeaguesRepository {
  constructor(
    private readonly documentClient: DynamoDBDocumentClient = docClient,
    private readonly tableName?: string,
  ) {}

  private entityRepository() {
    getSamsTable(this.documentClient, this.tableName);
    return SamsLeagueEntity.build(EntityRepository);
  }

  async listAll(): Promise<SamsLeagueInput[]> {
    const { Items } = await this.entityRepository().query(
      {
        index: SamsTableIndexes.gsi1,
        partition: "league",
      },
      { maxPages: Infinity },
    );
    return (Items ?? []).map((item) =>
      parseWithSchema(samsLeagueSchema, item, "Failed to parse SAMS league"),
    );
  }

  async upsert(input: SamsLeagueUpsertInput): Promise<SamsLeagueInput> {
    const now = isoTimestampNow();
    const item = parseWithSchema(
      samsLeagueSchema,
      {
        ...input,
        type: "league",
        source: "sams",
        updatedAt: input.updatedAt ?? now,
        lastSyncedAt: input.lastSyncedAt ?? now,
      },
      "Failed to parse SAMS league upsert",
    );
    await this.entityRepository().put(item);
    return item;
  }
}
