# SAMS provider events

Reference for versioned envelopes the SAMS provider publishes to your SQS queue after registration.

Install types and parsers from npm:

```bash
bun add sams-provider-events
```

## Delivery model

1. The provider publishes projection events to the shared EventBridge bus `sams-provider` (prod account, `eu-central-1`).
2. A maintainer wires an EventBridge rule to **your** SQS queue when you register.
3. SQS receives the standard EventBridge message wrapper. Parse the JSON **`detail`** field — that object is the projection envelope documented here.

```ts
import { parseSamsEventFromSqsBody } from "sams-provider-events";

const event = parseSamsEventFromSqsBody(sqsRecord.body);
```

Every registered queue currently receives **all** event types. Subscription filtering is planned but not enforced yet.

Live match ticker data is **not** included. Build ticker handling in your own app if you need it.

## Common envelope

Every event shares this shape (`SamsEvent`):

| Field             | Type              | Description                                      |
| ----------------- | ----------------- | ------------------------------------------------ |
| `schemaVersion`   | `"1.0.0"`         | Contract version                                 |
| `eventId`         | string            | Unique event ID (UUID)                           |
| `occurredAt`      | ISO datetime      | When the provider created the event              |
| `source`          | `"sams-provider"` | Fixed source                                     |
| `type`            | string            | Event type (see below)                           |
| `sourceSyncId`    | string            | Correlates events from one sync or refresh run   |
| `snapshotVersion` | string (16 hex)   | Hash of the payload — use for idempotent upserts |
| `payload`         | object            | Event-specific body                              |

**Idempotency:** When `snapshotVersion` is unchanged for the same logical projection (for example the same club UUID), you can skip rewriting your local store.

## Shared payload types

### Club

| Field             | Type           | Description                      |
| ----------------- | -------------- | -------------------------------- |
| `uuid`            | string         | SAMS club UUID                   |
| `name`            | string         | Club display name                |
| `slug`            | string         | URL-safe slug                    |
| `associationUuid` | string?        | Regional federation UUID         |
| `associationName` | string?        | Federation display name          |
| `logoUrl`         | string \| null | Public CDN URL for the club logo |

### Team

| Field                  | Type    | Description                |
| ---------------------- | ------- | -------------------------- |
| `uuid`                 | string  | Team UUID                  |
| `name`                 | string  | Team display name          |
| `slug`                 | string  | URL-safe slug              |
| `leagueUuid`           | string  | League UUID                |
| `leagueName`           | string  | League display name        |
| `leagueHierarchyLevel` | number? | League tier when available |

### Season (nested)

| Field     | Type    | Description                                   |
| --------- | ------- | --------------------------------------------- |
| `uuid`    | string  | Season UUID                                   |
| `name`    | string  | Label such as `2026/27`                       |
| `current` | boolean | Whether SAMS marks this as the current season |

### Match

| Field            | Type      | Description                                                              |
| ---------------- | --------- | ------------------------------------------------------------------------ |
| `uuid`           | string    | Match UUID                                                               |
| `date`           | string?   | `YYYY-MM-DD`                                                             |
| `time`           | string?   | Scheduled start time                                                     |
| `leagueUuid`     | string?   | League UUID                                                              |
| `seasonUuid`     | string?   | Season UUID                                                              |
| `team1`, `team2` | MatchTeam | Each side: `uuid`, `name`, optional `sportsclubUuid`, optional `logoUrl` |
| `location`       | object?   | `uuid`, optional `name`                                                  |
| `result`         | object?   | Winner, set/ball points, optional `sets[]` with per-set results          |
| `hasResult`      | boolean   | Whether a final result exists                                            |

---

## Published events

### `sams.club.updated`

**When:** Your **registered** club’s profile changes (name, association, or logo). Index-only clubs do not emit this event.

**Payload:** A `Club` object (see above).

**Use:** Upsert club metadata in your local projection.

---

### `sams.club-season-teams.updated`

**When:** After each current-season teams sync — one event per registered club with the **full** team list (not a diff).

**Payload:**

