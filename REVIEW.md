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
| 2026-05-27 | 0 | 0 | 1 | 0 | 0 | GitHub repo public; npm package still unpublished because `npm whoami` returns `ENEEDAUTH`. |

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

### 2026-05-26: Add Trust Artifact Launch Screenshots

**Date:** 2026-05-26

**Experiment:** Improve the GitHub first impression with visual proof of the core trust contract.

**Hypothesis:** Readers evaluating an automation CLI need to see the dry-run preview, selector mismatch failure, and audit log before they trust the README claim.

**Result:** Passed. README now includes a `Trust Artifacts` section with SVG screenshot cards for dry-run JSON, selector mismatch JSON, and `audit.jsonl` events.

**Evidence:** RED failure was observed first: release-readiness failed because `docs/assets/dry-run-preview.svg` did not exist. Final checks passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npm run test:replay`, `npm run build`, `npx tsc --noEmit`, and `npm run formctl -- doctor --json`.

**Decision:** Use static SVG screenshot cards for now because they are reviewable in git and render reliably in README. A 30-60 second GIF or video is still useful before broader outreach.

**Next Step:** Capture or generate the short GIF/video, then post one prepared outreach channel and record which asset drives engagement.

### 2026-05-26: Add 40-Second Demo Video

**Date:** 2026-05-26

**Experiment:** Add a short README video asset that can be reused in social launch posts.

**Hypothesis:** A 30-60 second video stitched from the existing demo and trust-artifact screens is enough to communicate the product loop without requiring a manual screen recording session.

**Result:** Passed. `docs/assets/demo.mp4` is a 40-second video covering the core CLI flow, dry-run preview, selector mismatch failure, and audit log. README links it directly below the primary demo image.

**Evidence:** RED failure was observed first: release-readiness failed because `docs/assets/demo.mp4` did not exist. Final checks passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npm run test:replay`, `npm run build`, `npx tsc --noEmit`, `npm run formctl -- doctor --json`, and `ffprobe`/release-readiness duration checks showing a 40-second MP4. Playwright also rendered each source SVG frame at 1120x540 before ffmpeg assembly.

**What Failed:** The first ffmpeg generation attempt failed because the temporary frame directory variable was not exported into the Node renderer process. Re-running with `export VIDEO_TMP` fixed it.

**Decision:** Keep the video as MP4 rather than GIF to avoid a large binary. The README still has static SVGs for quick scanning.

**Next Step:** Post one prepared outreach channel and record which README asset gets mentioned or clicked.

### 2026-05-26: Prepare Workflow Request Intake

**Date:** 2026-05-26

**Experiment:** Make early launch feedback easier to turn into fixture examples.

**Hypothesis:** Outreach should ask for specific painful API-less workflows, but users need a concrete template that filters out vague requests and avoids private data.

**Result:** Passed. `docs/WORKFLOW_REQUESTS.md` now asks for the painful workflow, current workaround, trust barrier, expected CLI command, and fixture permission. README, OUTREACH, ANNOUNCEMENT, and the GitHub feature request template now point users toward the same intake shape.

**Evidence:** RED failures were observed first: release-readiness failed because the outreach tracker did not link the workflow request guide and `docs/WORKFLOW_REQUESTS.md` did not exist. A second RED check failed until the announcement draft referenced the guide. Final checks passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npm run test:replay`, `npm run build`, `npx tsc --noEmit`, and `npm run formctl -- doctor --json`.

**Decision:** Keep actual external posting blocked until a human-authenticated account posts to Hacker News, Reddit, LinkedIn, or direct outreach. The repo is now ready to collect useful workflow leads once posted.

**Next Step:** Post one prepared outreach channel, record the posted URL and 24-hour metrics, then turn the best workflow request into the next fixture.

### 2026-05-26: Add Trust And Comparison Docs

**Date:** 2026-05-26

**Experiment:** Make security and positioning questions answerable with docs instead of ad hoc explanations.

**Hypothesis:** Before broader outreach, `formctl` should directly answer the predictable objections: whether dry-run truly avoids submit, whether approval is mandatory, what audit logs contain, what happens on selector drift, how secrets are handled, and how this differs from raw Playwright scripts, browser agents, and RPA.

**Result:** Passed. `docs/TRUST.md` now documents dry-run, approval gates, audit logs, selector breakage, secret handling, and what `formctl` does not do. `docs/COMPARISON.md` positions `formctl` against raw Playwright scripts, browser agents, and RPA. README, launch checklist, and announcement copy link to both docs.

**Evidence:** RED failure was observed first: release-readiness failed because `docs/TRUST.md` was missing. Focused GREEN passed with `npm test -- --run tests/release-readiness.test.ts -t "trust and comparison"`. Full checks passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npm run test:replay`, `npm run build`, `npx tsc --noEmit`, `npm run formctl -- doctor --json`, and `npm pack --dry-run --json`.

**Decision:** Keep trust claims conservative. The docs should say what the MVP does and does not do, especially that it does not store credentials, bypass authentication, solve CAPTCHA, silently heal selectors, encrypt local artifacts, or replace human approval.

**Next Step:** Use these docs in the first external outreach reply path, then record which objections still come up after readers see them.

### 2026-05-26: Add Agent Angle Article

**Date:** 2026-05-26

**Experiment:** Turn the agent positioning into a public article-style doc with concrete JSON branch examples.

**Hypothesis:** Agent users need a sharper reason to use `formctl`: browser agents are useful for exploration, but known form submissions should become commands with dry-run, approval, selector drift stops, and audit artifacts.

**Result:** Passed. `docs/WHY_FORM_CLIS.md` now explains why form-specific CLIs matter for browser agents and includes JSON examples for dry-run success, approval-required exit `5`, and selector-mismatch exit `3`. README, announcement, and outreach docs link to it.

**Evidence:** RED failure was observed first: release-readiness failed because `docs/WHY_FORM_CLIS.md` was missing. Focused GREEN passed with `npm test -- --run tests/release-readiness.test.ts -t "agent angle"`. Full checks passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npm run test:replay`, `npm run build`, `npx tsc --noEmit`, `npm run formctl -- doctor --json`, and `npm pack --dry-run --json`.

**What Failed:** The first GREEN attempt failed because the article wrapped `formctl` in backticks while the release-readiness test expected the positioning sentence as plain text. The doc was adjusted so the launch phrase can be searched and quoted directly.

**Decision:** Keep MCP work out of scope until real agent users validate the CLI shape. The current blocker is not more integration surface; it is getting at least three agent users to run the CLI on real workflows.

**Next Step:** Use the agent article in Reddit r/LocalLLaMA or direct outreach, then record agent-specific blockers and workflow leads.

### 2026-05-26: Add CRM Update Fixture

**Date:** 2026-05-26

**Experiment:** Add a CRM update demo as the next local example for API-less internal tools.

**Hypothesis:** A CRM account update fixture broadens the demo set beyond finance/procurement/vendor workflows and gives outreach readers another common "no useful API" form to map onto their own work.

**Result:** Passed. `demo/crm-update.html` now covers account name, pipeline stage, owner email, next contact date, priority flag, notes, and approved submit routing. README includes record and dry-run commands, and replay tests cover record, dry-run without submit, and approved submit exactly once.

**Evidence:** RED failures were observed first: release-readiness and replay both failed because `demo/crm-update.html` was missing. Focused GREEN passed with `npm test -- --run tests/release-readiness.test.ts -t "demo fixture"` and `npm run test:replay`. Full checks passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npm run test:replay`, `npm run build`, `npx tsc --noEmit`, `npm run formctl -- doctor --json`, and `npm pack --dry-run --json`.

**Decision:** Keep examples local and mock-backed. This avoids legal, credential, and site-permission issues while still showing realistic internal-tool workflows.

**Next Step:** Add the compliance attestation fixture, then write before/after posts for CRM update and compliance attestation.

### 2026-05-26: Add Compliance Attestation Fixture

**Date:** 2026-05-26

**Experiment:** Complete the initial example set with a compliance attestation workflow.

**Hypothesis:** Compliance attestations are a strong `formctl` demo because they are repetitive, approval-sensitive, audit-friendly, and often live inside API-less internal tools.

**Result:** Passed. `demo/compliance-attestation.html` now covers employee email, control area, attestation date, compliance checkbox, and notes. README includes record and dry-run commands, and replay tests cover record, dry-run without submit, and approved submit exactly once.

**Evidence:** RED failures were observed first: release-readiness and replay both failed because `demo/compliance-attestation.html` was missing. Focused GREEN passed with `npm test -- --run tests/release-readiness.test.ts -t "demo fixture"` and `npm run test:replay`. Full checks passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npm run test:replay`, `npm run build`, `npx tsc --noEmit`, `npm run formctl -- doctor --json`, and `npm pack --dry-run --json`.

**Decision:** The initial local example set now covers expense reports, admin invites, refund requests, vendor onboarding, procurement approval, CRM update, and compliance attestation. The next growth task should turn these into before/after posts instead of adding more fixtures.

**Next Step:** Write short before/after posts for CRM update and compliance attestation, then use them in outreach or repo docs.

### 2026-05-26: Add Before And After Example Posts

**Date:** 2026-05-26

**Experiment:** Turn the local fixture set into short outreach-ready before/after posts.

**Hypothesis:** Example fixtures are more useful for launch if each one has a compact story that contrasts the manual browser workflow with the `formctl submit ... --dry-run --json` and `--approve` path.

**Result:** Passed. `docs/EXAMPLE_POSTS.md` now includes before/after posts for expense report, admin invite, support refund, vendor onboarding, procurement approval, CRM update, and compliance attestation. README, announcement, and outreach docs link to the example posts.

**Evidence:** RED failure was observed first: release-readiness failed because `docs/EXAMPLE_POSTS.md` was missing. Focused GREEN passed with `npm test -- --run tests/release-readiness.test.ts -t "example before"`. Full checks passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npm run test:replay`, `npm run build`, `npx tsc --noEmit`, `npm run formctl -- doctor --json`, and `npm pack --dry-run --json`.

**Decision:** The next useful growth step is not another fixture. Use the prepared example posts in one external channel or direct outreach and start measuring which workflow produces useful replies.

**Next Step:** Post one example-led outreach message, or if external posting remains blocked, add a lightweight `docs/GROWTH_LOG.md` baseline for weekly star/download/lead tracking.

### 2026-05-26: Add Growth Log Baseline

**Date:** 2026-05-26

**Experiment:** Start the weekly 10k-star loop with a measured baseline before any external post.

**Hypothesis:** If outreach remains blocked by human-authenticated accounts, the next best move is to make growth tracking explicit so future posts can record stars, forks, issues, npm publish status, demo views, workflow leads, and positioning changes in one place.

**Result:** Passed. `docs/GROWTH_LOG.md` now records the baseline: 0 GitHub stars, 0 forks, 1 open issue, npm package not published because `npm view formctl` returns `E404`, demo views not measured, and 0 workflow leads. README, launch checklist, and outreach docs link to it.

