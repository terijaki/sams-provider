import { unixTtlFromNow } from "@lib/db/repository-utils";
import { slugify } from "@utils/slugify";
import type { SamsAssociationsRepository } from "@lib/db/repositories/sams-associations-repository";
import { SAMS_ENTITY_TTL_DAYS } from "../config/constants";
import { listAllAssociations } from "../sams/list-associations";
import type { AssociationResolverSams } from "../sams/resolve-association";

export async function syncAssociationsFromSams(args: {
  sams: AssociationResolverSams;
  associationsRepo: Pick<SamsAssociationsRepository, "upsertMany">;
}): Promise<{ associations: Array<{ uuid: string; name: string }> }> {
  const listed = await listAllAssociations(args.sams);
  await args.associationsRepo.upsertMany(
    listed.map((association) => ({
      uuid: association.uuid,
      name: association.name,
      nameSlug: slugify(association.name),
      ttl: unixTtlFromNow(SAMS_ENTITY_TTL_DAYS),
    })),
  );
  return { associations: listed };
}
