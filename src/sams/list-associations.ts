import type { AssociationResolverSams } from "./resolve-association";

export type ListedAssociation = {
  uuid: string;
  name: string;
};

export async function listAllAssociations(
  sams: AssociationResolverSams,
): Promise<ListedAssociation[]> {
  const associations: ListedAssociation[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await sams.getAssociations({
      query: { page, size: 100 },
    });
    if (error) {
      throw new Error(`Failed to fetch associations page ${page}`);
    }
    for (const item of data?.content ?? []) {
      if (item.uuid && item.name) {
        associations.push({ uuid: item.uuid, name: item.name });
      }
    }
    page += 1;
    hasMore = data?.last !== true;
  }

  return associations;
}