**Evidence:** RED failure was observed first: release-readiness failed because `docs/GROWTH_LOG.md` was missing. The baseline metrics came from `gh api repos/codeyoma/formctl`, `gh issue list --repo codeyoma/formctl --state open`, and `npm view formctl version --json`. Focused GREEN passed with `npm test -- --run tests/release-readiness.test.ts -t "growth log"`. Full checks passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npm run test:replay`, `npm run build`, `npx tsc --noEmit`, `npm run formctl -- doctor --json`, and `npm pack --dry-run --json`.

**What Failed:** The first GREEN attempt failed because the log had the lower-level `gh api` command but not the easier `gh repo view codeyoma/formctl` command expected by the readiness test. The source commands now include both.

**Decision:** Keep growth logging in `docs/GROWTH_LOG.md` and keep detailed implementation lessons in `REVIEW.md`. This keeps distribution metrics separate from engineering experiments.

**Next Step:** Post one example-led outreach message, then update `docs/GROWTH_LOG.md` with the posted URL and 24-hour metrics.

### 2026-05-26: Add Example-Led Posting Queue

**Date:** 2026-05-26

**Experiment:** Prepare a single next posting queue that a human can publish without reworking the launch copy.

**Hypothesis:** Since npm publish still fails with `ENEEDAUTH` and external communities require human-authenticated accounts, the highest-leverage automated step is to remove ambiguity from the first example-led post.

**Result:** Passed. `docs/POSTING_QUEUE.md` now has a first post candidate for Reddit r/commandline, an agent-oriented Reddit r/LocalLLaMA variant, direct outreach copy, posted URL placeholders, and 24-hour follow-up steps for `docs/GROWTH_LOG.md`, `docs/OUTREACH.md`, and `REVIEW.md`.

**Evidence:** RED failure was observed first: release-readiness failed because `docs/POSTING_QUEUE.md` was missing. Focused GREEN passed with `npm test -- --run tests/release-readiness.test.ts -t "posting queue"`. `npm whoami` still returns `ENEEDAUTH`, confirming publish is blocked until npm auth is configured. Full checks passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npm run test:replay`, `npm run build`, `npx tsc --noEmit`, `npm run formctl -- doctor --json`, and `npm pack --dry-run --json`.

**Decision:** Treat posting as a human action. The repository now has the copy and tracking path ready; automation should not pretend that a GitHub issue comment is an external audience channel.

**Next Step:** A human should post the Reddit r/commandline candidate, then record the posted URL and 24-hour metrics.

### 2026-05-26: Add Dry-Run-Safe MCP Wrapper

**Date:** 2026-05-26

**Experiment:** Add the smallest MCP wrapper that makes `formctl` discoverable to agent clients without exposing approved submission.

**Hypothesis:** Since external posting and npm publish still require human-authenticated accounts, the best product improvement for agent users is a safe MCP surface that exposes doctor, inspect, and dry-run submit while keeping real submission behind the CLI approval path.

**Result:** Passed. `formctl-mcp` now starts an MCP stdio server with `formctl_doctor`, `formctl_inspect`, and `formctl_submit_dry_run`. The dry-run tool builds `submit --dry-run --json --headless` arguments and rejects reserved field names such as `approve`.

**Evidence:** RED was observed first in `tests/mcp.test.ts`: package metadata did not expose `formctl-mcp`, tool definitions were empty, and CLI argument generation returned `[]`. Focused GREEN passed with `npm test -- --run tests/mcp.test.ts`. An MCP SDK client smoke test listed the three tools from `dist/mcp.js` and successfully called `formctl_doctor`. Full checks passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npm run test:replay`, `npm run build`, `npx tsc --noEmit`, `npm run formctl -- doctor --json`, and `npm pack --dry-run --json`.

**What Failed:** The first semantic GREEN attempt still failed because the safe tool definition did not include the literal `dry-run` wording expected by the test. The description now says the submit tool is a dry-run.

**Decision:** Keep MCP narrow until real users ask for more. Approved submit should stay outside MCP because it needs explicit human or policy authorization.

**Next Step:** Add an MCP client snippet to outreach if agent users ask how to wire `formctl-mcp`, or return to human posting/npm publish once credentials are available.

### 2026-05-26: Add MCP Setup Guide

**Date:** 2026-05-26

**Experiment:** Make `formctl-mcp` usable from a generic MCP stdio client without requiring npm publish first.

**Hypothesis:** Since npm publish is still blocked by `ENEEDAUTH`, agent users need a local-checkout MCP setup path now and an `npx formctl-mcp` setup path later.

**Result:** Passed. `docs/MCP.md` now includes local checkout config with `node dist/mcp.js`, post-publish config with `npx formctl-mcp`, the exposed tool list, the approval boundary, and an MCP SDK smoke test.

**Evidence:** RED failure was observed first: `npm test -- --run tests/release-readiness.test.ts -t "MCP setup guide"` failed because `docs/MCP.md` did not exist. Focused GREEN passed after adding the guide and links from README, `docs/agents.md`, `docs/OUTREACH.md`, and `docs/POSTING_QUEUE.md`.

**Decision:** Keep the guide generic to MCP stdio clients instead of claiming support for a specific client configuration that may drift.

**Next Step:** If agent users ask for a named client, add a tested client-specific snippet after verifying that client's current config format.

### 2026-05-26: Add MCP Test To CI

**Date:** 2026-05-26

**Experiment:** Close the CI gap introduced by adding `tests/mcp.test.ts`.

**Hypothesis:** If the MCP wrapper is part of the agent safety promise, CI must run its test suite separately so tool exposure and reserved-flag guards cannot regress unnoticed.

**Result:** Passed. `.github/workflows/ci.yml` now runs `npm test -- --run tests/mcp.test.ts` after the existing release-readiness suite.

**Evidence:** RED failure was observed first: `npm test -- --run tests/release-readiness.test.ts -t "CI runs"` failed because `.github/workflows/ci.yml` did not contain `tests/mcp.test.ts`. Focused GREEN passed after adding the CI step.

**Decision:** Keep the MCP CI step separate from the browser-backed suite so it is easy to identify MCP contract failures in GitHub Actions logs.

**Next Step:** Watch the next GitHub Actions run after push; if startup time becomes noisy, merge the MCP test into the main vitest invocation later.

### 2026-05-26: Opt CI Into Node 24 Action Runtime

**Date:** 2026-05-26

**Experiment:** Remove the GitHub Actions warning about JavaScript actions still running on Node.js 20.

**Hypothesis:** Setting `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"` at workflow scope should opt `actions/checkout@v4` and `actions/setup-node@v4` into the Node.js 24 action runtime without changing the project test Node version.

**Result:** Partial. `.github/workflows/ci.yml` set the opt-in env var at workflow scope while keeping the test matrix on Node 22, and the pushed CI run passed, but GitHub still emitted an annotation because the v4 actions target Node.js 20 and were only being forced onto Node.js 24.

**Evidence:** RED failure was observed first: `npm test -- --run tests/release-readiness.test.ts -t "CI runs"` failed because the CI workflow did not contain `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"`. Focused GREEN passed after adding the env var.

**Decision:** The workflow-scope opt-in is not enough to remove the annotation. The next change should upgrade the action versions themselves.

**Next Step:** Upgrade `actions/checkout` and `actions/setup-node` to versions whose action metadata uses `node24`.

### 2026-05-26: Upgrade CI Actions To Node 24 Targets

**Date:** 2026-05-26

**Experiment:** Remove the remaining GitHub Actions Node.js 20 annotation by upgrading action versions instead of forcing the runtime.

**Hypothesis:** Since `actions/checkout@v5` and `actions/setup-node@v5` both declare `using: node24` in `action.yml`, switching from v4 to v5 should remove the target-Node.js-20 annotation while keeping the project test runtime on Node 22.

**Result:** Passed. `.github/workflows/ci.yml` now uses `actions/checkout@v5` and `actions/setup-node@v5`, and the `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` env var was removed. The pushed GitHub Actions run completed without the previous Node.js 20 annotation.

**Evidence:** RED failure was observed first: `npm test -- --run tests/release-readiness.test.ts -t "CI runs"` failed because CI still used `actions/checkout@v4`, `actions/setup-node@v4`, and the force env var. GitHub API checks confirmed both v5 action metadata files declare `using: node24`. Focused GREEN passed after upgrading both actions. Push verification passed with GitHub Actions run `26424059093`.

**Decision:** Use v5 instead of v6 for now because it is the smallest major-version move that targets Node 24.

**Next Step:** Return to first-run reliability, human posting, or npm publish once credentials are available.

### 2026-05-26: Add Playwright Chromium Doctor Check

**Date:** 2026-05-26

**Experiment:** Catch missing Playwright Chromium before users or agents try browser-backed `record` and `submit` commands.

**Hypothesis:** `formctl doctor --json` should report the Playwright Chromium executable path and the exact install command so first-run failures are diagnosable before a workflow run starts.

**Result:** Passed. `doctor --json` now includes a `playwright-chromium` check with `executablePath` and `installCommand`, exits `1` if that browser is missing, and README install docs explain `npx playwright install chromium`.

**Evidence:** RED failures were observed first: the focused CLI test failed because doctor checks only included `node` and `workspace`, and the package-readiness test failed because README did not document the Chromium check or install command. Focused GREEN passed with `npm test -- --run tests/cli.test.ts -t "doctor --json"` and `npm test -- --run tests/package-readiness.test.ts -t "README documents"`. Full checks passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npm run test:replay`, `npm run build`, `npx tsc --noEmit`, `npm run formctl -- doctor --json`, MCP SDK smoke, `npm pack --dry-run --json`, and `git diff --check`. `npm whoami` still returns `ENEEDAUTH`, so npm publish remains blocked until login.

**Decision:** Check the Chromium executable path without launching a browser. This keeps doctor fast while still catching the most common first-run setup failure.

**Next Step:** Use the richer doctor output in support replies and npm install troubleshooting once publishing credentials are available.

### 2026-05-26: Add Human-Readable Doctor Details

**Date:** 2026-05-26

**Experiment:** Make plain `formctl doctor` useful without requiring users to know about `--json`.

**Hypothesis:** First-run debugging should show every check name and relevant browser path in the default output, because a new user is more likely to paste plain doctor output into an issue or support thread.

**Result:** Passed. Plain `formctl doctor` now prints the overall status plus individual `node`, `workspace`, and `playwright-chromium` check lines, including the Chromium executable path when available.

**Evidence:** RED failure was observed first: `npm test -- --run tests/cli.test.ts -t "doctor prints"` failed because stdout was only `formctl doctor: ok`. Focused GREEN passed after listing the checks in plain output. Full checks passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npm run test:replay`, `npm run build`, `npx tsc --noEmit`, `npm run formctl -- doctor`, `npm run formctl -- doctor --json`, `npm pack --dry-run --json`, and `git diff --check`. `npm whoami` still returns `ENEEDAUTH`, so npm publish remains blocked until login.

