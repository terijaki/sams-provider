import type { SamsAssociationsRepository } from "@lib/db/repositories/sams-associations-repository";

export type AssociationFanOutTarget = {
  uuid: string;
  name: string;
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

export function requireAssociationsForClubsSync(args: {
  environment: string;
  associations: AssociationFanOutTarget[];
}): void {
  if (args.associations.length === 0 && args.environment === "prod") {
    throw new Error("No associations in DynamoDB index; run associations-sync before clubs sync");
  }
}

export async function fanOutClubsSyncWorkers(args: {
  associations: AssociationFanOutTarget[];
  invokeWorker: (association: AssociationFanOutTarget) => Promise<void>;
}): Promise<void> {
  for (const association of args.associations) {
    await args.invokeWorker(association);
  }
}
