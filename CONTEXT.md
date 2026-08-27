# Domain context

Provider-owned SAMS read model and event-fed projections.

- Clubs are synced association-wide for SBVV.
- Paginated SAMS club lists often return `logoImageLink: null`; preserve stored logos.
- Teams, matches, and rankings are scoped to registered club UUIDs.
- Match refresh is adaptive (match blocks / sequential windows), not a fixed poll.
- Ticker stays app-local in v1.
- Event payloads are versioned (`schemaVersion`, `eventId`, `snapshotVersion`). Internal DynamoDB keys are not part of the contract.