**Decision:** Keep JSON output unchanged for agents and make only the human output more descriptive.

**Next Step:** If support requests show missing-browser confusion, add a fixture or environment override test for the error output path.

### 2026-05-26: Add Doctor JSON Exit Code

**Date:** 2026-05-26

**Experiment:** Make `doctor --json` easier for agents to branch on by including the same numeric exit code that the process returns.

**Hypothesis:** Agent callers should not need shell-specific process-status plumbing to understand whether doctor passed or failed; the JSON payload should include `exitCode`.

**Result:** Passed. `doctor --json` now returns `exitCode: 0` on success and uses the same computed exit code as the process return value. A missing-browser test also locks the existing `PLAYWRIGHT_BROWSERS_PATH` failure path and install guidance.

**Evidence:** RED failure was observed first: `npm test -- --run tests/cli.test.ts -t "doctor --json reports"` failed because the payload did not include `exitCode`. Focused GREEN passed after adding the field. The missing-browser characterization test passed immediately because the previous doctor implementation already handled a missing Playwright browser path. Full checks passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npm run test:replay`, `npm run build`, `npx tsc --noEmit`, `npm run formctl -- doctor`, `npm run formctl -- doctor --json`, `npm pack --dry-run --json`, and `git diff --check`. `npm whoami` still returns `ENEEDAUTH`, so npm publish remains blocked until login.

**Decision:** Keep the process exit code and JSON `exitCode` derived from the same local variable to avoid drift.

**Next Step:** Consider documenting the doctor JSON schema in `docs/agents.md` if agent users start consuming the doctor result directly.

### 2026-05-26: Document Doctor JSON For Agents

**Date:** 2026-05-26

**Experiment:** Turn the new `doctor --json` contract into copy-pasteable agent guidance.

**Hypothesis:** Agents should run doctor before browser-backed work and branch on `exitCode` and the `playwright-chromium` check before attempting `record` or `submit`.

**Result:** Passed. `docs/agents.md` now starts the default flow with `formctl doctor --json`, includes a Doctor JSON example with `exitCode`, `playwright-chromium`, `executablePath`, and `installCommand`, and tells agents to stop and run the returned install command if Chromium is missing.

**Evidence:** RED failure was observed first: `npm test -- --run tests/release-readiness.test.ts -t "agent safety"` failed because the guide did not mention `formctl doctor --json` or the Doctor JSON schema. Focused GREEN passed after adding the guide section. Full checks passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npm run test:replay`, `npm run build`, `npx tsc --noEmit`, `npm run formctl -- doctor`, `npm run formctl -- doctor --json`, `npm pack --dry-run --json`, and `git diff --check`. `npm whoami` still returns `ENEEDAUTH`, so npm publish remains blocked until login.

**Decision:** Keep the schema in `docs/agents.md` instead of duplicating it across README and MCP docs until a generated schema exists.

**Next Step:** If named MCP clients ask for direct doctor branching examples, add client-specific snippets to `docs/MCP.md`.

### 2026-05-26: Add CLI Version Flag

**Date:** 2026-05-26

**Experiment:** Add a standard `formctl --version` path for npm-installed smoke checks.

**Hypothesis:** New users and package installers expect a CLI to expose its installed version before they run browser-backed commands.

**Result:** Passed. `formctl --version` now prints `formctl <package-version>`, `--help` lists the flag, and README install smoke commands include `npx formctl --version`.

**Evidence:** RED failures were observed first: `npm test -- --run tests/cli.test.ts -t "version flag"` failed because `--version` exited `1`, and `npm test -- --run tests/package-readiness.test.ts -t "README documents"` failed because README did not include `npx formctl --version`. Focused GREEN passed after reading the package version from `package.json` and updating README. Full checks passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npm run test:replay`, `npm run build`, `npx tsc --noEmit`, `npm run formctl -- --version`, `npm run formctl -- --help`, `npm run formctl -- doctor --json`, `npm pack --dry-run --json`, and `git diff --check`. `npm whoami` still returns `ENEEDAUTH`, so npm publish remains blocked until login.

**What Failed:** The first RED command used `-t "--version"`, which Vitest treated as an option-like missing pattern. The test name was changed to `version flag prints the package version` before rerunning RED.

**Decision:** Read `package.json` relative to the CLI module so the same code works from `src/cli.ts` under `tsx` and from `dist/cli.js` after packaging.

**Next Step:** Include `formctl --version` in any future tarball install smoke scripts or release checklist.

### 2026-05-26: Add Tarball Package Smoke

**Date:** 2026-05-26

**Experiment:** Turn the manual npm tarball install smoke into a repeatable `npm run test:package` check.

**Hypothesis:** A local tarball smoke catches npm-bin and packaged-runtime breakages that source-level tests miss, especially after adding `formctl --version` and `formctl-mcp`.

**Result:** Passed. `scripts/package-smoke.mjs` now packs the project, installs the tarball into a temporary global prefix, verifies installed `formctl --version`, `formctl --help`, `formctl doctor --json`, and connects to installed `formctl-mcp` with an MCP client. CI now runs `npm run test:package`.

**Evidence:** RED failures were observed first: `npm test -- --run tests/package-readiness.test.ts -t "package metadata"` failed because `test:package` and `scripts/package-smoke.mjs` did not exist, and `npm test -- --run tests/release-readiness.test.ts -t "CI runs"` failed because CI did not run `npm run test:package`. Focused GREEN passed after adding the script and CI step. Full checks passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npm run test:replay`, `npm run test:package`, `npm run build`, `npx tsc --noEmit`, `npm run formctl -- --version`, `npm run formctl -- doctor --json`, `npm pack --dry-run --json`, and `git diff --check`. `npm whoami` still returns `ENEEDAUTH`, so npm publish remains blocked until login.

**What Failed:** The first package smoke exposed a real packaged-bin bug: installed `formctl-mcp` exited immediately because the entrypoint guard compared the npm bin symlink path to `dist/mcp.js`. Resolving both sides with `realpathSync` fixed the installed binary while preserving direct `node dist/mcp.js` execution.

**Decision:** Keep package smoke as a separate npm script and CI step because it is slower and covers a different failure class than Vitest.

**Next Step:** Add `npm run test:package` to release checklist docs if the release process gets formalized further.

### 2026-05-26: Add Package Smoke To Launch Checklist

**Date:** 2026-05-26

**Experiment:** Make the release checklist match the current CI and packaging verification path.

**Hypothesis:** Launch docs should require both fixture replay and tarball package smoke so a human release run cannot skip the checks most likely to catch browser-flow or npm-bin breakage.

**Result:** Passed. `docs/LAUNCH.md` now includes `npm run test:replay` and `npm run test:package` in pre-launch verification.

**Evidence:** RED failure was observed first: `npm test -- --run tests/release-readiness.test.ts -t "launch checklist"` failed because `docs/LAUNCH.md` did not include `npm run test:replay`. Focused GREEN passed after adding replay and package smoke commands. Verification passed with `npm test -- --run tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npm run test:package`, `npm run build`, `npx tsc --noEmit`, and `git diff --check`. `npm whoami` still returns `ENEEDAUTH`, so npm publish remains blocked until login.

**Decision:** Keep launch verification aligned with CI. The checklist should be boring and operational, not a marketing checklist.

**Next Step:** Once npm auth is available, run the checklist end-to-end before publishing.

### 2026-05-26: Detect Recorded Field Type Drift

**Date:** 2026-05-26

**Experiment:** Treat a recorded field type change as selector drift before replay fills the page.

**Hypothesis:** If a workflow recorded `type: number` but the live page now exposes the same selector as `type="text"`, `formctl submit --dry-run --json` should exit `3`, avoid POSTs, and save failure artifacts.

**Result:** Passed. Field preflight now compares recorded field types against the current DOM type after the selector resolves to exactly one element. Type drift returns the existing `selector_mismatch` exit contract with `expectedType` and `actualType`.

**Evidence:** RED was observed with `npm test -- --run tests/cli.test.ts -t "recorded field type changed"`: the command returned exit `0` instead of `3`. GREEN passed with the same focused command. Broader verification passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npm run test:replay`, `npm run test:package`, `npm run build`, `npx tsc --noEmit`, `npm run formctl -- doctor --json`, `npm pack --dry-run --json`, and `git diff --check`. `npm whoami` still returns `ENEEDAUTH`, so npm publish remains blocked until login.

**Decision:** Keep type drift under `selector_mismatch` because it is the same safety boundary: the recorded workflow no longer matches the live page strongly enough to replay.

**Next Step:** Add label or nearby visible-text comparison for fields so Task 1.5 covers semantic drift, not just selector count and field type.

### 2026-05-26: Record And Check Field Labels

**Date:** 2026-05-26

**Experiment:** Capture field labels during `record` and treat label changes as selector drift during `submit`.

**Hypothesis:** A selector can still point to exactly one input while the page meaning changed. Storing a human-visible label gives `formctl` a cheap semantic guardrail before replay.

**Result:** Passed. Recorded workflows now include labels when native labels or `aria-label` are available. Submit preflight compares recorded labels against the current DOM label and exits `3` with `expectedLabel` and `actualLabel` when they differ.

**Evidence:** RED was observed with `npm test -- --run tests/cli.test.ts -t "record creates a workflow file"` because record omitted `label`. A second RED was observed with `npm test -- --run tests/cli.test.ts -t "recorded field label changed"` because submit returned exit `0` instead of `3`. Focused GREEN passed with `npm test -- --run tests/cli.test.ts -t "recorded field label changed|record creates a workflow file"`. Broader verification passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npm run test:replay`, `npm run test:package`, `npm run build`, `npx tsc --noEmit`, `npm run formctl -- doctor --json`, `npm pack --dry-run --json`, and `git diff --check`. `npm whoami` still returns `ENEEDAUTH`, so npm publish remains blocked until login.

**Decision:** Keep label drift under `selector_mismatch` rather than inventing a separate exit code; the workflow no longer matches the live page.

**Next Step:** Add nearby visible-text comparison only if it can be made deterministic enough to avoid noisy false positives.

### 2026-05-26: Check Associated Field Descriptions

**Date:** 2026-05-26

**Experiment:** Capture `aria-describedby` text during `record` and treat description changes as selector drift during `submit`.

**Hypothesis:** `aria-describedby` is the safest first version of nearby visible-text drift detection because it is explicitly associated with the field and avoids scraping arbitrary surrounding copy.

**Result:** Passed. Recorded workflows now include `description` when a field points to visible text through `aria-describedby`. Submit preflight compares recorded descriptions against the current DOM description and exits `3` with `expectedDescription` and `actualDescription` when they differ.

