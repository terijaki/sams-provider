import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { EntityRepository } from "dynamodb-toolbox/entity/actions/repository";
import { docClient } from "../client";
import { SamsRosterEntity } from "../entities/sams/roster";
import { isoTimestampNow, parseWithSchema } from "../repository-utils";
import { samsRosterSchema, type SamsRosterInput } from "../schemas";
import { getSamsTable } from "../toolbox-client";

export type SamsRosterUpsertInput = Omit<
  SamsRosterInput,
  "type" | "updatedAt" | "lastSyncedAt" | "source"
> & {
  updatedAt?: string;
  lastSyncedAt?: string;
};

export class SamsRostersRepository {
  constructor(
    private readonly documentClient: DynamoDBDocumentClient = docClient,
    private readonly tableName?: string,
  ) {}

  private entityRepository() {
    getSamsTable(this.documentClient, this.tableName);
    return SamsRosterEntity.build(EntityRepository);
  }

  async upsert(input: SamsRosterUpsertInput): Promise<SamsRosterInput> {
    const now = isoTimestampNow();
    const item = parseWithSchema(
      samsRosterSchema,
      {
        ...input,
        type: "roster",
        source: "sams",
        updatedAt: input.updatedAt ?? now,
        lastSyncedAt: input.lastSyncedAt ?? now,
      },
      "Failed to parse SAMS roster upsert",
    );
    await this.entityRepository().put(item);
    return item;
  }

  async delete(teamUuid: string): Promise<void> {
    await this.entityRepository().delete({ teamUuid });
  }
}
