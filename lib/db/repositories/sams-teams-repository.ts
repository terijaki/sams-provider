import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { EntityRepository } from "dynamodb-toolbox/entity/actions/repository";
import { docClient } from "../client";
import { SamsTeamEntity } from "../entities/sams/team";
import { isoTimestampNow, parseWithSchema } from "../repository-utils";
import { samsTeamSchema, type SamsTeamInput } from "../schemas";
import { SamsTableIndexes } from "../table-indexes";
import { getSamsTable } from "../toolbox-client";

export type SamsTeamUpsertInput = Omit<
  SamsTeamInput,
  "type" | "updatedAt" | "lastSyncedAt" | "source"
> & {
  updatedAt?: string;
  lastSyncedAt?: string;
};

export class SamsTeamsRepository {
  constructor(
    private readonly documentClient: DynamoDBDocumentClient = docClient,
    private readonly tableName?: string,
  ) {}

  private entityRepository() {
    getSamsTable(this.documentClient, this.tableName);
    return SamsTeamEntity.build(EntityRepository);
  }

  async listAll(): Promise<SamsTeamInput[]> {
    const { Items } = await this.entityRepository().query(
      {
        index: SamsTableIndexes.gsi1,
        partition: "team",
      },
      { maxPages: Infinity },
    );
    return (Items ?? []).map((item) =>
      parseWithSchema(samsTeamSchema, item, "Failed to parse SAMS team"),
    );
  }

  async listBySportsclub(sportsclubUuid: string): Promise<SamsTeamInput[]> {
    const { Items } = await this.entityRepository().query(
      {
        index: SamsTableIndexes.gsi2,
        partition: sportsclubUuid,
      },
      { maxPages: Infinity },
    );
    return (Items ?? []).map((item) =>
      parseWithSchema(samsTeamSchema, item, "Failed to parse SAMS team"),
    );
  }

  async upsert(input: SamsTeamUpsertInput): Promise<SamsTeamInput> {
    const now = isoTimestampNow();
    const item = parseWithSchema(
      samsTeamSchema,
      {
        ...input,
        type: "team",
        source: "sams",
        updatedAt: input.updatedAt ?? now,
        lastSyncedAt: input.lastSyncedAt ?? now,
      },
      "Failed to parse SAMS team upsert",
    );
    await this.entityRepository().put(item);
    return item;
  }

  async delete(uuid: string): Promise<void> {
    await this.entityRepository().delete({ uuid });
  }
}
