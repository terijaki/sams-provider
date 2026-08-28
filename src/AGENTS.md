Domain logic: event contracts, projections, adaptive match refresh, sync jobs.

Event payloads must stay versioned and bounded. Prefer `src/events/schemas.ts` as the consumer contract.

Sync job architecture, schedules, and flow diagrams: [`docs/sync.md`](../docs/sync.md).
