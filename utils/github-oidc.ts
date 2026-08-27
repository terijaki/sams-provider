export const GITHUB = {
  owner: "terijaki",
  repository: "terijaki/sams-provider",
  oidcRoleName: "GitHubActionsCDKRole",
  /** GitHub Actions Environment names — same string as CDK_ENVIRONMENT. */
  environments: {
    dev: "dev",
    prod: "prod",
  },
  /** Environment-scoped Actions variable holding the IAM role ARN to assume. */
  roleArnVariable: "AWS_ROLE_ARN",
} as const;

export type GitHubEnvironmentName = (typeof GITHUB.environments)[keyof typeof GITHUB.environments];

export function parseGitHubEnvironment(value: string | undefined): GitHubEnvironmentName {
  return value === GITHUB.environments.prod ? GITHUB.environments.prod : GITHUB.environments.dev;
}

/**
 * GitHub OIDC `sub` claim when a workflow job sets `environment:`.
 * https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect
 */
export function githubActionsOidcSubject(githubEnvironment: GitHubEnvironmentName): string {
  return `repo:${GITHUB.repository}:environment:${githubEnvironment}`;
}