**Evidence:** RED was observed with `npm test -- --run tests/cli.test.ts -t "record creates a workflow file|recorded field description changed"`: record omitted `description`, and submit returned exit `0` for changed description text. Focused GREEN passed with the same command. Broader verification passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npm run test:replay`, `npm run test:package`, `npm run build`, `npx tsc --noEmit`, `npm run formctl -- doctor --json`, `npm pack --dry-run --json`, and `git diff --check`. `npm whoami` still returns `ENEEDAUTH`, so npm publish remains blocked until login.

**Decision:** Do not scrape arbitrary nearby text in v0. It is too likely to create false positives from layout or copy changes. Prefer explicit field associations first.

**Next Step:** Move Task 1.5 to done and return to growth/distribution work: npm auth/publish if available, otherwise one outreach channel from `docs/OUTREACH.md`.

### 2026-05-27: Add Manual CI Dispatch

**Date:** 2026-05-27

**Experiment:** Add `workflow_dispatch` to the CI workflow after a pushed commit did not produce a GitHub Actions run.

**Hypothesis:** Push triggers are still the default path, but a manual dispatch trigger gives maintainers a recovery path for verifying `main` when GitHub does not create a push run.

**Result:** Local change passed. CI can now be manually triggered from GitHub Actions or with `gh workflow run`.

**Evidence:** RED was observed with `npm test -- --run tests/release-readiness.test.ts -t "CI runs"` because `.github/workflows/ci.yml` did not contain `workflow_dispatch:`. Focused GREEN passed after adding the trigger.

**Decision:** Keep the existing push and pull request triggers, and add manual dispatch as an operational fallback rather than replacing automatic CI.

**Next Step:** Push this workflow change, then use the new manual trigger to verify the latest `main` commit if the push trigger is still missing.

### 2026-05-27: Sync Task Plan With Shipped MVP

**Date:** 2026-05-27

**Experiment:** Update `TASK.md` so public checklist state matches behavior already covered by tests and docs.

**Hypothesis:** A public repo loses credibility when shipped core behavior still appears unchecked, but the checklist must not overclaim unimplemented interactive approval or full event recording.

**Result:** Passed. The task plan now marks scaffold, dry-run, approved submit, and JSON output work as complete while leaving the remaining interactive approval prompt and broader recording ambitions open.

**Evidence:** RED was observed with `npm test -- --run tests/release-readiness.test.ts -t "TASK plan"` because `TASK.md` still listed shipped MVP work as incomplete. Focused GREEN passed after updating only verified checklist items.

**Decision:** Treat `TASK.md` as public product state, not only an internal scratchpad. Future shipped slices should update it in the same commit as code or docs.

**Next Step:** Return to growth/distribution work: npm auth/publish if credentials are available, otherwise execute the first outreach channel from `docs/OUTREACH.md`.

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

### 2026-05-26: DOM Label Type Narrowing Failed Typecheck

**Date:** 2026-05-26

**Failure:** The label implementation passed runtime tests but `npx tsc --noEmit` failed on `element.labels` because TypeScript did not narrow the DOM type from `"labels" in element`.

**Impact:** The package would not build even though Playwright could execute the browser code.

**Root Cause:** The DOM callback receives a broad `Element` type, and `Array.from(element.labels ?? [])` was inferred from `{}`/`unknown`.

**Fix:** Use an explicit erased type assertion inside the browser callback: `Element & { labels?: NodeListOf<HTMLLabelElement> | null }`.

**Verification:** `npx tsc --noEmit` passed after the type assertion, and the focused label tests still passed.

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

### 2026-05-26: Make The Demo Submit-First

**Date:** 2026-05-26

**Experiment:** Remove the first-run requirement to record demo workflows before using the CLI.

**Hypothesis:** New users should be able to start from `submit --dry-run` when a workflow file already exists, and `record` should read as a workflow-authoring step rather than the default user path.

**Result:** Passed. The repository now includes ready-to-run demo workflow files under `.formctl/workflows/`, package metadata includes those workflows, help text starts with dry-run and approve commands, and README/demo copy explains that `record` is only needed to create a missing workflow.

**Evidence:** RED failures were observed first: help text still led with the old phrasing, package metadata did not include `.formctl/workflows`, demo replay still called `record`, and the README/demo asset still described recording as the first step. Focused GREEN passed with `npm test -- --run tests/cli.test.ts tests/package-readiness.test.ts tests/demo-replay.test.ts tests/release-readiness.test.ts`.

**Decision:** Keep `record` in the product, but present it as workflow setup for one maintainer. The everyday path is: receive a workflow file, run `submit --dry-run`, inspect artifacts, then use `--approve` only after review.

**Next Step:** If users still miss the checked-in workflow path, add a small `formctl workflows` listing command or a clearer workflow-not-found recovery message.

### 2026-05-27: Add Interactive Approval Preview

**Date:** 2026-05-27

**Experiment:** Finish the remaining approval UX gap by letting a real TTY submit path show the dry-run screenshot before asking for explicit approval.

**Hypothesis:** Human interactive submit can be safer than a blind prompt if it first fills the form, saves `dry-run.png`, prints that path, and only clicks submit after the user types `approve`. Non-interactive and `--json` callers should keep the existing exit-code-5 approval gate.

**Result:** Passed. `submit` now accepts injected stdin for testability, prompts only when stdin is TTY-like, writes `dry-run.png` before the prompt, records `approval: "interactive"` after approval, and preserves the existing `--approve` and non-interactive JSON contracts.

**Evidence:** RED was observed with `npm test -- --run tests/cli.test.ts -t "interactive approval"`: the test failed because no `.formctl/runs` directory was created. Help/readiness RED checks also failed until the interactive behavior was documented. Final checks passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npm run test:replay`, `npm run test:package`, `npm run build`, `npx tsc --noEmit`, `npm run formctl -- --help`, `npm run formctl -- doctor --json`, `npm pack --dry-run --json`, and `git diff --check`.

**What Failed:** Importing `run` for the first RED exposed that `src/cli.ts` still executed at module import time. The CLI now uses a realpath-based direct-run guard so tests and installed symlinked binaries both work.

**Decision:** Keep interactive approval human-only. `--json` and non-TTY callers should continue to fail closed with exit code `5`; MCP remains dry-run-only.

**Next Step:** npm publish still needs an authenticated registry session; `npm whoami` returns `ENEEDAUTH`.

### 2026-05-27: Save Baseline Screenshot During Record

**Date:** 2026-05-27

**Experiment:** Add a baseline screenshot artifact to newly recorded workflows.

**Hypothesis:** A workflow file is easier to review in git when it points to the page state that was recorded, not only selectors and field names. A baseline screenshot also gives agents a stable artifact path from `inspect --json`.

**Result:** Passed. `record` now writes `.formctl/workflows/<workflow>.baseline.png`, stores that path under `screenshots.baseline` in the workflow YAML, prints the baseline path, and `inspect --json` returns `screenshots` when the workflow has them.

**Evidence:** RED was observed with `npm test -- --run tests/cli.test.ts -t "record creates"` because the baseline path was missing from stdout and no PNG was written. A second RED was observed with `npm test -- --run tests/cli.test.ts -t "inspect --json"` because screenshot metadata was not returned. Focused GREEN passed for both, and README readiness passed after documenting the artifact.

**Decision:** Keep the baseline screenshot as a local workflow-adjacent artifact for now. Broader safety settings and full event-history recording remain separate tasks.

**Next Step:** Add explicit workflow `safety` metadata only when it gates real runtime behavior instead of being decorative YAML.

### 2026-05-27: Add Workflow Discovery Command

**Date:** 2026-05-27

**Experiment:** Add a `formctl workflows --json` command for the submit-first path.

**Hypothesis:** If users start from checked-in workflows, they need a first command that discovers available names without reading the filesystem. Agents also need the same list in stable JSON before choosing `inspect` or `submit --dry-run`.

**Result:** Passed. `workflows --json` now lists `.formctl/workflows/*.yml` and `.yaml` files in sorted order with workflow name, path, URL, field count, and optional screenshot metadata. Human output prints a compact workflow list or an empty-state message.

**Evidence:** RED was observed with `npm test -- --run tests/cli.test.ts -t "workflows --json|help explains"` because the command was unknown and help did not mention it. A second RED was observed in release-readiness until README, TASK, and agent guidance taught the discovery command. Focused GREEN passed for both command behavior and docs.

**Decision:** Keep this as a read-only local discovery command. It does not mutate workflows, run browsers, or expose approval paths.

**Next Step:** If users ask for workflow editing, add validation or repair commands before adding any write-oriented workflow manager.

### 2026-05-27: Add Workflow Safety Metadata

**Date:** 2026-05-27

**Experiment:** Add explicit `safety` metadata to recorded and checked-in workflow YAML.

**Hypothesis:** Safety metadata is worth adding only when it reflects behavior already enforced at runtime: dry-run first, explicit approval, selector drift failure, and file-input redaction.

**Result:** Passed. `record` now writes a `safety` block, `inspect --json` returns it when present, README/TASK describe the contract, and every checked-in demo workflow carries the same metadata for package users.

**Evidence:** RED was observed with `npm test -- --run tests/cli.test.ts -t "inspect --json|record creates"` because `inspect` and `record` omitted `safety`. A second RED was observed with `npm test -- --run tests/package-readiness.test.ts -t "ready-to-run demo workflows"` because checked-in workflows lacked the block. Focused GREEN passed after adding the runtime and fixture changes. Broader verification passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, `git diff --check`, `npm run test:replay`, `npm run test:package`, `npm run build`, `npm run formctl -- workflows --json`, `npm run formctl -- inspect expense-report --json`, `npm run formctl -- doctor --json`, and `npm pack --dry-run --json`. `npm whoami` still returns `ENEEDAUTH`, so npm publish remains blocked until login.

**Decision:** Keep the metadata descriptive and conservative. It should mirror enforced gates, not imply selector healing or policy controls that do not exist yet.

**Next Step:** Finish the remaining workflow-format checklist by either marking readable YAML storage as shipped with a release-readiness test or adding a small workflow validator if users need stricter review guarantees.

### 2026-05-27: Add Workflow Validation

**Date:** 2026-05-27

**Experiment:** Add `formctl validate <workflow-name> [--json]` as a static review gate for workflow YAML.

**Hypothesis:** A lightweight validator makes workflow files safer to review in pull requests without introducing selector healing or browser-side mutation.

**Result:** Passed. `validate --json` now checks readable YAML, workflow name, target URL, field shape, submit selector, and safety metadata. The command exits `0` for reviewable workflows and `1` for invalid workflow content. Help, README, TASK, and the agent guide now teach the command.

