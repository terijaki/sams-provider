import { Entity } from "dynamodb-toolbox/entity";
import { boolean } from "dynamodb-toolbox/schema/boolean";
import { item } from "dynamodb-toolbox/schema/item";
import { number } from "dynamodb-toolbox/schema/number";
import { string } from "dynamodb-toolbox/schema/string";
import { samsSeasonPk } from "../../key-constants";
import { SamsTable } from "../../tables/sams-table";
import { samsMetadataKeys } from "../keys/sams-keys";

export const SamsSeasonEntity = new Entity({
  name: "SamsSeason",
  table: SamsTable,
  timestamps: false,
  schema: item({
    uuid: string().key(),
    type: string().const("season"),
    name: string(),
    currentSeason: boolean(),
    updatedAt: string(),
    lastSyncedAt: string(),
    source: string().const("sams"),
    ttl: number(),
  }).and((prevSchema) => ({
    pk: string()
      .key()
      .savedAs("pk")
      .link<typeof prevSchema>(({ uuid }) => samsSeasonPk(uuid))
      .hidden(),
    ...samsMetadataKeys(),
    gsi1pk: string()
      .link<typeof prevSchema>(({ type }) => type)
      .savedAs("gsi1pk")
      .hidden(),
    gsi1sk: string()
      .link<typeof prevSchema>(({ name }) => name)
      .savedAs("gsi1sk")
      .hidden(),
  })),
});
