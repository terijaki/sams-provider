/**
 * Non-secret project configuration. AWS account IDs stay empty until the
 * provider accounts exist — fill them in before the first real deploy.
 */
export const AWS = {
  region: "eu-central-1",
  profiles: {
    dev: "sams-provider-dev",
    prod: "sams-provider-prod",
  },
  /**
   * 12-digit account IDs. Leave empty until accounts are created.
   * GitHub OIDC role ARNs are GitHub Actions repository variables, not source.
   */
  accounts: {
    dev: "",
    prod: "",
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
