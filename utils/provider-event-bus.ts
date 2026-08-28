import { AWS } from "@project.config";

export type ProviderEnvironment = keyof typeof AWS.accounts;

export function providerEventBusArn(environment: ProviderEnvironment): string {
  return `arn:aws:events:${AWS.region}:${AWS.accounts[environment]}:event-bus/sams-provider`;
}
