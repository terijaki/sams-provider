import { Entity } from "dynamodb-toolbox/entity";
import { boolean } from "dynamodb-toolbox/schema/boolean";
import { item } from "dynamodb-toolbox/schema/item";
import { list } from "dynamodb-toolbox/schema/list";
import { number } from "dynamodb-toolbox/schema/number";
import { string } from "dynamodb-toolbox/schema/string";
import { samsMatchPk } from "../../key-constants";
import { SamsTable } from "../../tables/sams-table";
import { samsMetadataKeys } from "../keys/sams-keys";

export const SamsMatchEntity = new Entity({
  name: "SamsMatch",
  table: SamsTable,
  timestamps: false,
  schema: item({
    uuid: string().key(),
    type: string().const("match"),
    date: string().optional(),
    time: string().optional(),
    leagueUuid: string().optional(),
    seasonUuid: string().optional(),
    locationUuid: string().optional(),
    sportsclubUuids: list(string()),
    hasResult: boolean(),
    matchBlockId: string().optional(),
    rawJson: string(),
    updatedAt: string(),
    lastSyncedAt: string(),
    source: string().const("sams"),
    ttl: number(),
  }).and((prevSchema) => ({
    pk: string()
      .key()
      .savedAs("pk")
      .link<typeof prevSchema>(({ uuid }) => samsMatchPk(uuid))
      .hidden(),
    ...samsMetadataKeys(),
    gsi1pk: string()
      .link<typeof prevSchema>(({ type }) => type)
      .savedAs("gsi1pk")
      .hidden(),
    gsi1sk: string()
      .link<typeof prevSchema>(({ date }) => date ?? "unknown")
      .savedAs("gsi1sk")
      .hidden(),
  })),
});
