import { AWS, type ProviderEnvironment } from "@project.config";

export function providerEventBusArn(environment: ProviderEnvironment): string {
  return `arn:aws:events:${AWS.region}:${AWS.accounts[environment]}:event-bus/sams-provider`;
}
