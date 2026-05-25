# formctl Task Plan

> **For agentic workers:** Work task-by-task. After every meaningful change, run the listed verification and append the result to `REVIEW.md`.

**Goal:** Build `formctl`, an open-source CLI that turns browser-recorded web form workflows into reproducible, reviewable CLI commands, and grow the GitHub repository to 10,000 stars.

**Positioning:** "Record once. Submit safely forever." `formctl` is for developers, operators, and AI agents who need reliable automation for web forms that do not expose a useful API.

**Core Product Promise:**
- Record a web form workflow once.
- Convert it into a typed CLI command.
- Preview the result with screenshots and diffs.
- Submit only after dry-run checks and optional human approval.
- Preserve audit logs for every run.

**Assumptions:**
- Initial implementation uses TypeScript, Node.js, and Playwright because browser recording, headless execution, screenshots, and selectors are first-class there.
- The first release targets local developer machines, not hosted execution.
- Credentials are not stored by `formctl`; users rely on browser sessions, environment variables, or external secret managers.
- The first impressive demo matters more than broad SaaS coverage.
- 10k stars requires a sharp demo, credible reliability, and agent-oriented ergonomics, not just a generic browser automation wrapper.

---

## Success Criteria

- A new user can understand the project from the README in under 30 seconds.
- A new user can run a local demo in under 2 minutes.
- `formctl record expense-report <url>` produces a reusable workflow file.
- `formctl submit expense-report --amount 120000 --receipt ./receipt.png --dry-run` produces a preview without submitting.
- `formctl submit ... --approve` or an interactive confirmation performs the real submission.
- Each run emits deterministic exit codes, JSON output, screenshot artifacts, and an audit log.
- The repository has a launch-ready demo GIF/video, examples, install instructions, and issue templates.
- Growth is measured weekly until 10k GitHub stars.

---

## Phase 0: Product Shape

### Task 0.1: Write The One-Sentence Pitch

**Output:** README opening line and social launch copy.

- [ ] Write the pitch: "`formctl` turns any browser form into a safe, repeatable CLI command."
- [ ] Add a before/after example:

```bash
# Before: open browser, log in, click through a form, upload receipt, submit

# After
formctl submit expense-report --amount 120000 --receipt ./receipt.png --dry-run
formctl submit expense-report --amount 120000 --receipt ./receipt.png --approve
```

- [ ] Verify: Ask whether a developer can explain the product after reading only the first screen of the README.
- [ ] Record feedback in `REVIEW.md`.

### Task 0.2: Define The First Demo Workflow

**Output:** A demo that can run locally without depending on a fragile external website.

- [ ] Create a local demo web app with one realistic form: expense report, reimbursement, or admin invite.
- [ ] Include text input, number input, date input, select, checkbox, file upload, and final submit button.
- [ ] Make the demo visibly show "not submitted" during dry-run and "submitted" after approval.
- [ ] Verify: The whole demo can be shown in a 60-second screen recording.
- [ ] Record what felt confusing in `REVIEW.md`.

### Task 0.3: Choose The Initial Workflow File Format

**Output:** A stable workflow file users can commit to git.

- [ ] Store recorded workflows as readable YAML under `.formctl/workflows/<name>.yml`.
- [ ] Include workflow name, target URL, fields, selectors, submit action, screenshots, and safety settings.
- [ ] Avoid clever selector healing in v0; first detect selector breakage clearly.
- [ ] Verify: A human can review the workflow file in a pull request.
- [ ] Record format tradeoffs in `REVIEW.md`.

---

## Phase 1: MVP CLI

### Task 1.1: Scaffold The CLI

**Goal:** Create a minimal CLI with stable commands and help text.

- [ ] Create a Node.js TypeScript project.
- [ ] Add commands:

```bash
formctl record <workflow-name> <url>
formctl submit <workflow-name> [flags]
formctl inspect <workflow-name>
formctl doctor
```

- [ ] Use clear exit codes:

```text
0 success
1 user/input error
2 workflow not found
3 selector mismatch
4 dry-run failed
5 approval required
10 unexpected runtime error
```

- [ ] Verify: `formctl --help` explains the product without reading docs.
- [ ] Record CLI naming friction in `REVIEW.md`.

### Task 1.2: Implement Recording

**Goal:** Turn a browser interaction into a workflow file.

- [ ] Launch a headed Playwright browser.
- [ ] Let the user complete the form manually.
- [ ] Capture field interactions, file uploads, final submit target, and a baseline screenshot.
- [ ] Save `.formctl/workflows/<workflow-name>.yml`.
- [ ] Verify: Re-running `formctl inspect <workflow-name>` shows captured fields and selectors.
- [ ] Record missed interactions in `REVIEW.md`.