| Field         | Type         | Description                            |
| ------------- | ------------ | -------------------------------------- |
| `club`        | Club         | Registered club                        |
| `season`      | Season       | Current season                         |
| `teams`       | Team[]       | All teams for this club in that season |
| `projectedAt` | ISO datetime | When the provider built the projection |

**Use:** Replace your stored team list for the club/season.

---

### `sams.club-season-rosters.updated`

**When:** After each current-season teams sync — one event per registered club with the **full** roster snapshot for every current-season team (not a diff).

**Payload:**

| Field         | Type              | Description                                      |
| ------------- | ----------------- | ------------------------------------------------ |
| `club`        | Club              | Registered club                                  |
| `season`      | Season            | Current season                                   |
| `rosters`     | TeamRosterEntry[] | Squad lists keyed by team                        |
| `projectedAt` | ISO datetime      | When the provider built the projection           |
| `cachedAt`    | ISO datetime      | Latest roster fetch time among included teams    |
| `isStale`     | boolean           | `true` when roster refresh could not run in time |

**TeamRosterEntry** contains `team` (with `sportsclubUuid`), `players[]`, and `officials[]`.

**Use:** Replace your stored roster list for the club/season. Teams without a stored roster are omitted from `rosters`.

---

### `sams.team-roster.updated`

**When:** A registered club’s team roster changes during teams sync (create, update, or delete).

**Payload:**

| Field         | Type             | Description                                       |
| ------------- | ---------------- | ------------------------------------------------- |
| `team`        | Team + club      | Team metadata plus owning `sportsclubUuid`        |
| `season`      | Season           | Current season                                    |
| `players`     | RosterPlayer[]   | Normalized players (`portraitUrl` when available) |
| `officials`   | RosterOfficial[] | Normalized officials                              |
| `projectedAt` | ISO datetime     | When the provider built the projection            |
| `cachedAt`    | ISO datetime     | When roster data was fetched                      |
| `isStale`     | boolean          | `true` when roster refresh could not run in time  |

**404 handling:** SAMS sometimes returns 404 for roster endpoints even when squad data exists. The provider keeps the previous roster in that case and does **not** emit `sams.team-roster.updated`. When SAMS returns an empty roster successfully, the provider stores and publishes empty `players` / `officials` arrays.

**Use:** Upsert one team’s squad list. Empty arrays mean the squad was cleared or the team was removed.

---

### `sams.club-match-schedule.updated`

**When:** Match refresh affects a registered club (including initial bootstrap).

**Payload:**

| Field         | Type         | Description                               |
| ------------- | ------------ | ----------------------------------------- |
| `club`        | Club         | Registered club                           |
| `season`      | Season       | Season context                            |
| `matches`     | Match[]      | Fixtures in the rolling window            |
| `projectedAt` | ISO datetime | When the projection was built             |
| `cachedAt`    | ISO datetime | When underlying match data was cached     |
| `isStale`     | boolean      | `true` when refresh could not run in time |

**Window:** Matches from **14 days ago** through **365 days ahead**.

**Use:** Replace or merge your club schedule view. Respect `isStale` in UI if you show freshness.

---

### `sams.match-block.updated`

**When:** Adaptive match refresh decides a **match block** is due. A block groups matches that share league, date, and venue and are played sequentially.

**Payload:**

| Field              | Type                 | Description                                               |
| ------------------ | -------------------- | --------------------------------------------------------- |
| `matchBlockId`     | string               | Stable block identifier                                   |
| `leagueUuid`       | string               | League UUID                                               |
| `date`             | string               | Block date (`YYYY-MM-DD`)                                 |
| `refreshState`     | string               | Provider refresh phase (for example `active`, `preMatch`) |
| `cachedAt`         | ISO datetime         | When match data was fetched                               |
| `nextRefreshAfter` | ISO datetime \| null | When the provider plans the next refresh                  |
| `isStale`          | boolean              | Cache exceeded its refresh window                         |
| `matchUuids`       | string[]             | Match UUIDs in this block                                 |
| `matches`          | Match[]              | Normalized match details                                  |

**Use:** Update match results and schedules for all clubs involved in the block.

