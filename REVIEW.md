# formctl Review Log

This file stores decisions, experiments, failures, and growth lessons for `formctl`. Treat it as append-only. Do not rewrite old conclusions unless a later entry explicitly supersedes them.

## Current Hypothesis

Developers and AI agents need a safe CLI for web forms that have no useful API. The winning wedge is not "browser automation"; it is "reviewable, approval-gated form submission with dry-run screenshots and audit logs."

## Review Rules

- Append an entry after every meaningful task, launch attempt, user interview, or failed assumption.
- Include evidence: command output, screenshot path, user quote, metric, or reproduction step.
- Record what changed because of the evidence.
- Prefer short, concrete entries over polished narratives.
- Keep sensitive data out of this file.

## Metrics Snapshot

| Date | GitHub Stars | npm Downloads | Issues | Discussions | Demo Views | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 2026-05-25 | 0 | 0 | 0 | 0 | 0 | Project planning started. |

## Decision Log

### 2026-05-25: Start With A Local CLI, Not A Hosted Service

**Decision:** Build `formctl` as a local CLI first.

**Reasoning:** The sharpest initial audience is developers and agents already operating in terminal workflows. A hosted service adds auth, browser infrastructure, billing, and privacy concerns before the core value is proven.

**Revisit When:** Users repeatedly ask for scheduled runs, shared team audit logs, or cloud-hosted browser execution.

### 2026-05-25: Use Playwright As The Browser Engine

**Decision:** Use Playwright for recording, replay, screenshots, headed/headless execution, and fixture tests.

**Reasoning:** The product depends on reliable browser control. Playwright already handles the browser layer, so `formctl` can focus on workflow files, safety checks, CLI ergonomics, and auditability.

**Revisit When:** The implementation needs browser-extension-level recording that Playwright cannot capture cleanly.

### 2026-05-25: Detect Selector Breakage Before Healing It

**Decision:** The first release should fail clearly when selectors break instead of trying to auto-heal them.

**Reasoning:** Silent selector healing can submit the wrong form or fill the wrong field. Trust is more important than magic for this product.

**Revisit When:** The failure reports are clear, the fixture suite is strong, and users understand the approval model.

## Experiment Log

### 2026-05-25: Start The CLI With TDD

**Date:** 2026-05-25

**Experiment:** Build the first `formctl` CLI slice with strict RED/GREEN cycles.

**Hypothesis:** A small command surface can be locked down before browser recording work begins: `--help`, `doctor --json`, missing workflow handling, and workflow inspection.

**Result:** Passed. The project now has a TypeScript/Vitest test harness, a minimal CLI entrypoint, JSON doctor output, workflow-not-found exit code `2`, and `inspect --json` for `.formctl/workflows/<name>.yml`.

**Evidence:** RED failures were observed before each implementation: `--help` exited `1`, `doctor --json` exited `1`, missing workflow returned `1` instead of `2`, and `inspect --json` emitted text instead of JSON. Final checks passed with `npm test -- --run tests/cli.test.ts`, `npx tsc --noEmit`, `npm run formctl -- --help`, and `npm run formctl -- doctor --json`.

**Decision:** Continue with narrow TDD slices. The next useful slice is `record <workflow-name> <url>` against a local fixture page, then `submit --dry-run` without pressing the final submit button.

**Next Step:** Add a local fixture form and write the first failing Playwright-backed record test.

### 2026-05-25: Record A Live Fixture Form

**Date:** 2026-05-25

**Experiment:** Implement the first `record <workflow-name> <url>` slice against a local HTTP fixture form.

**Hypothesis:** `formctl record expense-report <url> --headless` can use Playwright to inspect a live form and write a reviewable `.formctl/workflows/expense-report.yml` file without implementing full interaction recording yet.

**Result:** Passed. The CLI now records named inputs and the submit selector from a live page into YAML, and the existing `inspect --json` command can read that workflow file.

**Evidence:** RED failure was observed first: `record` exited `1` because the command did not exist. Final checks passed with `npm test -- --run tests/cli.test.ts`, `npx tsc --noEmit`, `npm run formctl -- --help`, `npm run formctl -- doctor --json`, and a manual local-server smoke test that created `.formctl/workflows/expense-report.yml`.

**Decision:** Keep the first record implementation intentionally small. It captures form structure, not full user event history.

**Next Step:** Write the first failing `submit <workflow-name> --dry-run` test that fills the recorded form but does not trigger the submit button.

### 2026-05-25: Dry-Run A Recorded Workflow

