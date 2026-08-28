# Issue tracker

GitHub Issues are the source of truth. This file summarizes provider-scope work and links child issues.

## Parent PRD

| Issue                                                    | Title                               | Notes                                                                                                                                    |
| -------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [#1](https://github.com/terijaki/sams-provider/issues/1) | PRD: SAMS provider (event-fed sync) | Updated scope mirror: [`docs/issues/001-prd-sams-provider.md`](../../issues/001-prd-sams-provider.md) (sync to GitHub when token allows) |

## Provider milestones

| Issue                                                      | Title                                                               | Status |
| ---------------------------------------------------------- | ------------------------------------------------------------------- | ------ |
| [#10](https://github.com/terijaki/sams-provider/issues/10) | Goal: register first consumer and verify EventBridge → SQS delivery | Open   |

## Projections (sub-issues of #1)

| Issue                                                      | Projection / event                                     | Status             |
| ---------------------------------------------------------- | ------------------------------------------------------ | ------------------ |
| [#12](https://github.com/terijaki/sams-provider/issues/12) | `club-match-schedule`                                  | Not implemented    |
| [#13](https://github.com/terijaki/sams-provider/issues/13) | Normalize `league-ranking` (sportsclub UUID per entry) | Partial (raw SAMS) |
| [#14](https://github.com/terijaki/sams-provider/issues/14) | Normalize `match-block` payload                        | Partial (raw SAMS) |

Implemented today: `club` (`sams.club.updated`), `club-season-teams` (`sams.club-season-teams.updated`).

Logos: object key `sams-logos/{sportsclubUuid}.{ext}` only — no slug path. Ranking rows must include sportsclub UUID for logo resolution ([#13](https://github.com/terijaki/sams-provider/issues/13)).

## Out of PRD v1 scope

| Issue                                                      | Title                                  |
| ---------------------------------------------------------- | -------------------------------------- |
| [#11](https://github.com/terijaki/sams-provider/issues/11) | Investigate live ticker centralization |

Ticker stays app-local for v1; not tracked on the main PRD.

## Consumer repos (not tracked here)

Migration, event processors, feature flags, and local SAMS decommission live in consumer repositories:

- [terijaki/vcmuellheim#382](https://github.com/terijaki/vcmuellheim/issues/382)
- [terijaki/markgraefler-volleys#64](https://github.com/terijaki/markgraefler-volleys/issues/64)

## Remaining provider gaps (not yet filed)

Consider separate issues when tackling:

- Publish `sams.sync.completed` / `sams.sync.failed` (status subscription)
- Enforce adaptive refresh intervals (cache table cursors)
- Subscription-aware EventBridge rules (`consumer.subscriptions`)
- Observability metrics and PRD alarm set
- Daily match schedule reconciliation job
