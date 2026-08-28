# Types & Schemas for SAMS Provider

Install as **`sams-provider-events`** for typed events from the [SAMS provider](https://github.com/terijaki/sams-provider) delivered to your club app's SQS queue.

## Install

```bash
bun add sams-provider-events
pnpm add sams-provider-events
npm install sams-provider-events
```

Requires Node.js **25+** (or a recent Bun release).

## TypeScript

```ts
import {
  SamsEventType,
  type ClubSeasonTeamsUpdatedEvent,
  type SamsEvent,
} from "sams-provider-events";

export function handleEvent(event: SamsEvent): void {
  if (event.type === SamsEventType.clubSeasonTeamsUpdated) {
    const typed: ClubSeasonTeamsUpdatedEvent = event;
    saveTeams(typed.payload.club.uuid, typed.payload.teams);
  }
}
```

## Zod

```ts
import { parseSamsEventFromSqsBody, SamsEventType } from "sams-provider-events";

export function handleSqsRecord(body: string): void {
  const event = parseSamsEventFromSqsBody(body);
  if (event.type === SamsEventType.clubUpdated) {
    saveClub(event.payload);
  }
}
```

## Event reference

See [docs/consumers/events.md](https://github.com/terijaki/sams-provider/blob/main/docs/consumers/events.md).

## Idempotency

Every envelope includes `snapshotVersion`, a hash of the payload. Compare that field on incoming events — you do not need to recompute it. Skip writes when the value is unchanged for the same logical key.
