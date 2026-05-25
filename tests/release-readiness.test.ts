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
    expect(readme).toContain("![formctl demo](docs/assets/demo.svg)");
    expect(readme).toContain("Exit codes");
    expect(readme).toContain("5 approval required");
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
    const html = readFileSync(path.join(projectRoot, "demo", "expense-report.html"), "utf8");

    expect(html).toContain('action="/submit"');
    expect(html).toContain('name="amount"');
    expect(html).toContain('name="receipt"');
    expect(html).toContain('type="file"');
    expect(html).toContain('type="submit"');
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
});
