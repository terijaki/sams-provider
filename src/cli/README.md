# Operator: register a consumer

Public consumers are registered **only** on the production provider account (`550271577754`). They file a **Register as a consumer** GitHub issue after deploying the queue described in the [root README](../../README.md).

`--environment dev` is for **internal testing** (a maintainer wiring a throwaway queue to the dev bus). Do not register a public club on dev.

The CLI resolves the club from the provider index, stores the subscription in SSM, and wires EventBridge to the consumer queue. It does not create queues.

Entry point: `scripts/sams-provider.ts` (`vp run register`). Implementation: `src/cli/register.ts`.

## Prerequisites

- Provider stacks already deployed in the account you are targeting (`DataStack`, `EventStack`, `SyncStack`, …)
- AWS credentials for that **provider** account (prod for real consumers)
- `SAMS_API_KEY` is **not** required for register (index-only lookup). Sync jobs still need it in the provider account.
- Consumer already deployed an SQS queue in `eu-central-1` via **their** CDK. Use the queue ARN from the registration issue (`--queue-arn`).
- Queue policy allowing `events.amazonaws.com` to `sqs:SendMessage`, conditioned on the bus you are writing to

| Provider env | When to use                         | Event bus ARN                                                      |
| ------------ | ----------------------------------- | ------------------------------------------------------------------ |
| prod         | Every public consumer (the default) | `arn:aws:events:eu-central-1:550271577754:event-bus/sams-provider` |
| dev          | Maintainer tests only               | `arn:aws:events:eu-central-1:449952321849:event-bus/sams-provider` |

## Command

```sh
varlock run -- vp run register -- --club "Club Name" --account 123456789012
```

Same binary:

```sh
varlock run -- bun ./scripts/sams-provider.ts register --club "Club Name" --account 123456789012
```

Repeat once per consumer AWS account that should receive events. A club with two accounts (their own staging site and production site) is two **prod** registrations, not a prod + provider-dev pair.

Internal test against the dev bus:

```sh
varlock run -- vp run register -- --club "Club Name" --account 123456789012 --environment dev
```

### Flags

| Flag            | Required | Default                                                   | Meaning                                      |
| --------------- | -------- | --------------------------------------------------------- | -------------------------------------------- |
| `--club`        | yes      | —                                                         | Exact SAMS club name, or a 36-character UUID |
| `--account`     | yes      | —                                                         | 12-digit **consumer** AWS account ID         |
| `--environment` | no       | `prod`                                                    | Provider bus to update. `dev` is tests only. |
| `--consumer-id` | no       | slug of the club + environment (`club-name-prod`)         | Stable id stored in SSM                      |
| `--queue-arn`   | no       | `arn:aws:sqs:eu-central-1:<account>:sams-provider-events` | Queue ARN from the registration issue        |
| `--table-name`  | no       | `sams-provider-data-{env}`                                | Provider DynamoDB table for club stub upsert |

`--environment` selects which provider SSM prefix and event bus to update (`/sams-provider/prod` vs `/sams-provider/dev`). It is not the consumer's CDK branch.

## What it writes

1. **Resolves the club** from the provider DynamoDB club index only (no live SAMS calls). Name lookup is case-insensitive via slug; pass the UUID when ambiguous. Run clubs sync first if the club is not indexed yet.
2. **DynamoDB** provider data table — refreshes the club stub TTL and association fields from the index.
3. **SSM** `/sams-provider/{env}/sync/clubs` — club UUID, display name, and the consumer ids that subscribe to it.
4. **SSM** `/sams-provider/{env}/sync/consumers` — consumer id, account, queue ARN, and subscription kinds (`clubs`, `teams`, `matches`, `rankings`, `status`).
5. **EventBridge** rule `sams-provider-<consumer-id>` on bus `sams-provider`, targeting that SQS ARN, matching `source: sams-provider` and every current `detail-type` in the `sams-provider-events` package (`SamsEventType`).

Re-running the same club + consumer is idempotent: the club gains the consumer id if missing, the consumer record is replaced, and the EventBridge rule/target is upserted.

CDK does **not** create the clubs/consumers parameters. Registering from the CLI avoids `cdk deploy` overwriting operator-owned subscriptions.

Deploy the consumer queue **before** running this CLI. EventBridge `PutTargets` to a cross-account queue fails until that policy exists; the CLI surfaces that as a queue/policy error.

## Failures

| Symptom                         | Likely cause                                            |
| ------------------------------- | ------------------------------------------------------- |
| Club was not found              | Club not in provider index; run clubs sync first        |
| Club is ambiguous               | Same slug in multiple associations; pass the UUID       |
| Club UUID was not found         | UUID not in provider index; run clubs sync first        |
| `--account` must be 12 digits   | Account ID is missing digits or has extra characters    |
| SSM / EventBridge access denied | Wrong credentials (must be the provider account)        |
| Failed to wire EventBridge      | Queue missing, wrong ARN, or missing SQS policy         |
| Queue never receives events     | Queue missing, wrong account/ARN, or missing SQS policy |

Stdout is JSON with the persisted `club` and `consumer` records on success.