**Evidence:** RED was observed with `npm test -- --run tests/cli.test.ts -t "help explains|validate --json"` because `validate` was unknown and help omitted it. Release-readiness RED also failed until README, TASK, and `docs/agents.md` documented the review gate. Focused GREEN passed with `npm test -- --run tests/cli.test.ts tests/release-readiness.test.ts -t "help explains|validate --json|README explains|TASK plan|agent safety"`. Package-readiness RED then required the installed-package smoke to exercise `validate`; `npm run test:package` passed after adding that installed-binary check. Broader verification passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, `git diff --check`, `npm run test:replay`, `npm run test:package`, `npm run build`, `npm run formctl -- validate expense-report --json`, `npm run formctl -- doctor --json`, and `npm pack --dry-run --json`. `npm whoami` still returns `ENEEDAUTH`, so npm publish remains blocked until login.

**Decision:** Keep `validate` static for now. Runtime selector drift remains the job of `submit --dry-run`; `validate` should only answer whether the committed YAML follows the current reviewable contract.

**Next Step:** If validation errors become common, add human-readable repair guidance before adding any command that rewrites workflow files.

### 2026-05-27: Expose Workflow Validation In MCP

**Date:** 2026-05-27

**Experiment:** Add `formctl_validate` to the safe MCP server surface.

**Hypothesis:** Agent clients should be able to run the same static workflow review gate as the CLI before inspecting or dry-running a checked-in workflow.

**Result:** Passed. MCP tool definitions now include `formctl_validate`, the wrapper maps it to `formctl validate <workflow> --json`, README/agent/MCP docs list it, and package smoke confirms the installed MCP binary exposes the tool.

**Evidence:** RED was observed with `npm test -- --run tests/mcp.test.ts` because docs and tool definitions omitted `formctl_validate`, and `buildFormctlArgsForTool` rejected it. A release-readiness RED was observed with `npm test -- --run tests/release-readiness.test.ts -t "MCP setup"` until `docs/MCP.md` taught the safe flow. Package-readiness RED then required `scripts/package-smoke.mjs` to assert the installed MCP server exposes `formctl_validate`; `npm run test:package` passed after adding that check. Broader verification passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, `git diff --check`, `npm run test:replay`, `npm run test:package`, `npm run build`, `npm run formctl -- validate expense-report --json`, `npm run formctl -- doctor --json`, and `npm pack --dry-run --json`. `npm whoami` still returns `ENEEDAUTH`, so npm publish remains blocked until login.

**Decision:** Keep MCP write surface dry-run-only. `formctl_validate` is safe because it reads a workflow file and returns JSON validation results; approved submit remains CLI-only.

**Next Step:** Add `formctl_workflows` to MCP only if agent clients need discovery without shelling out to the CLI.

### 2026-05-27: Expose Workflow Discovery In MCP

**Date:** 2026-05-27

**Experiment:** Add `formctl_workflows` to the safe MCP server surface.

**Hypothesis:** MCP clients should be able to discover available workflow names before choosing `formctl_validate`, `formctl_inspect`, or `formctl_submit_dry_run`.

**Result:** Passed. MCP tool definitions now include `formctl_workflows`, the wrapper maps it to `formctl workflows --json`, README/agent/MCP docs list it, and package smoke confirms the installed MCP binary exposes the tool.

**Evidence:** RED was observed with `npm test -- --run tests/mcp.test.ts` because docs and tool definitions omitted `formctl_workflows`, and `buildFormctlArgsForTool` rejected it. A release-readiness RED was observed with `npm test -- --run tests/release-readiness.test.ts -t "MCP setup"` until `docs/MCP.md` taught discovery before validation. Package-readiness RED required `scripts/package-smoke.mjs` to assert the installed MCP server exposes `formctl_workflows`; `npm run test:package` passed after adding that check. Broader verification passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, `git diff --check`, `npm run test:replay`, `npm run test:package`, `npm run build`, `npm run formctl -- workflows --json`, `npm run formctl -- validate expense-report --json`, `npm run formctl -- doctor --json`, and `npm pack --dry-run --json`. `npm whoami` still returns `ENEEDAUTH`, so npm publish remains blocked until login.

**Decision:** Keep MCP discovery read-only and side-effect free. The MCP server can list, validate, inspect, and dry-run; approved submit remains outside MCP.

**Next Step:** Return to growth work or add workflow validation details only if users need more actionable invalid-YAML messages.

### 2026-05-27: Add Validate Repair Guidance

**Date:** 2026-05-27

**Experiment:** Make invalid workflow validation output actionable instead of diagnostic-only.

**Hypothesis:** Agents and reviewers can fix workflow YAML faster if every failed `validate` check includes a concrete `fix` string in JSON and human-readable output.

**Result:** Passed. Validation errors now carry `fix` guidance, and the human output prints a `fix:` line below each failing check.

**Evidence:** RED was observed with `npm test -- --run tests/cli.test.ts -t "validate"` because the missing safety metadata check had no `fix` field and human output had no `fix:` line. Release-readiness RED also failed until README and `docs/agents.md` documented how agents should report failed check names, `message`, and `fix`. Final verification passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, `git diff --check`, `npm run test:replay`, `npm run test:package`, `npm run build`, `npm run formctl -- validate expense-report --json`, `npm run formctl -- doctor --json`, and `npm pack --dry-run --json`.

**Decision:** Keep `validate` read-only. It should guide repair without rewriting workflow files or guessing selector changes.

**Next Step:** Return to growth work or external posting once a human can publish the prepared outreach copy. npm publish still requires an authenticated npm session.

### 2026-05-27: Add Manual Record Pause

**Date:** 2026-05-27

**Experiment:** Add a small `record --manual` mode so a human can complete login, navigation, or page setup before `formctl` saves selectors and the baseline screenshot.

**Hypothesis:** Recording should feel like a browser-reviewed workflow authoring step, not only a static form scan. Waiting for an explicit Enter before saving is the smallest useful slice toward that behavior.

**Result:** Passed. `record --manual` now prints a manual-record instruction, waits for input, then saves the workflow YAML and baseline screenshot using the existing record path.

**Evidence:** RED was observed with `npm test -- --run tests/cli.test.ts -t "record --manual"` because the flag was ignored and no manual-record instruction was printed. Release-readiness RED also failed until README, `docs/agents.md`, and `TASK.md` documented the manual authoring path. Focused GREEN passed with `npm test -- --run tests/cli.test.ts -t "help explains|record --manual"` and `npm test -- --run tests/release-readiness.test.ts -t "README explains|agent safety|TASK plan"`. Broader verification passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, `git diff --check`, `npm run test:replay`, `npm run test:package`, `npm run build`, `npm run formctl -- --help`, `npm run formctl -- validate expense-report --json`, `npm run formctl -- doctor --json`, and `npm pack --dry-run --json`.

**What Failed:** The first focused CLI test command used a pattern beginning with `--help`, which Vitest parsed as an unknown option. Re-running with `help explains|record --manual` verified the intended tests.

**Decision:** Keep this as an explicit `--manual` pause, not full event-history recording. Capturing individual interactions and file-upload history remains incomplete.

**Next Step:** If recording remains the highest-risk area, add event capture for field changes or file uploads as a separate TDD slice. npm publish still needs auth; `npm whoami` returns `ENEEDAUTH` and `npm view formctl` returns `E404`.

### 2026-05-27: Capture Manual Recording Events

**Date:** 2026-05-27

**Experiment:** Store manual recording interaction metadata without leaking entered values or file names.

**Hypothesis:** A workflow is easier to review if `record --manual` leaves a small `recording.events` trail showing which fields changed, while values and file uploads remain redacted.

**Result:** Passed. Manual workflows now store `recording.mode: manual` and redacted `recording.events` entries for input/change events. File inputs are recorded as `[file]`, other values as `[redacted]`, and `inspect --json` returns the recording metadata when present.

**Evidence:** RED was observed with `npm test -- --run tests/cli.test.ts -t "record --manual captures"` because `workflow.recording` was missing. A second RED was observed with `npm test -- --run tests/cli.test.ts -t "inspect --json returns manual"` because `inspect --json` omitted the metadata. Release-readiness RED failed until README, `docs/agents.md`, and `TASK.md` documented redacted `recording.events`. Broader verification passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, `git diff --check`, `npm run test:replay`, `npm run test:package`, `npm run build`, `npm run formctl -- --help`, `npm run formctl -- validate expense-report --json`, `npm run formctl -- doctor --json`, and `npm pack --dry-run --json`.

**What Failed:** The first event-capture test was flaky because the synthetic Enter could arrive before the page listener had captured the delayed browser events. The fixture now waits for a `__formctlManualReady` signal and delays Enter to match the real manual flow.

**Decision:** Keep interaction recording as metadata only for now. It should help review what changed without becoming a replay engine or storing sensitive values.

**Next Step:** Return to growth/outreach, or add a future event-history replay feature only after user demand proves it is needed.

### 2026-05-27: Surface Recording Summary In Workflow Discovery

**Date:** 2026-05-27

**Experiment:** Make manual recording metadata discoverable before agents call `inspect --json`.

**Hypothesis:** `workflows --json` should show a compact recording summary so an agent can decide whether a workflow has manual interaction metadata without loading every workflow file.

**Result:** Passed. Workflow discovery now includes `recording: { mode, eventCount }` when a workflow has `recording.events`, while leaving workflows without recording metadata unchanged.

**Evidence:** RED was observed with `npm test -- --run tests/cli.test.ts -t "workflows --json"` because the expense-report list item omitted `recording`. GREEN passed after adding the summary in `listWorkflowFiles()`. Release-readiness RED was observed with `npm test -- --run tests/release-readiness.test.ts -t "README explains|agent safety"` and `npm test -- --run tests/release-readiness.test.ts -t "TASK plan"` until README, `docs/agents.md`, and `TASK.md` documented the discovery summary. Broader verification passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, `git diff --check`, `npm run test:replay`, `npm run test:package`, `npm run build`, `npm run formctl -- workflows --json`, `npm run formctl -- validate expense-report --json`, `npm run formctl -- doctor --json`, and `npm pack --dry-run --json`.

**What Failed:** Nothing unexpected. The slice stayed small because it summarizes existing metadata instead of changing the workflow schema or replay behavior.

**Decision:** Keep `workflows --json` as a discovery surface with counts only. Full event details remain in `inspect --json`.

**Next Step:** Post the prepared launch outreach externally, or authenticate npm and publish the package. npm publish still needs auth; `npm whoami` returns `ENEEDAUTH`, while `npm view formctl` still returns `E404`.

### 2026-05-27: Validate Recording Metadata Redaction

**Date:** 2026-05-27

**Experiment:** Fail workflow validation when optional manual recording metadata contains unredacted event values.

**Hypothesis:** Since recording metadata is reviewable YAML, `validate --json` should catch accidental sensitive values before agents inspect, share, or submit from a workflow file.

**Result:** Passed. `validate --json` now adds a `recording-metadata` check when `recording` exists. It accepts `mode: manual`, `input`/`change` events, non-empty field and selector strings, and only `[redacted]` or `[file]` values.

