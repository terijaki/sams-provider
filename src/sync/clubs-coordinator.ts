import type { SamsAssociationsRepository } from "@lib/db/repositories/sams-associations-repository";

export type AssociationFanOutTarget = {
  uuid: string;
  name: string;
};

export type ResolveAssociationsForClubsSyncResult = {
  associations: AssociationFanOutTarget[];
  devBootstrapped: boolean;
};

export async function listAssociationsForClubsSync(args: {
  associationsRepo: Pick<SamsAssociationsRepository, "listAll">;
}): Promise<AssociationFanOutTarget[]> {
  const associations = await args.associationsRepo.listAll();
  return associations.map((association) => ({
    uuid: association.uuid,
    name: association.name,
  }));
}

/**
 * Prod always fans out from Dynamo. Dev bootstraps an empty index from SAMS once
 * per coordinator run so fresh feature deployments do not need a manual
 * associations-sync invoke before the first clubs sync.
 */
export async function resolveAssociationsForClubsSync(args: {
  environment: string;
  associationsRepo: Pick<SamsAssociationsRepository, "listAll">;
  refreshAssociationsFromSams?: () => Promise<void>;
}): Promise<ResolveAssociationsForClubsSyncResult> {
  const associations = await listAssociationsForClubsSync({
    associationsRepo: args.associationsRepo,
  });
  if (associations.length > 0 || args.environment !== "dev" || !args.refreshAssociationsFromSams) {
    return { associations, devBootstrapped: false };
  }

  await args.refreshAssociationsFromSams();
  return {
    associations: await listAssociationsForClubsSync({
      associationsRepo: args.associationsRepo,
    }),
    devBootstrapped: true,
  };
}

export async function fanOutClubsSyncWorkers(args: {
  associations: AssociationFanOutTarget[];
  invokeWorker: (association: AssociationFanOutTarget) => Promise<void>;
}): Promise<void> {
  for (const association of args.associations) {
    await args.invokeWorker(association);
  }
}
