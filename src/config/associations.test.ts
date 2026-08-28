import { describe, expect, it } from "vite-plus/test";
import {
  associationsFromRegisteredClubs,
  buildSyncAssociations,
  filterAssociations,
  mergeAssociationConfigs,
} from "./associations";

describe("mergeAssociationConfigs", () => {
  it("deduplicates by uuid and merges optional fields", () => {
    const merged = mergeAssociationConfigs([
      { name: "SBVV", uuid: "assoc-1" },
      { name: "SBVV", uuid: "assoc-1", shortName: "SBVV" },
      { name: "Other", uuid: "assoc-2" },
    ]);
    expect(merged).toEqual([
      { name: "SBVV", uuid: "assoc-1", shortName: "SBVV" },
      { name: "Other", uuid: "assoc-2" },
    ]);
  });
});

describe("associationsFromRegisteredClubs", () => {
  it("derives associations only for registered clubs with associationUuid", () => {
    const derived = associationsFromRegisteredClubs(
      [{ uuid: "club-1", name: "Club One", consumerIds: ["c1"] }],
      [
        {
          sportsclubUuid: "club-1",
          type: "club",
          name: "Club One",
          nameSlug: "club-one",
          associationUuid: "assoc-2",
          associationName: "Other Association",
          updatedAt: "2026-01-01T00:00:00.000Z",
          lastSyncedAt: "2026-01-01T00:00:00.000Z",
          source: "sams",
          ttl: 1,
        },
        {
          sportsclubUuid: "club-2",
          type: "club",
          name: "Club Two",
          nameSlug: "club-two",
          associationUuid: "assoc-3",
          associationName: "Ignored",
          updatedAt: "2026-01-01T00:00:00.000Z",
          lastSyncedAt: "2026-01-01T00:00:00.000Z",
          source: "sams",
          ttl: 1,
        },
      ],
    );
    expect(derived).toEqual([{ uuid: "assoc-2", name: "Other Association" }]);
  });
});

describe("buildSyncAssociations", () => {
  it("unions configured and registered-club associations", () => {
    const associations = buildSyncAssociations(
      [{ name: "SBVV", uuid: "assoc-1" }],
      [{ uuid: "club-1", name: "Club One", consumerIds: ["c1"] }],
      [
        {
          sportsclubUuid: "club-1",
          type: "club",
          name: "Club One",
          nameSlug: "club-one",
          associationUuid: "assoc-2",
          associationName: "Other Association",
          updatedAt: "2026-01-01T00:00:00.000Z",
          lastSyncedAt: "2026-01-01T00:00:00.000Z",
          source: "sams",
          ttl: 1,
        },
      ],
    );
    expect(associations).toEqual([
      { name: "SBVV", uuid: "assoc-1" },
      { uuid: "assoc-2", name: "Other Association" },
    ]);
  });
});

describe("filterAssociations", () => {
  const associations = [
    {
      name: "Südbadischer Volleyball-Verband",
      shortName: "SBVV",
      uuid: "11111111-1111-4111-8111-111111111111",
    },
    { name: "Other Association", uuid: "22222222-2222-4222-8222-222222222222" },
  ];

  it("filters by uuid", () => {
    expect(filterAssociations(associations, "22222222-2222-4222-8222-222222222222")).toEqual([
      { name: "Other Association", uuid: "22222222-2222-4222-8222-222222222222" },
    ]);
  });

  it("filters by slugified name or short name", () => {
    expect(filterAssociations(associations, "sbvv")).toEqual([
      {
        name: "Südbadischer Volleyball-Verband",
        shortName: "SBVV",
        uuid: "11111111-1111-4111-8111-111111111111",
      },
    ]);
    expect(filterAssociations(associations, "other-association")).toEqual([
      { name: "Other Association", uuid: "22222222-2222-4222-8222-222222222222" },
    ]);
  });
});
