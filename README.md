# formctl

formctl turns any browser form into a safe, repeatable CLI command.

Record once. Submit safely forever.

`formctl` is for developers, operators, and AI agents that need reliable automation for web forms with no useful API. It records a form workflow, stores it as reviewable YAML, previews changes with dry-run artifacts, and requires explicit approval before real submission.

```bash
formctl record expense-report https://example.internal/expense
formctl submit expense-report --amount 120000 --receipt ./receipt.txt --dry-run
formctl submit expense-report --amount 120000 --receipt ./receipt.txt --approve
```

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

Run artifacts are written under `.formctl/runs/<run-id>/`:

- `summary.json`
- `dry-run.png` for previews
- `post-submit.png` for approved submissions

## Commands

```bash
formctl record <workflow-name> <url>
formctl inspect <workflow-name> [--json]
formctl submit <workflow-name> --dry-run [flags]
formctl submit <workflow-name> --approve [flags]
formctl doctor [--json]
```

Workflow files are stored at:

```text
.formctl/workflows/<workflow-name>.yml
```

## Safety Contract

- Dry-run never clicks the recorded submit selector.
- Real submission requires `--approve`.
- Recorded selectors must match exactly one element.
- Missing or ambiguous selectors fail before filling fields or submitting.
- File inputs are redacted as `[file]` in summaries.
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
