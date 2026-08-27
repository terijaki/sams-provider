import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { EntityRepository } from "dynamodb-toolbox/entity/actions/repository";
import { docClient } from "../client";
import { SamsSyncMetaEntity } from "../entities/sams/sync-meta";
import { isoTimestampNow, parseWithSchema, unixTtlFromNow } from "../repository-utils";
import { samsSyncMetaSchema, type SamsSyncMetaInput } from "../schemas";
import { getSamsTable } from "../toolbox-client";

export class SamsSyncMetaRepository {
  constructor(
    private readonly documentClient: DynamoDBDocumentClient = docClient,
    private readonly tableName?: string,
  ) {}

  private entityRepository() {
    getSamsTable(this.documentClient, this.tableName);
    return SamsSyncMetaEntity.build(EntityRepository);
  }

  async put(input: {
    job: string;
    status: "success" | "failure";
    durationMs: number;
    itemCount?: number;
    errorMessage?: string;
  }): Promise<SamsSyncMetaInput> {
    const now = isoTimestampNow();
    const item = parseWithSchema(
      samsSyncMetaSchema,
      {
        ...input,
        type: "sync-meta",
        source: "sams-provider",
        updatedAt: now,
        lastSyncedAt: now,
        ttl: unixTtlFromNow(365),
      },
      "Failed to parse sync metadata",
    );
    await this.entityRepository().put(item);
    return item;
  }
}