### Task 1.3: Implement Dry-Run

**Goal:** Fill the form without submitting it.

- [ ] Load the workflow file.
- [ ] Accept field values from CLI flags.
- [ ] Open the target page.
- [ ] Fill fields.
- [ ] Stop before the final submit action.
- [ ] Save artifacts under `.formctl/runs/<timestamp>/`.
- [ ] Include screenshot, JSON summary, and resolved field values with secrets redacted.
- [ ] Verify: Dry-run never triggers the final submit action in the local demo app.
- [ ] Record false positives or confusing output in `REVIEW.md`.

### Task 1.4: Implement Approval And Submit

**Goal:** Require explicit user intent before a real submission.

- [ ] Make submission fail with exit code `5` unless `--approve` or interactive confirmation is present.
- [ ] Show the dry-run screenshot path before asking for approval.
- [ ] Perform the final submit action only after approval.
- [ ] Save post-submit screenshot and audit log.
- [ ] Verify: The local demo app changes to "submitted" only after approval.
- [ ] Record approval UX issues in `REVIEW.md`.

### Task 1.5: Implement Selector Breakage Detection

**Goal:** Fail loudly when the page no longer matches the recorded workflow.

- [ ] Check that every required selector resolves to exactly one expected element.
- [ ] Compare element labels, input types, and visible text near the field.
- [ ] Emit a clear selector mismatch report.
- [ ] Save a failure screenshot.
- [ ] Verify: Changing a form label or removing a field causes exit code `3`.
- [ ] Record brittle selector cases in `REVIEW.md`.

---

## Phase 2: Agent-Ready Behavior

### Task 2.1: Add Machine-Readable Output

**Goal:** Make `formctl` easy for coding agents and automation systems to call.

- [ ] Add `--json` to `submit`, `inspect`, and `doctor`.
- [ ] Return stable fields: `status`, `workflow`, `runId`, `artifacts`, `exitCode`, `requiresApproval`, `error`.
- [ ] Ensure secrets and file contents are never printed.
- [ ] Verify: A shell script can branch on output status and exit code.
- [ ] Record schema changes in `REVIEW.md`.

### Task 2.2: Add Audit Logs

**Goal:** Make every run reviewable after the fact.

- [x] Write `.formctl/runs/<timestamp>/audit.jsonl` for successful dry-run and approved runs.
- [x] Log page URL, command flags, redacted values, selector checks, screenshot paths, approval source, and final result for successful runs.
- [x] Keep logs append-only within a run directory.
- [x] Verify: A failed selector-mismatch run contains enough evidence to debug without rerunning.
- [x] Record missing audit fields in `REVIEW.md`.

### Task 2.3: Add Agent Instructions

**Goal:** Help agents use `formctl` safely.

- [x] Add `docs/agents.md` with safe usage rules.
- [x] Include examples for dry-run first, approval requirement, and artifact inspection.
- [x] Add a README section: "Using formctl from Codex, Claude Code, Cursor, or Copilot CLI."
- [x] Verify: An agent can infer that it should not submit without approval.
- [x] Record unclear instructions in `REVIEW.md`.

---

## Phase 3: Reliability And Trust

### Task 3.1: Build Fixture Sites

**Goal:** Test against realistic forms without relying on external services.

- [ ] Add fixture pages for expense report, admin user invite, support refund, and vendor onboarding. Expense report and admin invite are done; support refund and vendor onboarding remain.
- [ ] Include common UI patterns: modal forms, multi-step forms, file upload, date picker, and confirmation page. Current fixtures cover file upload, select, and checkbox.
- [ ] Verify: Every fixture supports record, dry-run, and approved submit. Current expense-report and admin-invite fixtures are smoke-checked.
- [x] Record fixture gaps in `REVIEW.md`.

### Task 3.2: Add Replay Tests

**Goal:** Prevent regressions in recorded workflows.

- [ ] Add end-to-end tests that record or load fixture workflows.
- [ ] Test dry-run does not submit.
- [ ] Test approval does submit.
- [ ] Test broken selectors fail with exit code `3`.
- [ ] Verify: CI runs replay tests on every pull request.
- [ ] Record flaky tests in `REVIEW.md`.

### Task 3.3: Support Headed And Headless Modes

**Goal:** Work for humans locally and agents in automation.

- [ ] Default `record` to headed mode.
- [ ] Default `submit --dry-run` to headless mode when no interactive approval is needed.
- [ ] Add `--headed` and `--headless` flags.
- [ ] Verify: The same workflow passes in both modes on fixture sites.
- [ ] Record mode-specific failures in `REVIEW.md`.

