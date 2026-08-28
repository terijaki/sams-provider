# Maintainer setup

Local toolchain, AWS accounts, and CI for people who operate this repository. Consumer-facing registration lives in the [root README](../README.md).

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

Runtime Lambdas do **not** use this file. They read `/sams-provider/sams/api-key` from SSM Parameter Store (SecureString) — same path as Varlock, one parameter per AWS account.

## AWS accounts

| Environment | Account ID     | Purpose                                                      |
| ----------- | -------------- | ------------------------------------------------------------ |
| dev         | `449952321849` | Internal testing only. Never register public consumers here. |
| prod        | `550271577754` | Production sync and **all** public consumer registrations.   |

Account IDs also live in `project.config.ts` (`AWS.accounts`).

## After the accounts exist

Do this **locally** in each account. GitHub Actions cannot create its own role.

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

| AWS account | GitHub Environment | OIDC `sub` (legacy or immutable)                                                                     |
| ----------- | ------------------ | ---------------------------------------------------------------------------------------------------- |
| dev         | `dev`              | `repo:terijaki/sams-provider:environment:dev` or `repo:terijaki@*/sams-provider@*:environment:dev`   |
| prod        | `prod`             | `repo:terijaki/sams-provider:environment:prod` or `repo:terijaki@*/sams-provider@*:environment:prod` |

New repositories use immutable owner/repo IDs in the `sub` claim. The shared OIDC stack trusts both formats via `StringLike`.

`GitHubActionsCDKRole` may assume the same-account CDK bootstrap roles (`sts:AssumeRole` + `sts:TagSession`). `--trust` is only for **cross-account** bootstrap (another AWS account ID) and is not needed here. First create of the OIDC role is local. After that, prod updates shared stacks on merge to `main`. The **dev** account still needs a local `cdk:deploy:shared` so feature branches cannot overwrite the account singletons.

4. Create GitHub Environments **`dev`** and **`prod`**. Restrict `prod` deployments to `main`. Leave `dev` unrestricted so feature-branch `workflow_dispatch` can deploy to the dev account.
5. In **each** environment, set the Actions **secret** `AWS_ROLE_ARN` to that account's role ARN (CDK output `RoleArn`). Same secret name in both environments; different values.
6. Create the SecureString in **each** account (same name; account isolation separates them):

```sh
aws ssm put-parameter \
  --name /sams-provider/sams/api-key \
  --type SecureString \
  --value "$SAMS_API_KEY"
```

7. Require the GitHub check named **Verify** on `main` before merge.

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

`cdk deploy --all` never includes shared stacks (`GitHubOidcStack`, `BudgetStack`). Destroy workflows must not include them either. Prod CI deploys them in a separate `CDK_STACK_GROUP=shared` step after the app deploy.

## Operator registration

Public consumers file a **Register as a consumer** GitHub issue after deploying their queue. Register them on **prod only**. Use `--environment dev` only when a maintainer is testing the wiring against the internal dev account.

Do not ask consumers to point their queue policy at the dev event bus unless they are helping you test. Full process: [`src/cli/README.md`](../src/cli/README.md).

```sh
varlock run -- vp run register -- --club "Club Name" --account 123456789012
```

## GitHub CI

| Workflow                | When                                                                 | What                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Verify and Deploy`     | Pull request (feature branches), push to `main`, `workflow_dispatch` | **Verify:** `vp check`, `vp test`, `cdk synth` (feature-branch app, prod app, and shared). **Deploy CDK to AWS:** runs only after Verify passes — app stacks to dev on pull requests, app + shared stacks to prod on push to `main`. Uses GitHub Environment `dev` or `prod`. Feature-branch deploys never include shared stacks. |
| `Destroy Branch Stacks` | PR closed or branch deleted                                          | Destroys app stacks for the feature branch in dev (`cdk destroy --all`). Never touches prod or shared stacks.                                                                                                                                                                                                                     |

Feature-branch deploys are isolated by branch slug (stacks, DynamoDB, S3, EventBridge, SSM under `/sams-provider/dev/<branch>/sync/...`). The register CLI writes shared `/sams-provider/{env}/sync/...` paths on the main dev or prod bus (`prod` by default; `dev` for internal tests).

Direct pushes to `main` are blocked; prod deploy runs on the `push` event from a merged PR. Feature branches only trigger via `pull_request` (not `push`) to avoid duplicate workflow runs when both would fire on the same commit.

Require status check **Verify** on `main` before merge.

No long-lived AWS keys in GitHub. App secrets live in SSM and are loaded in deploy jobs by Varlock after OIDC.

**Branch name truncation:** sanitized branch slugs are capped at 20 characters. Two long branch names with the same prefix can collide.

## Issue tracking

Provider work is tracked in [GitHub Issues](https://github.com/terijaki/sams-provider/issues). See [`AGENTS.md`](../AGENTS.md#issue-tracker) for `gh` conventions.
