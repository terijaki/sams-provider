# Consumer registration

Register a consumer club after the provider app stacks exist in that AWS account. The CLI resolves the SAMS club, stores the subscription in SSM, and wires EventBridge to the consumer queue.

Entry point: `scripts/sams-provider.ts` (`vp run register`). Implementation: `src/cli/register.ts`.

## Prerequisites

- Provider stacks already deployed (`DataStack`, `EventStack`, `SyncStack`, …)
- AWS credentials for the **provider** account
- `SAMS_API_KEY` available to the local process (Varlock / `.env.local`)
- Consumer already deployed queue `sams-provider-events` (plus a DLQ) in `eu-central-1` via **their** CDK

The consumer queue policy must allow the provider event bus to `sqs:SendMessage`. This CLI does not create queues.

## Command

```sh
varlock run -- vp run register -- --club "Club Name" --account 123456789012
```

Same binary:

```sh
varlock run -- bun ./scripts/sams-provider.ts register --club "Club Name" --account 123456789012
```

Repeat once per consumer (each website × each environment). Typical pattern: two consumer accounts × `dev` and `prod` = four registrations.

### Flags

| Flag            | Required | Default                                                   | Meaning                                      |
| --------------- | -------- | --------------------------------------------------------- | -------------------------------------------- |
| `--club`        | yes      | —                                                         | Exact SAMS club name, or a 36-character UUID |
| `--account`     | yes      | —                                                         | 12-digit **consumer** AWS account ID         |
| `--environment` | no       | `dev`                                                     | Provider environment: `dev` or `prod`        |
| `--consumer-id` | no       | slug of the club + environment (`club-name-dev`)          | Stable id stored in SSM                      |
| `--queue-arn`   | no       | `arn:aws:sqs:eu-central-1:<account>:sams-provider-events` | Override if the consumer uses another name   |

`--environment` selects which provider SSM prefix and event bus to update (`/sams-provider/dev` vs `/sams-provider/prod`). It is not the consumer’s CDK branch.

## What it writes

1. **Resolves the club** against SAMS (default association SBVV). Name lookup is case-insensitive via slug. It fails if the name is unknown or matches more than one club — pass the UUID in that case.
2. **SSM** `/sams-provider/{env}/sync/clubs` — club UUID, display name, and the consumer ids that subscribe to it.
3. **SSM** `/sams-provider/{env}/sync/consumers` — consumer id, account, queue ARN, and subscription kinds (`clubs`, `teams`, `matches`, `rankings`, `status`).
4. **EventBridge** rule `sams-provider-<consumer-id>` on bus `sams-provider`, targeting that SQS ARN, matching `source: sams-provider` and every current `detail-type` in `src/events/schemas.ts`.

Re-running the same club + consumer is idempotent: the club gains the consumer id if missing, the consumer record is replaced, and the EventBridge rule/target is upserted.

CDK does **not** create the clubs/consumers parameters. Registering from the CLI avoids `cdk deploy` overwriting operator-owned subscriptions.

## Consumer CDK

Queues are **not** created here. Each consumer deploys them in their own stacks:

- Queue name `sams-provider-events` in `eu-central-1` (unless they pass `--queue-arn` at register time)
- A DLQ
- Queue policy allowing `events.amazonaws.com` to send, conditioned on the provider bus:

| Provider env | Event bus ARN                                                      |
| ------------ | ------------------------------------------------------------------ |
| dev          | `arn:aws:events:eu-central-1:449952321849:event-bus/sams-provider` |
| prod         | `arn:aws:events:eu-central-1:550271577754:event-bus/sams-provider` |

Deploy the consumer queue **before** running this CLI. EventBridge `PutTargets` to a cross-account queue fails until that policy exists.

A processor that consumes the versioned envelopes (`schemaVersion`, `eventId`, `snapshotVersion`) also lives in the consumer repos. Ticker stays app-local. There is no public read API on this service.

## Failures

| Symptom                         | Likely cause                                            |
| ------------------------------- | ------------------------------------------------------- |
| Club was not found              | Name does not match SAMS; try the UUID                  |
| Club is ambiguous               | Two SAMS clubs slug to the same name; pass the UUID     |
| Club UUID was not found         | Wrong UUID or SAMS key/environment                      |
| Failed to search clubs in SAMS  | API key missing or SAMS unreachable                     |
| SSM / EventBridge access denied | Wrong credentials (must be the provider account)        |
| Queue never receives events     | Queue missing, wrong account/ARN, or missing SQS policy |

Stdout is JSON with the persisted `club` and `consumer` records on success.
