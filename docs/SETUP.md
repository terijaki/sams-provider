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

Two accounts, same pattern as the other club infrastructure:

| Profile              | Account ID | Purpose     |
| -------------------- | ---------- | ----------- |
| `sams-provider-dev`  | _pending_  | Development |
| `sams-provider-prod` | _pending_  | Production  |

Account IDs belong in `project.config.ts` (`AWS.accounts`) once they exist. Until then, `cdk synth` works without an account pin; `cdk deploy` and GitHub deploy do not.

### After the accounts exist

1. Put the 12-digit IDs in `project.config.ts`.
2. Bootstrap CDK in both accounts (`eu-central-1`).
3. Create the GitHub OIDC provider and IAM role `GitHubActionsCDKRole` in each account. Trust policy template: `docs/github-actions-trust-policy.template.json`. Lock `sub` to `repo:terijaki/sams-provider:ref:refs/heads/main` for production.
4. Set GitHub Actions **variables** `AWS_ROLE_ARN_DEV` and `AWS_ROLE_ARN_PROD`.
5. Create the SecureString:

```sh
aws ssm put-parameter \
  --name /sams-provider/dev/sams/api-key \
  --type SecureString \
  --value "$SAMS_API_KEY"
```

Repeat for `/sams-provider/prod/sams/api-key`. 6. Require the GitHub check named **verify** on `main` before merge.

SSO profiles (`sams-provider-dev` / `sams-provider-prod`) should use the same SSO session as the other AWS accounts.

## Common commands

```sh
vp check            # Lint + format + typecheck
vp test             # Unit tests
vp run verify       # Full quality gate

varlock run -- vp exec cdk synth --all
varlock run -- vp exec cdk diff --all
varlock run -- vp exec cdk deploy --all
```

## Operator registration

After the first deploy, register each consumer club (prod and dev accounts):

```sh
varlock run -- vp run register -- --club "Club Name" --account 123456789012
```

This resolves the exact SAMS club UUID (fails if unknown or ambiguous), stores it in SSM, and attaches an EventBridge rule to `arn:aws:sqs:eu-central-1:<account>:sams-provider-events`. Consumer apps must create that queue (plus DLQ) and allow the provider event bus to send messages.

## GitHub CI

| Workflow     | When                           | What                                                                 |
| ------------ | ------------------------------ | -------------------------------------------------------------------- |
| `CI`         | Every pull request and push    | `vp check`, `vp test`, `cdk synth` — required before merge           |
| `CDK Deploy` | `main` and `workflow_dispatch` | OIDC deploy to prod (`main`) or dev. Skipped until role ARNs are set |

No long-lived AWS keys in GitHub. App secrets live in SSM and are loaded in deploy jobs by Varlock after OIDC.

## Tickets left for a later session

- AWS account IDs, OIDC roles, and the SSM API key
- First `cdk deploy` to dev
- EventBridge → consumer SQS end-to-end
- Consumer app processors (separate repositories)
