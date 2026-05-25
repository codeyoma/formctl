import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
    expect(readme).toContain("Record once. Submit safely forever.");
    expect(readme).toContain("## Two-Minute Local Demo");
    expect(readme).toContain("npm install");
    expect(readme).toContain("npm run demo");
    expect(readme).toContain("npm run formctl -- record expense-report http://127.0.0.1:4173/expense --headless");
    expect(readme).toContain("npm run formctl -- submit expense-report --amount 120000 --receipt demo/receipt.txt --dry-run --json --headless");
    expect(readme).toContain("npm run formctl -- submit expense-report --amount 120000 --approve --json --headless");
    expect(readme).toContain("npm run formctl -- record admin-invite http://127.0.0.1:4173/admin-invite --headless");
    expect(readme).toContain("npm run formctl -- submit admin-invite --email ops@example.com --role admin --notify true --dry-run --json --headless");
    expect(readme).toContain("npm run formctl -- record support-refund http://127.0.0.1:4173/support-refund --headless");
    expect(readme).toContain("npm run formctl -- submit support-refund --orderId ORD-1001 --refundDate 2026-05-26 --reason \"Duplicate charge\" --dry-run --json --headless");
    expect(readme).toContain("npm run formctl -- record vendor-onboarding http://127.0.0.1:4173/vendor-onboarding --headless");
    expect(readme).toContain("npm run formctl -- submit vendor-onboarding --legalName \"Acme Supplies\" --website https://vendor.example --taxForm demo/tax-form.txt --riskTier medium --ndaSigned true --onboardingDate 2026-05-26 --notes \"Approved vendor\" --dry-run --json --headless");
    expect(readme).toContain("![formctl demo](docs/assets/demo.svg)");
    expect(readme).toContain("audit.jsonl");
    expect(readme).toContain("failure.json");
    expect(readme).toContain("failure.png");
    expect(readme).toContain("Audit logs record selector checks, redacted field values, approval source, screenshots, and final result.");
    expect(readme).toContain("Selector mismatch failures write `failure.json`, `failure.png`, and `audit.jsonl` without filling or submitting the form.");
    expect(readme).toContain("[Agent safety guide](docs/agents.md)");
    expect(readme).toContain("Exit codes");
    expect(readme).toContain("5 approval required");
    expect(readme).toContain("Browser mode defaults");
    expect(readme).toContain("`record` defaults to `--headed` so humans can watch login and form discovery.");
    expect(readme).toContain("`submit --dry-run` defaults to `--headless` for repeatable agent and CI previews.");
    expect(readme).toContain("Use `--headed` or `--headless` to override the default for any browser-backed command.");
  });

  test("demo media shows the core record dry-run approve flow", () => {
    const demo = readFileSync(path.join(projectRoot, "docs", "assets", "demo.svg"), "utf8");

    expect(demo).toContain("<svg");
    expect(demo).toContain("formctl record expense-report");
    expect(demo).toContain("submit expense-report --amount 120000");
    expect(demo).toContain("--dry-run --json");
    expect(demo).toContain("\"status\":\"dry-run\"");
    expect(demo).toContain("\"exitCode\":5");
    expect(demo).toContain("--approve --json");
    expect(demo).toContain("\"status\":\"submitted\"");
  });

  test("demo fixture contains the fields used by README commands", () => {
    const expenseReport = readFileSync(path.join(projectRoot, "demo", "expense-report.html"), "utf8");
    const adminInvite = readFileSync(path.join(projectRoot, "demo", "admin-invite.html"), "utf8");
    const supportRefund = readFileSync(path.join(projectRoot, "demo", "support-refund.html"), "utf8");
    const vendorOnboarding = readFileSync(path.join(projectRoot, "demo", "vendor-onboarding.html"), "utf8");
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
    expect(taxForm).toContain("Sample vendor tax form");
    expect(server).toContain('"/admin-invite"');
    expect(server).toContain('"/admin-invite/submit"');
    expect(server).toContain('"/support-refund"');
    expect(server).toContain('"/support-refund/submit"');
    expect(server).toContain('"/vendor-onboarding"');
    expect(server).toContain('"/vendor-onboarding/submit"');
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
    expect(launch).toContain("npm test -- --run tests/cli.test.ts tests/release-readiness.test.ts");
    expect(launch).toContain("npx tsc --noEmit");
    expect(launch).toContain("npm run demo");
    expect(launch).toContain("Capture a 30-60 second demo");
    expect(launch).toContain("First 500 stars");
    expect(launch).toContain("10k stars");
  });

  test("CI runs demo replay tests on pull requests", () => {
    const packageJson = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));
    const ci = readFileSync(path.join(projectRoot, ".github", "workflows", "ci.yml"), "utf8");

    expect(packageJson.scripts["test:replay"]).toBe("vitest run tests/demo-replay.test.ts");
    expect(ci).toContain("pull_request");
    expect(ci).toContain("npm test -- --run tests/cli.test.ts tests/release-readiness.test.ts");
    expect(ci).toContain("npm run test:replay");
    expect(ci).toContain("npx tsc --noEmit");
  });

  test("announcement draft is ready for first public launch post", () => {
    const announcement = readFileSync(path.join(projectRoot, "docs", "ANNOUNCEMENT.md"), "utf8");

    expect(announcement).toContain("# formctl Announcement Draft");
    expect(announcement).toContain("https://github.com/codeyoma/formctl");
    expect(announcement).toContain("record a browser form once");
    expect(announcement).toContain("dry-run screenshots");
    expect(announcement).toContain("selector mismatch checks");
    expect(announcement).toContain("approval gates");
    expect(announcement).toContain("JSON output for agents");
    expect(announcement).toContain("What I want feedback on");
    expect(announcement).toContain("API-less workflows");
    expect(announcement).toContain("Launch checklist run");
    expect(announcement).toContain("npm test -- --run tests/cli.test.ts tests/release-readiness.test.ts");
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
    expect(agents).toContain("Treat exit code `5` as an approval gate, not a retryable failure.");
    expect(agents).toContain("Do not print secrets, file contents, cookies, or private page data.");
    expect(agents).toContain("Selector mismatch failures are safe stops and include `failure.json`, `failure.png`, and `audit.jsonl`.");
  });
});
