# Project Guidelines

Instructions for AI coding agents working in this repository.

## Quick Overview

- **SAMS provider:** event-fed volleyball data service. Syncs SAMS, stores a provider-owned read model, and publishes projection events to consumer apps.
- **No public read API.** Consumers receive SQS events and serve their own local projections.
- **Infra:** AWS CDK in `lib/` + `bin/cdk.ts`.
- **Domain:** testable sync/refresh/event code in `src/`.
- **Lambdas:** thin handlers in `lambda/`.

## Commands

- **Install:** `vp install`
- **Lint / format / typecheck:** `vp check` / `vp check --fix`
- **Tests:** `vp test`
- **Full gate:** `vp run verify`
- **CDK:** `varlock run -- vp exec cdk synth` and `varlock run -- vp exec cdk deploy --all`
- **GitHub OIDC role (once per account, not in `--all`):** `varlock run -- vp run cdk:deploy:github-oidc`
- **Register a consumer club:** `varlock run -- vp run register -- --club "Club Name" --account 123456789012`

`vpr` is the Varlock-wrapped Vite+ entrypoint when available (`varlock run -- vp ...`). Prefer `vp` over invoking Bun directly.

## Conventions

- Formatting and linting via Vite+ (Oxlint + Oxfmt).
- Strings: double quotes, semicolons, 2-space indentation.
- Dates: `dayjs`.
- Prefer `for...of` over `.forEach`.
- Never cast as `unknown` or `any`.
- Secrets: Varlock only. Runtime Lambdas read SSM; do not bake the SAMS API key into Lambda environment variables.
- Do not mention other club apps in code or comments.

## AWS accounts

Two accounts: **dev** and **prod**. Fill `AWS.accounts` in `project.config.ts` once those accounts exist. GitHub Actions uses Environments `dev` / `prod` with the same variable name `AWS_ROLE_ARN`. Deploy `GitHubOidcStack` locally (`cdk:deploy:github-oidc`) — it is not part of `cdk deploy --all`. See `docs/SETUP.md`.
