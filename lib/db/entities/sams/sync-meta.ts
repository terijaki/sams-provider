import { Entity } from "dynamodb-toolbox/entity";
import { item } from "dynamodb-toolbox/schema/item";
import { number } from "dynamodb-toolbox/schema/number";
import { string } from "dynamodb-toolbox/schema/string";
import { samsSyncMetaPk } from "../../key-constants";
import { SamsTable } from "../../tables/sams-table";
import { samsMetadataKeys } from "../keys/sams-keys";

export const SamsSyncMetaEntity = new Entity({
  name: "SamsSyncMeta",
  table: SamsTable,
  timestamps: false,
  schema: item({
    job: string().key(),
    type: string().const("sync-meta"),
    status: string(),
    itemCount: number().optional(),
    durationMs: number(),
    errorMessage: string().optional(),
    updatedAt: string(),
    lastSyncedAt: string(),
    source: string().const("sams-provider"),
    ttl: number(),
  }).and((prevSchema) => ({
    pk: string()
      .key()
      .savedAs("pk")
      .link<typeof prevSchema>(({ job }) => samsSyncMetaPk(job))
      .hidden(),
    ...samsMetadataKeys(),
    gsi1pk: string()
      .link<typeof prevSchema>(({ type }) => type)
      .savedAs("gsi1pk")
      .hidden(),
    gsi1sk: string()
      .link<typeof prevSchema>(({ job }) => job)
      .savedAs("gsi1sk")
      .hidden(),
  })),
});
