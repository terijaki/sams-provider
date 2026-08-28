# Project Guidelines

Instructions for AI coding agents working in this repository.

## Quick Overview

- **SAMS provider:** event-fed volleyball data service. Syncs SAMS, stores a provider-owned read model, and publishes projection events to consumer apps.
- **No public read API.** Consumers receive SQS events and serve their own local projections.
- **Infra:** AWS CDK stacks in `lib/stacks/` + `bin/cdk.ts`. Shared constructs live in `lib/construct/` and `lib/db/`.
- **Domain:** testable sync/refresh/event code in `src/`.
- **Lambdas:** thin handlers in `lambda/`.

## Commands

- **Install:** `vp install`
- **Lint / format / typecheck:** `vp check` / `vp check --fix`
- **Tests:** `vp test`
- **Full gate:** `vp run verify`
- **CDK:** `varlock run -- vp exec cdk synth` and `varlock run -- vp exec cdk deploy --all`
- **Shared account stacks (OIDC + budget, not in `--all`):** local `varlock run -- vp run cdk:deploy:shared` for the **dev** account; prod CI deploys them after merge to `main`.
- **Register a consumer club (prod by default):** `varlock run -- vp run register -- --club "Club Name" --account 123456789012`. Use `--environment dev` only for internal tests. See `src/cli/README.md`.

`vpr` is the Varlock-wrapped Vite+ entrypoint when available (`varlock run -- vp ...`). Prefer `vp` over invoking Bun directly.

## Conventions

- Formatting and linting via Vite+ (Oxlint + Oxfmt).
- Strings: double quotes, semicolons, 2-space indentation.
- Dates: `dayjs`.
- Prefer `for...of` over `.forEach`.
- Never cast as `unknown` or `any`.
- Secrets: Varlock only. Runtime Lambdas read `/sams-provider/sams/api-key` from SSM; do not bake the key into Lambda environment variables.
- Do not mention other club apps in code or comments.

## AWS accounts

Two accounts: **dev** (`449952321849`, internal testing) and **prod** (`550271577754`, public consumer registrations). GitHub Actions uses Environments `dev` / `prod` with the same secret name `AWS_ROLE_ARN`. Shared stacks are not part of `cdk deploy --all`. Prod CI deploys them after merge to `main`; the dev account still uses local `cdk:deploy:shared`. See `docs/SETUP.md`.

## Agent skills

Agent workflows live in `.agents/skills/`. Invoke them when the user names a skill or the task matches a skill description.

### Issue tracker

Issues are tracked in GitHub Issues, and external pull requests are also treated as a triage request surface. See [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

### Triage labels

The triage workflow uses the canonical label vocabulary as-is: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md).

### Domain docs

This repository is configured as single-context: root `CONTEXT.md` and `docs/adr` are the domain sources. See [`docs/agents/domain.md`](docs/agents/domain.md).
