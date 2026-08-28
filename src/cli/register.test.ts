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
  const clubUuid = "22222222-2222-4222-8222-222222222222";
  const clubRow = {
    sportsclubUuid: clubUuid,
    type: "club" as const,
    name: "Other Club",
    nameSlug: "other-club",
    associationUuid: "assoc-2",
    associationName: "Assoc Two",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastSyncedAt: "2026-01-01T00:00:00.000Z",
    source: "sams" as const,
    ttl: 1,
  };

  it("resolves a club name from the provider index", async () => {
    const club = await resolveClub({
      clubsRepo: {
        getById: async () => null,
        listAll: async () => [clubRow],
      },
      nameOrUuid: "Other Club",
    });

    expect(club).toEqual({
      uuid: clubUuid,
      name: "Other Club",
      associationUuid: "assoc-2",
      associationName: "Assoc Two",
    });
  });

  it("resolves a club UUID from the provider index", async () => {
    const club = await resolveClub({
      clubsRepo: {
        getById: async (uuid) => (uuid === clubUuid ? clubRow : null),
        listAll: async () => [],
      },
      nameOrUuid: clubUuid,
    });

    expect(club.uuid).toBe(clubUuid);
  });

  it("reports ambiguity from the index without calling SAMS", async () => {
    await expect(
      resolveClub({
        clubsRepo: {
          getById: async () => null,
          listAll: async () => [
            clubRow,
            {
              ...clubRow,
              sportsclubUuid: "11111111-1111-4111-8111-111111111111",
              associationUuid: "assoc-3",
            },
          ],
        },
        nameOrUuid: "Other Club",
      }),
    ).rejects.toThrow('Club "Other Club" is ambiguous');
  });

  it("fails when the club is missing from the index", async () => {
    await expect(
      resolveClub({
        clubsRepo: {
          getById: async () => null,
          listAll: async () => [],
        },
        nameOrUuid: "Missing Club",
      }),
    ).rejects.toThrow("was not found in the provider index");
  });
});