**Date:** 2026-05-25

**Experiment:** Implement `submit <workflow-name> --dry-run` for a recorded workflow with a number input and file input.

**Hypothesis:** `formctl` can load `.formctl/workflows/<name>.yml`, fill fields from CLI flags, avoid the submit button, and leave enough artifacts to review the run.

**Result:** Passed. The CLI now fills recorded fields in Playwright, stores `.formctl/runs/<run-id>/summary.json`, captures `.formctl/runs/<run-id>/dry-run.png`, and leaves the fixture server's POST count at zero.

**Evidence:** RED failure was observed first: `submit --dry-run` exited `1` because the command did not exist. Final checks passed with `npm test -- --run tests/cli.test.ts`, `npx tsc --noEmit`, `npm run formctl -- --help`, `npm run formctl -- doctor --json`, and a manual smoke test showing `posts: 0`, a summary artifact, and a screenshot artifact.

**Decision:** Keep dry-run separate from real submission. The CLI should continue to make "not submitted" observable through both exit behavior and artifacts.

**Next Step:** Add an approval gate: `submit <workflow-name>` without `--dry-run` must return exit code `5`, while `--approve` performs the real submit and records a post-submit artifact.

### 2026-05-25: Add Approval-Gated Submission

**Date:** 2026-05-25

**Experiment:** Add the first real submission path behind an explicit `--approve` flag.

**Hypothesis:** `formctl submit <workflow-name>` should refuse to submit by default with exit code `5`, while `formctl submit <workflow-name> --approve` should fill the form, click the recorded submit selector, and store review artifacts.

**Result:** Passed. Unapproved submit exits `5` without creating run artifacts or sending POST. Approved submit sends exactly one POST in the fixture test, creates `.formctl/runs/<run-id>/summary.json`, and captures `.formctl/runs/<run-id>/post-submit.png`.

**Evidence:** RED failures were observed first: unapproved submit returned exit `1` instead of `5`, and approved submit returned exit `1` because it was not implemented. Final checks passed with `npm test -- --run tests/cli.test.ts`, `npx tsc --noEmit`, `npm run formctl -- --help`, `npm run formctl -- doctor --json`, and a manual smoke test showing blocked status `5`, approved status `0`, `posts: 1`, and post-submit artifacts.

**Decision:** Keep explicit `--approve` as the only non-interactive approval source for now. Interactive confirmation can come later after the machine-readable path is stable.

**Next Step:** Add selector breakage detection so missing or ambiguous recorded selectors fail with exit code `3` before filling or submitting.

### 2026-05-25: Detect Broken Or Ambiguous Selectors

**Date:** 2026-05-25

**Experiment:** Add selector breakage detection before dry-run or approved submit mutates the page.

**Hypothesis:** `formctl submit` should verify that every recorded field selector and submit selector resolves to exactly one element before filling fields or clicking submit.

**Result:** Passed. Missing field selectors and ambiguous field selectors now exit `3`, print a clear selector mismatch message, avoid POSTs, and avoid creating run artifacts.

**Evidence:** RED failure was observed first for a missing selector: the command eventually exited `1` after Playwright waited on `fill()` instead of failing fast with exit `3`. After adding preflight selector counts, the missing selector test passed quickly. The ambiguous selector regression test passed immediately because the same exactly-one-match rule covered both cases. Final checks passed with `npm test -- --run tests/cli.test.ts`, `npx tsc --noEmit`, and `npm run formctl -- doctor --json`.

**Decision:** Keep selector healing out of the MVP. Failing fast is safer than guessing a replacement selector.

**Next Step:** Add machine-readable `--json` output for `submit` success and selector mismatch failures so agents can branch on stable result fields.

### 2026-05-26: Add Submit JSON Output

**Date:** 2026-05-26

**Experiment:** Add machine-readable `--json` output for `submit` success and selector mismatch failures.

**Hypothesis:** Agents should be able to branch on stable JSON fields instead of parsing human output or stderr.

**Result:** Passed. `submit --dry-run --json` now emits JSON with `status`, `workflow`, `runId`, `exitCode`, `submitted`, `requiresApproval`, `fields`, and artifact paths. Selector mismatch with `--json` exits `3` and emits a structured error object on stdout while leaving stderr empty.

**Evidence:** RED failures were observed first: dry-run JSON parsing failed because stdout began with `Dry-run complete`, and selector mismatch JSON mode still wrote text to stderr. Final checks passed with `npm test -- --run tests/cli.test.ts`, `npx tsc --noEmit`, and `npm run formctl -- doctor --json`.

