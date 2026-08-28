# SAMS provider

Provider-owned SAMS read model and event-fed projections for volleyball data. Consumers receive events; there is no public read API.

## Language

**Provider-owned read model**:
Durable provider-side state used for sync, diffing, and operational safety. It is not a public contract.
_Avoid_: public API, proxy cache

**Consumer**:
An application that receives SQS projection events and serves its own local projection.
_Avoid_: provider API client

**Registered club**:
A club UUID enrolled for team, match, and ranking scope.
_Avoid_: target club, default club

**Association-wide club sync**:
Clubs are synced for the whole SBVV association, not only registered clubs.

**Logo preservation**:
Keep the stored club logo when a paginated SAMS list omits it.
_Avoid_: replacing logos from list responses

**Adaptive match refresh**:
Match polling scheduled by match blocks and sequential windows, not a fixed interval.
_Avoid_: 5-minute cache, cron poll

**App-local ticker**:
Live ticker stays in the consumer in v1 and is not published by the provider.
_Avoid_: ticker event, provider ticker

**Projection event**:
Versioned outbound payload (`schemaVersion`, `eventId`, `snapshotVersion`) that is the consumer contract.
_Avoid_: DynamoDB keys as contract
