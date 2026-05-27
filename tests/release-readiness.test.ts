import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function findMp4Box(buffer: Buffer, type: string, start = 0, end = buffer.length): { start: number; end: number } | undefined {
  let offset = start;

  while (offset + 8 <= end) {
    const size = buffer.readUInt32BE(offset);
    const boxType = buffer.toString("ascii", offset + 4, offset + 8);
    const boxEnd = size === 0 ? end : offset + size;

    if (boxType === type) {
      return { start: offset + 8, end: boxEnd };
    }

    if (size < 8 || boxEnd <= offset) {
      break;
    }

    offset = boxEnd;
  }

  return undefined;
}

function readMp4DurationSeconds(buffer: Buffer): number {
  const moov = findMp4Box(buffer, "moov");
  if (moov === undefined) {
    throw new Error("MP4 is missing moov box");
  }

  const mvhd = findMp4Box(buffer, "mvhd", moov.start, moov.end);
  if (mvhd === undefined) {
    throw new Error("MP4 is missing mvhd box");
  }

  const version = buffer.readUInt8(mvhd.start);
  const timescaleOffset = version === 1 ? mvhd.start + 20 : mvhd.start + 12;
  const durationOffset = version === 1 ? mvhd.start + 24 : mvhd.start + 16;
  const timescale = buffer.readUInt32BE(timescaleOffset);
  const duration = version === 1
    ? Number(buffer.readBigUInt64BE(durationOffset))
    : buffer.readUInt32BE(durationOffset);

  return duration / timescale;
}

