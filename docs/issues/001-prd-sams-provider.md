## Summary

Build a dedicated SAMS provider service that centrally syncs and normalizes volleyball data from the external SAMS API, then distributes new or changed data to consumer applications through events.

The provider should not be a thin proxy. Its main value is to own the upstream SAMS integration, keep provider-side durable state for diffing and operational safety, and publish app-useful data products to consumer queues. Consumer webapps can then maintain their own local projections and serve reads from their own DynamoDB tables.

Initial consumers are:

- `vcmuellheim`: [https://github.com/terijaki/vcmuellheim](https://github.com/terijaki/vcmuellheim)
- `markgraefler-volleys`: [https://github.com/terijaki/markgraefler-volleys](https://github.com/terijaki/markgraefler-volleys)

## Tracked issues

Provider scope only. Consumer migration and local SAMS decommission are tracked in consumer repositories (`vcmuellheim`, `markgraefler-volleys`), not here.

| Issue | Scope                                                                  |
| ----- | ---------------------------------------------------------------------- |
| #10   | **Goal:** first consumer registration + EventBridge → SQS verification |
| #11   | Live ticker investigation (out of PRD v1; app-local for now)           |
| #12   | Projection: `club-match-schedule`                                      |
| #13   | Projection: normalize `league-ranking` (sportsclub UUID per entry)     |
| #14   | Projection: normalize `match-block` payload                            |

### Projection status

| Projection            | Status                                         | Issue |
| --------------------- | ---------------------------------------------- | ----- |
| `club`                | Implemented (`sams.club.updated`)              | —     |
| `club-season-teams`   | Implemented (`sams.club-season-teams.updated`) | —     |
| `club-match-schedule` | Not implemented                                | #12   |
| `league-ranking`      | Partial (raw SAMS entries)                     | #13   |
| `match-block`         | Partial (raw SAMS matches)                     | #14   |

## Problem

Both existing apps integrate with the external SAMS API independently. They duplicate infrastructure, sync jobs, caching logic, DynamoDB tables, logo mirroring, schema handling, and operational behavior.

Current duplication creates several problems:

- Both apps need access to the SAMS API key.
- Both apps make upstream SAMS calls.
- Both apps maintain similar DynamoDB SAMS mirror tables.
- Both apps duplicate clubs and teams sync logic.
- Both apps duplicate match/ranking cache behavior.
- Both apps mirror club logos separately.
- SAMS quirks, such as missing logo values in paginated responses, must be handled in multiple places.
- Operational visibility is split across app accounts.

A proxy-only service would centralize the SAMS API key but would not materially improve latency, resilience, cache reuse, or operational simplicity.

## Goals

1. Centralize SAMS API access in one dedicated AWS account.
2. Serve common SAMS-derived data quickly from provider-owned storage/cache.
3. Reduce duplicate upstream SAMS traffic across apps.
4. Enable cross-account event delivery so consumers do not need their own SAMS integration.
5. Provide stable app-oriented event contracts.
6. Centralize logo mirroring.
7. Provide operational visibility into sync freshness and upstream failures.
8. Register the first consumer and verify events reach its queue ([#10](https://github.com/terijaki/sams-provider/issues/10)).

## Non-Goals

1. Do not expose the provider DynamoDB schema as a public contract.
2. Do not require consumers to read cross-account DynamoDB tables.
3. Do not rewrite both apps' UI data flow during initial migration.
4. Do not build a generic public SAMS replacement API.
5. Do not remove app-local fallback caches until provider behavior has been proven.
6. Do not add a separate provider read surface for data distribution.
7. Do not track consumer app integration, feature-flag migration, or local SAMS decommission in this repository (consumer repos).
8. Do not centralize live ticker in v1 ([#11](https://github.com/terijaki/sams-provider/issues/11) for future investigation).

## Existing Behavior

Each app currently has a SAMS stack with:

- DynamoDB SAMS data table
- TTL-enabled club/team records
- `GSI1-BySamsType` for listing clubs and teams
- scheduled clubs sync
- scheduled teams sync
- media bucket writes for club logos
- app-local cache table for match/ranking responses
- direct SAMS API calls for volatile data

Stable synced data:

- Clubs are synced association-wide for `Südbadischer Volleyball-Verband`.
- Club logo data is preserved because SAMS often returns `null` logo values in paginated responses.
- Teams are synced for configured target clubs and the current season.
- Stale teams are deleted after sync.

Volatile data:

- Matches are fetched on demand and cached for about 5 minutes.
- Rankings are fetched on demand and cached for about 5 minutes.
- Live ticker data stays app-local (not provider scope; see #11).

## Product Requirements

### Durable Synced Data

The provider must sync and serve these resources from provider-owned storage:

- associations
- clubs
- club logos
- seasons
- leagues
- league hierarchy metadata
- teams

Consumer reads for these resources must not call the external SAMS API.

### Provider-Owned Projections

The provider should not only forward raw SAMS entities. It should build efficient outbound projections that match the way consumers display data.

At minimum, the provider should match teams to their owning clubs before publishing events. This enables consumer apps to update a complete local club/team projection from a single event instead of reconstructing joins from separate low-level club and team messages.

Recommended projections:

| Projection            | Purpose                                                           |
| --------------------- | ----------------------------------------------------------------- |
| `club`                | Canonical club profile, association metadata, slug, and logo URL. |
| `club-season-teams`   | A club plus all known teams for the current season.               |
| `club-match-schedule` | Future and recent matches relevant to a club.                     |
| `league-ranking`      | Ranking table for a league affected by relevant matches.          |
| `match-block`         | Sequential match group for a date/league/venue/start-time block.  |

The `club-season-teams` projection should include:

- club UUID, name, slug, association, and public logo URL
- season UUID/name/current flag
- all current-season teams for that club
- league UUID/name/hierarchy level for each team
- projection timestamp and snapshot version

The `league-ranking` projection must include **sportsclub UUID** (club id) on each row, not only team id/name, so consumers can resolve logos by club UUID ([#13](https://github.com/terijaki/sams-provider/issues/13)).

### Volatile Projections

The provider must maintain volatile projections for resources that change around match activity:

- matches
- rankings

The provider should refresh these projections through scheduled/adaptive background jobs. Consumers receive changes through events and serve reads from their local projections.

Recommended initial TTLs:

- matches: adaptive, based on match schedule and match state
- rankings: adaptive, based on match activity in the related league
- seasons: 12-24 hours
- clubs: daily or weekly sync
- teams: hourly or nightly sync

### Matches and Rankings Refresh Strategy

Matches and rankings should not use a simple fixed polling interval. Volleyball match timing is uncertain: matches can last 3, 4, or 5 sets, and multiple matches are often listed with the same scheduled start time even though they are played sequentially. For example, three matches may all be scheduled at 14:00, while only the first actually starts at 14:00 and the following matches start when the previous matches finish.

The provider should use adaptive polling windows driven by scheduled match dates, known club/team/league interest, and current match/result state.

Recommended approach:

1. Store the match schedule as durable provider data for relevant clubs, teams, leagues, and seasons.
2. Build a `MatchRefreshPlanner` that periodically identifies which matches/leagues need refresh.
3. Refresh only the active window around relevant match days instead of polling all leagues constantly.
4. Refresh rankings only when a league has recently active or recently completed matches.
5. Decay polling frequency after results are complete or the active window has passed.

Suggested match refresh states:

| State               | Condition                                                                                            | Refresh behavior                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `scheduled-future`  | Match is more than 24 hours away                                                                     | Do not poll frequently; rely on daily schedule sync.                                                            |
| `pre-match-window`  | Match day, but more than 2 hours before first scheduled start                                        | Refresh schedule occasionally, for example every 1-2 hours.                                                     |
| `active-window`     | From roughly 2 hours before first scheduled start until several hours after the last scheduled start | Poll match results more frequently.                                                                             |
| `sequential-window` | Multiple matches share the same scheduled start time or venue/league context                         | Treat the group as a block; keep polling until all matches in the block have results or the max window expires. |
| `recently-finished` | Match has a winner/result, or all block matches have results                                         | Refresh a few more times with backoff to catch corrections.                                                     |
| `settled`           | Result has been stable past the correction window                                                    | Stop frequent polling; rely on daily reconciliation.                                                            |

Suggested initial polling intervals:

| Situation                            | Poll interval                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| No relevant matches today            | No match/ranking polling, except daily reconciliation.                                     |
| Match day, before active window      | 60-120 minutes.                                                                            |
| 2 hours before first scheduled match | 15-30 minutes.                                                                             |
| During active/sequential window      | 5-10 minutes.                                                                              |
| A match result just appeared         | 5-10 minutes for 30-60 minutes to catch corrections.                                       |
| All matches in block completed       | 15-30 minutes for 1-2 hours, then stop.                                                    |
| End of day reconciliation            | Once after the expected match day is over, for example late evening or early next morning. |

Sequential match groups should be modeled explicitly. A group may be inferred from shared league, date, venue, and identical scheduled start time, or from the way SAMS exposes the match day. The provider should not assume every listed 14:00 match starts at 14:00. Instead, it should treat the shared start time as the beginning of a match block and keep refreshing the block until all matches have final results or a conservative maximum duration is reached.

Recommended block window heuristic for v1:

- block starts 2 hours before the earliest scheduled start
- block remains active until 6-8 hours after the earliest scheduled start
- if any match in the block receives a result, keep polling until every match in the block has a result or the max window expires
- after all results are present, perform a short correction window with backoff
- run one daily reconciliation for yesterday's relevant matches

Rankings should be refreshed as a consequence of match activity, not blindly on a fixed interval. The provider should refresh league rankings when:

- a match in that league changes result state
- a match in that league completed within the last few hours
- a relevant match day ended and the provider runs reconciliation
- a consumer explicitly requests a stale ranking and the league is within an active/recent match window

The provider should include freshness metadata in volatile projection events:

- `cachedAt`
- `refreshState`
- `nextRefreshAfter`, if known
- `sourceMatchBlockId`, where applicable
- `isStale` or `servedStale`, when falling back during upstream failure

This lets consumers store and display whether data is fresh, recently refreshed, or intentionally stale without exposing internal provider DynamoDB/cache keys.

### Provider Configuration

The provider should use AWS Systems Manager Parameter Store for runtime configuration.

Recommended parameters:

| Parameter                                        | Type                      | Purpose                                                                 |
| ------------------------------------------------ | ------------------------- | ----------------------------------------------------------------------- |
| `/sams-provider/{env}/sams/api-key`              | `SecureString`            | External SAMS API key used only by provider sync/refresh lambdas.       |
| `/sams-provider/{env}/sync/associations`         | `String` or `StringList`  | Associations to keep in sync, for example SBVV.                         |
| `/sams-provider/{env}/sync/clubs`                | `String` or JSON `String` | Club names, slugs, or UUIDs to keep in sync.                            |
| `/sams-provider/{env}/sync/consumers`            | JSON `String`             | Consumer app IDs, environments, queue ARNs, and optional event filters. |
| `/sams-provider/{env}/sync/match-refresh-policy` | JSON `String`             | Adaptive polling windows and backoff settings for matches/rankings.     |

The provider CDK deployment may create these parameters with placeholder values, but real values should be managed as environment configuration. Sync lambdas should read the parameters at startup or cache them briefly in memory.

The SAMS API key can be stored in SSM Parameter Store as a `SecureString`. Secrets Manager remains an optional future upgrade if automatic rotation or richer secret lifecycle features become necessary.

### Event-Driven Distribution

The provider must publish normalized data-change events after successful sync and refresh jobs. This is the primary communication contract between the provider and consumer apps.

Potential event flow:

1. Provider sync lambda fetches and normalizes SAMS data.
2. Provider writes the canonical provider-side read model to DynamoDB.
3. Provider emits one or more events describing the completed sync or changed resources.
4. Consumer apps receive events through SQS queues and update local projections.

Recommended AWS services for event-driven distribution:

| Service              | Responsibility                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------- |
| Amazon EventBridge   | Provider-owned event bus for publishing domain events and routing to multiple consumers. |
| Amazon SQS           | Per-consumer durable queues for reliable delivery and retry isolation.                   |
| AWS Lambda           | Consumer-side queue processors that update local app projections or invalidate caches.   |
| Amazon SNS, optional | Fan-out alternative if EventBridge routing is not needed.                                |

Recommended event types:

| Event                            | When emitted                                                  | Suggested payload                                                                                      |
| -------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `sams.clubs.sync.completed`      | After a successful clubs sync                                 | Sync metadata, association, counts, changed club UUIDs, and provider snapshot version.                 |
| `sams.club.updated`              | For individual changed clubs, if per-entity fan-out is useful | Club UUID, slug, updated fields, public logo URL, and snapshot version.                                |
| `sams.teams.sync.completed`      | After a successful teams sync                                 | Sync metadata, season, counts by sports club, changed team UUIDs, and provider snapshot version.       |
| `sams.club-season-teams.updated` | When the current-season team projection for a club changes    | Club UUID/slug, public logo URL, season UUID/name, teams for the current season, and snapshot version. |
| `sams.rankings.cache.updated`    | When a ranking cache entry is refreshed                       | League UUID, season, cache timestamp, and optional ranking summary.                                    |
| `sams.matches.cache.updated`     | When a match cache entry is refreshed or pre-warmed           | Query shape, cache timestamp, match count, and optional match summary.                                 |

For augmented events, prefer publishing compact projections that are directly useful to consumers, for example `sams.club-season-teams.updated` containing a club and all of its current-season teams. This avoids forcing every consumer to reconstruct the same app-level projection from low-level entity events.

Event payloads should be versioned and bounded:

- include `schemaVersion`
- include `eventId`
- include `occurredAt`
- include `sourceSyncId` or `snapshotVersion`
- include enough data for idempotent consumer processing
- avoid unbounded payloads; store large snapshots in S3 and publish a pointer if needed

Recommended delivery model:

- Provider publishes events to EventBridge.
- EventBridge routes matching events to one SQS queue per consumer app/environment.
- Each consumer owns its queue, dead-letter queue, and processing lambda.
- Consumers process events idempotently by `eventId` or `snapshotVersion`.
- Failed consumer processing must not block provider sync completion or other consumers.

Event-driven distribution is most useful for:

- cache invalidation after provider syncs
- local app projections where very fast local reads are desired
- notifying apps that new logo/team/club data is available
- eventually removing polling from consumer apps
- auditability of sync changes over time

Event-driven distribution is less useful for arbitrary ad hoc queries that were not modeled as provider data products. For v1, the provider should avoid ad hoc query semantics and instead publish explicit projections that the consumer apps need, such as club teams, future matches, recent results, and league rankings.

The recommended first version is event-fed projections:

1. Provider owns upstream SAMS polling, normalization, diffing, and event publishing.
2. Consumer apps own local projection storage and serve webapp reads from that storage.
3. Provider publishes sync-completed and augmented projection events after durable syncs.
4. Provider publishes match/ranking update events from adaptive refresh jobs.

### Consumer Migration

Consumer apps should initially keep their existing server function exports stable, but change their backing data source from direct SAMS/local SAMS sync to local projections populated by provider events.

The following functions should become provider-backed adapters:

- `listSamsClubsFn`
- `listSamsTeamsFn`
- `getClubLogoUrlFn`
- `getClubLogoUrlsBatchFn`
- `getSamsMatchesFn`
- `peekSamsMatchesCacheFn`
- `getSamsRankingByLeagueUuidFn`
- `getSamsRankingsByLeagueUuidsFn`
- `peekSamsRankingsCacheFn`
- `getSamsTickerFn`
- SAMS admin sync trigger functions

Provider usage should be controlled by environment configuration so rollout can be gradual.

Each consumer app should add:

- an SQS queue for provider events
- a dead-letter queue
- a queue processor Lambda or existing background worker
- local DynamoDB projection tables or entities for provider-fed SAMS data
- idempotency tracking by `eventId` or `snapshotVersion`

## Technical Requirements

### Key AWS Services

The provider should be implemented as a small serverless AWS service. The expected core services are:

| Service                                          | Responsibility                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| AWS CDK                                          | Infrastructure definition and deployment.                                                                     |
| AWS Lambda                                       | SAMS sync jobs, adaptive match/ranking refresh jobs, event publication, and optional operator/admin handlers. |
| Amazon EventBridge Scheduler / EventBridge Rules | Scheduled clubs, teams, seasons, league metadata, adaptive match/ranking planner, and reconciliation jobs.    |
| Amazon EventBridge                               | Provider event bus for routing normalized domain events to consumers.                                         |
| Amazon SQS                                       | Per-consumer durable queues for provider events, with DLQs for failed processing.                             |
| Amazon DynamoDB                                  | Durable SAMS read model, short-lived computed cache, and sync/status metadata.                                |
| Amazon S3                                        | Public canonical mirrored SAMS club logo storage.                                                             |
| AWS Systems Manager Parameter Store              | SAMS API key, associations/clubs to sync, consumer queue configuration, and refresh policy settings.          |
| AWS IAM                                          | Least-privilege execution roles and cross-account event delivery permissions.                                 |
| Amazon CloudWatch                                | Logs, metrics, dashboards, and alarms.                                                                        |
| AWS X-Ray / Lambda Powertools tracing            | Tracing and structured logs across sync, refresh, and event publication lambdas.                              |

Operational actions should be handled through AWS-native mechanisms such as EventBridge schedule changes, Lambda console/CLI invocation by operators, CloudWatch dashboards, and SSM configuration updates.

### Storage

Use provider-owned DynamoDB tables:

- durable SAMS data table
- short-lived cache table
- optional sync metadata table, or sync metadata items in an existing table

Durable entities should include timestamps such as:

- `updatedAt`
- `lastSyncedAt`
- `source`
- `sourceVersion`, if useful

Internal TTL fields must not be part of public API contracts.

### Logo Mirroring

The provider should own one public S3 bucket or public-read S3 prefix for SAMS club logos. Club logos are not sensitive, and publishing stable S3 object URLs keeps the event payloads simple.

Logo sync must preserve existing logo data when SAMS returns missing/null logo values.

Consumer apps should receive canonical public S3 logo URLs from the provider in club and club/team projection events.

Recommended logo object layout:

- `sams-logos/{sportsclubUuid}.{ext}` (club UUID only; slug-based paths are redundant)

Recommended event field:

- `club.logoUrl`: public S3 URL for the mirrored logo, or `null` if no logo is known

### Authentication

Authorization is primarily IAM-based event delivery and queue access.

Recommended authorization model:

1. Store the external SAMS API key only in the provider account as an SSM `SecureString`.
2. Grant only provider sync/refresh Lambda roles permission to read `/sams-provider/{env}/sams/api-key`.
3. Store sync scope and consumer queue configuration in SSM parameters.
4. Provider event publication roles may publish to the provider EventBridge bus.
5. EventBridge rules may deliver selected events to approved consumer SQS queue ARNs.
6. Consumer queue resource policies allow messages only from the provider event bus/rules.
7. Consumer queue processor roles can read only their own queues and write only their own local projection tables.

Consumer access should be split by event subscription:

| Subscription | Example events                                                | Consumer behavior                                 |
| ------------ | ------------------------------------------------------------- | ------------------------------------------------- |
| `clubs`      | `sams.clubs.sync.completed`, `sams.club.updated`              | Maintain local club projection and logo metadata. |
| `teams`      | `sams.teams.sync.completed`, `sams.club-season-teams.updated` | Maintain local team and club-season projection.   |
| `matches`    | `sams.match-block.updated`, `sams.matches.updated`            | Maintain local future/recent match projections.   |
| `rankings`   | `sams.league-ranking.updated`                                 | Maintain local ranking projections.               |
| `status`     | `sams.sync.failed`, `sams.sync.completed`                     | Optional local operational visibility.            |

Public website users never interact with provider resources. They interact with the existing webapps, and those webapps read from their own local projections.

### Observability

The provider must expose and record:

- last successful clubs sync
- last successful teams sync
- item counts by entity type
- last upstream SAMS error
- sync duration
- upstream request count
- projection events published by type
- events published by type
- event publication failures
- consumer queue delivery failures
- consumer DLQ depth

Add alarms for:

- sync failure
- stale sync metadata
- elevated upstream SAMS failures
- unusually low item counts after sync
- EventBridge delivery failures
- SQS dead-letter queue messages

## Architecture

Normal consumer read flow:

1. Provider sync/refresh jobs publish events when relevant data changes.
2. Consumer queue processors update local projections.
3. Consumer webapps read from their own local DynamoDB tables.
4. No external SAMS call happens during normal webapp reads.

Volatile match/ranking refresh flow:

1. EventBridge invokes the adaptive refresh planner.
2. Planner reads provider state to find due match blocks and affected leagues.
3. Planner fetches only due data from SAMS.
4. Provider compares fresh data with stored state.
5. Provider writes changed state and publishes events for changed projections.
6. Consumers update local match/ranking projections from SQS.

Scheduled sync flow:

1. EventBridge invokes sync lambda.
2. Sync lambda fetches SAMS data with rate limiting and retries.
3. Response is normalized and validated.
4. DynamoDB is updated.
5. Sync metadata is written.
6. Metrics and alarms are updated.

## Rollout Plan

### Phase 1: Provider Foundation

- Create provider CDK app.
- Add DynamoDB tables.
- Add EventBridge schedules for background sync jobs.
- Add provider EventBridge bus.
- Add consumer SQS queue configuration and queue policies.
- Add public logo bucket or public logo prefix.
- Add SSM parameters for SAMS API key, associations/clubs to sync, consumers, and refresh policy.
- Add logging, tracing, metrics, and alarms.

### Phase 2: Durable Sync

- Port clubs sync.
- Port teams sync.
- Add seasons/leagues/league hierarchy sync.
- Preserve existing SAMS workarounds.
- Add sync metadata records.
- Add contract tests for event payload schemas.

### Phase 3: Event Contracts and Publication

- Implement events for clubs, teams, logos, seasons, and sync status.
- Implement adaptive match/ranking refresh events.
- Complete normalized volatile projections ([#12](https://github.com/terijaki/sams-provider/issues/12), [#13](https://github.com/terijaki/sams-provider/issues/13), [#14](https://github.com/terijaki/sams-provider/issues/14)).
- Add EventBridge rules that route events to consumer SQS queues.
- Add DLQs and alarms for failed event delivery or processing.

### Phase 4: Consumer registration (provider milestone)

Tracked in [#10](https://github.com/terijaki/sams-provider/issues/10):

- Register first consumer via CLI (`register --club … --account …`).
- Verify EventBridge rules deliver events to the consumer SQS queue.

### Out of scope (consumer repositories)

Consumer integration, read-path migration, feature flags, comparison with local SAMS data, disabling local sync, API key removal, and stack decommission are tracked in `vcmuellheim` and `markgraefler-volleys` (e.g. terijaki/vcmuellheim#382, terijaki/markgraefler-volleys#64), not in this repo.

## Success Metrics

**Provider (this repo)**

- Provider publishes durable sync and normalized projection events reliably.
- Provider sync metadata shows current sync freshness.
- SAMS API key exists only in provider account SSM Parameter Store.
- First consumer registered and events verified on consumer queue ([#10](https://github.com/terijaki/sams-provider/issues/10)).
- Volatile projections normalized ([#12](https://github.com/terijaki/sams-provider/issues/12), [#13](https://github.com/terijaki/sams-provider/issues/13), [#14](https://github.com/terijaki/sams-provider/issues/14)); ranking rows include sportsclub UUID.

**Consumers (separate repos)**

- Apps serve reads from provider-fed local projections after their own migration work.
- No direct SAMS API calls from consumer app accounts after migration.
- Consumer queue processors idempotent with empty DLQs during normal operation.

## Risks

### Provider Outage Or Sync Failure

Both apps depend on the provider for fresh updates, but should continue serving their last local projections if the provider is temporarily unavailable.

Mitigation:

- app-local projections remain readable during provider outages
- stale-data indicators in local projection metadata
- alarms
- rollback flag to local SAMS sync behavior until decommissioning

### Schema Coupling

Consumers may become tightly coupled to provider event payload shapes.

Mitigation:

- versioned event contracts
- additive changes only
- contract tests in provider and consumers

### Freshness Mismatch

Different data types need different freshness windows.

Mitigation:

- separate durable sync from volatile cache
- document freshness windows per projection/event type
- expose `lastSyncedAt` or `cachedAt`

### Hidden App-Specific Logic

Provider could accidentally hard-code one app's assumptions.

Mitigation:

- keep sync scope explicit in SSM configuration
- use consumer subscriptions and event filters rather than hidden hard-coded app behavior
- include association, club, season, league, and projection identifiers in event payloads

### Operator registration

CLI is the happy path; Console/SSM README is backup.

```text
sams-provider register --club "VC Müllheim" --account 123456789012
```

At register time: read API key from SSM, resolve the exact club name to UUID (fail if unknown or ambiguous), persist the UUID, attach it to that consumer. Club apps never look up SAMS ids. Four consumers to start (both apps × prod/dev accounts).

Association-wide clubs sync once. Per-club teams/matches/rankings/logos is where overlapping subscribers save upstream calls.

Use npm `sams-rest-v2` as the SAMS client. Production API key lives in SSM; GitHub Actions uses OIDC to AWS. Lock OIDC to `main` or a protected Environment.

## Open

- Full match/ranking payloads vs S3 pointers (normalized projections in #12–#14 may be sufficient)

**Resolved**

- Live ticker: out of PRD v1; investigate separately ([#11](https://github.com/terijaki/sams-provider/issues/11))
- Consumer-owned SQS vs provider-owned queues: consumer-owned queues; provider routes via register CLI
- Provider prod/dev: separate AWS accounts (dev `449952321849`, prod `550271577754`)
- Logo object keys: club UUID only (`sams-logos/{sportsclubUuid}.{ext}`); no slug path

## See also

- terijaki/sams-rest-v2#1
- terijaki/vcmuellheim#382 (consumer migration — out of provider scope)
- terijaki/markgraefler-volleys#64 (consumer migration — out of provider scope)
