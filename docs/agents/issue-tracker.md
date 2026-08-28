# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

Public consumers request event delivery with the **Register as a consumer** template; everything else uses **General issue**. Consumer migration work stays in the consumer app repositories and remains blocked until provider events are stable.

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
