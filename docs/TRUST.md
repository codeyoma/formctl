# Trust And Security Notes

`formctl` is designed for local, reviewable browser form automation. It turns a recorded workflow into a CLI command, but keeps the risky step, real submission, behind explicit approval.

## Dry-run

Dry-run fills the recorded form fields, writes review artifacts, and stops before the recorded submit selector is clicked.

```bash
formctl submit expense-report --amount 120000 --receipt ./receipt.txt --dry-run --json
```

Dry-run artifacts are written under `.formctl/runs/<run-id>/`:

- `summary.json`
- `field-diff.json`
- `audit.jsonl`
- `dry-run.png`

Use these artifacts to review the target page, field values, and selector checks before deciding whether a real submission is allowed.
Use `field-diff.json` to review the exact resolved field values before approval.

## Approval gate

Approved submit is the only non-interactive path that clicks the recorded submit selector.

```bash
formctl submit expense-report --amount 120000 --receipt ./receipt.txt --approve --json
```

In an interactive terminal, `formctl submit` without `--dry-run` or `--approve` first writes a `dry-run.png` screenshot and prints its path. It only clicks the recorded submit selector after the user types `approve`.

In non-interactive or JSON mode, running `submit` without `--dry-run` or `--approve` exits with code `5`. Treat that as an approval gate, not a retryable failure.

## Audit logs

Each dry-run, approved submit, and selector mismatch writes `audit.jsonl` inside the run directory. The log records selector checks, redacted field summaries, approval source, artifact paths, and final result.

Audit logs are local files. Review them before sharing because screenshots and page metadata can still contain private business context.

## Interaction-required safe stops

If the loaded page appears to require login, CAPTCHA, or MFA, `formctl` stops before filling fields or submitting. In JSON mode it returns `interaction_required`, `captcha_required`, or `mfa_required` with exit code `6` and writes:

- `failure.json`
- `failure.png`
- `audit.jsonl`

`formctl` does not bypass these controls. Complete the required step in a headed browser or provide a valid local session before retrying.

## Selector breakage

Recorded selectors must match exactly one element before `formctl` fills any fields or submits the form.

If a selector is missing or ambiguous, `formctl` stops with exit code `3` and writes:

- `failure.json`
- `failure.png`
- `audit.jsonl`

`formctl` does not silently heal selectors. A broken selector is a review event, not an automatic repair.

## Secret handling

`formctl` does not store credentials in workflow files. Use existing browser sessions, environment variables, or an external secret manager.

File inputs are summarized as `[file]` in JSON and audit output. Do not paste screenshots, audit logs, cookies, private URLs, or production data into public issues without review.

## What formctl does not do

- `formctl` does not store credentials.
- `formctl` does not bypass authentication, MFA, permissions, robots restrictions, or site terms.
- `formctl` does not solve CAPTCHA.
- `formctl` does not silently heal selectors after page drift.
- `formctl` does not encrypt local artifacts.
- `formctl` does not guarantee that a third-party site allows automation.
- `formctl` does not replace human approval for irreversible actions.

The intended first release scope is local developer and agent workflows where the operator has permission to use the target form and can review artifacts before submission.