**Decision:** Keep JSON output compact and single-object-per-command for now. Streaming JSONL audit logs should be a separate feature.

**Next Step:** Add approval-required `--json` output for exit code `5`, then add a README and local demo instructions so the project can be evaluated by outside users.

### 2026-05-26: Add Approval-Required JSON Output

**Date:** 2026-05-26

**Experiment:** Add machine-readable output for approval-required submit failures.

**Hypothesis:** `formctl submit <workflow> --json` without `--dry-run` or `--approve` should let agents detect the approval gate from a stable JSON object and exit code `5`, without parsing stderr.

**Result:** Passed. Approval-required JSON now emits `status: "error"`, `exitCode: 5`, `submitted: false`, `requiresApproval: true`, and an `approval_required` error object on stdout while keeping stderr empty.

**Evidence:** RED failure was observed first: JSON mode still wrote the approval-required message to stderr. Final checks passed with `npm test -- --run tests/cli.test.ts`, `npx tsc --noEmit`, and `npm run formctl -- doctor --json`; the suite now has 13 passing tests.

**Decision:** The core agent-facing exit contract now covers success, selector mismatch, missing workflow, approval required, dry-run, and approved submit paths.

**Next Step:** Add a README with a 2-minute local demo path and CLI examples, then initialize git and prepare the repository for public GitHub release once docs and package metadata are credible.

### 2026-05-26: Add README And Local Demo Fixture

**Date:** 2026-05-26

**Experiment:** Add release-readiness docs and a local demo form that matches the README commands.

**Hypothesis:** A credible public repo needs a first-screen pitch, a two-minute demo path, clear exit codes, and a fixture that lets outside users verify record/dry-run/approve behavior locally.

**Result:** Passed. The repository now has `README.md`, `demo/expense-report.html`, `demo/receipt.txt`, `demo/server.mjs`, and `npm run demo`. A release-readiness test verifies that the README includes the core pitch, demo commands, and exit-code contract, and that the demo form has the fields used by the CLI examples.

**Evidence:** RED failure was observed first: `README.md` and `demo/expense-report.html` were missing. Final checks passed with `npm test -- --run tests/cli.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, `npm run formctl -- doctor --json`, and a smoke test that started `demo/server.mjs` and recorded `.formctl/workflows/expense-report.yml`.

**Decision:** The next release-readiness gap is repository metadata and packaging, not more CLI behavior.

**Next Step:** Initialize git, add package metadata suitable for public release, add `LICENSE`, then run final verification before creating/pushing the GitHub repository.

### 2026-05-26: Add Public Metadata And Initialize Git

**Date:** 2026-05-26

**Experiment:** Prepare the project for a public GitHub repository with package metadata, MIT license, and a real git history.

**Hypothesis:** Before publishing, the repo should have a public package identity, license, release-readiness tests, synchronized lockfile metadata, and an initial commit on `main`.

**Result:** Passed. `package.json` now includes public metadata for `codeyoma/formctl`, `LICENSE` uses MIT terms, `package-lock.json` is synchronized, and the directory is initialized as a git repository with an initial commit.

**Evidence:** RED failure was observed first: package metadata was still private and `LICENSE` was missing. Final checks passed with `npm test -- --run tests/cli.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, and `npm run formctl -- doctor --json`. Git was initialized with `main` and committed as `ca7b66e chore: prepare formctl MVP`.

**Decision:** The repo is close to publishable. The remaining blocker is remote creation/push and a final sanity check of GitHub-facing naming.

**Next Step:** Create the GitHub repository `codeyoma/formctl`, add it as `origin`, push `main`, then verify the public URL renders the README.

### 2026-05-26: Publish GitHub Repository

**Date:** 2026-05-26

**Experiment:** Publish the MVP as a public GitHub repository.

**Hypothesis:** The current MVP is credible enough to publish because it has a working record/dry-run/approve flow, JSON output for agents, selector mismatch protection, tests, README, local demo, license, and package metadata.

**Result:** Passed. The public repository `codeyoma/formctl` was created, `main` was pushed, and repository description/homepage/topics were configured.

**Evidence:** `gh repo create codeyoma/formctl --public --source=. --remote=origin --push` succeeded and set `main` to track `origin/main`. `gh repo view codeyoma/formctl` reports `visibility: PUBLIC`, URL `https://github.com/codeyoma/formctl`, description `Turn browser-recorded web forms into safe, repeatable CLI commands.`, and topics `agent`, `browser-automation`, `cli`, `forms`, `playwright`, `rpa`.

