# Operator: register a consumer

Public consumers are registered **only** on the production provider account (`550271577754`). They file a **Register as a consumer** GitHub issue after deploying the queue described in the [root README](../../README.md).

`--environment dev` is for **internal testing** (a maintainer wiring a throwaway queue to the dev bus). Do not register a public club on dev.

The CLI resolves the SAMS club, stores the subscription in SSM, and wires EventBridge to the consumer queue. It does not create queues.

Entry point: `scripts/sams-provider.ts` (`vp run register`). Implementation: `src/cli/register.ts`.

## Prerequisites

- Provider stacks already deployed in the account you are targeting (`DataStack`, `EventStack`, `SyncStack`, …)
- AWS credentials for that **provider** account (prod for real consumers)
- `SAMS_API_KEY` available to the local process (Varlock / `.env.local`)
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

`--environment` selects which provider SSM prefix and event bus to update (`/sams-provider/prod` vs `/sams-provider/dev`). It is not the consumer's CDK branch.

## What it writes

1. **Resolves the club** against SAMS by UUID, or by name (case-insensitive slug). It fails if the name is unknown or matches more than one club — pass the UUID in that case. The SAMS host is not an association filter; do not assume SBVV.
2. **SSM** `/sams-provider/{env}/sync/clubs` — club UUID, display name, and the consumer ids that subscribe to it.
3. **SSM** `/sams-provider/{env}/sync/consumers` — consumer id, account, queue ARN, and subscription kinds (`clubs`, `teams`, `matches`, `rankings`, `status`).
4. **EventBridge** rule `sams-provider-<consumer-id>` on bus `sams-provider`, targeting that SQS ARN, matching `source: sams-provider` and every current `detail-type` in `src/events/schemas.ts`.

Re-running the same club + consumer is idempotent: the club gains the consumer id if missing, the consumer record is replaced, and the EventBridge rule/target is upserted.

CDK does **not** create the clubs/consumers parameters. Registering from the CLI avoids `cdk deploy` overwriting operator-owned subscriptions.

Deploy the consumer queue **before** running this CLI. EventBridge `PutTargets` to a cross-account queue fails until that policy exists; the CLI surfaces that as a queue/policy error.

## Failures

| Symptom                         | Likely cause                                            |
| ------------------------------- | ------------------------------------------------------- |
| Club was not found              | Name does not match SAMS; try the UUID                  |
| Club is ambiguous               | Two SAMS clubs slug to the same name; pass the UUID     |
| Club UUID was not found         | Wrong UUID or SAMS key/environment                      |
| Failed to search clubs in SAMS  | API key missing or SAMS unreachable                     |
| `--account` must be 12 digits   | Account ID is missing digits or has extra characters    |
| SSM / EventBridge access denied | Wrong credentials (must be the provider account)        |
| Failed to wire EventBridge      | Queue missing, wrong ARN, or missing SQS policy         |
| Queue never receives events     | Queue missing, wrong account/ARN, or missing SQS policy |

Stdout is JSON with the persisted `club` and `consumer` records on success.
