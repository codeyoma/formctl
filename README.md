# formctl

formctl turns any browser form into a safe, repeatable CLI command.

Run a saved workflow. Preview first. Approve only when ready.

`formctl` is for developers, operators, and AI agents that need reliable automation for web forms with no useful API. One person records a form workflow into reviewable YAML, then everyone else can run it as a CLI command with dry-run artifacts and explicit approval before real submission.

[Workflow request guide](docs/WORKFLOW_REQUESTS.md) · [Example before/after posts](docs/EXAMPLE_POSTS.md) · [Growth log](docs/GROWTH_LOG.md) · [Trust and security notes](docs/TRUST.md) · [Comparison with Playwright, browser agents, and RPA](docs/COMPARISON.md) · [Why browser agents need form-specific CLIs](docs/WHY_FORM_CLIS.md)

```bash
formctl submit expense-report --values values.json --dry-run --json
formctl submit expense-report --values values.json --approve --json
```

![formctl demo](docs/assets/demo.svg)

[Watch the real local demo video](docs/assets/demo.mp4)

## Trust Artifacts

![Dry-run preview](docs/assets/dry-run-preview.svg)

![Selector mismatch](docs/assets/selector-mismatch.svg)

![Audit log](docs/assets/audit-log.svg)

See [Trust and security notes](docs/TRUST.md) for dry-run, approval, audit log, selector breakage, and secret-handling details. See [Comparison with Playwright, browser agents, and RPA](docs/COMPARISON.md) for when `formctl` is the right layer.

## Install

```bash
npm install -g formctl
npx formctl --version
npx formctl --help
npx formctl doctor
```

`doctor` checks Node, the current workspace, and the Playwright Chromium browser used by record and submit. If the browser is missing, run:

```bash
npx playwright install chromium
```

## Two-Minute Local Demo

Run the demo locally:

```bash
npm install
npm run demo
```

In a second terminal:

```bash
npm run formctl -- workflows --json
npm run formctl -- validate expense-report --json
npm run formctl -- submit expense-report --values demo/expense-values.json --dry-run --json --headless
npm run formctl -- submit expense-report --values demo/expense-values.json --approve --json --headless
```

That is the main loop: discover, validate, dry-run, approve.

The demo workflows are already checked in under `.formctl/workflows/`. Run `npm run formctl -- inspect <workflow-name> --json` to see required fields for `expense-report`, `admin-invite`, `support-refund`, `vendor-onboarding`, `procurement-approval`, `crm-update`, and `compliance-attestation`.

Use `--values <path>` when field flags would be hard to quote. Unknown JSON keys or unknown submit field flags are rejected as `field_values_invalid` before opening the browser.
Use `--storage-state <path>` to replay a protected form with a local Playwright storageState JSON file after the user has already logged in.
Storage state files can contain cookies and must stay local; do not commit or paste them into agent chat.
Use `--resume-after-interaction` only in a local interactive submit run after completing login, MFA, or CAPTCHA in the browser.

Interactive submit shows the `dry-run.png` screenshot path before asking you to type `approve`.

Run artifacts are written under `.formctl/runs/<run-id>/`:

- `summary.json`
- `field-diff.json`
- `audit.jsonl`
- `dry-run.png` for previews
- `post-submit.png` for approved submissions
- `failure.json` and `failure.png` for selector mismatches and interaction-required safe stops

Field diffs list the resolved values that will be set before submission, with file inputs redacted as `[file]`.
Audit logs record selector checks, redacted field values, approval source, screenshots, field diff paths, and final result.

Workflow files include safety metadata for dry-run first, required approval, selector drift failure, and file-input redaction.
Workflow names may contain only letters, numbers, dots, underscores, and dashes.
Run `formctl validate <workflow-name> --json` before reviewing or sharing workflow YAML.
Invalid workflow checks include `message` and `fix` fields so agents can report a concrete repair.
Unreadable workflow YAML returns a `readable-yaml` check with `message` and `fix` fields.
Validation rejects unredacted `recording.events` metadata when present.
Validation also rejects `recording.events` entries that do not match a known workflow field and selector.
Validation rejects duplicate workflow field names before any browser work.
Validation rejects reserved or unsafe workflow field names before any browser work.
Validation rejects unsupported workflow field types before any browser work.
Validation rejects missing or non-http workflow target URLs before any browser work.
Invalid workflow names return `invalid_workflow_name` in JSON mode.
Missing workflows return `workflow_not_found` in JSON mode.
Unreadable workflows return `workflow_unreadable` in JSON mode for inspect and submit.
Invalid workflows return `workflow_invalid` in JSON mode for inspect and submit.