**Decision:** The project is now public. Next work should improve first-run polish and launch assets rather than adding broad scope.

**Next Step:** Add a GitHub issue template and a launch checklist, then capture a short demo GIF/video for README and social launch.

### 2026-05-26: Add Issue Templates And Launch Checklist

**Date:** 2026-05-26

**Experiment:** Add public repo operating assets for issue intake and launch execution.

**Hypothesis:** After publishing, the highest-leverage work is making feedback reproducible and launch work repeatable, not adding broad product scope.

**Result:** Passed. The repo now has GitHub issue templates for bug reports and feature requests plus `docs/LAUNCH.md` with verification, demo media, launch copy, first-500-star work, and the 10k-star loop.

**Evidence:** RED failure was observed first: `.github/ISSUE_TEMPLATE/bug_report.yml` and `docs/LAUNCH.md` were missing. Final checks passed with `npm test -- --run tests/cli.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, and `npm run formctl -- doctor --json`; the suite now has 19 passing tests.

**Decision:** The public repo is ready for early external feedback. The next blocker for launch quality is demo media, not more issue template detail.

**Next Step:** Capture a 30-60 second demo GIF/video and link it from the README, then run the launch checklist before posting.

### 2026-05-26: Add README Demo Media

**Date:** 2026-05-26

**Experiment:** Add a lightweight README demo visual that shows the core formctl flow.

**Hypothesis:** A public repo should show record, dry-run JSON, approval-required JSON, and approved submit above the fold so visitors understand the product before running commands.

**Result:** Passed. `README.md` now embeds `docs/assets/demo.svg`, and release-readiness tests verify that the asset contains the record, dry-run, approval gate, and approved-submit flow.

**Evidence:** RED failure was observed first: README did not link demo media and `docs/assets/demo.svg` was missing. Final checks passed with `npm test -- --run tests/cli.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, and `npm run formctl -- doctor --json`; the suite now has 20 passing tests.

**Decision:** The SVG is good enough as immediate README media. A recorded GIF/video can still replace or supplement it before broader launch.

**Next Step:** Run the launch checklist end-to-end and post the first public announcement, then track channel response in this review log.

### 2026-05-26: Prepare First Announcement

**Date:** 2026-05-26

**Experiment:** Prepare a first public announcement draft and run the launch checklist verification commands.

**Hypothesis:** The first announcement should ask for concrete API-less workflow feedback and point to the public GitHub repo, while the repo remains verifiably healthy.

**Result:** Passed. `docs/ANNOUNCEMENT.md` now includes a primary post, short post, feedback asks, and the verification commands used before launch.

**Evidence:** RED failure was observed first: `docs/ANNOUNCEMENT.md` was missing. Final checks passed with `npm test -- --run tests/cli.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, and `npm run formctl -- doctor --json`; the suite now has 21 passing tests.

**Decision:** The project has a publishable repo and announcement draft. Actual public posting should be tracked as a launch attempt with channel-specific results.

**Next Step:** Post the announcement to one focused developer channel, then append a `Launch Attempts` entry with stars, comments, clicks, installs, issues, or interviews.

### 2026-05-26: Cut v0.1.0 GitHub Release

**Date:** 2026-05-26

**Experiment:** Create the first public GitHub Release as the initial focused launch channel.

**Hypothesis:** A versioned GitHub Release gives the public repo a concrete launch artifact before posting to broader communities.

**Result:** Passed. Package metadata now says `0.1.0`, `CHANGELOG.md` documents the first public MVP, and GitHub Release `v0.1.0` is live.

**Evidence:** RED failure was observed first: package version was `0.0.0` and `CHANGELOG.md` was missing. Final checks passed with `npm test -- --run tests/cli.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, and `npm run formctl -- doctor --json`; the suite now has 22 passing tests. `gh release create v0.1.0 --title "formctl v0.1.0" --notes-file CHANGELOG.md` created https://github.com/codeyoma/formctl/releases/tag/v0.1.0.

**Decision:** Treat GitHub Releases as the first controlled launch channel. Broader community posts should link to the release or README after initial repo rendering is stable.

**Next Step:** Share the announcement draft to one external developer channel and measure stars, comments, clicks, issues, or interviews.

### 2026-05-26: Add Channel-Specific Outreach Tracker

**Date:** 2026-05-26

**Experiment:** Turn the generic announcement draft into channel-specific outreach copy and metrics.

