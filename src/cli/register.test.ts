import { describe, expect, it } from "vite-plus/test";
import {
  assertConsumerQueueArn,
  buildConsumerEventPattern,
  clubUuidsForConsumer,
  DEFAULT_REGISTER_ENVIRONMENT,
  isCrossAccountQueue,
  parseRegisterArgs,
  parseRegisterEnvironment,
  queueAccountId,
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
      deliveryRoleArn: undefined,
      environment: "prod",
      tableName: undefined,
    });
  });
});

describe("assertConsumerQueueArn", () => {
  it("accepts a queue in eu-central-1 owned by the account", () => {
    expect(() =>
      assertConsumerQueueArn(
        "arn:aws:sqs:eu-central-1:123456789012:sams-provider-events",
        "123456789012",
      ),
    ).not.toThrow();
  });

  it("rejects the wrong region", () => {
    expect(() =>
      assertConsumerQueueArn(
        "arn:aws:sqs:us-east-1:123456789012:sams-provider-events",
        "123456789012",
      ),
    ).toThrow("Queue ARN region must be eu-central-1");
  });

  it("rejects the wrong account", () => {
    expect(() =>
      assertConsumerQueueArn(
        "arn:aws:sqs:eu-central-1:999999999999:sams-provider-events",
        "123456789012",
      ),
    ).toThrow("does not match --account");
  });
});

describe("queueAccountId", () => {
  it("extracts the account id from an SQS ARN", () => {
    expect(queueAccountId("arn:aws:sqs:eu-central-1:883425316554:sams-provider-events-prod")).toBe(
      "883425316554",
    );
  });
});

describe("isCrossAccountQueue", () => {
  it("returns true when the queue is outside the provider account", () => {
    expect(
      isCrossAccountQueue(
        "arn:aws:sqs:eu-central-1:883425316554:sams-provider-events-prod",
        "prod",
      ),
    ).toBe(true);
  });

  it("returns false when the queue is in the provider account", () => {
    expect(
      isCrossAccountQueue("arn:aws:sqs:eu-central-1:550271577754:sams-provider-events", "prod"),
    ).toBe(false);
  });
});

describe("buildConsumerEventPattern", () => {
  it("matches source and club uuids in detail", () => {
    expect(buildConsumerEventPattern(["club-1", "club-2"])).toEqual({
      source: ["sams-provider"],
      detail: {
        clubUuids: ["club-1", "club-2"],
      },
    });
  });
});

describe("clubUuidsForConsumer", () => {
  it("returns uuids for every club subscribed by the consumer", () => {
    expect(
      clubUuidsForConsumer(
        [
          { uuid: "club-1", name: "One", consumerIds: ["consumer-a"] },
          { uuid: "club-2", name: "Two", consumerIds: ["consumer-a", "consumer-b"] },
          { uuid: "club-3", name: "Three", consumerIds: ["consumer-b"] },
        ],
        "consumer-a",
      ),
    ).toEqual(["club-1", "club-2"]);
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
