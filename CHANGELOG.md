# Changelog

## Unreleased

- Write `.formctl/runs/<run-id>/audit.jsonl` for successful dry-run and approved submissions.
- Expose the audit log path in run summaries and `submit --json` artifact output.

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