**Hypothesis:** The fastest path to useful feedback is not another product feature; it is a repeatable outreach tracker that asks each audience for painful API-less workflows.

**Result:** Passed. `docs/OUTREACH.md` now defines Hacker News, Reddit r/commandline, Reddit r/LocalLLaMA, LinkedIn, and direct outreach copy, plus per-channel metrics for stars, comments, and workflow leads. A public GitHub tracking issue was created at https://github.com/codeyoma/formctl/issues/1.

**Evidence:** RED failure was observed first: the outreach tracker test failed because `docs/OUTREACH.md` did not exist. Final checks passed with `npm test -- --run tests/cli.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, and `npm run formctl -- doctor --json`; the suite now has 23 passing tests.

**Decision:** The next highest-value task is posting one prepared channel, then recording actual metrics instead of adding more launch documents.

**Next Step:** Post the Hacker News or Reddit r/commandline draft, update `docs/OUTREACH.md` with the posted URL and 24-hour metric baseline, and append the result under `Launch Attempts`.

### 2026-05-26: Add Successful Run Audit Logs

**Date:** 2026-05-26

**Experiment:** Add append-only `audit.jsonl` artifacts for successful dry-run and approved submit runs.

**Hypothesis:** Before broader launch, the product should back up its trust positioning with a machine-readable audit trail that records what was checked, redacted, previewed, and finally produced.

**Result:** Passed for successful runs. `submit --dry-run` and `submit --approve` now write `.formctl/runs/<run-id>/audit.jsonl`, and both `summary.json` and `submit --json` expose the audit artifact path.

**Evidence:** RED failure was observed first: the audit-log test failed with `ENOENT` because `audit.jsonl` did not exist. README readiness also failed until `audit.jsonl` was documented. Final checks passed with `npm test -- --run tests/cli.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, and `npm run formctl -- doctor --json`; the suite now has 24 passing tests.

**Decision:** Successful-run audit logs are enough to support the current README promise, but selector-mismatch failures still intentionally avoid creating run directories.

**Next Step:** Add failure audit artifacts for selector mismatch runs, including a failure screenshot and structured selector report, without making accidental submissions possible.

### 2026-05-26: Add Selector Mismatch Failure Artifacts

**Date:** 2026-05-26

**Experiment:** Preserve debugging evidence when selector preflight fails.

**Hypothesis:** Selector mismatch failures should be as reviewable as successful runs, while still failing before any field filling or submit click.

**Result:** Passed. Missing and ambiguous selector runs now create `.formctl/runs/<run-id>-failed/` with `failure.json`, `failure.png`, and `audit.jsonl`. JSON mode includes `runId` and artifact paths in the selector mismatch response.

**Evidence:** RED failure was observed first: selector mismatch tests failed because no run directory or JSON artifacts existed. Final checks passed with `npm test -- --run tests/cli.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, and `npm run formctl -- doctor --json`; the suite now has 24 passing tests.

**Decision:** The audit-log slice now covers successful runs and selector mismatch failures. Other runtime failures can get structured artifacts later after their failure modes are clearer.

**Next Step:** Add `docs/agents.md` with explicit safe-use rules for agents, then post one outreach channel using the existing launch copy.

### 2026-05-26: Add Agent Safety Guide

**Date:** 2026-05-26

**Experiment:** Document safe `formctl` usage for coding agents before broader outreach.

**Hypothesis:** Agent users need explicit rules more than generic README prose: dry-run first, inspect artifacts, branch on JSON, and never infer approval.

**Result:** Passed. `docs/agents.md` now covers Codex, Claude Code, Cursor, Copilot CLI, dry-run-first usage, approval gates, JSON branching, artifact inspection, selector mismatch failures, and secret handling. README links to the guide from Agent Usage.

**Evidence:** RED failure was observed first: the agent safety test failed because `docs/agents.md` was missing. Final checks passed with `npm test -- --run tests/cli.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, and `npm run formctl -- doctor --json`; the suite now has 25 passing tests.

**Decision:** The project now has enough agent safety guidance to support an agent-focused launch post.

**Next Step:** Post one prepared outreach channel, preferably Reddit r/LocalLLaMA or Reddit r/commandline, then record stars, comments, and workflow leads.

### 2026-05-26: Add Admin Invite Fixture

**Date:** 2026-05-26

**Experiment:** Add a second local demo workflow for internal-tool admin invites.

