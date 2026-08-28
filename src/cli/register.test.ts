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
      association: undefined,
      tableName: undefined,
    });
  });

  it("reads optional flags including internal-test environment", () => {
    expect(
      parseRegisterArgs([
        "--club",
        "Example Club",
        "--account",
        "123456789012",
        "--environment",
        "dev",
        "--consumer-id",
        "example-club-dev",
        "--queue-arn",
        "arn:aws:sqs:eu-central-1:123456789012:custom-queue",
        "--association",
        "Other Association",
        "--table-name",
        "custom-table",
      ]),
    ).toEqual({
      club: "Example Club",
      account: "123456789012",
      consumerId: "example-club-dev",
      queueArn: "arn:aws:sqs:eu-central-1:123456789012:custom-queue",
      environment: "dev",
      association: "Other Association",
      tableName: "custom-table",
    });
  });
});

describe("resolveClub", () => {
  const associations = [
    { name: "SBVV", uuid: "assoc-1", shortName: "SBVV" },
    { name: "Other Association", uuid: "assoc-2" },
  ];

  it("searches across all configured associations for a name match", async () => {
    const sams = {
      getSportsclub: async () => ({ data: undefined, error: { message: "unused" } }),
      getAssociationByUuid: async ({ path }: { path: { uuid: string } }) => ({
        data: {
          uuid: path.uuid,
          name: path.uuid === "assoc-1" ? "SBVV" : "Other Association",
        },
        error: undefined,
      }),
      getAssociations: async () => ({ data: { content: [], last: true }, error: undefined }),
      getAllSportsclubs: async ({
        query,
      }: {
        query: { association: string; page: number; size: number };
      }) => ({
        data: {
          content:
            query.association === "assoc-2"
              ? [{ uuid: "club-2", name: "Other Club", associationUuid: "assoc-2" }]
              : [],
          last: true,
        },
        error: undefined,
      }),
    };

    const club = await resolveClub(sams, "Other Club", associations);
    expect(club).toEqual({
      uuid: "club-2",
      name: "Other Club",
      associationUuid: "assoc-2",
      associationName: "Other Association",
    });
  });

  it("narrows search with --association", async () => {
    const sams = {
      getSportsclub: async () => ({ data: undefined, error: { message: "unused" } }),
      getAssociationByUuid: async ({ path }: { path: { uuid: string } }) => ({
        data: { uuid: path.uuid, name: "SBVV" },
        error: undefined,
      }),
      getAssociations: async () => ({ data: { content: [], last: true }, error: undefined }),
      getAllSportsclubs: async ({
        query,
      }: {
        query: { association: string; page: number; size: number };
      }) => ({
        data: {
          content:
            query.association === "assoc-1"
              ? [{ uuid: "club-1", name: "Shared Name", associationUuid: "assoc-1" }]
              : [],
          last: true,
        },
        error: undefined,
      }),
    };

    const club = await resolveClub(sams, "Shared Name", associations, "SBVV");
    expect(club.uuid).toBe("club-1");
  });

  it("reports ambiguity across associations", async () => {
    const sams = {
      getSportsclub: async () => ({ data: undefined, error: { message: "unused" } }),
      getAssociationByUuid: async ({ path }: { path: { uuid: string } }) => ({
        data: {
          uuid: path.uuid,
          name: path.uuid === "assoc-1" ? "SBVV" : "Other Association",
        },
        error: undefined,
      }),
      getAssociations: async () => ({ data: { content: [], last: true }, error: undefined }),
      getAllSportsclubs: async () => ({
        data: {
          content: [{ uuid: "club-x", name: "Shared Name", associationUuid: "assoc-1" }],
          last: true,
        },
        error: undefined,
      }),
    };

    await expect(resolveClub(sams, "Shared Name", associations)).rejects.toThrow(
      'Club "Shared Name" is ambiguous',
    );
  });
});
