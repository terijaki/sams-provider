# Domain context

Provider-owned SAMS read model and event-fed projections.

- Clubs are synced association-wide for SBVV.
- Paginated SAMS club lists often return `logoImageLink: null`; preserve stored logos.
- Teams, matches, and rankings are scoped to registered club UUIDs.
- Match refresh is adaptive (match blocks / sequential windows), not a fixed poll.
- Live ticker is out of PRD v1 ([#11](https://github.com/terijaki/sams-provider/issues/11)); apps keep ticker app-local.
- Logos: `sams-logos/{sportsclubUuid}.{ext}` only; ranking projections must include sportsclub UUID ([#13](https://github.com/terijaki/sams-provider/issues/13)).
- Event payloads are versioned (`schemaVersion`, `eventId`, `snapshotVersion`). Internal DynamoDB keys are not part of the contract.