**Hypothesis:** A second fixture with a select field and checkbox makes the launch demo less expense-report-specific and proves `formctl` can handle common internal-tool controls.

**Result:** Passed. `demo/admin-invite.html` now covers email, role select, and notify checkbox fields. The demo server serves `/admin-invite` and `/admin-invite/submit`, README includes record and dry-run commands, and submit replay supports `select` and `checkbox` fields.

**Evidence:** RED failures were observed first: the CLI select/checkbox test exited `1`, README lacked admin-invite commands, and `demo/admin-invite.html` was missing. Final checks passed with `npm test -- --run tests/cli.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, `npm run formctl -- doctor --json`, and a local demo smoke test for admin-invite record, dry-run, and approved submit; the suite now has 26 passing tests.

**Decision:** Fixture coverage is broader but still not enough for Phase 3.1. Refund/vendor examples and richer patterns like modal, multi-step, date picker, and confirmation pages remain.

**Next Step:** Post one outreach channel using the agent/internal-tool angle, or add a support refund fixture if external posting is still unavailable.

### 2026-05-26: Add Support Refund Fixture

**Date:** 2026-05-26

**Experiment:** Add a third local workflow fixture for support refund requests.

**Hypothesis:** Refund requests are a clearer API-less admin workflow than another generic form, and date plus textarea fields broaden the replay coverage without adding risky external dependencies.

**Result:** Passed. `demo/support-refund.html` now covers order ID, refund date, and refund reason fields. The demo server serves `/support-refund` and `/support-refund/submit`, and README includes support-refund record and dry-run commands.

**Evidence:** RED failure was observed first: release-readiness failed because README lacked support-refund commands and `demo/support-refund.html` was missing. The textarea/date CLI test passed because the existing fill path already supports those controls. Final checks passed with `npm test -- --run tests/cli.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, `npm run formctl -- doctor --json`, and a local demo smoke test for support-refund record, dry-run, and approved submit; the suite now has 27 passing tests.

**Decision:** The demo set now covers expense reports, admin invites, and support refunds. Vendor onboarding remains the last Phase 3.1 fixture and should include richer multi-step or confirmation-page behavior.

**Next Step:** Post one outreach channel using the support-refund/internal-tool angle, or add a vendor onboarding fixture if external posting is still unavailable.

### 2026-05-26: Add Vendor Onboarding Fixture

**Date:** 2026-05-26

**Experiment:** Complete the Phase 3.1 fixture set with a vendor onboarding workflow.

**Hypothesis:** Vendor onboarding is a strong demo for API-less internal tools because it combines file upload, select, checkbox, date, URL, and notes fields in one workflow.

**Result:** Passed. `demo/vendor-onboarding.html` now covers legal name, website, tax form upload, risk tier, NDA checkbox, onboarding date, and notes. The demo server serves `/vendor-onboarding` and `/vendor-onboarding/submit`, README includes vendor-onboarding record and dry-run commands, and `demo/tax-form.txt` provides a local file input fixture.

**Evidence:** RED failure was observed first: release-readiness failed because README lacked vendor-onboarding commands and `demo/vendor-onboarding.html` was missing. Final checks passed with `npm test -- --run tests/cli.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, `npm run formctl -- doctor --json`, and a local demo smoke test for vendor-onboarding record, dry-run, and approved submit; the suite now has 27 passing tests.

**Decision:** The core fixture set is complete for Phase 3.1. Modal and true multi-step workflows remain separate reliability work because they need product behavior beyond static form replay.

**Next Step:** Add replay tests that load the committed fixture workflows or post one outreach channel with the four-fixture demo set.

### 2026-05-26: Add Demo Replay Tests And CI

**Date:** 2026-05-26

**Experiment:** Turn the four committed demo fixtures into regression tests.

**Hypothesis:** The demos should not only be launch assets; they should continuously prove record, dry-run, and approved submit behavior for the workflows used in outreach.

**Result:** Passed. `tests/demo-replay.test.ts` starts a local fixture server from committed demo HTML, records all four workflows, verifies dry-run sends zero POSTs, and verifies approved submit sends exactly one POST per workflow. `npm run test:replay` and `.github/workflows/ci.yml` now run the replay suite on pull requests.

**Evidence:** RED failure was observed first: release-readiness failed because `.github/workflows/ci.yml` was missing. Final checks passed with `npm test -- --run tests/cli.test.ts tests/release-readiness.test.ts`, `npm run test:replay`, `npx tsc --noEmit`, and `npm run formctl -- doctor --json`; the main suite has 28 passing tests and the replay suite has 1 passing test.

**Decision:** Phase 3.2 is complete enough for the current MVP. Future reliability work should target headed/headless defaults and richer modal or multi-step fixtures.

**Next Step:** Post one outreach channel with the four-fixture demo set, or implement headed/headless mode defaults if external posting remains unavailable.

### 2026-05-26: Support Headed And Headless Modes

**Date:** 2026-05-26

**Experiment:** Make browser execution defaults match human and agent workflows.

**Hypothesis:** `record` should default to a visible browser for human-guided setup, while `submit --dry-run` should default to headless because it needs no interactive approval. Explicit `--headed` and `--headless` flags should override those defaults.

**Result:** Passed. `src/browser-mode.ts` now centralizes mode selection, `record` defaults to headed, `submit --dry-run` defaults to headless, and the CLI help/README document both override flags.

**Evidence:** RED failures were observed first: the mode resolver module was missing, `submit --dry-run` without a mode flag wrote `headless: false` to the audit log, and README lacked browser mode default docs. Final checks passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/release-readiness.test.ts`, `npm run test:replay`, `npx tsc --noEmit`, `npm run formctl -- doctor --json`, and local fixture smoke checks for both `--headless` and `--headed` dry-runs.

