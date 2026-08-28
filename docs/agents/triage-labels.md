# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Wayfinder skills also use `wayfinder:map`, `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, and `wayfinder:task`.

## Creating labels

Create any missing labels once:

```sh
gh label create needs-triage --color FBCA04 --description "Maintainer needs to evaluate this issue"
gh label create needs-info --color D876E3 --description "Waiting on reporter for more information"
gh label create ready-for-agent --color 0E8A16 --description "Fully specified, ready for an AFK agent"
gh label create ready-for-human --color 1D76DB --description "Requires human implementation"
gh label create "wayfinder:map" --color 5319E7 --description "Wayfinder map issue"
gh label create "wayfinder:research" --color C5DEF5 --description "Wayfinder research ticket"
gh label create "wayfinder:prototype" --color C5DEF5 --description "Wayfinder prototype ticket"
gh label create "wayfinder:grilling" --color C5DEF5 --description "Wayfinder grilling ticket"
gh label create "wayfinder:task" --color C5DEF5 --description "Wayfinder task ticket"
```

`wontfix`, `bug`, and `enhancement` already exist on this repo.
