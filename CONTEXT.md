# SAMS provider

Provider-owned read model and event-fed projections for volleyball data from SAMS. Consumers receive events; there is no public read API.

## Language

### Upstream

**SAMS**:
The upstream volleyball information system (REST API) this provider syncs from. It covers many associations, not one federation.
_Avoid_: SBVV, Südbadischer Volleyball-Verband, "the association"

**Association**:
A regional volleyball federation in SAMS. Germany has many; a club belongs to one.
_Avoid_: SAMS, league, Verband as a synonym for the API

**SBVV**:
Südbadischer Volleyball-Verband. One association among others, and the default association this provider uses for club-name lookup today.
_Avoid_: SAMS

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
Storing every club in a configured association, not only registered clubs.
_Avoid_: syncing SAMS (the API), treating SBVV as the only association in SAMS

**Logo preservation**:
Keep the stored club logo when a paginated SAMS list omits it.
_Avoid_: replacing logos from list responses

**Outbound projection**:
A provider-shaped data product for consumers (club, club-season-teams, match-block, league ranking). Not a raw SAMS entity.
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