**Evidence:** RED was observed with `npm test -- --run tests/cli.test.ts -t "recording metadata"` because a workflow with `recording.events[].value: 120000` still exited `0`. GREEN passed after adding optional recording validation. Release-readiness RED was observed with `npm test -- --run tests/release-readiness.test.ts -t "README explains|TASK plan|agent safety"` until README, `docs/agents.md`, and `TASK.md` documented the validation contract. Broader verification passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, `git diff --check`, `npm run test:replay`, `npm run test:package`, `npm run build`, `npm run formctl -- validate expense-report --json`, `npm run formctl -- workflows --json`, `npm run formctl -- doctor --json`, and `npm pack --dry-run --json`.

**What Failed:** The focused test name also matched the existing `inspect --json returns manual recording metadata` test, so the RED/GREEN command ran two tests. That was harmless but less narrow than intended.

**Decision:** Keep the check optional so older workflows without recording metadata do not change shape. Treat unredacted recording metadata as a validation error rather than silently dropping it.

**Next Step:** Post the prepared launch outreach externally, or authenticate npm and publish the package. npm publish remains blocked by npm auth.

### 2026-05-27: Reject Unsafe Workflow Names

**Date:** 2026-05-27

**Experiment:** Stop workflow commands from interpreting `../` or path-like names as filesystem paths.

**Hypothesis:** Since workflow files are trusted review artifacts under `.formctl/workflows/`, commands should reject unsafe names before reading or writing files outside that directory.

**Result:** Passed. `inspect`, `validate`, `submit`, and `record` now accept only workflow names made of letters, numbers, dots, underscores, and dashes, starting with a letter or number. Unsafe names exit with user-input error code `1`.

**Evidence:** RED was observed with `npm test -- --run tests/cli.test.ts -t "unsafe workflow names"` because `inspect ../leaked --json` read `.formctl/leaked.yml`, and `validate ../leaked --json` parsed it as `.formctl/workflows/../leaked.yml`. GREEN passed after adding workflow name validation before path construction. Release-readiness RED was observed with `npm test -- --run tests/release-readiness.test.ts -t "README explains|TASK plan|agent safety"` until README, `docs/agents.md`, and `TASK.md` documented the constraint. Broader verification passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, `git diff --check`, `npm run test:replay`, `npm run test:package`, `npm run build`, `npm run formctl -- inspect expense-report --json`, `npm run formctl -- validate expense-report --json`, `npm run formctl -- doctor --json`, `npm pack --dry-run --json`, and a direct unsafe-name CLI smoke showing `inspect ../expense --json` exits `1`.

**What Failed:** The original `validate --json` behavior made the path traversal visible in JSON output, which confirmed the risk but also showed that invalid input was being treated as a workflow validation problem rather than an input problem.

**Decision:** Treat invalid workflow names as user-input errors instead of normalizing paths. Keep the allowed grammar intentionally narrow.

**Next Step:** Post the prepared launch outreach externally, or authenticate npm and publish the package. npm publish remains blocked by npm auth.

### 2026-05-27: Return JSON For Invalid Workflow Names

**Date:** 2026-05-27

**Experiment:** Make unsafe workflow-name failures machine-readable when callers pass `--json`.

**Hypothesis:** Agents should branch on a structured `invalid_workflow_name` error instead of parsing stderr or retrying path-like variants.

**Result:** Passed. `inspect --json`, `validate --json`, and `submit --json` now return `{ status: "error", command, exitCode: 1, error: { code: "invalid_workflow_name", message } }` for unsafe workflow names without echoing the unsafe input.

**Evidence:** RED was observed with `npm test -- --run tests/cli.test.ts -t "unsafe workflow names|unsafe workflow"` because invalid names still wrote stderr in JSON mode. GREEN passed after adding a shared invalid-name JSON error helper. Release-readiness RED was observed with `npm test -- --run tests/release-readiness.test.ts -t "README explains|TASK plan|agent safety"` until README, `docs/agents.md`, and `TASK.md` documented the JSON contract. Broader verification passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, `git diff --check`, `npm run test:replay`, `npm run test:package`, `npm run build`, `npm run formctl -- validate expense-report --json`, `npm run formctl -- inspect expense-report --json`, direct unsafe-name CLI smoke for `inspect ../expense --json`, `npm run formctl -- doctor --json`, and `npm pack --dry-run --json`.

**What Failed:** The old behavior was safe after the previous path traversal fix, but it was harder for agents to handle because `--json` callers had to parse stderr for a normal input error.

**Decision:** Keep human mode on stderr and JSON mode on stdout. Do not include the unsafe workflow name in the JSON payload.

**Next Step:** Post the prepared launch outreach externally, or authenticate npm and publish the package. npm publish remains blocked by npm auth.

### 2026-05-28: Return JSON For Missing Workflows

**Date:** 2026-05-28

**Experiment:** Make workflow-not-found failures machine-readable when callers pass `--json`.

**Hypothesis:** Agents should branch on a structured `workflow_not_found` error before deciding whether to record a new workflow, ask the user, or stop.

**Result:** Passed. `inspect --json`, `validate --json`, and `submit --dry-run --json` now return `{ status: "error", command, workflow, exitCode: 2, error: { code: "workflow_not_found", message, expectedPath } }` without writing stderr. Submit also includes `submitted: false` and `requiresApproval: false`.

**Evidence:** RED was observed with `npm test -- --run tests/cli.test.ts -t "workflow-not-found"` because missing workflows still wrote stderr in JSON mode. GREEN passed after adding a shared workflow-not-found JSON helper. Release-readiness RED was observed with `npm test -- --run tests/release-readiness.test.ts -t "README explains|TASK plan|agent safety"` until README, `docs/agents.md`, and `TASK.md` documented the JSON contract. Broader verification passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, `git diff --check`, `npm run test:replay`, `npm run test:package`, `npm run build`, `npm run formctl -- validate expense-report --json`, `npm run formctl -- inspect expense-report --json`, `npm run formctl -- doctor --json`, `npm run formctl -- inspect missing-workflow --json`, and `npm pack --dry-run --json`.

**What Failed:** The old behavior respected exit code `2`, but `--json` callers still had to parse stderr and reconstruct `.formctl/workflows/<name>.yml` themselves.

**Decision:** Keep human mode unchanged and route only JSON mode to stdout. Include the expected relative workflow path because it is safe, deterministic, and useful for repair messages.

**Next Step:** Post the prepared launch outreach externally, or authenticate npm and publish the package. `npm whoami` still returns `ENEEDAUTH`; `npm view formctl version --json` still returns `E404`.

### 2026-05-28: Add Repair Guidance For Unreadable Workflow YAML

**Date:** 2026-05-28

**Experiment:** Make YAML parse failures in `validate --json` include a concrete repair hint.

**Hypothesis:** Agents should be able to report a malformed workflow file as a validation repair item without inventing the next action from the parser error text.

**Result:** Passed. `validate --json` now returns a `readable-yaml` check with `status: "error"`, parser `message`, and `fix: "Repair .formctl/workflows/<name>.yml so it is valid YAML before retrying validation."`

**Evidence:** RED was observed with `npm test -- --run tests/cli.test.ts -t "unreadable"` because `readable-yaml` lacked a `fix` field. GREEN passed after adding deterministic repair guidance in the YAML parse catch. Release-readiness RED was observed with `npm test -- --run tests/release-readiness.test.ts -t "README explains|TASK plan|agent safety"` until README, `docs/agents.md`, and `TASK.md` documented the contract. Broader verification passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, `git diff --check`, `npm run test:replay`, `npm run test:package`, `npm run build`, `npm run formctl -- validate expense-report --json`, `npm run formctl -- doctor --json`, and `npm pack --dry-run --json`.

**What Failed:** The previous validation contract said invalid workflow checks include `message` and `fix`, but the parse-failure check only included `message`.

**Decision:** Keep this as validation output instead of introducing a new top-level error code, because parse failure is one failed validation check for an existing workflow file.

**Next Step:** Post the prepared launch outreach externally, or authenticate npm and publish the package. `npm whoami` still returns `ENEEDAUTH`; `npm view formctl version --json` still returns `E404`.

### 2026-05-28: Return JSON For Unreadable Workflows

**Date:** 2026-05-28

**Experiment:** Prevent `inspect --json` and `submit --dry-run --json` from crashing when the workflow YAML cannot be parsed.

**Hypothesis:** Agents should see a structured `workflow_unreadable` error with the path, parser message, and repair hint instead of empty stdout and a process stack trace.

**Result:** Passed. `inspect --json` and `submit --dry-run --json` now return `{ status: "error", command, workflow, exitCode: 1, error: { code: "workflow_unreadable", message, path, fix } }`; submit also includes `submitted: false` and `requiresApproval: false`.

**Evidence:** RED was observed with `npm test -- --run tests/cli.test.ts -t "workflow YAML is unreadable"` because both new JSON callers had empty stdout and failed JSON parsing. GREEN passed after `readWorkflow` started catching YAML parse errors and routing them through a shared unreadable-workflow writer. Release-readiness RED was observed with `npm test -- --run tests/release-readiness.test.ts -t "README explains|TASK plan|agent safety"` until README, `docs/agents.md`, and `TASK.md` documented the contract. Broader verification passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, `git diff --check`, `npm run test:replay`, `npm run test:package`, `npm run build`, `npm run formctl -- validate expense-report --json`, `npm run formctl -- inspect expense-report --json`, `npm run formctl -- doctor --json`, and `npm pack --dry-run --json`.

**What Failed:** `validate --json` had a clean malformed-YAML path, but `inspect` and `submit` reused `readWorkflow`, which previously let parse exceptions escape.

**Decision:** Treat unreadable workflow YAML as exit code `1` user/input error rather than `2` workflow not found or `10` runtime error.

**Next Step:** Post the prepared launch outreach externally, or authenticate npm and publish the package. `npm whoami` still returns `ENEEDAUTH`; `npm view formctl version --json` still returns `E404`.

### 2026-05-28: Keep Workflow Discovery Alive With Unreadable Files

**Date:** 2026-05-28

**Experiment:** Prevent `workflows --json` from failing the entire discovery response when one workflow YAML file cannot be parsed.

**Hypothesis:** Agents should still discover runnable workflows even if one checked-in workflow needs YAML repair.

**Result:** Passed. `workflows --json` now returns unreadable workflow files as item-level `{ status: "error", error: { code: "workflow_unreadable", message, fix } }` entries while keeping the top-level response `status: "ok"` and listing other workflows.

