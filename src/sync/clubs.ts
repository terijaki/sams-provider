import type { DomainEventPublisher } from "../events/publisher";
import { createEventEnvelope, EventType, snapshotVersion } from "../events/schemas";
import { logoObjectKey, publicLogoUrl, resolveClubLogo } from "../logos/preserve";
import { unixTtlFromNow } from "@lib/db/repository-utils";
import { slugify } from "@utils/slugify";
import type { AssociationConfig } from "../config/schema";

export type LogoUploader = (args: {
  sportsclubUuid: string;
  logoUrl: string;
}) => Promise<string | undefined>;

type ClubUpsertItem = {
  sportsclubUuid: string;
  name: string;
  nameSlug: string;
  associationUuid?: string;
  associationName?: string;
  logoImageLink?: string;
  logoS3Key?: string;
  ttl: number;
};

type ClubListItem = {
  sportsclubUuid: string;
  name: string;
  nameSlug: string;
  associationUuid?: string;
  associationName?: string;
  logoImageLink?: string;
  logoS3Key?: string;
};

type SamsPage<T> = {
  data?: { content?: T[]; last?: boolean };
  error?: unknown;
  response?: { status?: number };
};

export type ClubsSyncSams = {
  getAllSportsclubs(args: { query: { association: string; page: number; size: number } }): Promise<
    SamsPage<{
      uuid?: string;
      name?: string;
      associationUuid?: string | null;
      logoImageLink?: string | null;
    }>
  >;
  getAssociations(args: {
    query: { page: number; size: number };
  }): Promise<SamsPage<{ name?: string; uuid?: string }>>;
  getAssociationByUuid(args: { path: { uuid: string } }): Promise<{
    data?: { name?: string; uuid?: string };
    error?: unknown;
  }>;
};

export type ClubsSyncRepos = {
  clubs: {
    listAll(): Promise<ClubListItem[]>;
    upsertMany(items: ClubUpsertItem[]): Promise<void>;
  };
  syncMeta: {
    put(input: {
      job: string;
      status: "success" | "failure";
      durationMs: number;
      itemCount?: number;
      errorMessage?: string;
    }): Promise<unknown>;
  };
};

