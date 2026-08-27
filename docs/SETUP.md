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
CDK_ALERT_EMAIL="you@example.com"
SAMS_API_KEY=""
```

Runtime Lambdas do **not** use this file. They read `/sams-provider/{env}/sams/api-key` from SSM Parameter Store (SecureString).

## AWS accounts

| Profile              | Account ID     | Purpose     |
| -------------------- | -------------- | ----------- |
| `sams-provider-dev`  | `449952321849` | Development |
| `sams-provider-prod` | `550271577754` | Production  |

Account IDs also live in `project.config.ts` (`AWS.accounts`).

SSO profiles (`sams-provider-dev` / `sams-provider-prod`) should use the same SSO session as the other AWS accounts.

## After the accounts exist

Do this **locally with SSO** in each account. GitHub Actions cannot create its own role.

1. Put the 12-digit IDs in `project.config.ts`.
2. Bootstrap CDK in both accounts (`eu-central-1`).
3. Put the alert email in SSM (`/sams-provider/cdk-email`), then deploy **shared** account stacks (GitHub OIDC + budget). Not part of `cdk deploy --all`:

```sh
# Dev account
varlock run -- vp run cdk:deploy:shared

# Prod account
varlock run -- vp run cdk:deploy:shared:prod
```

This creates the GitHub OIDC provider (or reuses `GITHUB_OIDC_PROVIDER_ARN` if you set it), IAM role `GitHubActionsCDKRole`, and the account monthly budget. Trust is locked to the GitHub Environment name:

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

Repeat for `/sams-provider/prod/sams/api-key`.

7. Require the GitHub check named **verify** on `main` before merge.

If the OIDC provider already exists in an account (same URL), deploy with:

```sh
GITHUB_OIDC_PROVIDER_ARN="arn:aws:iam::<account>:oidc-provider/token.actions.githubusercontent.com" \
  varlock run -- vp run cdk:deploy:shared
```

## Common commands

```sh
vp check            # Lint + format + typecheck
vp test             # Unit tests
vp run verify       # Full quality gate

varlock run -- vp exec cdk synth
varlock run -- vp exec cdk diff --all
varlock run -- vp exec cdk deploy --all

varlock run -- vp run cdk:deploy:shared       # OIDC + budget (dev account)
varlock run -- vp run cdk:deploy:shared:prod  # OIDC + budget (prod account)
```

`cdk deploy --all` never includes shared stacks (`GitHubOidcStack`, `BudgetStack`). Destroy workflows must not include them either.

## Operator registration

After the first app deploy, register each consumer club (prod and dev accounts). Full process: [`src/cli/README.md`](../src/cli/README.md).

```sh
varlock run -- vp run register -- --club "Club Name" --account 123456789012
```

## GitHub CI

| Workflow     | When                           | What                                                                                                                                                      |
| ------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CI`         | Every pull request and push    | `vp check`, `vp test`, `cdk synth` (app stacks + `CDK_STACK_GROUP=shared`) — required before merge                                                        |
| `CDK Deploy` | `main` and `workflow_dispatch` | Uses GitHub Environment `prod` (`main`) or `dev` (everything else). Assumes `vars.AWS_ROLE_ARN` from that environment. Does **not** deploy shared stacks. |

No long-lived AWS keys in GitHub. App secrets live in SSM and are loaded in deploy jobs by Varlock after OIDC.

## Tickets left for a later session

- Paste `RoleArn` into GitHub Environment variables `AWS_ROLE_ARN` (`dev` / `prod`)
- SSM API key + first `cdk deploy` to dev
- EventBridge → consumer SQS end-to-end
- Consumer app processors (separate repositories)
