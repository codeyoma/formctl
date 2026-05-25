# formctl

formctl turns any browser form into a safe, repeatable CLI command.

Record once. Submit safely forever.

`formctl` is for developers, operators, and AI agents that need reliable automation for web forms with no useful API. It records a form workflow, stores it as reviewable YAML, previews changes with dry-run artifacts, and requires explicit approval before real submission.

```bash
formctl record expense-report https://example.internal/expense
formctl submit expense-report --amount 120000 --receipt ./receipt.txt --dry-run
formctl submit expense-report --amount 120000 --receipt ./receipt.txt --approve
```

![formctl demo](docs/assets/demo.svg)

## Two-Minute Local Demo

Install dependencies:

```bash
npm install
```

Start the local demo form in one terminal:

```bash
npm run demo
```

In another terminal, record the form:

```bash
npm run formctl -- record expense-report http://127.0.0.1:4173/expense --headless
```

Preview a submission without sending the form:

```bash
npm run formctl -- submit expense-report --amount 120000 --receipt demo/receipt.txt --dry-run --json --headless
```

Submit only after explicit approval:

```bash
npm run formctl -- submit expense-report --amount 120000 --approve --json --headless
```

Try a second fixture with a select field and checkbox:

```bash
npm run formctl -- record admin-invite http://127.0.0.1:4173/admin-invite --headless
npm run formctl -- submit admin-invite --email ops@example.com --role admin --notify true --dry-run --json --headless
```

Try a support refund fixture with a date input and textarea:

```bash
npm run formctl -- record support-refund http://127.0.0.1:4173/support-refund --headless
npm run formctl -- submit support-refund --orderId ORD-1001 --refundDate 2026-05-26 --reason "Duplicate charge" --dry-run --json --headless
```

Try a vendor onboarding fixture with file upload, select, checkbox, date, and notes:

```bash
npm run formctl -- record vendor-onboarding http://127.0.0.1:4173/vendor-onboarding --headless
npm run formctl -- submit vendor-onboarding --legalName "Acme Supplies" --website https://vendor.example --taxForm demo/tax-form.txt --riskTier medium --ndaSigned true --onboardingDate 2026-05-26 --notes "Approved vendor" --dry-run --json --headless
```

Run artifacts are written under `.formctl/runs/<run-id>/`:

- `summary.json`
- `audit.jsonl`
- `dry-run.png` for previews
- `post-submit.png` for approved submissions
- `failure.json` and `failure.png` for selector mismatches

Audit logs record selector checks, redacted field values, approval source, screenshots, and final result.

## Commands

```bash
formctl record <workflow-name> <url>
formctl inspect <workflow-name> [--json]
formctl submit <workflow-name> --dry-run [flags]
formctl submit <workflow-name> --approve [flags]
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
- Real submission requires `--approve`.
- Recorded selectors must match exactly one element.
- Missing or ambiguous selectors fail before filling fields or submitting.
  Selector mismatch failures write `failure.json`, `failure.png`, and `audit.jsonl` without filling or submitting the form.
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
10 unexpected runtime error
```

## Agent Usage

Agents should call `submit --dry-run --json` first, inspect the returned artifacts, and only use `--approve` when the user or policy explicitly allows submission.

See the [Agent safety guide](docs/agents.md) for Codex, Claude Code, Cursor, Copilot CLI, and other coding agents.

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

This is an early MVP. It currently records named form fields and a submit selector from a live page. It does not yet implement full event-history recording, credential storage, CAPTCHA handling, hosted execution, or selector healing.