## Create A New Workflow

Use `record` only when you need to create a workflow that does not exist yet.

```bash
formctl record expense-report https://example.internal/expense
formctl record expense-report https://example.internal/expense --manual
formctl record expense-report https://example.internal/expense --storage-state ./storage-state.json --headless
```

Use `--manual` when login, navigation, or form setup needs a human-visible browser before saving selectors.
Use `--storage-state <path>` with `record` or `submit` only after the user has completed login, MFA, or setup in a local browser session.
Manual recording stores redacted `recording.events` entries for changed fields and file inputs.
Manual recording labels text input as `input`, select controls as `select`, file inputs as `file`, named non-submit button clicks as `click`, and page navigation as `wait` so the YAML is easier to review.
When present, `submit` uses the first recorded event for each field to replay fields in the same order the human recorded them.
If terminal input closes before Enter, `record --manual` cancels without writing a workflow file.
Commit or share the generated `.formctl/workflows/<workflow-name>.yml` file so other users can start from `submit --dry-run`.
`record` also saves a baseline screenshot next to the workflow file.

## Commands

```bash
formctl submit <workflow-name> --dry-run [flags]
formctl submit <workflow-name> --approve [flags]
formctl submit <workflow-name> [flags]
formctl inspect <workflow-name> [--json]
formctl workflows [--json]
formctl validate <workflow-name> [--json]
formctl record <workflow-name> <url>
formctl doctor [--json]
```

## Browser mode defaults

- `record` defaults to `--headed` so humans can watch login and form discovery.
- `submit --dry-run` defaults to `--headless` for repeatable agent and CI previews.
- Use `--headed` or `--headless` to override the default for any browser-backed command.

Workflow files are stored at:

```text
.formctl/workflows/<workflow-name>.yml
```

## Safety Contract

- Dry-run never clicks the recorded submit selector.
- Real submission requires `--approve` or an interactive terminal confirmation.
- Recorded selectors must match exactly one element.
- Missing or ambiguous selectors fail before filling fields or submitting.
  Selector mismatch failures write `failure.json`, `failure.png`, and `audit.jsonl` without filling or submitting the form.
- Login, CAPTCHA, and MFA walls fail before filling fields or submitting.
  Interaction-required failures write `failure.json`, `failure.png`, and `audit.jsonl` with `interaction_required`, `captcha_required`, or `mfa_required`.
- File inputs are redacted as `[file]` in summaries.
- Audit logs are written for successful dry-run, approved, and selector-mismatch failed runs.
- JSON output is available for agent and automation callers.

## Exit codes

```text
0 success
1 user/input error
2 workflow not found
3 selector mismatch
4 dry-run failed
5 approval required
6 interaction required
10 unexpected runtime error
```

Dry-run browser runtime failures return `dry_run_failed` in JSON mode with `failure.json` and `audit.jsonl` artifacts.
Login, CAPTCHA, and MFA walls return `interaction_required`, `captcha_required`, or `mfa_required` in JSON mode with failure artifacts.

## Agent Usage

Agents should call `submit --dry-run --json` first, inspect the returned artifacts, and only use `--approve` when the user or policy explicitly allows submission.

See the [Agent safety guide](docs/agents.md) for Codex, Claude Code, Cursor, Copilot CLI, and other coding agents.

See [Why browser agents need form-specific CLIs](docs/WHY_FORM_CLIS.md) for JSON branching examples and the agent-specific rationale. See the [MCP setup guide](docs/MCP.md) for local-checkout and npm-based client configuration.

## MCP Server

`formctl-mcp` exposes the dry-run-safe parts of the CLI to MCP clients:

```bash
npx formctl-mcp
```

Tools:

- `formctl_doctor`
- `formctl_workflows`
- `formctl_inspect`
- `formctl_validate`
- `formctl_submit_dry_run`

The MCP server does not expose approved submit. Agents still need a human or policy-approved CLI call to run `formctl submit ... --approve`.

Approval-required JSON looks like:

```json
{
  "status": "error",
  "workflow": "expense-report",
  "exitCode": 5,
  "submitted": false,
  "requiresApproval": true,
  "error": {
    "code": "approval_required",
    "message": "Approval required: run with --dry-run to preview or --approve to submit."
  }
}
```

## Current Scope

This is an early MVP. It currently records named form fields and a submit selector from a live page. It detects common login, CAPTCHA, and MFA walls as safe stops, but does not bypass them. It does not yet implement full event-history recording, credential storage, hosted execution, or selector healing.
