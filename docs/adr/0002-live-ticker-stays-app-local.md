# Live ticker stays app-local

The public SAMS ticker backend (`backend.sams-ticker.de`) is a different upstream from keyed SAMS REST, refreshes on a 10-second cadence, and does not fit this provider’s event-fed minute-scale refresh model. Consumers keep fetching ticker themselves; the provider does not publish ticker projections.

## Considered options

- **App-local (chosen).** Consumer origins proxy `GET https://backend.sams-ticker.de/live/indoor/tickers/baden` (no API key; `Cache-Control: max-age=10`; `Cross-Origin-Resource-Policy: same-origin` so browsers cannot call it directly). The browser polls the consumer origin every 10s; the origin keeps a ~10s memory cache.
- **Provider v2 (event `sams.ticker.updated`).** A 10s poller would sit beside adaptive match refresh (5-minute schedule, 8–90 minute poll windows). EventBridge/SQS payloads cap at 256 KB; a measured Baden indoor dump is ~1.3 MB, almost all static `matchSeries` the provider already syncs via REST. A slim live-state event would still leave the browser polling a consumer store, unless this repo grew a read API or websocket fanout — both contradict “no public read API.”
- **Never.** Too strong. Revisit only if many more consumers share the same ticker, the ticker stops being a public cacheable GET, or we deliberately build a real-time fanout product (not SQS projections). SAMS Score’s push distributor is a different API and is not a reason to poll ticker through this provider.

## Why centralizing does not pay

1. **Duplicate keyed SAMS traffic is not the problem.** Ticker is unauthenticated. Centralizing it does not protect `/sams-provider/sams/api-key`.
2. **Duplicate ticker GETs are already cheap and viewer-driven.** Two club apps, 10s origin cache, fetch only while a visitor has the live UI open. A provider poller would download the 1.3 MB catalog for the whole live window even with zero viewers.
3. **Freshness gets worse, not better.** Extra hops (poller → EventBridge → SQS → consumer processor → local store → browser poll) cannot beat a 10s origin proxy.
4. **AWS dollars are not the blocker** (~$1–4/month for a 10s Lambda in `eu-central-1`, well under the $25 account budget). The cost is a second upstream, a sub-minute job this stack does not have, 50–320 GB/month of ticker downloads if the job is not viewer-driven, and a chatty event that still does not light up the homepage.

## Reopen bar

Do not add ticker types to `sams-provider-events` as a “reserved” contract. Reopen this decision only under the conditions in **Never** above.
