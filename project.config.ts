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
    dev: "449952321849",
    prod: "550271577754",
  },
} as const;

export const SAMS = {
  /** SAMS instance this provider calls. The host is not an association. */
  server: "https://www.volleyball-baden.de",
  /**
   * Paginated GET /associations often omits some associations (including SBVV).
   * Direct UUID fetch is an upstream workaround, not a provider default association.
   */
  defaultAssociation: {
    name: "Südbadischer Volleyball-Verband",
    shortName: "SBVV",
    uuid: "2b7571b5-f985-c552-ea1c-f819ed3811c1",
  },
} as const;

export const RESOURCE_PREFIX = "sp" as const;

/** Register CLI fallback queue name when `--queue-arn` is omitted. Consumers may use any queue name; they provide the ARN when registering. */
export const CONSUMER_QUEUE_NAME = "sams-provider-events" as const;
