import { Entity } from "dynamodb-toolbox/entity";
import { item } from "dynamodb-toolbox/schema/item";
import { number } from "dynamodb-toolbox/schema/number";
import { string } from "dynamodb-toolbox/schema/string";
import { samsClubPk } from "../../key-constants";
import { SamsTable } from "../../tables/sams-table";
import { samsMetadataKeys } from "../keys/sams-keys";

export const SamsClubEntity = new Entity({
  name: "SamsClub",
  table: SamsTable,
  timestamps: false,
  schema: item({
    sportsclubUuid: string().key(),
    type: string().const("club"),
    name: string(),
    nameSlug: string(),
    associationUuid: string().optional(),
    associationName: string().optional(),
    logoImageLink: string().optional(),
    logoS3Key: string().optional(),
    updatedAt: string(),
    lastSyncedAt: string(),
    source: string().const("sams"),
    ttl: number(),
  }).and((prevSchema) => ({
    pk: string()
      .key()
      .savedAs("pk")
      .link<typeof prevSchema>(({ sportsclubUuid }) => samsClubPk(sportsclubUuid))
      .hidden(),
    ...samsMetadataKeys(),
    gsi1pk: string()
      .link<typeof prevSchema>(({ type }) => type)
      .savedAs("gsi1pk")
      .hidden(),
    gsi1sk: string()
      .link<typeof prevSchema>(({ nameSlug }) => nameSlug)
      .savedAs("gsi1sk")
      .hidden(),
  })),
});
