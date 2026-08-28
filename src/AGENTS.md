Domain logic: event contracts, projections, adaptive match refresh, sync jobs.

Event payloads must stay versioned and bounded. The consumer contract lives in the [`sams-provider-events`](../packages/sams-provider-events/) npm package; the provider re-exports it from `src/events/schemas.ts`.
