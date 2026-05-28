# Changelog

## Unreleased

- Add a checked-in procurement approval demo workflow that proves bounded setup click replay.
- Replay bounded named setup clicks before field selector checks.
- Add multi-step recording guidance for bounded click/wait metadata boundaries.
- Record page navigation during manual recording as redacted `waitFor: navigation` metadata.
- Record named non-submit button clicks as redacted manual `click` events.
- Record manual select controls and file uploads as semantic `select` and `file` events.
- Reject `recording.events` entries that reference fields or selectors outside the workflow field list.
- Cancel `record --manual` without saving when the confirmation input closes before Enter.
- Replay manually recorded workflow fields in first-recorded event order when `recording.events` metadata is present.
- Require a real Enter keypress before `submit --resume-after-interaction` rechecks CAPTCHA or MFA safe stops.

## 0.1.1 - 2026-05-29

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
- Add a local CRM update demo fixture with pipeline stage, owner email, next contact date, priority flag, and notes.
- Add a local compliance attestation demo fixture with control area, attestation date, compliance checkbox, and notes.
- Add npm package build metadata, install docs, and tarball install verification.
- Add README trust-artifact screenshots for dry-run previews, selector mismatch failures, and audit logs.
- Add a 40-second README demo video built from the launch asset sequence.
- Add a workflow request guide and richer feature request intake for launch feedback.
- Add trust and comparison docs for dry-run, approval, audit logs, selector drift, and security boundaries.
- Add an agent-angle article with JSON branching examples for dry-run, approval-required, and selector-mismatch outcomes.
- Add before/after example posts for each local fixture workflow.
- Add a growth log baseline for the weekly 10k-star loop.
- Add an example-led posting queue for Reddit and direct outreach.
- Add a dry-run-safe MCP server binary, `formctl-mcp`, for agent clients.
- Add an MCP setup guide with local-checkout and npm client configuration snippets.
- Add the MCP wrapper test to CI so the agent-safe tool surface cannot regress unnoticed.
- Upgrade GitHub Actions checkout/setup-node steps to Node.js 24-target action versions.
- Add a manual GitHub Actions `workflow_dispatch` trigger for CI recovery when push runs are missing.
- Extend `doctor --json` with Playwright Chromium availability and install guidance.
- List individual checks in plain `formctl doctor` output for human first-run debugging.
- Add `exitCode` to `doctor --json` so agents can branch on doctor results without shell-specific handling.
- Document the `doctor --json` contract in the agent safety guide.
- Add `formctl --version` for installed-package smoke checks.
- Add a package smoke test that installs the local tarball and verifies installed CLI and MCP binaries.
- Add replay and package smoke commands to the launch checklist.
- Detect recorded field type drift before filling or submitting a workflow.
- Record field labels and detect label drift before filling or submitting a workflow.
- Record `aria-describedby` field descriptions and detect description drift before replay.
- Detect common login, CAPTCHA, and MFA walls as interaction-required safe stops before filling fields or submitting.
- Add `record` and `submit --storage-state <path>` for local authenticated-session handoff without storing credentials in workflow YAML.
- Add `submit --resume-after-interaction` for local interactive pause/resume after login, CAPTCHA, or MFA safe-stop detection.
- Broaden CAPTCHA/MFA safe-stop detection for human-verification and security-code challenge screens.

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
