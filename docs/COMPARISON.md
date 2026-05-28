# Comparison

`formctl` is not a general RPA suite and not a free-form browser agent. It is a narrow CLI layer for recorded web forms where safety, repeatability, and review artifacts matter more than broad UI control.

| Approach | Best for | Main weakness | dry-run | approval | audit | selector drift |
| --- | --- | --- | --- | --- | --- | --- |
| formctl | Repeating known browser form submissions as CLI commands | Early MVP; not full event-history recording yet | Built in | Built in | Built in | Preflights field and step selectors; gates final submit |
| Raw Playwright scripts | Custom browser automation owned by engineers | Safety contract and artifact shape are custom per script | Usually custom | Usually custom | Usually custom | Depends on script author |
| Browser agents | Exploring unknown pages and handling open-ended tasks | Reproducibility can be weak across repeated submissions | Usually prompt-driven | Usually prompt-driven | Usually transcript-based | May continue unless constrained |
| RPA | Enterprise workflow automation across many desktop and web apps | Heavy setup and operational overhead for simple developer workflows | Product-specific | Product-specific | Product-specific | Product-specific |

## Why formctl exists

API-less internal tools, admin screens, government sites, and SaaS settings pages often need repeatable submissions, but they rarely justify a full RPA rollout. Raw Playwright scripts can automate them, but every team has to reinvent the same trust layer:

- preview before submit
- explicit approval before side effects
- deterministic JSON output for agents
- screenshots and audit logs for review
- selector drift detection before field filling for recorded fields and workflow steps
- readable workflow files that can be reviewed in git

`formctl` makes that trust layer the default for form workflows.

## When raw Playwright is better

Use raw Playwright when the workflow is highly custom, spans arbitrary browser interactions, needs custom assertions, or belongs inside a larger application test suite. `formctl` is deliberately narrower: record a form, replay values, produce artifacts, and gate submission.

## When browser agents are better

Use a browser agent when the page is unknown, the task requires exploration, or the next action depends on open-ended reasoning. Use `formctl` after the workflow is known and should become a repeatable command.

## When RPA is better

Use RPA when the organization needs centralized scheduling, credential vaults, desktop app automation, team permissions, and enterprise governance. Use `formctl` when a developer or agent needs a local CLI command with dry-run artifacts and approval gates.

## Positioning rule

`formctl` should stay focused on safe form submission, not generic browser automation. The product earns trust by making the boring safety path easy: dry-run first, review artifacts, approve explicitly, and fail on selector drift.
