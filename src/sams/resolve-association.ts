type SamsPage<T> = {
  data?: { content?: T[]; last?: boolean };
  error?: unknown;
};

export type AssociationRef = {
  name: string;
  uuid?: string;
  shortName?: string;
};

export type AssociationResolverSams = {
  getAssociations(args: {
    query: { page: number; size: number };
  }): Promise<SamsPage<{ name?: string; uuid?: string }>>;
  getAssociationByUuid(args: { path: { uuid: string } }): Promise<{
    data?: { name?: string; uuid?: string };
    error?: unknown;
  }>;
};

export async function resolveAssociationUuid(
  sams: AssociationResolverSams,
  association: AssociationRef,
): Promise<string> {
  if (association.uuid) {
    const { data, error } = await sams.getAssociationByUuid({ path: { uuid: association.uuid } });
    if (!error && data?.uuid) {
      return data.uuid;
    }
  }

  let currentPage = 0;
  let hasMorePages = true;
  while (hasMorePages) {
    const { data, error } = await sams.getAssociations({
      query: { page: currentPage, size: 100 },
    });
    if (error) {
      throw new Error(`Failed to fetch associations page ${currentPage}`);
    }
    const match = data?.content?.find((item) => item.name === association.name);
    if (match?.uuid) {
      return match.uuid;
    }
    currentPage += 1;
    hasMorePages = data?.last !== true;
  }

  if (association.uuid) {
    return association.uuid;
  }
  throw new Error(`Association "${association.name}" not found`);
}

export async function resolveAssociationName(
  sams: AssociationResolverSams,
  associationUuid: string,
): Promise<string | undefined> {
  const { data, error } = await sams.getAssociationByUuid({ path: { uuid: associationUuid } });
  if (!error && data?.name) {
    return data.name;
  }
  return undefined;
}