**Evidence:** RED was observed with `npm test -- --run tests/cli.test.ts -t "unreadable workflow files"` because malformed YAML made workflow discovery emit empty stdout. GREEN passed after `listWorkflowFiles` caught parse failures per file. Release-readiness RED was observed with `npm test -- --run tests/release-readiness.test.ts -t "README explains|TASK plan|agent safety"` until README, `docs/agents.md`, and `TASK.md` documented the discovery behavior. Broader verification passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, `git diff --check`, `npm run test:replay`, `npm run test:package`, `npm run build`, `npm run formctl -- workflows --json`, `npm run formctl -- validate expense-report --json`, `npm run formctl -- doctor --json`, and `npm pack --dry-run --json`.

**What Failed:** Workflow discovery parsed all files in a single map path, so one malformed file could hide every valid workflow from agents and MCP clients.

**Decision:** Keep discovery best-effort. A malformed workflow is a repair task, not a reason to hide valid workflows.

**Next Step:** Post the prepared launch outreach externally, or authenticate npm and publish the package. `npm whoami` still returns `ENEEDAUTH`; `npm view formctl version --json` still returns `E404`.

### 2026-05-28: Mark Schema-Invalid Workflows In Discovery

**Date:** 2026-05-28

**Experiment:** Prevent `workflows --json` from presenting parseable but schema-invalid workflow files as runnable workflows.

**Hypothesis:** Agents should still discover valid workflows while treating invalid workflow files as repair tasks with failed checks.

**Result:** Passed. `workflows --json` now returns schema-invalid workflows as item-level `{ status: "error", error: { code: "workflow_invalid", message, fix }, checks }` entries while keeping the top-level response `status: "ok"` and listing valid workflows.

**Evidence:** RED was observed with `npm test -- --run tests/cli.test.ts -t "invalid workflow files"` because schema-invalid workflows were listed without error metadata. GREEN passed after workflow discovery reused `validateWorkflow` and only emitted normal list items after validation passed. Release-readiness RED was observed with `npm test -- --run tests/release-readiness.test.ts -t "README explains|TASK plan|agent safety"` until README, `docs/agents.md`, and `TASK.md` documented the discovery behavior. Broader verification passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, `git diff --check`, `npm run test:replay`, `npm run test:package`, `npm run build`, `npm run formctl -- workflows --json`, `npm run formctl -- validate expense-report --json`, `npm run formctl -- doctor --json`, and `npm pack --dry-run --json`.

**What Failed:** The focused filter also matched the existing human invalid-workflow repair-guidance test, so it ran two tests instead of one. That was harmless but less narrow.

**Decision:** Keep discovery best-effort and item-level. A schema-invalid workflow is a repair task, not a runnable workflow and not a reason to hide valid workflows.

**Next Step:** Post the prepared launch outreach externally, or authenticate npm and publish the package. `npm whoami` still returns `ENEEDAUTH`; `npm view formctl version --json` still returns `E404`. GitHub currently has one open issue, `#1 Launch outreach: first developer channels`; no already-resolved open issue needed closing.

### 2026-05-28: Reject Schema-Invalid Workflows Before Inspect Or Submit

**Date:** 2026-05-28

**Experiment:** Make `inspect --json` and `submit --dry-run --json` reject parseable but schema-invalid workflow files before trusting their contents or launching a browser.

**Hypothesis:** Agents should get the same `workflow_invalid` repair contract from direct workflow use that they get from workflow discovery.

**Result:** Passed. `inspect` and `submit` now validate parsed workflow objects in `readWorkflow` and return structured `workflow_invalid` errors with failed checks, path, message, and fix. Submit includes `submitted: false` and `requiresApproval: false`.

**Evidence:** RED was observed with `npm test -- --run tests/cli.test.ts -t "workflow schema is invalid"` because inspect returned success for invalid workflow YAML and submit produced no JSON. GREEN passed after `readWorkflow` validated before casting to `Workflow`. Release-readiness RED was observed with `npm test -- --run tests/release-readiness.test.ts -t "README explains|TASK plan|agent safety"` until README, `docs/agents.md`, and `TASK.md` documented the direct-use error contract. Broader verification passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, `git diff --check`, `npm run test:replay`, `npm run test:package`, `npm run build`, `npm run formctl -- workflows --json`, `npm run formctl -- inspect expense-report --json`, `npm run formctl -- validate expense-report --json`, `npm run formctl -- doctor --json`, and `npm pack --dry-run --json`.

**What Failed:** The broad CLI suite initially failed because older test fixtures created valid-looking workflows without safety metadata. Updating those fixtures exposed that the tests had drifted behind the enforced workflow format.

**Decision:** Keep one validation contract for discovery, inspect, and submit. Direct submit should not be a bypass around workflow repair checks.

**Next Step:** Post the prepared launch outreach externally, or authenticate npm and publish the package. `npm whoami` still returns `ENEEDAUTH`; `npm view formctl version --json` still returns `E404`. GitHub currently has one open issue, `#1 Launch outreach: first developer channels`.

### 2026-05-28: Add Agent JSON Branch Smoke

**Date:** 2026-05-28

**Experiment:** Add a real shell-level smoke script that proves agents can branch on JSON `error.code` and process exit status without launching a browser.

**Hypothesis:** The "machine-readable output" contract should be verified by a standalone script, not only by Vitest assertions embedded in the source test suite.

**Result:** Passed. `npm run test:agent` now runs `scripts/agent-branch-smoke.mjs`, which creates a temporary workspace and verifies `invalid_workflow_name`, `workflow_not_found`, `workflow_unreadable`, `workflow_invalid`, and `approval_required` branches. CI and `docs/LAUNCH.md` now include the gate.

**Evidence:** RED was observed with `npm test -- --run tests/release-readiness.test.ts -t "launch checklist|CI runs"` because `test:agent`, the CI step, and the launch checklist entry were missing. GREEN passed after adding the script, package script, CI step, and checklist entry. Broader verification passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npm run test:replay`, `npm run test:agent`, `npm run test:package`, `npm run build`, `npx tsc --noEmit`, `git diff --check`, `npm run formctl -- workflows --json`, `npm run formctl -- validate expense-report --json`, `npm run formctl -- doctor --json`, and `npm pack --dry-run --json`.

**What Failed:** The project previously marked "A shell script can branch on output status and exit code" complete, but the actual reusable branch smoke script did not exist.

**Decision:** Keep `test:agent` separate from package smoke. Package smoke proves installed binaries; agent branch smoke proves JSON control-flow semantics quickly without browser startup.

**Next Step:** Post the prepared launch outreach externally, or authenticate npm and publish the package. `npm whoami` still returns `ENEEDAUTH`; `npm view formctl version --json` still returns `E404`. GitHub currently has one open issue, `#1 Launch outreach: first developer channels`.

### 2026-05-28: Run Agent Branch Smoke Against Installed Binary

**Date:** 2026-05-28

**Experiment:** Reuse the agent JSON branch smoke inside package smoke while pointing it at the installed `formctl` binary.

**Hypothesis:** Source-level agent branch checks are useful, but release readiness should also prove the packed and globally installed CLI preserves the same JSON error-code contract.

**Result:** Passed. `scripts/agent-branch-smoke.mjs` now accepts `FORMCTL_BINARY`; `scripts/package-smoke.mjs` installs the tarball, then runs the branch smoke against that installed binary before MCP smoke.

**Evidence:** RED was observed with `npm test -- --run tests/release-readiness.test.ts -t "CI runs"` because package smoke did not call the branch smoke and the branch smoke could not target an installed binary. GREEN passed after adding `FORMCTL_BINARY` support and wiring package smoke to call `scripts/agent-branch-smoke.mjs`. The first GREEN attempt exposed an over-specific test expectation for the path string, so the assertion was narrowed to `agent-branch-smoke.mjs`. Broader verification passed with `npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/mcp.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npm run test:replay`, `npm run test:agent`, `npm run test:package`, `npm run build`, `npx tsc --noEmit`, `git diff --check`, `npm run formctl -- workflows --json`, `npm run formctl -- validate expense-report --json`, `npm run formctl -- doctor --json`, and `npm pack --dry-run --json`.

**What Failed:** The original release-readiness assertion required the literal string `scripts/agent-branch-smoke.mjs`, but the implementation correctly used `path.join(projectRoot, "scripts", "agent-branch-smoke.mjs")`. The test was too brittle, not the implementation.

**Decision:** Keep `test:agent` as a fast source-level gate and make `test:package` reuse it through `FORMCTL_BINARY` for installed-binary verification.

**Next Step:** Post the prepared launch outreach externally, or authenticate npm and publish the package. `npm whoami` still returns `ENEEDAUTH`; `npm view formctl version --json` still returns `E404`. GitHub currently has one open issue, `#1 Launch outreach: first developer channels`.

### 2026-05-28: Add Growth Snapshot Command

**Date:** 2026-05-28

**Experiment:** Turn the manual growth-log metric commands into one reproducible `npm run growth:snapshot` command that emits either a markdown table row or JSON.

**Hypothesis:** The weekly 10k-star loop will be less likely to drift if stars, forks, open issues, and npm publication status can be captured with one command before editing `docs/GROWTH_LOG.md`.

**Result:** Passed. `scripts/growth-snapshot.mjs` now reads `gh api repos/codeyoma/formctl` and `npm view formctl version --json`, formats the current snapshot as markdown or JSON, and `docs/GROWTH_LOG.md` includes a 2026-05-28 snapshot.

**Evidence:** RED was observed with `npm test -- --run tests/release-readiness.test.ts -t "growth snapshot"` because `scripts/growth-snapshot.mjs` did not exist. GREEN passed after adding the script, `growth:snapshot` package script, and growth-log usage docs. Broader verification passed with `npm test -- --run tests/release-readiness.test.ts`, `npm test -- --run tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, `git diff --check`, `npm run growth:snapshot -- --json`, `npm run growth:snapshot -- --markdown --date 2026-05-28`, `npm pack --dry-run --json`, and `npm run test:package`.

**What Failed:** The first real JSON smoke used the process default date, which can be UTC in this environment. The markdown smoke used the explicit `--date 2026-05-28` flag, and the growth-log source command now shows `--date YYYY-MM-DD` to avoid timezone ambiguity.

**Decision:** Keep this as a repo maintenance script rather than CLI product surface. It measures growth for the public repo; it should not affect user-facing `formctl` commands.

**Next Step:** Post the prepared launch outreach externally, or authenticate npm and publish the package. GitHub metrics remain 0 stars, 0 forks, and 1 open issue; npm still returns `E404`.

### 2026-05-28: Include Discussions In Growth Snapshot

**Date:** 2026-05-28

**Experiment:** Extend the weekly growth snapshot to include GitHub Discussions, matching the growth-loop metric list in `TASK.md`.

**Hypothesis:** If discussions are tracked in the same row as stars, forks, issues, npm status, demo views, and workflow leads, the project can notice early qualitative interest instead of only star count.

**Result:** Passed. `scripts/growth-snapshot.mjs` now queries GitHub GraphQL for `discussions(first: 1) { totalCount }`, emits `discussions` in JSON, and includes a Discussions column in markdown output and `docs/GROWTH_LOG.md`.

**Evidence:** RED was observed with `npm test -- --run tests/release-readiness.test.ts -t "growth"` because the growth log lacked a Discussions column and the snapshot script did not call `gh api graphql`. GREEN passed after adding the GraphQL lookup and updating the growth log tables. Broader verification passed with `npm test -- --run tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, `git diff --check`, `npm run growth:snapshot -- --json --date 2026-05-28`, `npm run growth:snapshot -- --markdown --date 2026-05-28`, `npm run test:package`, and `npm pack --dry-run --json`.

