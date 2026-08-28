import { describe, expect, it } from "vite-plus/test";
import {
  fanOutClubsSyncWorkers,
  listAssociationsForClubsSync,
  requireAssociationsForClubsSync,
} from "./clubs-coordinator";

describe("listAssociationsForClubsSync", () => {
  it("maps Dynamo association rows to fan-out targets", async () => {
    const associations = await listAssociationsForClubsSync({
      associationsRepo: {
        listAll: async () => [
          {
            uuid: "assoc-1",
            type: "association",
            name: "Assoc One",
            nameSlug: "assoc-one",
            updatedAt: "2026-01-01T00:00:00.000Z",
            lastSyncedAt: "2026-01-01T00:00:00.000Z",
            source: "sams",
            ttl: 1_800_000_000,
          },
          {
            uuid: "assoc-2",
            type: "association",
            name: "Assoc Two",
            nameSlug: "assoc-two",
            updatedAt: "2026-01-01T00:00:00.000Z",
            lastSyncedAt: "2026-01-01T00:00:00.000Z",
            source: "sams",
            ttl: 1_800_000_000,
          },
        ],
      },
    });

    expect(associations).toEqual([
      { uuid: "assoc-1", name: "Assoc One" },
      { uuid: "assoc-2", name: "Assoc Two" },
    ]);
  });

  it("returns an empty list when Dynamo has no associations", async () => {
    const associations = await listAssociationsForClubsSync({
      associationsRepo: {
        listAll: async () => [],
      },
    });

    expect(associations).toEqual([]);
  });
});

describe("requireAssociationsForClubsSync", () => {
  it("throws on prod when the association index is empty", () => {
    expect(() =>
      requireAssociationsForClubsSync({
        environment: "prod",
        associations: [],
      }),
    ).toThrow("No associations in DynamoDB index");
  });

  it("allows an empty association index on dev", () => {
    expect(() =>
      requireAssociationsForClubsSync({
        environment: "dev",
        associations: [],
      }),
    ).not.toThrow();
  });
});

describe("fanOutClubsSyncWorkers", () => {
  it("invokes one worker per association from Dynamo", async () => {
    const invoked: Array<{ uuid: string; name: string }> = [];

    await fanOutClubsSyncWorkers({
      associations: [
        { uuid: "assoc-1", name: "Assoc One" },
        { uuid: "assoc-2", name: "Assoc Two" },
        { uuid: "assoc-3", name: "Assoc Three" },
      ],
      invokeWorker: async (association) => {
        invoked.push(association);
      },
    });

    expect(invoked).toEqual([
      { uuid: "assoc-1", name: "Assoc One" },
      { uuid: "assoc-2", name: "Assoc Two" },
      { uuid: "assoc-3", name: "Assoc Three" },
    ]);
  });

  it("invokes no workers when the association list is empty", async () => {
    let invokeCount = 0;

    await fanOutClubsSyncWorkers({
      associations: [],
      invokeWorker: async () => {
        invokeCount += 1;
      },
    });

    expect(invokeCount).toBe(0);
  });
});