**Decision:** Keep committed CI on headless browser paths and cover `--headed` through pure mode-resolution tests plus local smoke checks. Headed Playwright runs are useful for humans but brittle on Linux CI without a display server.

**Next Step:** Add a modal or multi-step fixture, or post the prepared outreach copy now that mode defaults are documented.

### 2026-05-26: Add Modal Multi-Step Fixture

**Date:** 2026-05-26

**Experiment:** Close the remaining fixture realism gap with a modal procurement approval workflow.

**Hypothesis:** A fixture with an open modal, two visible form steps, mixed field types, and a post-submit confirmation page will make the demo set broad enough for early launch conversations without requiring event-history recording yet.

**Result:** Passed. `demo/procurement-approval.html` adds an open `<dialog>` with two `data-step` sections, email/select/number/date/textarea/checkbox fields, and the demo server returns a "Procurement approved" confirmation page after approved submit. README and replay tests now cover the new workflow.

**Evidence:** RED failures were observed first: release-readiness and replay tests failed because `demo/procurement-approval.html` did not exist. Final checks passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/release-readiness.test.ts`, `npm run test:replay`, `npx tsc --noEmit`, `npm run formctl -- doctor --json`, and a local demo smoke test for procurement record, dry-run, and approved submit.

**Decision:** Keep this fixture as an open modal with visible steps. Hidden wizard steps would require recorded click/navigation events, which is a larger product feature than fixture coverage.

**Next Step:** Move to distribution work, starting with local npm package verification and install docs, or post one prepared outreach channel.

### 2026-05-26: Prepare npm Package Install Path

**Date:** 2026-05-26

**Experiment:** Make the package installable as a real npm CLI before attempting registry publish.

**Hypothesis:** `formctl` needs a built `dist/cli.js` binary, `bin` metadata, install docs, and a tarball install smoke test before `npm publish` is credible.

**Result:** Partially passed. The local package now builds with `npm run build`, exposes `bin.formctl`, includes package files for dist/demo/docs, and README documents `npm install -g formctl`, `npx formctl --help`, and `npx formctl doctor`. A tarball installed into a clean prefix runs `formctl --help`, `formctl doctor --json`, and the packaged demo record/dry-run path.

**Evidence:** RED failures were observed first: package-readiness failed because `bin` was missing, `tsconfig.build.json` did not exist, README lacked install docs, and `src/cli.ts` had no shebang. CI readiness also failed until package-readiness and `npm run build` were included. Final checks passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npm run test:replay`, `npm run build`, `npx tsc --noEmit`, `npm run formctl -- doctor --json`, `npm pack --pack-destination ... --json`, `npm publish --dry-run`, tarball install smoke, and `npm exec --package <tarball> -- formctl --help`.

**What Failed:** `npm view formctl` returned `E404`, so the name appears available, but `npm whoami` returned `ENEEDAUTH`. Actual registry publish is blocked until npm auth is configured.

**Decision:** Do not invent a scoped fallback yet because the desired unscoped name appears available. Keep publish unchecked until an authenticated npm session is available.

**Next Step:** Authenticate npm and run `npm publish`, or post one prepared outreach channel while npm publishing is pending.

### Template

**Date:** YYYY-MM-DD

