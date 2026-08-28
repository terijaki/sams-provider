Domain logic: event contracts, projections, adaptive match refresh, sync jobs.

Event payloads must stay versioned and bounded. The consumer contract lives in [`packages/sams-provider-events/`](../packages/sams-provider-events/).

Provider code imports the npm contract through [`src/events/schemas.ts`](events/schemas.ts). Event publishing helpers (`createEventEnvelope`, `snapshotVersion`) live in [`src/events/envelope.ts`](events/envelope.ts) and are not part of the published package.

## Consumer documentation

Audience: club app developers installing `sams-provider-events` or registering for event delivery.

Consumer-facing docs live in the root README, [`docs/consumers/`](../docs/consumers/), and [`packages/sams-provider-events/README.md`](../packages/sams-provider-events/README.md).

When editing those files:

- Focus on what club apps receive and how to use types, schemas, and parsers.
- Do not include maintainer workflow (npm publish, CI, `vp pack`, contract-test mechanics, version-bump rules).
- Do not add export inventory tables or other design-conversation context.
- Link to other docs naturally — avoid labels like "human-readable".

Maintainer notes for the events package (publish workflow, contract file paths) belong here or in [`docs/`](../docs/), not in the npm README.
