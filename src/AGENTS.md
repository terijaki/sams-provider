Domain logic: event contracts, projections, adaptive match refresh, sync jobs.

Event payloads must stay versioned and bounded. Prefer `src/events/schemas.ts` as the consumer contract.
