# Why Browser Agents Need Form-Specific CLIs

Browser agents are good at exploration. They can open a page, inspect labels, click through unfamiliar UI, and recover when the next screen is not exactly what a script expected.

That is not the same as a repeatable submission workflow.

formctl is for the moment after exploration, when a user or agent has found a known form and wants to turn that workflow into a command that can be reviewed, dry-run, approved, and audited.

## The gap

A browser agent can submit a form directly, but the safety contract is usually hidden inside prompts and transcripts:

- Did the agent click submit during a preview?
- Which fields did it fill?
- Did a selector drift to a different field?
- Where is the screenshot?
- Can another agent repeat the same workflow tomorrow?
- Did a human explicitly approve the side effect?

For known forms, those questions should be answered by a CLI contract, not by a long prompt.

## The formctl contract for agents

1. Start from an existing workflow file, or record one only if it does not exist.
2. Run `submit --dry-run --json`.
3. Inspect `summary.json`, screenshots, and `audit.jsonl`.
4. Treat exit code `5` as an approval gate.
5. Do not pass `--approve` unless the user or policy explicitly authorizes submission.

## JSON examples

Dry-run output gives the agent a stable branch point without clicking submit:

```json
{
  "status": "dry-run",
  "workflow": "expense-report",
  "runId": "2026-05-26T05-59-00-000Z",
  "submitted": false,
  "requiresApproval": false,
  "artifacts": {
    "summary": ".formctl/runs/2026-05-26T05-59-00-000Z/summary.json",
    "screenshot": ".formctl/runs/2026-05-26T05-59-00-000Z/dry-run.png",
    "auditLog": ".formctl/runs/2026-05-26T05-59-00-000Z/audit.jsonl"
  },
  "exitCode": 0
}
```

Unapproved submit is not a runtime error. It is the approval gate:

```json
{
  "status": "error",
  "workflow": "expense-report",
  "submitted": false,
  "requiresApproval": true,
  "exitCode": 5,
  "error": {
    "code": "approval_required",
    "message": "Approval required: run with --dry-run to preview or --approve to submit."
  }
}
```

Selector drift stops before filling fields or submitting:

```json
{
  "status": "error",
  "workflow": "expense-report",
  "submitted": false,
  "requiresApproval": false,
  "exitCode": 3,
  "error": {
    "code": "selector_mismatch",
    "message": "Selector mismatch: expected exactly one element for amount."
  },
  "artifacts": {
    "failure": ".formctl/runs/2026-05-26T05-59-10-000Z/failure.json",
    "screenshot": ".formctl/runs/2026-05-26T05-59-10-000Z/failure.png",
    "auditLog": ".formctl/runs/2026-05-26T05-59-10-000Z/audit.jsonl"
  }
}
```

## Agent prompt rule

When an agent calls `formctl`, the prompt should be short because the CLI owns the safety contract:

```text
Run formctl submit expense-report --dry-run --json.
Inspect the returned artifacts.
Report the dry-run result and artifact paths.
Do not pass `--approve` unless I explicitly approve submission.
```

## Why not just raw browser control?

Raw browser control is still useful for discovery and one-off work. The issue is repeatability. Once the same form needs to be submitted more than once, the workflow should become a named command with reviewable artifacts.

That lets agents branch on machine-readable output instead of scraping terminal text or inferring state from screenshots.

## When not to use formctl

Do not use `formctl` when the task requires open-ended browsing, CAPTCHA solving, credential capture, or automation that the site owner does not permit. Keep browser agents in the exploration loop and use `formctl` only for known forms where a dry-run, approval gate, and audit trail are valuable.
