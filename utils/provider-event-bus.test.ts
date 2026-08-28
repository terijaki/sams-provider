import { describe, expect, it } from "vite-plus/test";
import { AWS } from "@project.config";
import { providerEventBusArn } from "./provider-event-bus";

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
