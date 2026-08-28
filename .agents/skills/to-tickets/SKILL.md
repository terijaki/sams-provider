---
name: to-tickets
description: Break a plan, spec, or the current conversation into a set of tracer-bullet tickets, each declaring its blocking edges, published as GitHub sub-issues with native blocking dependencies.
disable-model-invocation: true
---

# To Tickets

Break a plan, spec, or conversation into a set of **tickets** — tracer-bullet vertical slices, each declaring the tickets that **block** it.

This repo uses **GitHub Issues** exclusively. Use the `gh` CLI for all tracker operations — see [`docs/agents/issue-tracker.md`](../../docs/agents/issue-tracker.md).

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes a reference (a spec path, an issue number or URL) as an argument, fetch it with `gh issue view <number> --comments` and read its full body and comments.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Ticket titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.

Look for opportunities to prefactor the code to make the implementation easier. "Make the change easy, then make the easy change."

### 3. Draft vertical slices

Break the work into **tracer bullet** tickets.

<vertical-slice-rules>

- Each slice cuts a narrow but COMPLETE path through every layer (schema, API, UI, tests) — vertical, NOT a horizontal slice of one layer
- A completed slice is demoable or verifiable on its own
- Each slice is sized to fit in a single fresh context window
- Any prefactoring should be done first

</vertical-slice-rules>

Give each ticket its **blocking edges** — the other tickets that must complete before it can start. A ticket with no blockers can start immediately.

**Wide refactors are the exception to vertical slicing.** A **wide refactor** is one mechanical change — rename a column, retype a shared symbol — whose **blast radius** fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Don't force it into a tracer bullet; sequence it as **expand–contract**. First expand: add the new form beside the old so nothing breaks. Then migrate the call sites over in batches sized by blast radius (per package, per directory), each batch its own ticket blocked by the expand, keeping CI green batch to batch because the old form still exists. Finally contract: delete the old form once no caller remains, in a ticket blocked by every migrate batch. When even the batches can't stay green alone, keep the sequence but let them share an integration branch that all block a final integrate-and-verify ticket — green is promised only there.

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each ticket, show:

- **Title**: short descriptive name
- **Blocked by**: which other tickets (if any) must complete first
- **What it delivers**: the end-to-end behaviour this ticket makes work

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the blocking edges correct — does each ticket only depend on tickets that genuinely gate it?
- Should any tickets be merged or split further?

Iterate until the user approves the breakdown.

### 5. Publish tickets to GitHub

Publish the approved tickets. **Do NOT close or modify the parent issue** beyond linking sub-issues.

**Parent issue:** the GitHub issue that holds the spec or plan these tickets implement. If the work came from an existing issue, that issue is the parent. If not, create one first with `gh issue create` before publishing tickets.

Publish in dependency order (blockers first) so blocking edges can reference real issue numbers:

1. **Create each ticket** with `gh issue create`, using the issue template below. Capture each ticket's database id (`.id` from the create response or `gh api repos/<owner>/<repo>/issues/<n> --jq .id`) — you need it for sub-issue linking.
2. **Link every ticket as a sub-issue of the parent** — always use GitHub's sub-issue relationship; never rely on body-text linking alone (no `Part of #123` headers, no task lists in the parent body as a substitute):

   ```bash
   echo "{\"sub_issue_id\": $CHILD_ID}" | gh api repos/<owner>/<repo>/issues/<parent_number>/sub_issues -X POST --input -
   ```

   Use `--input` with JSON, not `-f` — `sub_issue_id` must be an integer database id, not `#number`.

3. **Wire blocking edges in a second pass** using GitHub's native issue dependencies (see "Blocking" in [`docs/agents/issue-tracker.md`](../../docs/agents/issue-tracker.md)):

   ```bash
   gh api --method POST repos/<owner>/<repo>/issues/<child_number>/dependencies/blocked_by -f issue_id=<blocker-db-id>
   ```

   `<blocker-db-id>` is the blocker's database id (`.id`), not `#number`.

<issue-template>

## Parent

#<parent issue number> — linked as a GitHub sub-issue; do not duplicate parent body here.

## What to build

The end-to-end behaviour this ticket makes work, from the user's perspective — not layer-by-layer implementation.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

</issue-template>

Avoid specific file paths or code snippets — they go stale fast. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.

Work the frontier one ticket at a time with `/implement`, clearing context between tickets.
