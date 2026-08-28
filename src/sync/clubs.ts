import type { DomainEventPublisher } from "../events/publisher";
import { createEventEnvelope, SamsEventType, snapshotVersion } from "../events/schemas";
import { SAMS_ENTITY_TTL_DAYS } from "../config/constants";
import { logoObjectKey, publicLogoUrl, resolveClubLogo } from "../logos/preserve";
import { unixTtlFromNow } from "@lib/db/repository-utils";
import { slugify } from "@utils/slugify";

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

export type AssociationClubsSyncSams = {
  getAllSportsclubs(args: { query: { association: string; page: number; size: number } }): Promise<
    SamsPage<{
      uuid?: string;
      name?: string;
      associationUuid?: string | null;
      logoImageLink?: string | null;
    }>
  >;
  getSportsclub(args: { path: { uuid: string } }): Promise<{
    data?: {
      uuid?: string;
      name?: string;
      logoImageLink?: string | null;
      associationUuid?: string | null;
    };
    error?: unknown;
  }>;
};

export type AssociationClubsSyncRepos = {
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

export type SyncAssociationClubsResult = {
  clubsCount: number;
  changedRegisteredClubUuids: string[];
};

export async function syncAssociationClubs(args: {
  sams: AssociationClubsSyncSams;
  repos: AssociationClubsSyncRepos;
  publisher: DomainEventPublisher;
  associationUuid: string;
  associationName: string;
  registeredClubUuids: Set<string>;
  publicLogoBaseUrl: string;
  uploadLogo: LogoUploader;
  sourceSyncId: string;
  sleep?: (ms: number) => Promise<void>;
}): Promise<SyncAssociationClubsResult> {
  const sleep = args.sleep ?? defaultSleep;
  const startedAt = Date.now();
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
  const changedRegisteredClubUuids: string[] = [];
  const events: ReturnType<typeof createEventEnvelope>[] = [];

  while (hasMorePages) {
    const { data, error, response } = await args.sams.getAllSportsclubs({
      query: { association: args.associationUuid, page: currentPage, size: 100 },
    });
    if (error) {
      throw new Error(`Error ${response?.status ?? "unknown"} fetching clubs page ${currentPage}`);
    }

    const pageItems: ClubUpsertItem[] = [];
    for (const club of data?.content ?? []) {
      if (!club.uuid || !club.name) {
        continue;
      }

      const existingRow = existingClubs.find((row) => row.sportsclubUuid === club.uuid);
      const associationUuid = club.associationUuid ?? args.associationUuid;
      const associationName = args.associationName;
      const dataChanged =
        !existingRow ||
        clubDataSnapshot({
          name: club.name,
          associationUuid,
          associationName,
        }) !==
          clubDataSnapshot({
            name: existingRow.name,
            associationUuid: existingRow.associationUuid,
            associationName: existingRow.associationName,
          });

      const existingLogo = existingLogoMap.get(club.uuid);
      let logoImageLink: string | undefined;
      let logoS3Key: string | undefined;

      if (!existingRow) {
        const resolved = await resolveLogoForClub({
          sams: args.sams,
          sportsclubUuid: club.uuid,
          incomingLogoUrl: club.logoImageLink,
          existing: existingLogo,
          fetchDetail: true,
        });
        logoImageLink = resolved.logoImageLink;
        logoS3Key = resolved.existingS3Key;
        if (resolved.shouldUpload && resolved.logoImageLink) {
          const uploaded = await args.uploadLogo({
            sportsclubUuid: club.uuid,
            logoUrl: resolved.logoImageLink,
          });
          if (uploaded) {
            logoS3Key = uploaded;
          }
        }
      } else if (dataChanged) {
        const resolved = await resolveLogoForClub({
          sams: args.sams,
          sportsclubUuid: club.uuid,
          incomingLogoUrl: club.logoImageLink,
          existing: existingLogo,
          fetchDetail: !club.logoImageLink,
        });
        logoImageLink = resolved.logoImageLink;
        logoS3Key = resolved.existingS3Key;
        if (resolved.shouldUpload && resolved.logoImageLink) {
          const uploaded = await args.uploadLogo({
            sportsclubUuid: club.uuid,
            logoUrl: resolved.logoImageLink,
          });
          if (uploaded) {
            logoS3Key = uploaded;
          }
        }
      } else {
        const resolved = resolveClubLogo({
          incomingLogoUrl: null,
          existing: existingLogo,
        });
        logoImageLink = resolved.logoImageLink;
        logoS3Key = resolved.existingS3Key;
      }

      const item: ClubUpsertItem = {
        sportsclubUuid: club.uuid,
        name: club.name,
        nameSlug: slugify(club.name),
        associationUuid,
        associationName,
        ...(logoImageLink ? { logoImageLink } : {}),
        ...(logoS3Key ? { logoS3Key } : {}),
        ttl: unixTtlFromNow(SAMS_ENTITY_TTL_DAYS),
      };
      pageItems.push(item);

      const projectionChanged =
        !existingRow ||
        clubProjectionSnapshot({
          name: item.name,
          associationUuid: item.associationUuid,
          associationName: item.associationName,
          logoS3Key: item.logoS3Key,
          logoImageLink: item.logoImageLink,
        }) !==
          clubProjectionSnapshot({
            name: existingRow.name,
            associationUuid: existingRow.associationUuid,
            associationName: existingRow.associationName,
            logoS3Key: existingRow.logoS3Key,
            logoImageLink: existingRow.logoImageLink,
          });

      if (args.registeredClubUuids.has(club.uuid) && projectionChanged) {
        changedRegisteredClubUuids.push(club.uuid);
        events.push(
          createEventEnvelope({
            type: SamsEventType.clubUpdated,
            sourceSyncId: args.sourceSyncId,
            payload: {
              uuid: item.sportsclubUuid,
              name: item.name,
              slug: item.nameSlug,
              associationUuid: item.associationUuid,
              associationName: item.associationName,
              logoUrl: publicLogoUrl({
                publicBaseUrl: args.publicLogoBaseUrl,
                logoS3Key: item.logoS3Key,
                fallbackImageLink: item.logoImageLink,
              }),
            },
          }),
        );
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

  await args.publisher.publish(events);
  await args.repos.syncMeta.put({
    job: `clubs-${args.associationUuid}`,
    status: "success",
    durationMs: Date.now() - startedAt,
    itemCount: clubsCount,
  });

  return { clubsCount, changedRegisteredClubUuids };
}

async function resolveLogoForClub(args: {
  sams: AssociationClubsSyncSams;
  sportsclubUuid: string;
  incomingLogoUrl: string | null | undefined;
  existing?: { logoImageLink?: string; logoS3Key?: string };
  fetchDetail: boolean;
}): Promise<{
  logoImageLink?: string;
  shouldUpload: boolean;
  existingS3Key?: string;
}> {
  const resolved = resolveClubLogo({
    incomingLogoUrl: args.incomingLogoUrl,
    existing: args.existing,
  });
  if (resolved.logoImageLink) {
    return resolved;
  }
  if (!args.fetchDetail) {
    return resolved;
  }
  const { data, error } = await args.sams.getSportsclub({ path: { uuid: args.sportsclubUuid } });
  if (error || !data?.uuid) {
    return resolved;
  }
  return resolveClubLogo({
    incomingLogoUrl: data.logoImageLink,
    existing: args.existing,
  });
}

function clubDataSnapshot(club: {
  name: string;
  associationUuid?: string;
  associationName?: string;
}): string {
  return snapshotVersion({
    name: club.name,
    associationUuid: club.associationUuid,
    associationName: club.associationName,
  });
}

function clubProjectionSnapshot(club: {
  name: string;
  associationUuid?: string;
  associationName?: string;
  logoS3Key?: string;
  logoImageLink?: string;
}): string {
  return snapshotVersion({
    name: club.name,
    associationUuid: club.associationUuid,
    associationName: club.associationName,
    logoS3Key: club.logoS3Key,
    logoImageLink: club.logoImageLink,
  });
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
