# sams-provider-events

TypeScript types, Zod schemas, and SQS parsing helpers for [SAMS provider](https://github.com/terijaki/sams-provider) projection events.

Install this package in your consumer app to get editor hover docs, runtime validation, and typed event handling for messages delivered to your SQS queue.

## Install

```bash
bun add sams-provider-events
pnpm add sams-provider-events
npm install sams-provider-events
```

Requires Node.js **25+** (or a recent Bun release).

## Quick start

```ts
import {
  ProjectionEventType,
  parseProjectionEventFromSqsBody,
  type ClubSeasonTeamsUpdatedEvent,
  type TypedProjectionEvent,
} from "sams-provider-events";

export function handleSqsRecord(body: string): void {
  const event = parseProjectionEventFromSqsBody(body);

  switch (event.type) {
    case ProjectionEventType.clubSeasonTeamsUpdated: {
      const typed = event as ClubSeasonTeamsUpdatedEvent;
      upsertTeams(typed.payload.club.uuid, typed.payload.teams);
      break;
    }
    case ProjectionEventType.clubUpdated:
      upsertClub(event.payload);
      break;
    default:
      break;
  }
}
```

## What you get

- **Friendly type names** such as `Club`, `Team`, `Match`, `ClubSeasonTeams`, and `LeagueRankingUpdate`
- **JSDoc on exports** so hover text in VS Code explains each event and field group
- **Zod schemas** for runtime validation (`clubProjectionSchema`, `eventEnvelopeSchema`, …)
- **`ProjectionEventType`** constants with documentation instead of raw string literals
- **`TypedProjectionEvent`** discriminated union for narrowing on `type`
- **SQS helpers** — `parseProjectionEventFromSqsBody` unwraps the EventBridge message body

## Event reference

Human-readable event documentation lives in the provider repo: [docs/consumers/events.md](https://github.com/terijaki/sams-provider/blob/main/docs/consumers/events.md).

Machine-readable contract: the Zod schemas exported from this package (kept in sync with the provider).

## Idempotency

Every envelope includes `snapshotVersion`, a hash of the payload. Skip writes when the version is unchanged for the same projection key.

## Out of scope

This package does not include SAMS REST access (use [`sams-rest-v2`](https://www.npmjs.com/package/sams-rest-v2)), queue setup, or provider registration. See the provider [README](https://github.com/terijaki/sams-provider#get-events-for-your-club).

## Publishing

Maintainers build with `vp pack` from this directory. CI publishes to npm on merge to `main` when the package version changes.
