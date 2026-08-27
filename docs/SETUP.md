# sams-provider

Event-fed SAMS volleyball data provider.

## Prerequisites

- [Vite+](https://viteplus.dev/) — installs Bun automatically if absent
- [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- [AWS CDK](https://docs.aws.amazon.com/cdk/v2/guide/getting-started.html)

```sh
vp install
```

Create `.env.local` at the repo root for local CLI use:

```sh
CDK_ENVIRONMENT="dev"
CDK_BUDGET_ALERT_EMAIL="you@example.com"
CDK_MONITORING_ALERT_EMAIL="you@example.com"
SAMS_API_KEY=""
```

Runtime Lambdas do **not** use this file. They read `/sams-provider/{env}/sams/api-key` from SSM Parameter Store (SecureString).

## AWS accounts

| Profile              | Account ID | Purpose     |
| -------------------- | ---------- | ----------- |
| `sams-provider-dev`  | _pending_  | Development |
| `sams-provider-prod` | _pending_  | Production  |

Account IDs belong in `project.config.ts` (`AWS.accounts`) once they exist. Until then, `cdk synth` works without an account pin; `cdk deploy` does not.

SSO profiles (`sams-provider-dev` / `sams-provider-prod`) should use the same SSO session as the other AWS accounts.

## After the accounts exist

Do this **locally with SSO** in each account. GitHub Actions cannot create its own role.

1. Put the 12-digit IDs in `project.config.ts`.
2. Bootstrap CDK in both accounts (`eu-central-1`).
3. Deploy the GitHub OIDC stack (not part of `cdk deploy --all`):

```sh
# Dev account
varlock run -- vp run cdk:deploy:github-oidc

# Prod account
varlock run -- vp run cdk:deploy:github-oidc:prod
```

This creates the GitHub OIDC provider (or reuses `GITHUB_OIDC_PROVIDER_ARN` if you set it) and IAM role `GitHubActionsCDKRole`. Trust is locked to the GitHub Environment name:

| AWS account | GitHub Environment | OIDC `sub`                                     |
| ----------- | ------------------ | ---------------------------------------------- |
| dev         | `dev`              | `repo:terijaki/sams-provider:environment:dev`  |
| prod        | `prod`             | `repo:terijaki/sams-provider:environment:prod` |

4. Create GitHub Environments **`dev`** and **`prod`**. On `prod`, restrict deployment branches to `main`.
5. In **each** environment, set the Actions variable `AWS_ROLE_ARN` to that account's role ARN (CDK output `RoleArn`). Same variable name in both environments; different values.
6. Create the SecureString:

```sh
aws ssm put-parameter \
  --name /sams-provider/dev/sams/api-key \
  --type SecureString \
  --value "$SAMS_API_KEY"
```

Repeat for `/sams-provider/prod/sams/api-key`. 7. Put alert emails in SSM as `/sams-provider/cdk-reporting-email` (or the equivalent Varlock `awsParam` names). 8. Require the GitHub check named **verify** on `main` before merge.

If the OIDC provider already exists in an account (same URL), deploy with:

```sh
GITHUB_OIDC_PROVIDER_ARN="arn:aws:iam::<account>:oidc-provider/token.actions.githubusercontent.com" \
  varlock run -- vp run cdk:deploy:github-oidc
```

## Common commands

```sh
vp check            # Lint + format + typecheck
vp test             # Unit tests
vp run verify       # Full quality gate

varlock run -- vp exec cdk synth
varlock run -- vp exec cdk diff --all
varlock run -- vp exec cdk deploy --all

varlock run -- vp run cdk:deploy:github-oidc       # one-shot identity stack (dev)
varlock run -- vp run cdk:deploy:github-oidc:prod  # one-shot identity stack (prod)
```

`cdk deploy --all` never includes `GitHubOidcStack`. Destroy workflows must not include it either.

## Operator registration

After the first app deploy, register each consumer club (prod and dev accounts):

```sh
varlock run -- vp run register -- --club "Club Name" --account 123456789012
```

This resolves the exact SAMS club UUID (fails if unknown or ambiguous), stores it in SSM, and attaches an EventBridge rule to `arn:aws:sqs:eu-central-1:<account>:sams-provider-events`. Consumer apps must create that queue (plus DLQ) and allow the provider event bus to send messages.

## GitHub CI

| Workflow     | When                           | What                                                                                                                                                          |
| ------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CI`         | Every pull request and push    | `vp check`, `vp test`, `cdk synth` (app stacks + GitHub OIDC stack) — required before merge                                                                   |
| `CDK Deploy` | `main` and `workflow_dispatch` | Uses GitHub Environment `prod` (`main`) or `dev` (everything else). Assumes `vars.AWS_ROLE_ARN` from that environment. Does **not** deploy `GitHubOidcStack`. |

No long-lived AWS keys in GitHub. App secrets live in SSM and are loaded in deploy jobs by Varlock after OIDC.

## Tickets left for a later session

- AWS account IDs and first local `cdk:deploy:github-oidc`
- Paste `RoleArn` into GitHub Environment variables
- SSM API key + first `cdk deploy` to dev
- EventBridge → consumer SQS end-to-end
- Consumer app processors (separate repositories)
