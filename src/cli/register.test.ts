import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_REGISTER_ENVIRONMENT,
  parseRegisterArgs,
  parseRegisterEnvironment,
  REGISTER_USAGE,
  resolveClub,
} from "./register";

describe("parseRegisterEnvironment", () => {
  it("defaults public registrations to prod", () => {
    expect(parseRegisterEnvironment(undefined)).toBe("prod");
    expect(DEFAULT_REGISTER_ENVIRONMENT).toBe("prod");
  });

  it("accepts explicit prod and internal-only dev", () => {
    expect(parseRegisterEnvironment("prod")).toBe("prod");
    expect(parseRegisterEnvironment("dev")).toBe("dev");
  });

  it("rejects unknown environments", () => {
    expect(() => parseRegisterEnvironment("staging")).toThrow(
      `--environment must be "dev" or "prod"`,
    );
  });
});

describe("parseRegisterArgs", () => {
  it("requires club and account", () => {
    expect(() => parseRegisterArgs([])).toThrow(REGISTER_USAGE);
    expect(() => parseRegisterArgs(["--club", "Example Club"])).toThrow(REGISTER_USAGE);
  });

  it("requires a 12-digit account id", () => {
    expect(() => parseRegisterArgs(["--club", "Example Club", "--account", "123"])).toThrow(
      "--account must be a 12-digit AWS account ID",
    );
  });

  it("defaults environment to prod and leaves optional flags unset", () => {
    expect(parseRegisterArgs(["--club", "Example Club", "--account", "123456789012"])).toEqual({
      club: "Example Club",
      account: "123456789012",
      consumerId: undefined,
      queueArn: undefined,
      environment: "prod",
      tableName: undefined,
    });
  });
});

describe("resolveClub", () => {
  const associationsRepo = {
    listAll: async () => [],
  };
  const clubsRepo = {
    getByNameSlug: async () => null,
  };

  it("resolves a club name from the DynamoDB index when present", async () => {
    const indexedClubsRepo = {
      getByNameSlug: async (slug: string) =>
        slug === "other-club"
          ? {
              sportsclubUuid: "club-2",
              type: "club" as const,
              name: "Other Club",
              nameSlug: "other-club",
              associationUuid: "assoc-2",
              associationName: "Assoc Two",
              updatedAt: "2026-01-01T00:00:00.000Z",
              lastSyncedAt: "2026-01-01T00:00:00.000Z",
              source: "sams" as const,
              ttl: 1,
            }
          : null,
    };

    const club = await resolveClub({
      sams: {
        getSportsclub: async () => ({ data: undefined, error: { message: "unused" } }),
        getAllSportsclubs: async () => ({ data: { content: [], last: true }, error: undefined }),
        getAssociations: async () => ({ data: { content: [], last: true }, error: undefined }),
        getAssociationByUuid: async () => ({ data: undefined, error: undefined }),
      },
      clubsRepo: indexedClubsRepo,
      associationsRepo,
      nameOrUuid: "Other Club",
    });

    expect(club).toEqual({
      uuid: "club-2",
      name: "Other Club",
      associationUuid: "assoc-2",
      associationName: "Assoc Two",
    });
  });

  it("falls back to SAMS when the index misses", async () => {
    const sams = {
      getSportsclub: async () => ({ data: undefined, error: { message: "unused" } }),
      getAssociationByUuid: async () => ({ data: undefined, error: undefined }),
      getAssociations: async () => ({
        data: { content: [{ uuid: "assoc-2", name: "Assoc Two" }], last: true },
        error: undefined,
      }),
      getAllSportsclubs: async () => ({
        data: {
          content: [{ uuid: "club-2", name: "Other Club", associationUuid: "assoc-2" }],
          last: true,
        },
        error: undefined,
      }),
    };

    const club = await resolveClub({
      sams,
      clubsRepo,
      associationsRepo,
      nameOrUuid: "Other Club",
    });

    expect(club.uuid).toBe("club-2");
  });
});
