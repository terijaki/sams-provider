import type { SamsClubInput } from "@lib/db/schemas";
import { slugify } from "@utils/slugify";
import type { AssociationConfig, ClubSubscription } from "./schema";

export function mergeAssociationConfigs(associations: AssociationConfig[]): AssociationConfig[] {
  const byKey = new Map<string, AssociationConfig>();
  for (const association of associations) {
    const key = association.uuid ?? association.name;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, association);
      continue;
    }
    byKey.set(key, {
      name: existing.name || association.name,
      shortName: existing.shortName ?? association.shortName,
      uuid: existing.uuid ?? association.uuid,
    });
  }
  return [...byKey.values()];
}

export function associationsFromRegisteredClubs(
  registered: ClubSubscription[],
  storedClubs: SamsClubInput[],
): AssociationConfig[] {
  const registeredUuids = new Set(registered.map((club) => club.uuid));
  const derived: AssociationConfig[] = [];
  for (const club of storedClubs) {
    if (!registeredUuids.has(club.sportsclubUuid) || !club.associationUuid) {
      continue;
    }
    derived.push({
      uuid: club.associationUuid,
      name: club.associationName ?? club.associationUuid,
    });
  }
  return derived;
}

export function buildSyncAssociations(
  configured: AssociationConfig[],
  registered: ClubSubscription[],
  storedClubs: SamsClubInput[],
): AssociationConfig[] {
  return mergeAssociationConfigs([
    ...configured,
    ...associationsFromRegisteredClubs(registered, storedClubs),
  ]);
}

export function filterAssociations(
  associations: AssociationConfig[],
  filter: string,
): AssociationConfig[] {
  if (/^[0-9a-f-]{36}$/i.test(filter)) {
    return associations.filter((association) => association.uuid === filter);
  }
  const wanted = slugify(filter);
  return associations.filter(
    (association) =>
      slugify(association.name) === wanted ||
      (association.shortName ? slugify(association.shortName) === wanted : false),
  );
}
