import { Entity } from "dynamodb-toolbox/entity";
import { item } from "dynamodb-toolbox/schema/item";
import { number } from "dynamodb-toolbox/schema/number";
import { string } from "dynamodb-toolbox/schema/string";
import { samsTeamPk } from "../../key-constants";
import { SamsTable } from "../../tables/sams-table";
import { samsMetadataKeys } from "../keys/sams-keys";

export const SamsTeamEntity = new Entity({
  name: "SamsTeam",
  table: SamsTable,
  timestamps: false,
  schema: item({
    uuid: string().key(),
    type: string().const("team"),
    name: string(),
    nameSlug: string(),
    sportsclubUuid: string(),
    associationUuid: string(),
    leagueUuid: string(),
    leagueName: string(),
    leagueHierarchyLevel: number().optional(),
    seasonUuid: string(),
    seasonName: string(),
    updatedAt: string(),
    lastSyncedAt: string(),
    source: string().const("sams"),
    ttl: number(),
  }).and((prevSchema) => ({
    pk: string()
      .key()
      .savedAs("pk")
      .link<typeof prevSchema>(({ uuid }) => samsTeamPk(uuid))
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
    gsi2pk: string()
      .link<typeof prevSchema>(({ sportsclubUuid }) => sportsclubUuid)
      .savedAs("gsi2pk")
      .hidden(),
    gsi2sk: string()
      .link<typeof prevSchema>(({ uuid }) => uuid)
      .savedAs("gsi2sk")
      .hidden(),
  })),
});
