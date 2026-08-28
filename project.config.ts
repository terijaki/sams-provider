/**
 * Non-secret project configuration.
 */
export const AWS = {
  region: "eu-central-1",
  /**
   * GitHub Actions assumes `GitHubActionsCDKRole` via OIDC; the ARN is stored
   * per GitHub Environment (`dev` / `prod`) as secret `AWS_ROLE_ARN`.
   */
  accounts: {
    /** Internal testing only. Do not register public consumers here. */
    dev: "449952321849",
    /** Production sync and all public consumer registrations. */
    prod: "550271577754",
  },
} as const;

export type ProviderEnvironment = keyof typeof AWS.accounts;

export function providerEventBusArn(environment: ProviderEnvironment): string {
  return `arn:aws:events:${AWS.region}:${AWS.accounts[environment]}:event-bus/sams-provider`;
}

export const SAMS = {
  server: "https://www.volleyball-baden.de",
  defaultAssociation: {
    name: "Südbadischer Volleyball-Verband",
    shortName: "SBVV",
    /**
     * Paginated GET /associations often omits SBVV. Direct UUID fetch is the workaround.
     */
    uuid: "2b7571b5-f985-c552-ea1c-f819ed3811c1",
  },
} as const;

export const RESOURCE_PREFIX = "sp" as const;

/** Conventional consumer SQS queue name in each consumer account. */
export const CONSUMER_QUEUE_NAME = "sams-provider-events" as const;