describe("release readiness docs", () => {
  test("package metadata is ready for a public GitHub repository", () => {
    const packageJson = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));

    expect(packageJson.version).toBe("0.1.0");
    expect(packageJson.private).toBe(false);
    expect(packageJson.description).toBe("Turn browser-recorded web forms into safe, repeatable CLI commands.");
    expect(packageJson.license).toBe("MIT");
    expect(packageJson.repository).toEqual({
      type: "git",
      url: "git+https://github.com/codeyoma/formctl.git",
    });
    expect(packageJson.bugs).toEqual({
      url: "https://github.com/codeyoma/formctl/issues",
    });
    expect(packageJson.homepage).toBe("https://github.com/codeyoma/formctl#readme");
    expect(packageJson.bin).toEqual({
      formctl: "dist/cli.js",
      "formctl-mcp": "dist/mcp.js",
    });
    expect(packageJson.keywords).toEqual([
      "agent",
      "browser-automation",
      "cli",
      "forms",
      "playwright",
      "rpa",
    ]);
  });

  test("LICENSE uses MIT terms", () => {
    const license = readFileSync(path.join(projectRoot, "LICENSE"), "utf8");

    expect(license).toContain("MIT License");
    expect(license).toContain("Copyright (c) 2026 yoma");
    expect(license).toContain("Permission is hereby granted, free of charge");
    expect(license).toContain("THE SOFTWARE IS PROVIDED \"AS IS\"");
  });

  test("README explains the product and the two-minute local demo", () => {
    const readme = readFileSync(path.join(projectRoot, "README.md"), "utf8");

    expect(readme).toContain("formctl turns any browser form into a safe, repeatable CLI command");
    expect(readme).toContain("Run a saved workflow. Preview first. Approve only when ready.");
    expect(readme).toContain("## Two-Minute Local Demo");
    expect(readme).toContain("npm install");
    expect(readme).toContain("npm run demo");
    expect(readme).toContain("The demo workflows are already checked in under `.formctl/workflows/`.");
    expect(readme).toContain("npm run formctl -- workflows --json");
    expect(readme).toContain("Workflow discovery reports recording mode and event count when metadata exists.");
    expect(readme).toContain("Workflow discovery reports unreadable workflow files as `workflow_unreadable` items instead of failing the whole list.");
    expect(readme).toContain("Workflow discovery reports schema-invalid workflow files as `workflow_invalid` items with failed checks.");
    expect(readme).toContain("npm run formctl -- submit expense-report --amount 120000 --receipt demo/receipt.txt --dry-run --json --headless");
    expect(readme).toContain("npm run formctl -- submit expense-report --values demo/expense-values.json --dry-run --json --headless");
    expect(readme).toContain("Use `--values <path>` to load submit field values from a JSON object file when flags would be hard to quote.");
    expect(readme).toContain("Unknown keys in a `--values` file are rejected as `field_values_invalid` before opening the browser.");
    expect(readme).toContain("npm run formctl -- submit expense-report --amount 120000 --receipt demo/receipt.txt --approve --json --headless");
    expect(readme).toContain("Interactive submit shows the `dry-run.png` screenshot path before asking you to type `approve`.");
    expect(readme).toContain("npm run formctl -- submit admin-invite --email ops@example.com --role admin --notify true --dry-run --json --headless");
    expect(readme).toContain("npm run formctl -- submit support-refund --orderId ORD-1001 --refundDate 2026-05-26 --reason \"Duplicate charge\" --dry-run --json --headless");
    expect(readme).toContain("npm run formctl -- submit vendor-onboarding --legalName \"Acme Supplies\" --website https://vendor.example --taxForm demo/tax-form.txt --riskTier medium --ndaSigned true --onboardingDate 2026-05-26 --notes \"Approved vendor\" --dry-run --json --headless");
    expect(readme).toContain("npm run formctl -- submit procurement-approval --requestorEmail buyer@example.com --department finance --amount 98000 --neededBy 2026-06-01 --justification \"Quarterly laptop refresh\" --urgent true --dry-run --json --headless");
    expect(readme).toContain("npm run formctl -- submit crm-update --accountName \"Northwind Traders\" --stage renewal --ownerEmail ae@example.com --nextContactDate 2026-06-03 --priority true --notes \"Renewal risk flagged\" --dry-run --json --headless");
    expect(readme).toContain("npm run formctl -- submit compliance-attestation --employeeEmail auditor@example.com --controlArea security --attestationDate 2026-06-15 --compliant true --notes \"Quarterly access review complete\" --dry-run --json --headless");
    expect(readme).toContain("## Create A New Workflow");
    expect(readme).toContain("Use `record` only when you need to create a workflow that does not exist yet.");
    expect(readme).toContain("formctl record expense-report https://example.internal/expense");
    expect(readme).toContain("formctl record expense-report https://example.internal/expense --manual");
    expect(readme).toContain("Use `--manual` when login, navigation, or form setup needs a human-visible browser before saving selectors.");
    expect(readme).toContain("Manual recording stores redacted `recording.events` entries for changed fields and file inputs.");
    expect(readme).toContain("`record` also saves a baseline screenshot next to the workflow file.");
    expect(readme).toContain("formctl workflows [--json]");
    expect(readme).toContain("formctl validate <workflow-name> [--json]");
    expect(readme).toContain("Run `formctl validate <workflow-name> --json` before reviewing or sharing workflow YAML.");
    expect(readme).toContain("Invalid workflow checks include `message` and `fix` fields so agents can report a concrete repair.");
    expect(readme).toContain("Unreadable workflow YAML returns a `readable-yaml` check with `message` and `fix` fields.");
    expect(readme).toContain("Validation rejects unredacted `recording.events` metadata when present.");
    expect(readme).toContain("Invalid workflow names return `invalid_workflow_name` in JSON mode.");
    expect(readme).toContain("Missing workflows return `workflow_not_found` in JSON mode.");
    expect(readme).toContain("Unreadable workflows return `workflow_unreadable` in JSON mode for inspect and submit.");
    expect(readme).toContain("Invalid workflows return `workflow_invalid` in JSON mode for inspect and submit.");
    expect(readme).toContain("![formctl demo](docs/assets/demo.svg)");
    expect(readme).toContain("audit.jsonl");
    expect(readme).toContain("failure.json");
    expect(readme).toContain("failure.png");
    expect(readme).toContain("Audit logs record selector checks, redacted field values, approval source, screenshots, and final result.");
    expect(readme).toContain("Workflow files include safety metadata for dry-run first, required approval, selector drift failure, and file-input redaction.");
    expect(readme).toContain("Workflow names may contain only letters, numbers, dots, underscores, and dashes.");
    expect(readme).toContain("Selector mismatch failures write `failure.json`, `failure.png`, and `audit.jsonl` without filling or submitting the form.");
    expect(readme).toContain("[Agent safety guide](docs/agents.md)");
    expect(readme).toContain("Exit codes");
    expect(readme).toContain("5 approval required");
    expect(readme).toContain("Browser mode defaults");
    expect(readme).toContain("`record` defaults to `--headed` so humans can watch login and form discovery.");
    expect(readme).toContain("`submit --dry-run` defaults to `--headless` for repeatable agent and CI previews.");
    expect(readme).toContain("Use `--headed` or `--headless` to override the default for any browser-backed command.");
    expect(readme).toContain("Real submission requires `--approve` or an interactive terminal confirmation.");
  });

  test("demo media shows the core record dry-run approve flow", () => {
    const demo = readFileSync(path.join(projectRoot, "docs", "assets", "demo.svg"), "utf8");

    expect(demo).toContain("<svg");
    expect(demo).toContain("existing workflow: .formctl/workflows/expense-report.yml");
    expect(demo).toContain("submit expense-report --amount 120000");
    expect(demo).toContain("--dry-run --json");
    expect(demo).toContain("\"status\":\"dry-run\"");
    expect(demo).toContain("\"exitCode\":5");
    expect(demo).toContain("--approve --json");
    expect(demo).toContain("\"status\":\"submitted\"");
  });

  test("demo video is ready for social launch posts", () => {
    const readme = readFileSync(path.join(projectRoot, "README.md"), "utf8");
    const video = readFileSync(path.join(projectRoot, "docs", "assets", "demo.mp4"));
    const durationSeconds = readMp4DurationSeconds(video);

    expect(readme).toContain("[Watch the 40-second demo video](docs/assets/demo.mp4)");
    expect(video.toString("ascii", 4, 8)).toBe("ftyp");
    expect(video.length).toBeGreaterThan(10_000);
    expect(durationSeconds).toBeGreaterThanOrEqual(30);
    expect(durationSeconds).toBeLessThanOrEqual(60);
  });

  test("README includes trust artifact screenshots for launch readers", () => {
    const readme = readFileSync(path.join(projectRoot, "README.md"), "utf8");
    const dryRun = readFileSync(path.join(projectRoot, "docs", "assets", "dry-run-preview.svg"), "utf8");
    const selectorMismatch = readFileSync(path.join(projectRoot, "docs", "assets", "selector-mismatch.svg"), "utf8");
    const auditLog = readFileSync(path.join(projectRoot, "docs", "assets", "audit-log.svg"), "utf8");

    expect(readme).toContain("## Trust Artifacts");
    expect(readme).toContain("![Dry-run preview](docs/assets/dry-run-preview.svg)");
    expect(readme).toContain("![Selector mismatch](docs/assets/selector-mismatch.svg)");
    expect(readme).toContain("![Audit log](docs/assets/audit-log.svg)");
    expect(dryRun).toContain("<svg");
    expect(dryRun).toContain('"status":"dry-run"');
    expect(dryRun).toContain('"submitted":false');
    expect(dryRun).toContain("dry-run.png");
    expect(selectorMismatch).toContain("<svg");
    expect(selectorMismatch).toContain("selector_mismatch");
    expect(selectorMismatch).toContain('"exitCode":3');
    expect(selectorMismatch).toContain("failure.png");
    expect(auditLog).toContain("<svg");
    expect(auditLog).toContain("audit.jsonl");
    expect(auditLog).toContain("selector_check");
    expect(auditLog).toContain("[file]");
  });

  test("demo fixture contains the fields used by README commands", () => {
    const expenseReport = readFileSync(path.join(projectRoot, "demo", "expense-report.html"), "utf8");
    const adminInvite = readFileSync(path.join(projectRoot, "demo", "admin-invite.html"), "utf8");
    const supportRefund = readFileSync(path.join(projectRoot, "demo", "support-refund.html"), "utf8");
    const vendorOnboarding = readFileSync(path.join(projectRoot, "demo", "vendor-onboarding.html"), "utf8");
    const procurementApproval = readFileSync(path.join(projectRoot, "demo", "procurement-approval.html"), "utf8");
    const crmUpdate = readFileSync(path.join(projectRoot, "demo", "crm-update.html"), "utf8");
    const complianceAttestation = readFileSync(path.join(projectRoot, "demo", "compliance-attestation.html"), "utf8");
    const taxForm = readFileSync(path.join(projectRoot, "demo", "tax-form.txt"), "utf8");
    const server = readFileSync(path.join(projectRoot, "demo", "server.mjs"), "utf8");

    expect(expenseReport).toContain('action="/submit"');
    expect(expenseReport).toContain('name="amount"');
    expect(expenseReport).toContain('name="receipt"');
    expect(expenseReport).toContain('type="file"');
    expect(expenseReport).toContain('type="submit"');
    expect(adminInvite).toContain('action="/admin-invite/submit"');
    expect(adminInvite).toContain('name="email"');
    expect(adminInvite).toContain('type="email"');
    expect(adminInvite).toContain('name="role"');
    expect(adminInvite).toContain("<select");
    expect(adminInvite).toContain('value="admin"');
    expect(adminInvite).toContain('name="notify"');
    expect(adminInvite).toContain('type="checkbox"');
    expect(supportRefund).toContain('action="/support-refund/submit"');
    expect(supportRefund).toContain('name="orderId"');
    expect(supportRefund).toContain('name="refundDate"');
    expect(supportRefund).toContain('type="date"');
    expect(supportRefund).toContain('name="reason"');
    expect(supportRefund).toContain("<textarea");
    expect(vendorOnboarding).toContain('action="/vendor-onboarding/submit"');
    expect(vendorOnboarding).toContain('name="legalName"');
    expect(vendorOnboarding).toContain('name="website"');
    expect(vendorOnboarding).toContain('type="url"');
    expect(vendorOnboarding).toContain('name="taxForm"');
    expect(vendorOnboarding).toContain('type="file"');
    expect(vendorOnboarding).toContain('name="riskTier"');
    expect(vendorOnboarding).toContain("<select");
    expect(vendorOnboarding).toContain('name="ndaSigned"');
    expect(vendorOnboarding).toContain('type="checkbox"');
    expect(vendorOnboarding).toContain('name="onboardingDate"');
    expect(vendorOnboarding).toContain('type="date"');
    expect(vendorOnboarding).toContain('name="notes"');
    expect(vendorOnboarding).toContain("<textarea");
    expect(procurementApproval).toContain("<dialog");
    expect(procurementApproval).toContain("open");
    expect(procurementApproval).toContain('action="/procurement-approval/submit"');
    expect(procurementApproval).toContain('data-step="1"');
    expect(procurementApproval).toContain('data-step="2"');
    expect(procurementApproval).toContain('name="requestorEmail"');
    expect(procurementApproval).toContain('type="email"');
    expect(procurementApproval).toContain('name="department"');
    expect(procurementApproval).toContain("<select");
    expect(procurementApproval).toContain('name="amount"');
    expect(procurementApproval).toContain('type="number"');
    expect(procurementApproval).toContain('name="neededBy"');
    expect(procurementApproval).toContain('type="date"');
    expect(procurementApproval).toContain('name="justification"');
    expect(procurementApproval).toContain("<textarea");
    expect(procurementApproval).toContain('name="urgent"');
    expect(procurementApproval).toContain('type="checkbox"');
    expect(crmUpdate).toContain('action="/crm-update/submit"');
    expect(crmUpdate).toContain('name="accountName"');
    expect(crmUpdate).toContain('name="stage"');
    expect(crmUpdate).toContain("<select");
    expect(crmUpdate).toContain('value="renewal"');
    expect(crmUpdate).toContain('name="ownerEmail"');
    expect(crmUpdate).toContain('type="email"');
    expect(crmUpdate).toContain('name="nextContactDate"');
    expect(crmUpdate).toContain('type="date"');
    expect(crmUpdate).toContain('name="priority"');
    expect(crmUpdate).toContain('type="checkbox"');
    expect(crmUpdate).toContain('name="notes"');
    expect(crmUpdate).toContain("<textarea");
    expect(complianceAttestation).toContain('action="/compliance-attestation/submit"');
    expect(complianceAttestation).toContain('name="employeeEmail"');
    expect(complianceAttestation).toContain('type="email"');
    expect(complianceAttestation).toContain('name="controlArea"');
    expect(complianceAttestation).toContain("<select");
    expect(complianceAttestation).toContain('value="security"');
    expect(complianceAttestation).toContain('name="attestationDate"');
    expect(complianceAttestation).toContain('type="date"');
    expect(complianceAttestation).toContain('name="compliant"');
    expect(complianceAttestation).toContain('type="checkbox"');
    expect(complianceAttestation).toContain('name="notes"');
    expect(complianceAttestation).toContain("<textarea");
    expect(taxForm).toContain("Sample vendor tax form");
    expect(server).toContain('"/admin-invite"');
    expect(server).toContain('"/admin-invite/submit"');
    expect(server).toContain('"/support-refund"');
    expect(server).toContain('"/support-refund/submit"');
    expect(server).toContain('"/vendor-onboarding"');
    expect(server).toContain('"/vendor-onboarding/submit"');
    expect(server).toContain('"/procurement-approval"');
    expect(server).toContain('"/procurement-approval/submit"');
    expect(server).toContain("Procurement approved");
    expect(server).toContain('"/crm-update"');
    expect(server).toContain('"/crm-update/submit"');
    expect(server).toContain("CRM updated");
    expect(server).toContain('"/compliance-attestation"');
    expect(server).toContain('"/compliance-attestation/submit"');
    expect(server).toContain("Compliance attested");
  });

  test("GitHub issue templates collect reproducible form automation reports", () => {
    const bugReport = readFileSync(path.join(projectRoot, ".github", "ISSUE_TEMPLATE", "bug_report.yml"), "utf8");
    const featureRequest = readFileSync(path.join(projectRoot, ".github", "ISSUE_TEMPLATE", "feature_request.yml"), "utf8");

    expect(bugReport).toContain("name: Bug report");
    expect(bugReport).toContain("formctl doctor --json");
    expect(bugReport).toContain("selector mismatch");
    expect(bugReport).toContain(".formctl/runs/<run-id>/summary.json");
    expect(bugReport).toContain("dry-run");
    expect(featureRequest).toContain("name: Feature request");
    expect(featureRequest).toContain("API-less workflow");
    expect(featureRequest).toContain("Why should this be in formctl instead of a raw Playwright script?");
  });

  test("launch checklist is ready for public growth work", () => {
    const launch = readFileSync(path.join(projectRoot, "docs", "LAUNCH.md"), "utf8");

    expect(launch).toContain("# formctl Launch Checklist");
    expect(launch).toContain("https://github.com/codeyoma/formctl");
    expect(launch).toContain("npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts");
    expect(launch).toContain("npm run test:replay");
    expect(launch).toContain("npm run test:agent");
    expect(launch).toContain("npm run test:package");
    expect(launch).toContain("npm run build");
    expect(launch).toContain("npx tsc --noEmit");
    expect(launch).toContain("npm run demo");
    expect(launch).toContain("Review `docs/assets/demo.mp4`");
    expect(launch).toContain("First 500 stars");
    expect(launch).toContain("10k stars");
  });

  test("CI runs demo replay tests on pull requests", () => {
    const packageJson = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));
    const ci = readFileSync(path.join(projectRoot, ".github", "workflows", "ci.yml"), "utf8");
    const packageSmoke = readFileSync(path.join(projectRoot, "scripts", "package-smoke.mjs"), "utf8");
    const agentBranchSmoke = readFileSync(path.join(projectRoot, "scripts", "agent-branch-smoke.mjs"), "utf8");

    expect(packageJson.scripts["test:replay"]).toBe("vitest run tests/demo-replay.test.ts");
    expect(packageJson.scripts["test:agent"]).toBe("node scripts/agent-branch-smoke.mjs");
    expect(ci).toContain("pull_request");
    expect(ci).toContain("workflow_dispatch:");
    expect(ci).toContain("actions/checkout@v5");
    expect(ci).toContain("actions/setup-node@v5");
    expect(ci).not.toContain("actions/checkout@v4");
    expect(ci).not.toContain("actions/setup-node@v4");
    expect(ci).not.toContain("FORCE_JAVASCRIPT_ACTIONS_TO_NODE24");
    expect(ci).toContain("npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts");
    expect(ci).toContain("tests/mcp.test.ts");
    expect(ci).toContain("npm run test:replay");
    expect(ci).toContain("npm run test:agent");
    expect(ci).toContain("npm run test:package");
    expect(ci).toContain("npm run build");
    expect(ci).toContain("npx tsc --noEmit");
    expect(agentBranchSmoke).toContain("process.env.FORMCTL_BINARY");
    expect(packageSmoke).toContain("agent-branch-smoke.mjs");
    expect(packageSmoke).toContain("FORMCTL_BINARY");
  });

  test("TASK plan reflects shipped MVP behavior without overclaiming", () => {
    const task = readFileSync(path.join(projectRoot, "TASK.md"), "utf8");

    expect(task).toContain("- [x] Create a Node.js TypeScript project.");
    expect(task).toContain("- [x] Add commands:");
    expect(task).toContain("formctl workflows [--json]");
    expect(task).toContain("formctl validate <workflow-name> [--json]");
    expect(task).toContain("- [x] Use clear exit codes:");
    expect(task).toContain("- [x] Verify: `formctl --help` explains the product without reading docs.");
    expect(task).toContain("- [x] Launch a headed Playwright browser.");
    expect(task).toContain("- [x] Let the user complete the form manually with `record --manual` before saving selectors.");
    expect(task).toContain("- [x] Capture final submit target and a baseline screenshot.");
    expect(task).toContain("- [x] Capture redacted field interaction and file-input events during manual completion.");
    expect(task).toContain("- [x] Include workflow name, target URL, fields, selectors, submit action, and screenshots.");
    expect(task).toContain("- [x] Add workflow safety settings when backed by runtime behavior.");
    expect(task).toContain("- [x] Store recorded workflows as readable YAML under `.formctl/workflows/<name>.yml`.");
    expect(task).toContain("- [x] Avoid clever selector healing in v0; first detect selector breakage clearly.");
    expect(task).toContain("- [x] Verify: A human can review the workflow file in a pull request.");
    expect(task).toContain("- [x] Record format tradeoffs in `REVIEW.md`.");
    expect(task).toContain("- [x] Load the workflow file.");
    expect(task).toContain("- [x] Accept field values from CLI flags.");
    expect(task).toContain("- [x] Stop before the final submit action.");
    expect(task).toContain("- [x] Make submission fail with exit code `5` unless `--approve` or interactive confirmation is present.");
    expect(task).toContain("- [x] Show the dry-run screenshot path before asking for approval.");
    expect(task).toContain("- [x] Perform the final submit action only after approval.");
    expect(task).toContain("- [x] Add `--json` to `submit`, `inspect`, and `doctor`.");
    expect(task).toContain("- [x] Return stable fields: `status`, `workflow`, `runId`, `artifacts`, `exitCode`, `requiresApproval`, `error`.");
    expect(task).toContain("- [x] Expose recording mode and event count in workflow discovery JSON.");
    expect(task).toContain("- [x] Report unreadable workflow files without failing workflow discovery JSON.");
    expect(task).toContain("- [x] Report schema-invalid workflow files without failing workflow discovery JSON.");
    expect(task).toContain("- [x] Ensure secrets and file contents are never printed.");
    expect(task).toContain("- [x] Validate optional recording metadata so event values stay redacted.");
    expect(task).toContain("- [x] Reject unsafe workflow names before reading or writing workflow files.");
    expect(task).toContain("- [x] Return machine-readable `invalid_workflow_name` errors in JSON mode.");
    expect(task).toContain("- [x] Return machine-readable `workflow_not_found` errors in JSON mode.");
    expect(task).toContain("- [x] Return repair guidance for unreadable workflow YAML in validation JSON.");
    expect(task).toContain("- [x] Return machine-readable `workflow_unreadable` errors for inspect and submit JSON.");
    expect(task).toContain("- [x] Return machine-readable `workflow_invalid` errors for inspect and submit JSON.");
  });

  test("announcement draft is ready for first public launch post", () => {
    const announcement = readFileSync(path.join(projectRoot, "docs", "ANNOUNCEMENT.md"), "utf8");

    expect(announcement).toContain("# formctl Announcement Draft");
    expect(announcement).toContain("https://github.com/codeyoma/formctl");
    expect(announcement).toContain("start from a saved workflow");
    expect(announcement).toContain("dry-run screenshots");
    expect(announcement).toContain("docs/assets/demo.mp4");
    expect(announcement).toContain("selector mismatch checks");
    expect(announcement).toContain("approval gates");
    expect(announcement).toContain("JSON output for agents");
    expect(announcement).toContain("What I want feedback on");
    expect(announcement).toContain("API-less workflows");
    expect(announcement).toContain("Launch checklist run");
    expect(announcement).toContain("npm test -- --run tests/browser-mode.test.ts tests/cli.test.ts tests/package-readiness.test.ts tests/release-readiness.test.ts");
    expect(announcement).toContain("npm run build");
    expect(announcement).toContain("npx tsc --noEmit");
  });

  test("CHANGELOG documents the first public release", () => {
    const changelog = readFileSync(path.join(projectRoot, "CHANGELOG.md"), "utf8");

    expect(changelog).toContain("# Changelog");
    expect(changelog).toContain("## 0.1.0 - 2026-05-26");
    expect(changelog).toContain("Record live forms into `.formctl/workflows/<name>.yml`");
    expect(changelog).toContain("Run `submit --dry-run` with screenshots and JSON summaries");
    expect(changelog).toContain("Require `--approve` before clicking the recorded submit selector");
    expect(changelog).toContain("Fail fast on missing or ambiguous selectors with exit code `3`");
    expect(changelog).toContain("Publish the public GitHub MVP at https://github.com/codeyoma/formctl");
  });

  test("outreach tracker defines first launch channels and metrics", () => {
    const outreach = readFileSync(path.join(projectRoot, "docs", "OUTREACH.md"), "utf8");

    expect(outreach).toContain("# formctl Outreach Tracker");
    expect(outreach).toContain("Primary ask: share painful API-less workflows");
    expect(outreach).toContain("Workflow request guide: docs/WORKFLOW_REQUESTS.md");
    expect(outreach).toContain("Hacker News");
    expect(outreach).toContain("Reddit r/commandline");
    expect(outreach).toContain("Reddit r/LocalLLaMA");
    expect(outreach).toContain("LinkedIn");
    expect(outreach).toContain("Direct outreach");
    expect(outreach).toContain("Stars before");
    expect(outreach).toContain("Stars after 24h");
    expect(outreach).toContain("Comments");
    expect(outreach).toContain("Workflow leads");
    expect(outreach).toContain("https://github.com/codeyoma/formctl/releases/tag/v0.1.0");
  });

  test("workflow request intake is ready for launch feedback", () => {
    const readme = readFileSync(path.join(projectRoot, "README.md"), "utf8");
    const workflowRequests = readFileSync(path.join(projectRoot, "docs", "WORKFLOW_REQUESTS.md"), "utf8");
    const announcement = readFileSync(path.join(projectRoot, "docs", "ANNOUNCEMENT.md"), "utf8");
    const featureRequest = readFileSync(path.join(projectRoot, ".github", "ISSUE_TEMPLATE", "feature_request.yml"), "utf8");

    expect(readme).toContain("[Workflow request guide](docs/WORKFLOW_REQUESTS.md)");
    expect(announcement).toContain("docs/WORKFLOW_REQUESTS.md");
    expect(workflowRequests).toContain("# Workflow Request Guide");
    expect(workflowRequests).toContain("Painful API-less workflow");
    expect(workflowRequests).toContain("Current workaround");
    expect(workflowRequests).toContain("Trust barrier");
    expect(workflowRequests).toContain("Expected CLI command");
    expect(workflowRequests).toContain("Fixture permission");
    expect(workflowRequests).toContain("Do not include credentials, cookies, private URLs, or production data.");
    expect(workflowRequests).toContain("CRM update");
    expect(workflowRequests).toContain("compliance attestation");
    expect(featureRequest).toContain("Expected CLI command");
    expect(featureRequest).toContain("Fixture permission");
    expect(featureRequest).toContain("Trust barrier");
  });

  test("example before and after posts are ready for outreach", () => {
    const readme = readFileSync(path.join(projectRoot, "README.md"), "utf8");
    const outreach = readFileSync(path.join(projectRoot, "docs", "OUTREACH.md"), "utf8");
    const examplePosts = readFileSync(path.join(projectRoot, "docs", "EXAMPLE_POSTS.md"), "utf8");

    expect(readme).toContain("[Example before/after posts](docs/EXAMPLE_POSTS.md)");
    expect(outreach).toContain("Example posts: docs/EXAMPLE_POSTS.md");
    expect(examplePosts).toContain("# Example Before And After Posts");
    expect(examplePosts).toContain("## Expense report");
    expect(examplePosts).toContain("## Admin invite");
    expect(examplePosts).toContain("## Support refund");
    expect(examplePosts).toContain("## Vendor onboarding");
    expect(examplePosts).toContain("## Procurement approval");
    expect(examplePosts).toContain("## CRM update");
    expect(examplePosts).toContain("## Compliance attestation");
    expect(examplePosts).toContain("Before:");
    expect(examplePosts).toContain("After:");
    expect(examplePosts).toContain("formctl submit expense-report");
    expect(examplePosts).toContain("formctl submit crm-update");
    expect(examplePosts).toContain("formctl submit compliance-attestation");
    expect(examplePosts).toContain("--dry-run --json");
    expect(examplePosts).toContain("--approve");
  });

  test("growth log captures the weekly 10k-star loop baseline", () => {
    const readme = readFileSync(path.join(projectRoot, "README.md"), "utf8");
    const launch = readFileSync(path.join(projectRoot, "docs", "LAUNCH.md"), "utf8");
    const outreach = readFileSync(path.join(projectRoot, "docs", "OUTREACH.md"), "utf8");
    const growthLog = readFileSync(path.join(projectRoot, "docs", "GROWTH_LOG.md"), "utf8");

    expect(readme).toContain("[Growth log](docs/GROWTH_LOG.md)");
    expect(launch).toContain("docs/GROWTH_LOG.md");
    expect(outreach).toContain("Growth log: docs/GROWTH_LOG.md");
    expect(growthLog).toContain("# Growth Log");
    expect(growthLog).toContain("## Baseline: 2026-05-26");
    expect(growthLog).toContain("## Snapshot: 2026-05-27");
    expect(growthLog).toContain("| Date | Channel | Posted URL | GitHub Stars | Forks | Open Issues | Discussions | npm Downloads | Demo Views | Comments | Workflow Leads | Next Action |");
    expect(growthLog).toContain("| 2026-05-27 | Not posted | Not posted | 0 | 0 | 1 | 0 | Not published: `npm view formctl` returns `E404` | Not measured | 0 | 0 | Human posts Reddit r/commandline candidate from `docs/POSTING_QUEUE.md` |");
    expect(growthLog).toContain("Shipped MCP workflow discovery and validation tools for agent clients.");
    expect(growthLog).toContain("gh repo view codeyoma/formctl");
    expect(growthLog).toContain("npm view formctl");
    expect(growthLog).toContain("npm publish blocked until npm auth is configured");
    expect(growthLog).toContain("Post one example-led outreach message");
    expect(growthLog).toContain("Weekly Review Template");
    expect(growthLog).toContain("Positioning Change");
  });

  test("growth snapshot command produces markdown-ready metrics", async () => {
    const packageJson = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));
    const growthLog = readFileSync(path.join(projectRoot, "docs", "GROWTH_LOG.md"), "utf8");
    const snapshotScriptPath = path.join(projectRoot, "scripts", "growth-snapshot.mjs");
    const snapshotScript = readFileSync(snapshotScriptPath, "utf8");
    const snapshot = await import(pathToFileURL(snapshotScriptPath).href);

    expect(packageJson.scripts["growth:snapshot"]).toBe("node scripts/growth-snapshot.mjs");
    expect(growthLog).toContain("npm run growth:snapshot -- --markdown");
    expect(growthLog).toContain("npm run growth:snapshot -- --json");
    expect(growthLog).toContain("--timezone Asia/Seoul");
    expect(growthLog).toContain("--demo-views N --workflow-leads N");
    expect(growthLog).toContain("--channel CHANNEL --posted-url URL");
    expect(growthLog).toContain("--comments N");
    expect(snapshotScript).toContain("gh api repos/codeyoma/formctl");
    expect(snapshotScript).toContain("gh api graphql");
    expect(snapshotScript).toContain("discussions(first: 1)");
    expect(snapshotScript).toContain("npm view formctl version --json");
    expect(snapshotScript).toContain("--markdown");
    expect(snapshotScript).toContain("--timezone");
    expect(snapshotScript).toContain("--demo-views");
    expect(snapshotScript).toContain("--workflow-leads");
    expect(snapshotScript).toContain("--channel");
    expect(snapshotScript).toContain("--posted-url");
    expect(snapshotScript).toContain("--comments");
    expect(snapshot.formatDateForTimeZone(new Date("2026-05-27T20:02:54.310Z"), "Asia/Seoul")).toBe("2026-05-28");
    expect(snapshot.createSnapshot({
      date: "2026-05-28",
      channel: "Reddit r/commandline",
      postedUrl: "https://reddit.example/formctl",
      github: {
        forks: 3,
        openIssues: 1,
        stars: 12,
      },
      discussions: 2,
      npmDownloads: "Published: 0.1.0",
      demoViews: "42",
      comments: 5,
      workflowLeads: 7,
      nextAction: "Follow up with workflow leads",
    })).toMatchObject({
      channel: "Reddit r/commandline",
      comments: 5,
      demoViews: "42",
      postedUrl: "https://reddit.example/formctl",
      workflowLeads: 7,
    });

    expect(snapshot.formatMarkdownRow({
      date: "2026-05-28",
      channel: "Reddit r/commandline",
      postedUrl: "https://reddit.example/formctl",
      stars: 12,
      forks: 3,
      openIssues: 1,
      discussions: 2,
      npmDownloads: "Not published: `npm view formctl` returns `E404`",
      demoViews: "Not measured",
      comments: 5,
      workflowLeads: 0,
      nextAction: "Post one example-led outreach message",
    })).toBe("| 2026-05-28 | Reddit r/commandline | https://reddit.example/formctl | 12 | 3 | 1 | 2 | Not published: `npm view formctl` returns `E404` | Not measured | 5 | 0 | Post one example-led outreach message |");
  });

  test("example-led posting queue is ready for a human to publish", () => {
    const outreach = readFileSync(path.join(projectRoot, "docs", "OUTREACH.md"), "utf8");
    const growthLog = readFileSync(path.join(projectRoot, "docs", "GROWTH_LOG.md"), "utf8");
    const postingQueue = readFileSync(path.join(projectRoot, "docs", "POSTING_QUEUE.md"), "utf8");

    expect(outreach).toContain("Posting queue: docs/POSTING_QUEUE.md");
    expect(growthLog).toContain("docs/POSTING_QUEUE.md");
    expect(postingQueue).toContain("# Posting Queue");
    expect(postingQueue).toContain("First post candidate");
    expect(postingQueue).toContain("Reddit r/commandline");
    expect(postingQueue).toContain("Reddit r/LocalLLaMA");
    expect(postingQueue).toContain("Direct outreach");
    expect(postingQueue).toContain("Posted URL:");
    expect(postingQueue).toContain("24-hour follow-up");
    expect(postingQueue).toContain("Update `docs/GROWTH_LOG.md`");
    expect(postingQueue).toContain("CRM update");
    expect(postingQueue).toContain("Compliance attestation");
    expect(postingQueue).toContain("formctl submit crm-update");
    expect(postingQueue).toContain("formctl submit compliance-attestation");
    expect(postingQueue).toContain("Trust notes: docs/TRUST.md");
    expect(postingQueue).toContain("Example posts: docs/EXAMPLE_POSTS.md");
  });

  test("trust and comparison docs answer security questions", () => {
    const readme = readFileSync(path.join(projectRoot, "README.md"), "utf8");
    const launch = readFileSync(path.join(projectRoot, "docs", "LAUNCH.md"), "utf8");
    const announcement = readFileSync(path.join(projectRoot, "docs", "ANNOUNCEMENT.md"), "utf8");
    const trust = readFileSync(path.join(projectRoot, "docs", "TRUST.md"), "utf8");
    const comparison = readFileSync(path.join(projectRoot, "docs", "COMPARISON.md"), "utf8");

    expect(readme).toContain("[Trust and security notes](docs/TRUST.md)");
    expect(readme).toContain("[Comparison with Playwright, browser agents, and RPA](docs/COMPARISON.md)");
    expect(launch).toContain("docs/TRUST.md");
    expect(launch).toContain("docs/COMPARISON.md");
    expect(announcement).toContain("docs/TRUST.md");
    expect(announcement).toContain("docs/COMPARISON.md");
    expect(trust).toContain("# Trust And Security Notes");
    expect(trust).toContain("Dry-run");
    expect(trust).toContain("Approval gate");
    expect(trust).toContain("Audit logs");
    expect(trust).toContain("Selector breakage");
    expect(trust).toContain("Secret handling");
    expect(trust).toContain("What formctl does not do");
    expect(trust).toContain("does not store credentials");
    expect(trust).toContain("does not bypass authentication");
    expect(trust).toContain("does not solve CAPTCHA");
    expect(trust).toContain("does not silently heal selectors");
    expect(comparison).toContain("# Comparison");
    expect(comparison).toContain("formctl");
    expect(comparison).toContain("Raw Playwright scripts");
    expect(comparison).toContain("Browser agents");
    expect(comparison).toContain("RPA");
    expect(comparison).toContain("dry-run");
    expect(comparison).toContain("approval");
    expect(comparison).toContain("audit");
    expect(comparison).toContain("selector drift");
  });

  test("agent safety guide teaches approval-gated CLI usage", () => {
    const agents = readFileSync(path.join(projectRoot, "docs", "agents.md"), "utf8");

    expect(agents).toContain("# Agent Safety Guide");
    expect(agents).toContain("Codex");
    expect(agents).toContain("Claude Code");
    expect(agents).toContain("Cursor");
    expect(agents).toContain("Copilot CLI");
    expect(agents).toContain("Always run `submit --dry-run --json` before any approved submit.");
    expect(agents).toContain("Never pass `--approve` unless the user or policy explicitly authorizes submission.");
    expect(agents).toContain("Inspect `.formctl/runs/<run-id>/summary.json`, screenshots, and `audit.jsonl` before approval.");
    expect(agents).toContain("Branch on JSON fields such as `status`, `exitCode`, `requiresApproval`, and `artifacts`.");
    expect(agents).toContain("Run `formctl doctor --json` before browser-backed work.");
    expect(agents).toContain("Run `formctl workflows --json` to discover available workflow names.");
    expect(agents).toContain("Use `--values <path>` for structured field input when quoting long values in shell flags would be fragile.");
    expect(agents).toContain("Treat unknown keys in a `--values` file as typos and stop on `field_values_invalid`.");
    expect(agents).toContain("Use workflow discovery recording summaries to decide whether to inspect manual recording metadata.");
    expect(agents).toContain("Treat `workflow_unreadable` items in workflow discovery as repair tasks, not runnable workflows.");
    expect(agents).toContain("Treat `workflow_invalid` items in workflow discovery as repair tasks and inspect their failed checks.");
    expect(agents).toContain("Run `formctl validate <workflow-name> --json` before trusting a checked-in workflow.");
    expect(agents).toContain("When `validate --json` returns `status: \"error\"`, report the failed check names plus their `message` and `fix` fields.");
    expect(agents).toContain("For `readable-yaml` failures, report the YAML parse message and fix before retrying.");
    expect(agents).toContain("Treat a `recording-metadata` validation failure as a possible sensitive-data leak.");
    expect(agents).toContain("Treat an invalid workflow name as a user-input error, not as a path to normalize.");
    expect(agents).toContain("Branch on `invalid_workflow_name` JSON errors without retrying path variants.");
    expect(agents).toContain("Branch on `workflow_not_found` JSON errors before attempting record or submit.");
    expect(agents).toContain("Branch on `workflow_unreadable` JSON errors by reporting the path, parser message, and fix.");
    expect(agents).toContain("Branch on `workflow_invalid` JSON errors by reporting failed check names, messages, and fixes.");
    expect(agents).toContain("Use `record --manual` only when a workflow is missing and the page needs human login, navigation, or setup before saving selectors.");
    expect(agents).toContain("Treat `recording.events` as interaction metadata only; values and file names are redacted.");
    expect(agents).toContain("## Doctor JSON");
    expect(agents).toContain('"exitCode": 0');
    expect(agents).toContain('"playwright-chromium"');
    expect(agents).toContain('"installCommand": "npx playwright install chromium"');
    expect(agents).toContain("Treat exit code `5` as an approval gate, not a retryable failure.");
    expect(agents).toContain("Do not print secrets, file contents, cookies, or private page data.");
    expect(agents).toContain("Selector mismatch failures are safe stops and include `failure.json`, `failure.png`, and `audit.jsonl`.");
  });

  test("MCP setup guide is copy-pasteable before and after npm publish", () => {
    const readme = readFileSync(path.join(projectRoot, "README.md"), "utf8");
    const agents = readFileSync(path.join(projectRoot, "docs", "agents.md"), "utf8");
    const outreach = readFileSync(path.join(projectRoot, "docs", "OUTREACH.md"), "utf8");
    const postingQueue = readFileSync(path.join(projectRoot, "docs", "POSTING_QUEUE.md"), "utf8");
    const mcp = readFileSync(path.join(projectRoot, "docs", "MCP.md"), "utf8");

    expect(readme).toContain("[MCP setup guide](docs/MCP.md)");
    expect(agents).toContain("MCP setup guide: docs/MCP.md");
    expect(outreach).toContain("MCP setup guide: docs/MCP.md");
    expect(postingQueue).toContain("MCP setup guide: docs/MCP.md");
    expect(mcp).toContain("# MCP Setup Guide");
    expect(mcp).toContain("Run from a local checkout");
    expect(mcp).toContain("npm run build");
    expect(mcp).toContain("\"command\": \"node\"");
    expect(mcp).toContain("\"args\": [\"dist/mcp.js\"]");
    expect(mcp).toContain("Run after npm publish");
    expect(mcp).toContain("\"command\": \"npx\"");
    expect(mcp).toContain("\"args\": [\"formctl-mcp\"]");
    expect(mcp).toContain("formctl_doctor");
    expect(mcp).toContain("formctl_workflows");
    expect(mcp).toContain("formctl_inspect");
    expect(mcp).toContain("formctl_validate");
    expect(mcp).toContain("formctl_submit_dry_run");
    expect(mcp).toContain("Call `formctl_workflows` to discover available workflow names.");
    expect(mcp).toContain("Call `formctl_validate` before `formctl_inspect` or `formctl_submit_dry_run` when using a checked-in workflow.");
    expect(mcp).toContain("does not expose approved submit");
    expect(mcp).toContain("approval stays in the CLI");
    expect(mcp).toContain("MCP SDK smoke test");
  });

  test("agent angle article gives agents JSON branching examples", () => {
    const readme = readFileSync(path.join(projectRoot, "README.md"), "utf8");
    const outreach = readFileSync(path.join(projectRoot, "docs", "OUTREACH.md"), "utf8");
    const article = readFileSync(path.join(projectRoot, "docs", "WHY_FORM_CLIS.md"), "utf8");

    expect(readme).toContain("[Why browser agents need form-specific CLIs](docs/WHY_FORM_CLIS.md)");
    expect(outreach).toContain("docs/WHY_FORM_CLIS.md");
    expect(article).toContain("# Why Browser Agents Need Form-Specific CLIs");
    expect(article).toContain("Browser agents are good at exploration");
    expect(article).toContain("formctl is for the moment after exploration");
    expect(article).toContain("`submit --dry-run --json`");
    expect(article).toContain("\"status\": \"dry-run\"");
    expect(article).toContain("\"requiresApproval\": true");
    expect(article).toContain("\"exitCode\": 5");
    expect(article).toContain("\"code\": \"selector_mismatch\"");
    expect(article).toContain("approval gate");
    expect(article).toContain("audit.jsonl");
    expect(article).toContain("failure.json");
    expect(article).toContain("Do not pass `--approve`");
  });
});
