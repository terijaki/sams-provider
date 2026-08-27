import { describe, expect, it } from "vite-plus/test";
import { InMemoryEventPublisher } from "../events/publisher";
import { unixTtlFromNow } from "@lib/db/repository-utils";
import { syncClubs, type ClubsSyncRepos, type ClubsSyncSams } from "./clubs";
import type { SamsClubInput } from "@lib/db/schemas";

function page<T>(content: T[], last = true) {
  return { data: { content, last }, error: undefined, response: { status: 200 } };
}

describe("syncClubs", () => {
  it("preserves stored logos when the list API returns null and publishes changed clubs", async () => {
    const stored: SamsClubInput[] = [
      {
        sportsclubUuid: "club-1",
        type: "club",
        name: "Example Club",
        nameSlug: "example-club",
        associationUuid: "assoc-1",
        associationName: "SBVV",
        logoImageLink: "https://sams.example/old.png",
        logoS3Key: "sams-logos/club-1.png",
        updatedAt: "2026-01-01T00:00:00.000Z",
        lastSyncedAt: "2026-01-01T00:00:00.000Z",
        source: "sams",
        ttl: unixTtlFromNow(30),
      },
    ];
    const upserted: Parameters<ClubsSyncRepos["clubs"]["upsertMany"]>[0] = [];
    const repos: ClubsSyncRepos = {
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

    const sams: ClubsSyncSams = {
      getAssociations: async () => page([{ name: "SBVV", uuid: "assoc-1" }]),
      getAssociationByUuid: async () => ({ data: undefined, error: undefined }),
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

    const result = await syncClubs({
      sams,
      repos,
      publisher,
      associations: [{ name: "SBVV", uuid: "assoc-1" }],
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
    expect(upserted[0]?.logoS3Key).toBe("sams-logos/club-1.png");
    expect(upserted[0]?.logoImageLink).toBe("https://sams.example/old.png");
    expect(publisher.published.some((event) => event.type === "sams.clubs.sync.completed")).toBe(
      true,
    );
  });
});
