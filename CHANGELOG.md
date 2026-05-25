# Changelog

## Unreleased

- Write `.formctl/runs/<run-id>/audit.jsonl` for successful dry-run and approved submissions.
- Expose the audit log path in run summaries and `submit --json` artifact output.
- Write `failure.json`, `failure.png`, and `audit.jsonl` for selector-mismatch failures before any field filling or submission.
- Add `docs/agents.md` with dry-run-first, approval-gated usage rules for coding agents.
- Support `select` and `checkbox` fields during submit replay.
- Add a local admin invite demo fixture for internal-tool workflows.
- Add a local support refund demo fixture with date and textarea fields.
- Add a local vendor onboarding demo fixture with file, select, checkbox, date, URL, and textarea fields.
- Add demo replay tests and a CI workflow that runs them on pull requests.
- Add browser mode defaults and `--headed`/`--headless` overrides for browser-backed commands.
- Add a local procurement approval demo fixture with an open modal, two visible steps, and a confirmation page.
- Add npm package build metadata, install docs, and tarball install verification.
- Add README trust-artifact screenshots for dry-run previews, selector mismatch failures, and audit logs.
- Add a 40-second README demo video built from the launch asset sequence.
- Add a workflow request guide and richer feature request intake for launch feedback.

## 0.1.0 - 2026-05-26

First public MVP release.

- Record live forms into `.formctl/workflows/<name>.yml`.
- Inspect recorded workflows with text or JSON output.
- Run `submit --dry-run` with screenshots and JSON summaries.
- Require `--approve` before clicking the recorded submit selector.
- Fail fast on missing or ambiguous selectors with exit code `3`.
- Return machine-readable JSON for dry-run success, approval-required failures, and selector mismatches.
- Include a local expense-report demo, README demo media, issue templates, launch checklist, and announcement draft.
- Publish the public GitHub MVP at https://github.com/codeyoma/formctl.
