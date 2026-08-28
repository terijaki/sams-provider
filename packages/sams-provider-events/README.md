# sams-provider-events

TypeScript types, Zod schemas, and optional SQS parsers for [SAMS provider](https://github.com/terijaki/sams-provider) events delivered to consumer queues.

## Install

```bash
bun add sams-provider-events
pnpm add sams-provider-events
npm install sams-provider-events
```

Requires Node.js **25+** (or a recent Bun release).

## What is in the package

| Export                                                          | Needs Zod at runtime? | Purpose                                      |
| --------------------------------------------------------------- | --------------------- | -------------------------------------------- |
| **Types** (`Club`, `Match`, `SamsEvent`, …)                     | No                    | Editor hovers and compile-time safety        |
| **Constants** (`SamsEventType`, `EVENT_SOURCE`)                 | No                    | Documented event type strings                |
| **Zod schemas** (`clubProjectionSchema`, …)                     | Yes                   | Optional runtime validation                  |
| **Parsers** (`parseSamsEventFromSqsBody`)                       | Yes                   | Optional SQS/EventBridge helpers             |
| **Provider helpers** (`createEventEnvelope`, `snapshotVersion`) | Yes                   | Used by the provider; optional for consumers |

Types are **hand-written** and kept in sync with Zod schemas by contract tests. Import only types/constants if you do not want Zod in your runtime bundle — your bundler can tree-shake unused schema/parser code when you import type-only symbols.

## Quick start (types only)

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

## Quick start (with Zod parsing)

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

Human-readable documentation: [docs/consumers/events.md](https://github.com/terijaki/sams-provider/blob/main/docs/consumers/events.md).

## Idempotency

Every envelope includes `snapshotVersion`, a hash of the payload. Skip writes when the version is unchanged for the same logical key.

## Publishing

Maintainers bump `package.json` automatically on PRs that change the contract (`src/types.ts`, `src/schemas.ts`, or `src/constants.ts`). npm publish runs on merge to `main` only when the package version is newer than the version on npm.

Build locally with:

```bash
cd packages/sams-provider-events && vp pack
```

## Out of scope

SAMS REST access (`sams-rest-v2`), queue setup, and provider registration. See the provider [README](https://github.com/terijaki/sams-provider#get-events-for-your-club).
