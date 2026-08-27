export const GITHUB = {
  owner: "terijaki",
  repository: "terijaki/sams-provider",
  oidcRoleName: "GitHubActionsCDKRole",
  /** GitHub Actions Environment names — same string as CDK_ENVIRONMENT. */
  environments: {
    dev: "dev",
    prod: "prod",
  },
  /** Environment-scoped Actions secret holding the IAM role ARN to assume. */
  roleArnVariable: "AWS_ROLE_ARN",
  /** Default CDK bootstrap qualifier (`cdk bootstrap` without `--qualifier`). */
  bootstrapQualifier: "hnb659fds",
} as const;

export type GitHubEnvironmentName = (typeof GITHUB.environments)[keyof typeof GITHUB.environments];

export function parseGitHubEnvironment(value: string | undefined): GitHubEnvironmentName {
  return value === GITHUB.environments.prod ? GITHUB.environments.prod : GITHUB.environments.dev;
}

const [GITHUB_OWNER, GITHUB_REPO] = GITHUB.repository.split("/") as [string, string];

/**
 * Legacy GitHub OIDC `sub` claim when a workflow job sets `environment:`.
 * https://docs.github.com/en/actions/reference/security/oidc
 */
export function githubActionsOidcSubject(githubEnvironment: GitHubEnvironmentName): string {
  return `repo:${GITHUB.repository}:environment:${githubEnvironment}`;
}

/**
 * IAM `StringLike` patterns for the OIDC `sub` claim.
 *
 * New repositories use immutable IDs in `sub`, e.g.
 * `repo:terijaki@590522/sams-provider@1348108547:environment:prod`.
 * Trust policies must accept both legacy and immutable formats.
 */
export function githubActionsOidcTrustSubjects(
  githubEnvironment: GitHubEnvironmentName,
): readonly [string, string] {
  return [
    githubActionsOidcSubject(githubEnvironment),
    `repo:${GITHUB_OWNER}@*/${GITHUB_REPO}@*:environment:${githubEnvironment}`,
  ];
}

/** CDK bootstrap roles that GitHub Actions should assume during deploy (not direct credentials). */
export function cdkBootstrapRoleArns(account: string, region: string): string[] {
  const qualifier = GITHUB.bootstrapQualifier;
  return [
    `arn:aws:iam::${account}:role/cdk-${qualifier}-deploy-role-${account}-${region}`,
    `arn:aws:iam::${account}:role/cdk-${qualifier}-file-publishing-role-${account}-${region}`,
    `arn:aws:iam::${account}:role/cdk-${qualifier}-lookup-role-${account}-${region}`,
  ];
}

export function githubActionsCdkRoleArn(account: string): string {
  return `arn:aws:iam::${account}:role/${GITHUB.oidcRoleName}`;
}
