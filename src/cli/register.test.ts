import { describe, expect, it } from "vite-plus/test";
import { AWS, providerEventBusArn } from "@project.config";
import {
  DEFAULT_REGISTER_ENVIRONMENT,
  parseRegisterArgs,
  parseRegisterEnvironment,
  REGISTER_USAGE,
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
      ]),
    ).toEqual({
      club: "Example Club",
      account: "123456789012",
      consumerId: "example-club-dev",
      queueArn: "arn:aws:sqs:eu-central-1:123456789012:custom-queue",
      environment: "dev",
    });
  });
});

describe("providerEventBusArn", () => {
  it("points public consumers at the prod bus", () => {
    expect(providerEventBusArn("prod")).toBe(
      `arn:aws:events:${AWS.region}:${AWS.accounts.prod}:event-bus/sams-provider`,
    );
  });

  it("points internal tests at the dev bus", () => {
    expect(providerEventBusArn("dev")).toBe(
      `arn:aws:events:${AWS.region}:${AWS.accounts.dev}:event-bus/sams-provider`,
    );
  });
});