**What Failed:** The previous growth snapshot automated only the easiest REST metrics and left one metric from the weekly loop out of the table.

**Decision:** Keep GitHub Discussions as a numeric count for now. Demo views and workflow leads remain manual because there is no configured analytics source or intake database yet.

**Next Step:** Post the prepared launch outreach externally, or authenticate npm and publish the package. Current metrics remain 0 stars, 0 forks, 1 open issue, 0 discussions, and unpublished npm.

### 2026-05-28: Make Growth Snapshot Timezone Explicit

**Date:** 2026-05-28

**Experiment:** Add timezone-aware date formatting to `npm run growth:snapshot` so heartbeat runs near midnight UTC produce the intended local calendar date.

**Hypothesis:** The weekly growth log will be less error-prone if snapshot date defaults use an explicit timezone path and docs show `--timezone Asia/Seoul` for this workspace.

**Result:** Passed. `scripts/growth-snapshot.mjs` now supports `--timezone`, exports `formatDateForTimeZone`, and computes the default date in the resolved or supplied timezone. `docs/GROWTH_LOG.md` shows timezone-based snapshot commands before manual `--date` commands.

**Evidence:** RED was observed with `npm test -- --run tests/release-readiness.test.ts -t "growth snapshot"` because the growth log lacked `--timezone Asia/Seoul` and the script had no timezone contract. GREEN passed after adding timezone parsing and deterministic date formatting. Broader verification passed with `npm test -- --run tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, `git diff --check`, `npm run growth:snapshot -- --json --timezone Asia/Seoul`, `npm run growth:snapshot -- --markdown --timezone Asia/Seoul`, `npm run test:package`, and `npm pack --dry-run --json`.

**What Failed:** The prior script used `new Date().toISOString().slice(0, 10)`, which is UTC and can record the previous day for Asia/Seoul heartbeat runs.

**Decision:** Keep `--date` for fully manual backfills, but prefer `--timezone` for recurring snapshot commands.

**Next Step:** Post the prepared launch outreach externally, or authenticate npm and publish the package. Current metrics remain 0 stars, 0 forks, 1 open issue, 0 discussions, and unpublished npm.

### 2026-05-28: Let Growth Snapshot Carry Manual Outreach Metrics

**Date:** 2026-05-28

**Experiment:** Add `--demo-views` and `--workflow-leads` to `npm run growth:snapshot` so the same snapshot row can include 24-hour outreach metrics after a post goes live.

**Hypothesis:** The first outreach loop will be easier to execute if the operator can paste measured demo views and workflow leads into the snapshot command instead of editing only part of the table by hand.

**Result:** Passed. `scripts/growth-snapshot.mjs` now accepts manual demo view and workflow lead values, carries them into JSON output, and includes them in the markdown row. `docs/GROWTH_LOG.md` shows a command example with both flags.

**Evidence:** RED was observed with `npm test -- --run tests/release-readiness.test.ts -t "growth snapshot"` because the growth log did not document `--demo-views N --workflow-leads N`. GREEN passed after adding the flags and carrying them through `createSnapshot`. Broader verification passed with `npm test -- --run tests/release-readiness.test.ts`, `npm test -- --run tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, `git diff --check`, `npm run growth:snapshot -- --json --timezone Asia/Seoul --demo-views 42 --workflow-leads 7 --next-action "Follow up with workflow leads"`, `npm run growth:snapshot -- --markdown --timezone Asia/Seoul --demo-views 42 --workflow-leads 7 --next-action "Follow up with workflow leads"`, `npm run test:package`, and `npm pack --dry-run --json`.

**What Failed:** The previous snapshot command could not represent post-specific manual metrics, so the markdown row still had to be partially edited after running the supposedly reproducible command.

**Decision:** Keep demo views as a string because early channels may report views as exact counts, dashboard labels, or "not measured"; keep workflow leads numeric because it is a count.

**Next Step:** Post the prepared launch outreach externally, then run `npm run growth:snapshot -- --markdown --timezone Asia/Seoul --demo-views N --workflow-leads N` for the 24-hour follow-up.

### 2026-05-28: Track Launch Channel And Posted URL In Growth Snapshots

**Date:** 2026-05-28

**Experiment:** Add `--channel` and `--posted-url` to `npm run growth:snapshot` so a metric row can identify where an outreach result came from.

**Hypothesis:** A growth log row is much less useful if it records stars and leads without the channel and URL that produced them; adding source fields makes follow-up and later comparison easier.

**Result:** Passed. Growth snapshots now include `channel` and `postedUrl` in JSON output and the markdown table row. Existing historical rows use `Not posted`, and `docs/GROWTH_LOG.md` documents the new flags.

**Evidence:** RED was observed with `npm test -- --run tests/release-readiness.test.ts -t "growth"` because the growth log did not include Channel/Posted URL columns or the `--channel CHANNEL --posted-url URL` command. GREEN passed after adding the flags, snapshot fields, and table columns. Broader verification passed with `npm test -- --run tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, `git diff --check`, `npm run growth:snapshot -- --json --timezone Asia/Seoul --channel "Reddit r/commandline" --posted-url https://reddit.example/formctl --demo-views 42 --workflow-leads 7 --next-action "Follow up with workflow leads"`, `npm run growth:snapshot -- --markdown --timezone Asia/Seoul --channel "Reddit r/commandline" --posted-url https://reddit.example/formctl --demo-views 42 --workflow-leads 7 --next-action "Follow up with workflow leads"`, `npm run test:package`, and `npm pack --dry-run --json`.

**What Failed:** The previous snapshot command could carry the measured numbers after outreach, but it still lost the source URL unless someone manually edited the surrounding notes.

**Decision:** Keep source tracking as plain strings instead of trying to validate URLs or enumerate channels; early launch data will be messy and should not be rejected by the helper script.

**Next Step:** Post the prepared launch outreach externally, then run a channel-specific snapshot row with `--channel`, `--posted-url`, `--demo-views`, and `--workflow-leads`.

### 2026-05-28: Track Outreach Comments In Growth Snapshots

**Date:** 2026-05-28

**Experiment:** Add `--comments` to `npm run growth:snapshot` so 24-hour launch follow-up rows can capture discussion volume next to demo views and workflow leads.

**Hypothesis:** Comments are often the earliest high-signal feedback for a CLI launch, so they should be tracked in the same reproducible row as channel, posted URL, stars, views, and leads.

**Result:** Passed. Growth snapshots now include `comments` in JSON output and the markdown row, and `docs/GROWTH_LOG.md` includes a Comments column plus `--comments N` source-command examples.

**Evidence:** RED was observed with `npm test -- --run tests/release-readiness.test.ts -t "growth"` because the growth log and snapshot script had no Comments column or `--comments` flag. GREEN passed after adding the flag and carrying the value through `createSnapshot`. Broader verification passed with `npm test -- --run tests/release-readiness.test.ts -t "growth"`, `npm test -- --run tests/package-readiness.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, `git diff --check`, `npm run growth:snapshot -- --json --timezone Asia/Seoul --channel "Reddit r/commandline" --posted-url https://reddit.example/formctl --demo-views 42 --comments 5 --workflow-leads 7 --next-action "Follow up with workflow leads"`, `npm run growth:snapshot -- --markdown --timezone Asia/Seoul --channel "Reddit r/commandline" --posted-url https://reddit.example/formctl --demo-views 42 --comments 5 --workflow-leads 7 --next-action "Follow up with workflow leads"`, `npm run test:package`, and `npm pack --dry-run --json`.

**What Failed:** The previous manual-metric snapshot could capture views and leads but still dropped public reply volume, so a 24-hour launch row would miss whether the post generated useful discussion.

**Decision:** Keep comments as a numeric count. The qualitative best comment belongs in the weekly review template's feedback field, not in the metric row.

**Next Step:** Post the prepared launch outreach externally, then run a channel-specific snapshot row with `--channel`, `--posted-url`, `--demo-views`, `--comments`, and `--workflow-leads`.

### 2026-05-28: Load Submit Values From JSON Files

**Date:** 2026-05-28

**Experiment:** Add `formctl submit <workflow> --values <path>` so agents and humans can pass form values as a JSON object when shell flags would be fragile.

**Hypothesis:** A values file lowers first-run friction for long text, booleans, and file paths while keeping the same dry-run, approval, screenshot, and audit behavior.

**Result:** Passed. `submit --dry-run --json --values fields.json` now loads string, number, and boolean values, CLI field flags can still override JSON values, and the README demo includes `demo/expense-values.json`.

**Evidence:** RED was observed with `npm test -- --run tests/cli.test.ts -t "values from a JSON file"` because the dry-run completed with an empty `fields` object. GREEN passed after loading the JSON object before the browser run and reusing the existing field-fill path. Documentation RED was observed with `npm test -- --run tests/release-readiness.test.ts -t "README explains|agent safety"` because README and the agent guide did not mention `--values`. Broader verification passed with `npm test -- --run tests/cli.test.ts tests/release-readiness.test.ts`, `npx tsc --noEmit`, `git diff --check`, `npm run formctl -- submit expense-report --values demo/expense-values.json --dry-run --json --headless`, `npm run test:agent`, `npm run test:replay`, `npm run test:package`, and `npm pack --dry-run --json`.

**What Failed:** Passing every field as a shell flag remains awkward for agent-generated commands and longer text. The first RED showed the command shape was accepted but did not fill any fields because `--values` was treated like an unrelated flag.

**Decision:** Keep `--values` narrow: it accepts one JSON object file and scalar string, number, or boolean values. More complex input mapping should wait for evidence from real workflows.

**Next Step:** Add a guard for unknown keys in `--values` after seeing whether users prefer strict typo detection or permissive extra metadata.

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

### Week Ending: 2026-05-27

**Metrics:** 0 GitHub stars, 0 forks, 1 open issue, npm not published (`npm view formctl` returns `E404`), demo views not measured, 0 workflow leads.

**Most Useful Feedback:** No external feedback yet; the repo is still waiting on the first outreach post.

**Biggest Risk:** The product keeps improving without being put in front of developers who have painful API-less workflows.

**Shipped:** Workflow validation plus MCP workflow discovery and validation, including package smoke and CI coverage.

**Next Week Focus:** A human should post the Reddit r/commandline candidate from `docs/POSTING_QUEUE.md` and record the posted URL plus 24-hour metrics.

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