export async function syncClubs(args: {
  sams: ClubsSyncSams;
  repos: ClubsSyncRepos;
  publisher: DomainEventPublisher;
  associations: AssociationConfig[];
  publicLogoBaseUrl: string;
  uploadLogo: LogoUploader;
  sourceSyncId: string;
  sleep?: (ms: number) => Promise<void>;
}): Promise<{ clubsCount: number; changedClubUuids: string[]; associationUuid: string }> {
  const sleep = args.sleep ?? defaultSleep;
  const startedAt = Date.now();
  const association = args.associations[0];
  if (!association) {
    throw new Error("No associations configured for clubs sync");
  }

  const associationUuid = await resolveAssociationUuid(args.sams, association);
  const existingClubs = await args.repos.clubs.listAll();
  const existingLogoMap = new Map(
    existingClubs.map((club) => [
      club.sportsclubUuid,
      { logoImageLink: club.logoImageLink, logoS3Key: club.logoS3Key },
    ]),
  );

  let currentPage = 0;
  let hasMorePages = true;
  let clubsCount = 0;
  const changedClubUuids: string[] = [];
  const upsertedByUuid = new Map<string, ClubUpsertItem>();

  while (hasMorePages) {
    const { data, error, response } = await args.sams.getAllSportsclubs({
      query: { association: associationUuid, page: currentPage, size: 100 },
    });
    if (error) {
      throw new Error(`Error ${response?.status ?? "unknown"} fetching clubs page ${currentPage}`);
    }

    const pageItems: ClubUpsertItem[] = [];
    for (const club of data?.content ?? []) {
      if (!club.uuid || !club.name) {
        continue;
      }
      const existing = existingLogoMap.get(club.uuid);
      const resolved = resolveClubLogo({
        incomingLogoUrl: club.logoImageLink,
        existing,
      });
      let logoS3Key = resolved.existingS3Key;
      if (resolved.shouldUpload && resolved.logoImageLink) {
        const uploaded = await args.uploadLogo({
          sportsclubUuid: club.uuid,
          logoUrl: resolved.logoImageLink,
        });
        if (uploaded) {
          logoS3Key = uploaded;
        }
      }
      const item: ClubUpsertItem = {
        sportsclubUuid: club.uuid,
        name: club.name,
        nameSlug: slugify(club.name),
        ...(club.associationUuid ? { associationUuid: club.associationUuid } : { associationUuid }),
        associationName: association.name,
        ...(resolved.logoImageLink ? { logoImageLink: resolved.logoImageLink } : {}),
        ...(logoS3Key ? { logoS3Key } : {}),
        ttl: unixTtlFromNow(30),
      };
      pageItems.push(item);
      upsertedByUuid.set(club.uuid, item);

      const previous = existingClubs.find((row) => row.sportsclubUuid === club.uuid);
      const nextHash = snapshotVersion({
        name: item.name,
        logoS3Key: item.logoS3Key,
        logoImageLink: item.logoImageLink,
      });
      const previousHash = previous
        ? snapshotVersion({
            name: previous.name,
            logoS3Key: previous.logoS3Key,
            logoImageLink: previous.logoImageLink,
          })
        : undefined;
      if (nextHash !== previousHash) {
        changedClubUuids.push(club.uuid);
      }
    }

    const chunkSize = 25;
    for (let index = 0; index < pageItems.length; index += chunkSize) {
      await args.repos.clubs.upsertMany(pageItems.slice(index, index + chunkSize));
    }
    clubsCount += pageItems.length;
    currentPage += 1;
    hasMorePages = data?.last !== true;
    if (hasMorePages) {
      await sleep(500);
    }
  }

  const events = [
    createEventEnvelope({
      type: EventType.clubsSyncCompleted,
      sourceSyncId: args.sourceSyncId,
      payload: {
        associationUuid,
        associationName: association.name,
        clubsCount,
        changedClubUuids,
      },
    }),
  ];

  for (const uuid of changedClubUuids) {
    const club = upsertedByUuid.get(uuid);
    if (!club) {
      continue;
    }
    events.push(
      createEventEnvelope({
        type: EventType.clubUpdated,
        sourceSyncId: args.sourceSyncId,
        payload: {
          uuid: club.sportsclubUuid,
          name: club.name,
          slug: club.nameSlug,
          ...(club.associationUuid ? { associationUuid: club.associationUuid } : {}),
          ...(club.associationName ? { associationName: club.associationName } : {}),
          logoUrl: publicLogoUrl({
            publicBaseUrl: args.publicLogoBaseUrl,
            logoS3Key: club.logoS3Key,
            fallbackImageLink: club.logoImageLink,
          }),
        },
      }),
    );
  }

  await args.publisher.publish(events);
  await args.repos.syncMeta.put({
    job: "clubs",
    status: "success",
    durationMs: Date.now() - startedAt,
    itemCount: clubsCount,
  });

  return { clubsCount, changedClubUuids, associationUuid };
}

export async function fetchLogoAndKey(args: {
  sportsclubUuid: string;
  logoUrl: string;
  contentTypeFallback?: string;
}): Promise<{ key: string; body: Buffer; contentType: string } | undefined> {
  try {
    const response = await fetch(args.logoUrl, {
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "sams-provider/1.0" },
    });
    if (!response.ok) {
      return undefined;
    }
    const contentType =
      response.headers.get("content-type") ?? args.contentTypeFallback ?? "image/png";
    return {
      key: logoObjectKey(args.sportsclubUuid, contentType),
      body: Buffer.from(await response.arrayBuffer()),
      contentType,
    };
  } catch {
    return undefined;
  }
}

async function resolveAssociationUuid(
  sams: ClubsSyncSams,
  association: AssociationConfig,
): Promise<string> {
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
    const { data, error } = await sams.getAssociationByUuid({ path: { uuid: association.uuid } });
    if (!error && data?.name === association.name && data.uuid) {
      return data.uuid;
    }
  }
  throw new Error(`Association "${association.name}" not found`);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
