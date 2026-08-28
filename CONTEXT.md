# Domain context

Provider-owned SAMS read model and event-fed projections.

- Associations and clubs are discovered from the configured SAMS host (`getAssociations`, `getAllSportsclubs`) and cached in DynamoDB (730-day TTL).
- Weekly clubs sync: coordinator refreshes associations, then async-invokes one worker per association.
- `clubUpdated` events are emitted only for registered clubs when projection data changes; index-only clubs stay silent on the bus.
- Paginated SAMS club lists often return `logoImageLink: null`; logos are fetched on first index and when club metadata changes.
- Teams, matches, and rankings are scoped to registered club UUIDs.
- Match refresh is adaptive (match blocks / sequential windows), not a fixed poll.
- Ticker stays app-local in v1.
- Event payloads are versioned (`schemaVersion`, `eventId`, `snapshotVersion`). Internal DynamoDB keys are not part of the contract.
