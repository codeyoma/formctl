# Posting Queue

Use this queue when a human-authenticated account is ready to publish. Do not post from automation accounts without permission.

## First post candidate

Channel: Reddit r/commandline

Reason: The current product is strongest as a CLI-first workflow: record a known browser form, dry-run it, review artifacts, then submit only with explicit approval.

Posted URL:

Status: Ready

```text
I built formctl, a CLI that turns API-less browser forms into repeatable commands.

The examples are local and mock-backed, but they mirror the kinds of workflows I keep seeing in internal tools:

- CRM update: set account stage, owner, next contact date, priority, and notes.
- Compliance attestation: choose a control area, date the attestation, check compliance, and add audit notes.
- Expense reports, admin invites, refunds, vendor onboarding, and procurement approvals.

Before: open a browser, follow a runbook, fill the form, hope the selectors did not drift, and click submit manually.

After:

formctl submit crm-update --accountName "Northwind Traders" --stage renewal --ownerEmail ae@example.com --nextContactDate 2026-06-03 --priority true --notes "Renewal risk flagged" --dry-run --json
formctl submit crm-update --accountName "Northwind Traders" --stage renewal --ownerEmail ae@example.com --nextContactDate 2026-06-03 --priority true --notes "Renewal risk flagged" --approve --json

formctl submit compliance-attestation --employeeEmail auditor@example.com --controlArea security --attestationDate 2026-06-15 --compliant true --notes "Quarterly access review complete" --dry-run --json
formctl submit compliance-attestation --employeeEmail auditor@example.com --controlArea security --attestationDate 2026-06-15 --compliant true --notes "Quarterly access review complete" --approve --json

The point is not generic RPA. It is a small safety contract for known forms:
- dry-run screenshots before submit
- selector drift stops before filling
- approval required for side effects
- audit.jsonl and JSON output for agents

Release: https://github.com/codeyoma/formctl/releases/tag/v0.1.0
Example posts: docs/EXAMPLE_POSTS.md
https://github.com/codeyoma/formctl/blob/main/docs/EXAMPLE_POSTS.md
Trust notes: docs/TRUST.md
https://github.com/codeyoma/formctl/blob/main/docs/TRUST.md
MCP setup guide: docs/MCP.md
https://github.com/codeyoma/formctl/blob/main/docs/MCP.md

What API-less form workflow would you want turned into a safe CLI command?
```

## Reddit r/LocalLLaMA

Use this if the first post should target agent users.

Posted URL:

```text
I built formctl for the point where a browser agent has already found a known form and the task needs to become repeatable.

Browser agents are useful for exploration, but repeated form submission needs a stricter contract:
- submit --dry-run --json first
- inspect screenshots, summary.json, and audit.jsonl
- stop on selector drift
- only click submit with --approve

The local examples include CRM update and Compliance attestation workflows:

formctl submit crm-update --accountName "Northwind Traders" --stage renewal --ownerEmail ae@example.com --nextContactDate 2026-06-03 --priority true --notes "Renewal risk flagged" --dry-run --json

formctl submit compliance-attestation --employeeEmail auditor@example.com --controlArea security --attestationDate 2026-06-15 --compliant true --notes "Quarterly access review complete" --dry-run --json

Release: https://github.com/codeyoma/formctl/releases/tag/v0.1.0
Agent article: docs/WHY_FORM_CLIS.md
https://github.com/codeyoma/formctl/blob/main/docs/WHY_FORM_CLIS.md
Trust notes: docs/TRUST.md
https://github.com/codeyoma/formctl/blob/main/docs/TRUST.md
MCP setup guide: docs/MCP.md
https://github.com/codeyoma/formctl/blob/main/docs/MCP.md

Where would a form-specific CLI be safer than raw browser control?
```

## Direct outreach

Use this for a developer, operator, or founder who works around internal tools.

Posted URL:

```text
I am testing formctl, a CLI for turning browser-only forms into dry-run-first commands.

The most concrete examples right now are CRM update and Compliance attestation:

- CRM update: stage, owner, next contact date, priority, notes.
- Compliance attestation: control area, attestation date, compliance checkbox, audit notes.

The CLI runs a dry-run first, writes screenshots and audit.jsonl, and only submits with --approve.

Do you have any API-less internal form that still needs a browser runbook?

GitHub: https://github.com/codeyoma/formctl
Example posts: docs/EXAMPLE_POSTS.md
https://github.com/codeyoma/formctl/blob/main/docs/EXAMPLE_POSTS.md
```

## 24-hour follow-up

After posting:

1. Copy the posted URL into this file under the matching channel.
2. Update `docs/GROWTH_LOG.md` with stars, forks, open issues, comments, workflow leads, and any positioning change.
3. Update `docs/OUTREACH.md` channel status from `Ready` to `Posted`.
4. Record what worked and what failed in the Launch Attempts section of `REVIEW.md`.
