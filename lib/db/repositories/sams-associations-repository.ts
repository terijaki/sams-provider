import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { EntityRepository } from "dynamodb-toolbox/entity/actions/repository";
import { docClient } from "../client";
import { SamsAssociationEntity } from "../entities/sams/association";
import { isoTimestampNow, parseWithSchema } from "../repository-utils";
import { samsAssociationSchema, type SamsAssociationInput } from "../schemas";
import { SamsTableIndexes } from "../table-indexes";
import { getSamsTable } from "../toolbox-client";

export type SamsAssociationUpsertInput = Omit<
  SamsAssociationInput,
  "type" | "updatedAt" | "lastSyncedAt" | "source"
> & {
  updatedAt?: string;
  lastSyncedAt?: string;
};

export class SamsAssociationsRepository {
  constructor(
    private readonly documentClient: DynamoDBDocumentClient = docClient,
    private readonly tableName?: string,
  ) {}

  private entityRepository() {
    getSamsTable(this.documentClient, this.tableName);
    return SamsAssociationEntity.build(EntityRepository);
  }

  async listAll(): Promise<SamsAssociationInput[]> {
    const { Items } = await this.entityRepository().query(
      {
        index: SamsTableIndexes.gsi1,
        partition: "association",
      },
      { maxPages: Infinity },
    );
    return (Items ?? []).map((item) =>
      parseWithSchema(samsAssociationSchema, item, "Failed to parse SAMS association"),
    );
  }

  async upsertMany(inputs: SamsAssociationUpsertInput[]): Promise<void> {
    const now = isoTimestampNow();
    for (const input of inputs) {
      const item = parseWithSchema(
        samsAssociationSchema,
        {
          ...input,
          type: "association",
          source: "sams",
          updatedAt: input.updatedAt ?? now,
          lastSyncedAt: input.lastSyncedAt ?? now,
        },
        "Failed to parse SAMS association upsert",
      );
      await this.entityRepository().put(item);
    }
  }
}
