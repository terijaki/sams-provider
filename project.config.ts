/**
 * Non-secret project configuration.
 */
export const AWS = {
  region: "eu-central-1",
  profiles: {
    dev: "sams-provider-dev",
    prod: "sams-provider-prod",
  },
  /**
   * GitHub Actions assumes `GitHubActionsCDKRole` via OIDC; the ARN is stored
   * per GitHub Environment (`dev` / `prod`) as variable `AWS_ROLE_ARN`.
   */
  accounts: {
    dev: "449952321849",
    prod: "550271577754",
  },
} as const;

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
