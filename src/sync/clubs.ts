import type { DomainEventPublisher } from "../events/publisher";
import { createEventEnvelope, EventType, snapshotVersion } from "../events/schemas";
import { logoObjectKey, publicLogoUrl, resolveClubLogo } from "../logos/preserve";
import { resolveAssociationUuid } from "../sams/resolve-association";
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

export type SyncClubsResult = {
  clubsCount: number;
  changedClubUuids: string[];
  associationUuids: string[];
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
}): Promise<SyncClubsResult> {
  const startedAt = Date.now();
  if (args.associations.length === 0) {
    throw new Error("No associations configured for clubs sync");
  }

  const existingClubs = await args.repos.clubs.listAll();
  const existingLogoMap = new Map(
    existingClubs.map((club) => [
      club.sportsclubUuid,
      { logoImageLink: club.logoImageLink, logoS3Key: club.logoS3Key },
    ]),
  );

  let clubsCount = 0;
  const changedClubUuids: string[] = [];
  const associationUuids: string[] = [];
  const events: ReturnType<typeof createEventEnvelope>[] = [];

  for (const association of args.associations) {
    const associationResult = await syncClubsForAssociation({
      ...args,
      association,
      existingClubs,
      existingLogoMap,
    });
    clubsCount += associationResult.clubsCount;
    changedClubUuids.push(...associationResult.changedClubUuids);
    associationUuids.push(associationResult.associationUuid);
    events.push(...associationResult.events);
  }

  await args.publisher.publish(events);
  await args.repos.syncMeta.put({
    job: "clubs",
    status: "success",
    durationMs: Date.now() - startedAt,
    itemCount: clubsCount,
  });

  return { clubsCount, changedClubUuids, associationUuids };
}

async function syncClubsForAssociation(args: {
  sams: ClubsSyncSams;
  repos: ClubsSyncRepos;
  association: AssociationConfig;
  existingClubs: ClubListItem[];
  existingLogoMap: Map<string, { logoImageLink?: string; logoS3Key?: string }>;
  publicLogoBaseUrl: string;
  uploadLogo: LogoUploader;
  sourceSyncId: string;
  sleep?: (ms: number) => Promise<void>;
}): Promise<{
  clubsCount: number;
  changedClubUuids: string[];
  associationUuid: string;
  events: ReturnType<typeof createEventEnvelope>[];
}> {
  const sleep = args.sleep ?? defaultSleep;
  const associationUuid = await resolveAssociationUuid(args.sams, args.association);

  let currentPage = 0;
  let hasMorePages = true;
  let clubsCount = 0;
  const changedClubUuids: string[] = [];
  const upsertedByUuid = new Map<string, ClubUpsertItem>();
  const events: ReturnType<typeof createEventEnvelope>[] = [];

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
      const existing = args.existingLogoMap.get(club.uuid);
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
        associationName: args.association.name,
        ...(resolved.logoImageLink ? { logoImageLink: resolved.logoImageLink } : {}),
        ...(logoS3Key ? { logoS3Key } : {}),
        ttl: unixTtlFromNow(30),
      };
      pageItems.push(item);
      upsertedByUuid.set(club.uuid, item);

      const previous = args.existingClubs.find((row) => row.sportsclubUuid === club.uuid);
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

  events.push(
    createEventEnvelope({
      type: EventType.clubsSyncCompleted,
      sourceSyncId: args.sourceSyncId,
      payload: {
        associationUuid,
        associationName: args.association.name,
        clubsCount,
        changedClubUuids,
      },
    }),
  );

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

  return { clubsCount, changedClubUuids, associationUuid, events };
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

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