---

## Phase 4: Distribution

### Task 4.1: Package For npm

**Goal:** Make installation trivial.

- [ ] Publish as `formctl` or a clear scoped fallback if the name is unavailable.
- [ ] Ensure `npx formctl --help` works.
- [ ] Add install docs:

```bash
npm install -g formctl
npx formctl doctor
```

- [ ] Verify: A clean machine can install and run the local demo.
- [ ] Record install friction in `REVIEW.md`.

### Task 4.2: Add Homebrew Later

**Goal:** Support developers who expect native CLI installation.

- [ ] Add Homebrew only after npm usage shows demand.
- [ ] Verify: The formula installs a pinned release and runs `formctl doctor`.
- [ ] Record whether Homebrew increased adoption in `REVIEW.md`.

### Task 4.3: Create Launch Assets

**Goal:** Make the project instantly understandable on GitHub and social channels.

- [ ] Add a 30-60 second demo video or GIF.
- [ ] Add screenshots for dry-run preview, selector mismatch, and audit log.
- [ ] Add a `demo/` folder with the local form app and sample workflow.
- [ ] Verify: A reader can star the repo based on the GitHub page alone.
- [ ] Record which asset gets the most engagement in `REVIEW.md`.

---

## Phase 5: Growth To 10k Stars

### Task 5.1: Launch To Developers

**Goal:** Get the first 500 stars from a clear technical audience.

- [ ] Publish the repo with a polished README, demo, examples, and roadmap.
- [ ] Post launch copy centered on "API-less web forms as CLI commands."
- [ ] Share with communities interested in CLI tools, browser automation, AI agents, internal tools, and ops automation.
- [ ] Ask early users for workflows that are painful because no API exists.
- [ ] Verify: Reach 500 stars or collect 20 concrete workflow requests.
- [ ] Record channel-by-channel results in `REVIEW.md`.

### Task 5.2: Turn Painful Workflows Into Examples

**Goal:** Convert user pain into star-worthy demos.

- [ ] Add examples for expense reports, admin invites, refund requests, CRM updates, and compliance attestations. Expense report and admin invite examples are done.
- [ ] Keep examples local or mock-backed to avoid legal and credential issues.
- [ ] Write short posts showing each workflow before and after `formctl`.
- [ ] Verify: At least one example produces repeated inbound interest.
- [ ] Record example performance in `REVIEW.md`.

### Task 5.3: Build The Agent Angle

**Goal:** Make `formctl` the default answer for agents that need safe browser form submission.

- [ ] Publish "Why browser agents need form-specific CLIs."
- [ ] Add JSON output examples for agent use.
- [ ] Add an MCP wrapper only after the CLI is stable.
- [ ] Verify: At least three agent users run `formctl` in real workflows.
- [ ] Record agent-specific blockers in `REVIEW.md`.

### Task 5.4: Create Trust Content

**Goal:** Separate `formctl` from fragile browser macros.

- [ ] Write docs for dry-run, approval, audit logs, selector breakage, and secret handling.
- [ ] Add a comparison page: `formctl` vs raw Playwright scripts vs browser agents vs RPA.
- [ ] Add security notes explaining what `formctl` does not do.
- [ ] Verify: Security questions can be answered by linking to docs.
- [ ] Record trust objections in `REVIEW.md`.

### Task 5.5: Weekly Growth Loop

**Goal:** Keep iterating until 10k stars.

- [ ] Every week, record stars, forks, npm downloads, issues, discussions, and demo views.
- [ ] Identify the highest-signal user request.
- [ ] Ship one improvement that improves the first-run experience or expands a real use case.
- [ ] Publish one artifact: release note, demo, article, comparison, or example.
- [ ] Verify: Growth rate improves or the positioning changes based on evidence.
- [ ] Append the weekly review to `REVIEW.md`.

---

## Initial Backlog Ranking

1. Local demo app and 60-second demo path.
2. CLI scaffold with `record`, `submit`, `inspect`, and `doctor`.
3. Workflow YAML format.
4. Dry-run screenshots and artifact directory.
5. Approval-gated submit.
6. Selector mismatch detection.
7. JSON output and exit codes.
8. Audit logs.
9. README, demo GIF, and launch post.
10. Fixture sites and replay tests.
11. npm package.
12. Agent usage docs.
13. MCP wrapper.
14. Homebrew formula.

---

## Non-Goals For The First Release

- Hosted browser execution.
- Enterprise team management.
- Full RPA designer UI.
- Automatic CAPTCHA bypass.
- Credential vault.
- Smart selector healing that silently changes behavior.
- Automating real government or banking sites in examples.