**Experiment:** One sentence describing what was tried.

**Hypothesis:** What we expected to happen.

**Result:** What actually happened.

**Evidence:** Link, command, screenshot path, metric, or quote.

**Decision:** Continue, change, or stop.

**Next Step:** The next concrete action.

---

## Failure Log

### 2026-05-25: Synchronous CLI Spawn Blocked The Fixture Server

**Date:** 2026-05-25

**Failure:** The first Playwright-backed record test hung until `page.goto` timed out.

**Impact:** It looked like a product bug even though the local fixture server was the problem.

**Root Cause:** The test used `spawnSync` while the fixture HTTP server was running in the same Vitest process. `spawnSync` blocked the event loop, so the server could not answer Playwright's request.

**Fix:** Use async `spawn` for tests that need the fixture HTTP server to respond.

**Verification:** The same record test passed after switching only that path to async process execution.

### Template

**Date:** YYYY-MM-DD

**Failure:** What broke or failed to convince users.

**Impact:** Who was affected and why it mattered.

**Root Cause:** The smallest explanation that fits the evidence.

**Fix:** The concrete change made or planned.

**Verification:** How we know the fix worked.

---

## User Interview Notes

### Template

**Date:** YYYY-MM-DD

**User Type:** Developer, operator, founder, AI-agent user, QA engineer, or other.

**Workflow Pain:** The form workflow they want automated.

**Current Workaround:** Manual process, browser macro, Playwright script, RPA, spreadsheet, or other.

**Trust Barrier:** What would stop them from using `formctl`.

**Quote:** A short non-sensitive quote.

**Product Implication:** What should change in product, docs, or positioning.

---

## Launch Attempts

### 2026-05-26: GitHub Release v0.1.0

**Date:** 2026-05-26

**Channel:** GitHub Release

**Message:** First public MVP release: record live forms, dry-run with artifacts, require approval for submit, fail on selector drift, and expose JSON output for agents.

**Result:** Release created at https://github.com/codeyoma/formctl/releases/tag/v0.1.0. Initial metrics not yet measured after publication.

**What Worked:** The repo already had README demo media, release-readiness tests, changelog, issue templates, and a launch announcement draft, so creating a release was low friction.

**What Failed:** This is not yet a discovery channel by itself; it needs one external post or direct outreach to generate feedback.

**Next Iteration:** Post the prepared announcement to one focused developer channel and record response metrics.

### 2026-05-26: GitHub Issue Launch Outreach Tracker

**Date:** 2026-05-26

**Channel:** GitHub Issue

**Message:** Public checklist for the first developer outreach channels, with the primary ask: share painful API-less workflows that should become safe, repeatable CLI commands.

**Result:** Issue created at https://github.com/codeyoma/formctl/issues/1. No external discovery metrics yet; this is an execution tracker for the next launch posts.

**What Worked:** The issue turns launch work into a public checklist and links it to the v0.1.0 release and outreach tracker.

**What Failed:** A GitHub issue is still not an audience channel. It does not replace posting to Hacker News, Reddit, LinkedIn, or direct outreach.

**Next Iteration:** Use the prepared `docs/OUTREACH.md` copy to post one channel and record stars before, stars after 24 hours, comments, and workflow leads.

### Template

**Date:** YYYY-MM-DD

**Channel:** GitHub, Hacker News, Reddit, X, LinkedIn, Discord, newsletter, blog, or direct outreach.

**Message:** The exact launch angle used.

**Result:** Stars, comments, clicks, installs, issues, or interviews.

**What Worked:** Specific phrasing, demo, example, or audience.

**What Failed:** Specific confusion, objection, or ignored claim.

**Next Iteration:** The next message or demo change.

---

## Weekly Review

### Template

**Week Ending:** YYYY-MM-DD

**Metrics:** Stars, downloads, issues, discussions, demo views.

**Most Useful Feedback:** The highest-signal thing learned this week.

**Biggest Risk:** The most likely reason the project will stall.

**Shipped:** What changed in product, docs, examples, or launch assets.

**Next Week Focus:** One narrow priority.

---

## Open Questions

- Is the strongest first audience AI-agent users, ops teams, QA engineers, or internal-tool developers?
- Is "web forms as CLI commands" clearer than "safe browser form automation"?
- Should the first public demo use expense reports, admin invites, refunds, or vendor onboarding?
- How much recording should happen automatically versus through explicit user annotation?
- What artifact best earns trust: screenshot diff, audit log, workflow YAML, or replay test?