---

### `sams.league-ranking.updated`

**When:** Emitted alongside match-block refresh when rankings for that league should update.

**Payload:**

| Field                | Type                 | Description                                                |
| -------------------- | -------------------- | ---------------------------------------------------------- |
| `leagueUuid`         | string               | League UUID                                                |
| `leagueName`         | string?              | League display name (for example `Bezirksliga Herren Süd`) |
| `seasonUuid`         | string               | Season UUID                                                |
| `seasonName`         | string?              | Season display name (for example `2026/27`)                |
| `cachedAt`           | ISO datetime         | When ranking data was fetched                              |
| `refreshState`       | string               | Same semantics as match-block                              |
| `nextRefreshAfter`   | ISO datetime \| null | Planned next ranking refresh                               |
| `isStale`            | boolean              | Cache exceeded its refresh window                          |
| `sourceMatchBlockId` | string?              | Block that triggered this ranking refresh                  |
| `entries`            | LeagueRankingEntry[] | Standings rows                                             |

**LeagueRankingEntry** includes `rank`, `teamUuid`, `teamName`, optional `sportsclubUuid`, optional `logoUrl`, and optional stats (`points`, `wins`, `losses`, set/ball columns, etc.).

**Use:** Replace league table data for the given league/season.

---

### `sams.clubs.sync.completed`

**When:** The weekly association-wide club index sync coordinator finishes.

**Payload:**

| Field                 | Type     | Description                          |
| --------------------- | -------- | ------------------------------------ |
| `associationsInvoked` | number   | Count of association workers invoked |
| `associationUuids`    | string[] | Association UUIDs processed          |

**Use:** Optional operational signal (health dashboards, “last sync” timestamps). Most club apps can ignore this.

---

### `sams.teams.sync.completed`

**When:** A current-season teams sync pass finishes.

**Payload:**

| Field                    | Type                          | Description                       |
| ------------------------ | ----------------------------- | --------------------------------- |
| `seasonUuid`             | string                        | Season UUID                       |
| `seasonName`             | string                        | Season label                      |
| `teamsCount`             | number                        | Total teams synced                |
| `countsBySportsclubUuid` | Record&lt;clubUuid, count&gt; | Teams per club                    |
| `changedTeamUuids`       | string[]                      | Teams whose stored record changed |

**Use:** Optional operational signal. Per-club team projections arrive in `sams.club-season-teams.updated`.

---

## Reserved (not published yet)

These types exist in the contract for forward compatibility. **Do not expect them on your queue today.**

| Type                   | Purpose                                                           |
| ---------------------- | ----------------------------------------------------------------- |
| `sams.matches.updated` | Alternate match update signal (same payload shape as match-block) |
| `sams.sync.completed`  | Generic job success (`{ job: string }`)                           |
| `sams.sync.failed`     | Generic job failure (`{ job, message }`)                          |

---

## Integration notes

- Treat projection payloads as **snapshots** unless noted otherwise. Upsert by natural keys (`club.uuid`, `leagueUuid`, `match.uuid`, …).
- Use `snapshotVersion` to dedupe replays and at-least-once delivery.
- Configure a **dead-letter queue** on your SQS subscription so poison messages do not block processing.
- TypeScript consumers should import `SamsEventType`, `SamsEvent`, and optionally Zod schemas from `sams-provider-events`.

## Example envelope

```json
{
  "schemaVersion": "1.0.0",
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "occurredAt": "2026-08-27T12:00:00.000Z",
  "source": "sams-provider",
  "type": "sams.club-season-teams.updated",
  "sourceSyncId": "sync-teams-2026-08-27",
  "snapshotVersion": "a1b2c3d4e5f67890",
  "payload": {
    "club": {
      "uuid": "club-1",
      "name": "Example Club",
      "slug": "example-club",
      "logoUrl": "https://cdn.example/sams-logos/club-1.png"
    },
    "season": { "uuid": "season-1", "name": "2026/27", "current": true },
    "teams": [],
    "projectedAt": "2026-08-27T12:00:00.000Z"
  }
}
```
