# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

Public consumers request event delivery with the **Register as a consumer** template; everything else uses **General issue**. Consumer migration work stays in the consumer app repositories.

## Status

**PRD v1 provider scope is delivered.** The original parent PRD ([#1](https://github.com/terijaki/sams-provider/issues/1)) tracked the initial build-out; projection events, multi-association sync, and normalized payloads are live in prod.

Domain terminology and architecture: root [`CONTEXT.md`](../../CONTEXT.md) and [`docs/adr`](../adr).

## Open issues

| Issue                                                      | Title                                                               | Notes                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------ |
| [#10](https://github.com/terijaki/sams-provider/issues/10) | Goal: register first consumer and verify EventBridge → SQS delivery | Blocked on a real consumer queue + account |
| [#11](https://github.com/terijaki/sams-provider/issues/11) | Investigate live ticker centralization                              | Out of PRD v1 scope                        |

## Delivered projections and events

| Projection / event  | Event type                         | Issue | PR  |
| ------------------- | ---------------------------------- | ----- | --- |
| Club                | `sams.club.updated`                | —     | —   |
| Club season teams   | `sams.club-season-teams.updated`   | —     | —   |
| Match block         | `sams.match-block.updated`         | #14   | #22 |
| League ranking      | `sams.league-ranking.updated`      | #13   | #20 |
| Club match schedule | `sams.club-match-schedule.updated` | #12   | #22 |

Sync summary events (`sams.clubs.sync.completed`, `sams.teams.sync.completed`) publish today. Per-job `sams.sync.completed` / `sams.sync.failed` are schema-only — see gaps below.

## Delivered infrastructure

| Issue                                                      | Title                                                        | PR  |
| ---------------------------------------------------------- | ------------------------------------------------------------ | --- |
| [#16](https://github.com/terijaki/sams-provider/issues/16) | Multi-association sync and register (remove SBVV-only paths) | #19 |
| [#18](https://github.com/terijaki/sams-provider/issues/18) | Full SAMS host club index (coordinator + workers)            | #19 |

## Next step

1. **[#10](https://github.com/terijaki/sams-provider/issues/10)** — register the first consumer when their SQS queue and AWS account are ready (`register --club "…" --account …`).

## Consumer repos (not tracked here)

- [terijaki/vcmuellheim#382](https://github.com/terijaki/vcmuellheim/issues/382)
- [terijaki/markgraefler-volleys#64](https://github.com/terijaki/markgraefler-volleys/issues/64)

## Remaining provider gaps (not yet filed)

Consider separate issues when tackling:

- Publish `sams.sync.completed` / `sams.sync.failed` (status subscription)
- Enforce adaptive refresh intervals (cache table cursors)
- Subscription-aware EventBridge rules (`consumer.subscriptions`)
- Observability metrics and PRD alarm set
- Daily match schedule reconciliation job

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## To-tickets operations

Used by `/to-tickets`. The **parent** is the spec or plan issue; each tracer-bullet ticket is a **sub-issue** of that parent.

- **Parent**: the GitHub issue holding the spec or plan. Use the source issue when one exists; otherwise create one with `gh issue create` first.
- **Ticket**: create with `gh issue create`, then link as a sub-issue of the parent:

  ```bash
  echo "{\"sub_issue_id\": $CHILD_ID}" | gh api repos/<owner>/<repo>/issues/<parent_number>/sub_issues -X POST --input -
  ```

  `$CHILD_ID` is the ticket's database id (`.id`), not `#number`. Use `--input` with JSON — `-f` sends strings and the API rejects them.

- **Blocking**: GitHub's **native issue dependencies**. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only — the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.

Do not close or modify the parent issue beyond linking sub-issues.
