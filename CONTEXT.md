# SAMS provider

Provider-owned read model and event-fed projections for volleyball data from SAMS. Consumers receive events; there is no public read API.

## Runtime (clubs index)

- Associations are refreshed weekly from the SAMS host (`getAssociations`) into DynamoDB (730-day TTL). Clubs are fetched live per association (`getAllSportsclubs`) and cached in DynamoDB.
- **Tuesday 22:00 UTC:** `associations-sync` refreshes the association index from SAMS.
- **Wednesday 02:00 UTC:** `clubs-sync-coordinator` fans out one `clubs-sync-worker` per **cached** association (Dynamo-driven; empty index fails on prod, succeeds on dev).
- `clubUpdated` events are emitted only for registered clubs when projection data changes; index-only clubs stay silent on the bus.
- Register CLI resolves clubs from the DynamoDB index only (no live SAMS calls).

See [`docs/sync.md`](docs/sync.md) for schedules, flow diagrams, and sync meta keys.

## Language

### Upstream

**SAMS**:
The upstream volleyball information system (REST API) this provider syncs from. It covers many associations, not one federation.
_Avoid_: SBVV, Südbadischer Volleyball-Verband, "the association"

**SAMS host**:
The HTTP origin of the SAMS instance this provider calls. Today that is volleyball-baden.de. The host is how we reach SAMS, not a choice of association.
_Avoid_: SBVV, default association, Baden as a synonym for SAMS

**Association**:
A regional volleyball federation in SAMS. Germany has many; a club belongs to one. Discovered from the SAMS host and cached in the provider data table.
_Avoid_: SAMS, SAMS host, league, SSM association list

**Club**:
A sports club in SAMS, identified by UUID. SAMS list endpoints often call this a sportsclub.
_Avoid_: sportsclub (in prose), team, consumer

**Current season**:
The season SAMS marks as current. Team and league sync follow this season.
_Avoid_: live season, synced season

**League**:
A competition in a season that has teams, matches, and a ranking.
_Avoid_: association, division as a synonym for association

**Team**:
A club's side in a league for a season.
_Avoid_: club

**Match**:
A scheduled or completed game between two teams.
_Avoid_: ticker

**Ticker**:
Live play-by-play for a match. It stays in the consumer in v1; the provider does not publish it.
_Avoid_: match event, ticker event, provider ticker

### This provider

**Provider-owned read model**:
Durable provider-side state used for sync, diffing, and operational safety. It is not a public contract.
_Avoid_: public API, proxy cache

**Consumer**:
An application that receives SQS projection events and maintains its own local projection. One club may have several consumers (separate AWS accounts).
_Avoid_: provider API client, registered club

**Registered club**:
A club enrolled so teams, matches, and rankings are in scope, and to which consumers subscribe.
_Avoid_: target club, default club, consumer

**Association-wide club sync**:
Storing every club for each association returned by the SAMS host, not only registered clubs. Associations are discovered from SAMS and cached in DynamoDB.
_Avoid_: syncing SAMS, SBVV-only, default association, SSM association config

**Logo preservation**:
Keep the stored club logo when a paginated SAMS list omits it. Logos are fetched on first index and when club metadata changes. Mirrored objects use `sams-logos/{sportsclubUuid}.{ext}` only.
_Avoid_: replacing logos from list responses, slug-based logo keys

**Outbound projection**:
A provider-shaped data product for consumers (club, club-season-teams, match-block, league ranking). Not a raw SAMS entity. League ranking rows include sportsclub UUID and resolved `logoUrl`.
_Avoid_: DynamoDB item, SAMS payload

**Projection event**:
Versioned outbound message (`schemaVersion`, `eventId`, `snapshotVersion`) that carries an outbound projection. This is the consumer contract.
_Avoid_: DynamoDB keys as contract

**Local projection**:
The consumer's own copy of the data, updated from projection events.
_Avoid_: querying the provider

**Match block**:
Matches that share league, date, venue, and listed start time and are played sequentially even when scheduled together.
_Avoid_: match day, round, fixed poll window

**Adaptive match refresh**:
Refreshing match blocks (and related rankings) by schedule and match state, not on a fixed interval.
_Avoid_: 5-minute cache, cron poll

**Match snapshot**:
A weekly full reload of current-season schedules and league rankings for registered clubs, independent of the live window.
_Avoid_: emptying the matches table to force bootstrap

## Issue tracking

Work is tracked in GitHub Issues. Use `gh issue list --state open` for current work.
