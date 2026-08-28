import { describe, expect, it } from "vite-plus/test";
import { InMemoryEventPublisher } from "../events/publisher";
import { SAMS_ENTITY_TTL_DAYS } from "../config/constants";
import { unixTtlFromNow } from "@lib/db/repository-utils";
import {
  syncAssociationClubs,
  type AssociationClubsSyncRepos,
  type AssociationClubsSyncSams,
} from "./clubs";
import type { SamsClubInput } from "@lib/db/schemas";

function page<T>(content: T[], last = true) {
  return { data: { content, last }, error: undefined, response: { status: 200 } };
}

describe("syncAssociationClubs", () => {
  it("preserves stored logos when the list API returns null and emits clubUpdated for registered clubs only", async () => {
    const stored: SamsClubInput[] = [
      {
        sportsclubUuid: "club-1",
        type: "club",
        name: "Example Club",
        nameSlug: "example-club",
        associationUuid: "assoc-1",
        associationName: "Assoc One",
        logoImageLink: "https://sams.example/old.png",
        logoS3Key: "sams-logos/club-1.png",
        updatedAt: "2026-01-01T00:00:00.000Z",
        lastSyncedAt: "2026-01-01T00:00:00.000Z",
        source: "sams",
        ttl: unixTtlFromNow(SAMS_ENTITY_TTL_DAYS),
      },
    ];
    const upserted: Parameters<AssociationClubsSyncRepos["clubs"]["upsertMany"]>[0] = [];
    const repos: AssociationClubsSyncRepos = {
      clubs: {
        listAll: async () => stored,
        upsertMany: async (items) => {
          upserted.push(...items);
        },
      },
      syncMeta: {
        put: async () => undefined,
      },
    };

    const sams: AssociationClubsSyncSams = {
      getSportsclub: async () => ({ data: undefined, error: undefined }),
      getAllSportsclubs: async () =>
        page([
          {
            uuid: "club-1",
            name: "Example Club",
            associationUuid: "assoc-1",
            logoImageLink: null,
          },
        ]),
    };

    const publisher = new InMemoryEventPublisher();
    const uploaded: string[] = [];

    const result = await syncAssociationClubs({
      sams,
      repos,
      publisher,
      associationUuid: "assoc-1",
      associationName: "Assoc One",
      registeredClubUuids: new Set(["club-1"]),
      publicLogoBaseUrl: "https://cdn.example",
      sourceSyncId: "sync-1",
      sleep: async () => undefined,
      uploadLogo: async ({ sportsclubUuid }) => {
        uploaded.push(sportsclubUuid);
        return `sams-logos/${sportsclubUuid}.png`;
      },
    });

    expect(result.clubsCount).toBe(1);
    expect(uploaded).toEqual([]);
    expect(upserted[0]?.ttl).toBe(unixTtlFromNow(SAMS_ENTITY_TTL_DAYS));
    expect(upserted[0]?.logoS3Key).toBe("sams-logos/club-1.png");
    expect(publisher.published.some((event) => event.type === "sams.club.updated")).toBe(false);
  });

  it("indexes new clubs without emitting clubUpdated for non-registered clubs", async () => {
    const upserted: Parameters<AssociationClubsSyncRepos["clubs"]["upsertMany"]>[0] = [];
    const repos: AssociationClubsSyncRepos = {
      clubs: {
        listAll: async () => [],
        upsertMany: async (items) => {
          upserted.push(...items);
        },
      },
      syncMeta: {
        put: async () => undefined,
      },
    };

    const sams: AssociationClubsSyncSams = {
      getSportsclub: async () => ({
        data: { uuid: "club-2", logoImageLink: "https://sams.example/new.png" },
        error: undefined,
      }),
      getAllSportsclubs: async () =>
        page([
          {
            uuid: "club-2",
            name: "Other Club",
            associationUuid: "assoc-2",
            logoImageLink: null,
          },
        ]),
    };

    const publisher = new InMemoryEventPublisher();
    const uploaded: string[] = [];

    await syncAssociationClubs({
      sams,
      repos,
      publisher,
      associationUuid: "assoc-2",
      associationName: "Assoc Two",
      registeredClubUuids: new Set(),
      publicLogoBaseUrl: "https://cdn.example",
      sourceSyncId: "sync-1",
      sleep: async () => undefined,
      uploadLogo: async ({ sportsclubUuid }) => {
        uploaded.push(sportsclubUuid);
        return `sams-logos/${sportsclubUuid}.png`;
      },
    });

    expect(upserted[0]?.sportsclubUuid).toBe("club-2");
    expect(uploaded).toEqual(["club-2"]);
    expect(publisher.published).toEqual([]);
  });
});
