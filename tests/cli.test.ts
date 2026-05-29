import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, test } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(projectRoot, "src", "cli.ts");
const tsxLoaderPath = path.join(projectRoot, "node_modules", "tsx", "dist", "loader.mjs");
const workflowSafetyYaml = [
  "safety:",
  "  dryRunFirst: true",
  "  approvalRequired: true",
  "  selectorDrift: fail",
  "  fileInputs: redacted",
];

function runFormctl(args: string[], cwd = projectRoot, env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, ["--import", tsxLoaderPath, cliPath, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function runFormctlAsync(args: string[], cwd = projectRoot) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", tsxLoaderPath, cliPath, ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

function createWritableCapture() {
  let output = "";
  return {
    stream: new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    }),
    text: () => output,
  };
}

function createInteractiveInput(text: string) {
  const input = Readable.from([text]) as Readable & { isTTY?: boolean };
  input.isTTY = true;
  return input;
}

function createDelayedInteractiveInput(text: string, delayMs: number) {
  const input = new Readable({
    read() {},
  }) as Readable & { isTTY?: boolean };
  input.isTTY = true;
  setTimeout(() => {
    input.push(text);
    input.push(null);
  }, delayMs);
  return input;
}

function createClosedInteractiveInput() {
  const input = Readable.from([]) as Readable & { isTTY?: boolean };
  input.isTTY = true;
  return input;
}

async function serveFixture(html: string) {
  let postCount = 0;
  const server = http.createServer((_, response) => {
    if (_.method === "POST") {
      postCount += 1;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Fixture server did not expose a TCP port");
  }

  return {
    url: `http://127.0.0.1:${address.port}/expense`,
    postCount: () => postCount,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    }),
  };
}

describe("formctl CLI", () => {
  test("--help explains the core commands", () => {
    const result = runFormctl(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("formctl runs recorded browser forms as safe CLI commands");
    expect(result.stdout).toContain("formctl submit <workflow-name> --dry-run [flags]");
    expect(result.stdout).toContain("formctl submit <workflow-name> --approve [flags]");
    expect(result.stdout).toContain("Interactive submit shows a dry-run screenshot path before asking for approval.");
    expect(result.stdout).toContain("formctl inspect <workflow-name>");
    expect(result.stdout).toContain("formctl workflows [--json]");
    expect(result.stdout).toContain("formctl validate <workflow-name> [--json]");
    expect(result.stdout).toContain("formctl cleanup --max-age-days <days> [--dry-run] [--json]");
    expect(result.stdout).toContain("formctl record <workflow-name> <url>");
    expect(result.stdout).toContain("formctl doctor");
    expect(result.stdout).toContain("Start with an existing .formctl/workflows/<name>.yml file.");
    expect(result.stdout).toContain("Use record only when you need to create a new workflow.");
    expect(result.stdout).toContain("--headed");
    expect(result.stdout).toContain("--headless");
    expect(result.stdout).toContain("--resume-after-interaction");
    expect(result.stdout).toContain("--manual");
    expect(result.stdout).toContain("--version");
  });

  test("version flag prints the package version", () => {
    const packageJson = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));
    const result = runFormctl(["--version"]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(`formctl ${packageJson.version}\n`);
  });

  test("doctor --json reports a machine-readable ok status", () => {
    const result = runFormctl(["doctor", "--json"]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const payload = JSON.parse(result.stdout);

    expect(payload).toMatchObject({
      status: "ok",
      command: "doctor",
      exitCode: 0,
    });
    expect(payload.checks).toEqual(expect.arrayContaining([
      { name: "node", status: "ok" },
      { name: "workspace", status: "ok" },
      expect.objectContaining({
        name: "playwright-chromium",
        status: "ok",
        executablePath: expect.stringContaining("chromium"),
        installCommand: "npx playwright install chromium",
      }),
    ]));
  });

  test("doctor prints human-readable check details", () => {
    const result = runFormctl(["doctor"]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("formctl doctor: ok");
    expect(result.stdout).toContain("- node: ok");
    expect(result.stdout).toContain("- workspace: ok");
    expect(result.stdout).toContain("- playwright-chromium: ok");
    expect(result.stdout).toContain("executable:");
  });

  test("doctor exits 1 with install guidance when Playwright Chromium is missing", () => {
    const missingBrowserPath = path.join(mkdtempSync(path.join(os.tmpdir(), "formctl-missing-browsers-")), "browsers");
    const result = runFormctl(["doctor"], projectRoot, {
      PLAYWRIGHT_BROWSERS_PATH: missingBrowserPath,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("formctl doctor: error");
    expect(result.stdout).toContain("- playwright-chromium: error");
    expect(result.stdout).toContain("message: Playwright Chromium is not installed.");
    expect(result.stdout).toContain("install: npx playwright install chromium");
  });

  test("cleanup --dry-run --json reports expired run directories without deleting them", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-cleanup-dry-run-"));
    const runsDirectory = path.join(workspace, ".formctl", "runs");
    const oldRun = path.join(runsDirectory, "1000-dry-run");
    const recentRun = path.join(runsDirectory, "2000-dry-run");
    mkdirSync(oldRun, { recursive: true });
    mkdirSync(recentRun, { recursive: true });
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const recentDate = new Date(Date.now());
    utimesSync(oldRun, oldDate, oldDate);
    utimesSync(recentRun, recentDate, recentDate);

    const result = runFormctl(["cleanup", "--max-age-days", "7", "--dry-run", "--json"], workspace);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      status: "ok",
      command: "cleanup",
      exitCode: 0,
      dryRun: true,
      runsDirectory: ".formctl/runs",
      maxAgeDays: 7,
      removed: [],
      wouldRemove: [".formctl/runs/1000-dry-run"],
      kept: [".formctl/runs/2000-dry-run"],
    });
    expect(existsSync(oldRun)).toBe(true);
    expect(existsSync(recentRun)).toBe(true);
  });

  test("cleanup --json removes expired run directories and keeps recent runs", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-cleanup-remove-"));
    const runsDirectory = path.join(workspace, ".formctl", "runs");
    const oldRun = path.join(runsDirectory, "1000-failed");
    const recentRun = path.join(runsDirectory, "2000-dry-run");
    mkdirSync(oldRun, { recursive: true });
    mkdirSync(recentRun, { recursive: true });
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const recentDate = new Date(Date.now());
    utimesSync(oldRun, oldDate, oldDate);
    utimesSync(recentRun, recentDate, recentDate);

    const result = runFormctl(["cleanup", "--max-age-days", "7", "--json"], workspace);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      status: "ok",
      command: "cleanup",
      exitCode: 0,
      dryRun: false,
      runsDirectory: ".formctl/runs",
      maxAgeDays: 7,
      removed: [".formctl/runs/1000-failed"],
      wouldRemove: [],
      kept: [".formctl/runs/2000-dry-run"],
    });
    expect(existsSync(oldRun)).toBe(false);
    expect(existsSync(recentRun)).toBe(true);
  });

  test("inspect returns exit code 2 when the workflow does not exist", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-missing-workflow-"));
    const result = runFormctl(["inspect", "expense-report"], workspace);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Workflow not found: expense-report");
    expect(result.stderr).toContain(".formctl/workflows/expense-report.yml");
  });

  test("inspect --json returns a machine-readable workflow-not-found error", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-missing-inspect-json-"));
    const result = runFormctl(["inspect", "expense-report", "--json"], workspace);

    expect(result.status).toBe(2);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      status: "error",
      command: "inspect",
      workflow: "expense-report",
      exitCode: 2,
      error: {
        code: "workflow_not_found",
        message: "Workflow not found: expense-report",
        expectedPath: ".formctl/workflows/expense-report.yml",
      },
    });
  });

  test("validate --json returns a machine-readable workflow-not-found error", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-missing-validate-json-"));
    const result = runFormctl(["validate", "expense-report", "--json"], workspace);

    expect(result.status).toBe(2);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      status: "error",
      command: "validate",
      workflow: "expense-report",
      exitCode: 2,
      error: {
        code: "workflow_not_found",
        message: "Workflow not found: expense-report",
        expectedPath: ".formctl/workflows/expense-report.yml",
      },
    });
  });

  test("submit --dry-run --json returns a machine-readable workflow-not-found error", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-missing-submit-json-"));
    const result = runFormctl(["submit", "expense-report", "--dry-run", "--json"], workspace);

    expect(result.status).toBe(2);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      status: "error",
      command: "submit",
      workflow: "expense-report",
      exitCode: 2,
      submitted: false,
      requiresApproval: false,
      error: {
        code: "workflow_not_found",
        message: "Workflow not found: expense-report",
        expectedPath: ".formctl/workflows/expense-report.yml",
      },
    });
  });

  test("inspect --json rejects unsafe workflow names with a machine-readable error", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-unsafe-inspect-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "leaked.yml"),
      [
        "name: leaked",
        "url: http://localhost:3000/leaked",
        "fields:",
        "  - name: token",
        "    selector: input[name=\"token\"]",
        "    type: text",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    const result = runFormctl(["inspect", "../leaked", "--json"], workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      status: "error",
      command: "inspect",
      exitCode: 1,
      error: {
        code: "invalid_workflow_name",
        message: "Invalid workflow name: use letters, numbers, dots, underscores, or dashes only.",
      },
    });
    expect(result.stdout).not.toContain("leaked");
  });

  test("validate --json rejects unsafe workflow names with a machine-readable error", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-unsafe-validate-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "leaked.yml"),
      [
        "name: leaked",
        "url: http://localhost:3000/leaked",
        "safety:",
        "  dryRunFirst: true",
        "  approvalRequired: true",
        "  selectorDrift: fail",
        "  fileInputs: redacted",
        "fields:",
        "  - name: token",
        "    selector: input[name=\"token\"]",
        "    type: text",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    const result = runFormctl(["validate", "../leaked", "--json"], workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      status: "error",
      command: "validate",
      exitCode: 1,
      error: {
        code: "invalid_workflow_name",
        message: "Invalid workflow name: use letters, numbers, dots, underscores, or dashes only.",
      },
    });
    expect(result.stdout).not.toContain("leaked");
  });

  test("submit --json rejects unsafe workflow names before approval checks", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-unsafe-submit-"));
    const result = runFormctl(["submit", "../leaked", "--json"], workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      status: "error",
      command: "submit",
      exitCode: 1,
      error: {
        code: "invalid_workflow_name",
        message: "Invalid workflow name: use letters, numbers, dots, underscores, or dashes only.",
      },
    });
    expect(result.stdout).not.toContain("leaked");
  });

  test("workflows --json lists available workflow files", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-list-workflows-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        "url: http://localhost:3000/expense",
        "screenshots:",
        "  baseline: .formctl/workflows/expense-report.baseline.png",
        "recording:",
        "  mode: manual",
        "  events:",
        "    - event: input",
        "      field: amount",
        "      selector: input[name=\"amount\"]",
        "      value: \"[redacted]\"",
        "safety:",
        "  dryRunFirst: true",
        "  approvalRequired: true",
        "  selectorDrift: fail",
        "  fileInputs: redacted",
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "admin-invite.yml"),
      [
        "name: admin-invite",
        "url: http://localhost:3000/admin-invite",
        "safety:",
        "  dryRunFirst: true",
        "  approvalRequired: true",
        "  selectorDrift: fail",
        "  fileInputs: redacted",
        "fields:",
        "  - name: email",
        "    selector: input[name=\"email\"]",
        "    type: email",
        "  - name: role",
        "    selector: select[name=\"role\"]",
        "    type: select",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );
    writeFileSync(path.join(workspace, ".formctl", "workflows", "expense-report.baseline.png"), "not yaml\n");

    const result = runFormctl(["workflows", "--json"], workspace);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      status: "ok",
      workflows: [
        {
          name: "admin-invite",
          path: ".formctl/workflows/admin-invite.yml",
          url: "http://localhost:3000/admin-invite",
          fieldCount: 2,
        },
        {
          name: "expense-report",
          path: ".formctl/workflows/expense-report.yml",
          url: "http://localhost:3000/expense",
          fieldCount: 1,
          screenshots: {
            baseline: ".formctl/workflows/expense-report.baseline.png",
          },
          recording: {
            mode: "manual",
            eventCount: 1,
          },
        },
      ],
    });
  });

  test("workflows --json reports unreadable workflow files without failing discovery", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-list-unreadable-workflows-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(path.join(workspace, ".formctl", "workflows", "broken-workflow.yml"), "name: [\n");
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        "url: http://localhost:3000/expense",
        "safety:",
        "  dryRunFirst: true",
        "  approvalRequired: true",
        "  selectorDrift: fail",
        "  fileInputs: redacted",
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    const result = runFormctl(["workflows", "--json"], workspace);
    const parsed = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(parsed.workflows).toHaveLength(2);
    expect(parsed.workflows[0]).toMatchObject({
      name: "broken-workflow",
      path: ".formctl/workflows/broken-workflow.yml",
      status: "error",
      error: {
        code: "workflow_unreadable",
        fix: "Repair .formctl/workflows/broken-workflow.yml so it is valid YAML before retrying workflows.",
      },
    });
    expect(parsed.workflows[0].error.message).toEqual(expect.any(String));
    expect(parsed.workflows[1]).toEqual({
      name: "expense-report",
      path: ".formctl/workflows/expense-report.yml",
      url: "http://localhost:3000/expense",
      fieldCount: 1,
    });
  });

  test("workflows --json reports invalid workflow files without failing discovery", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-list-invalid-workflows-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "broken-workflow.yml"),
      [
        "name: broken-workflow",
        "url: http://localhost:3000/broken",
        "fields: []",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        "url: http://localhost:3000/expense",
        "safety:",
        "  dryRunFirst: true",
        "  approvalRequired: true",
        "  selectorDrift: fail",
        "  fileInputs: redacted",
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    const result = runFormctl(["workflows", "--json"], workspace);
    const parsed = JSON.parse(result.stdout);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(parsed.workflows).toHaveLength(2);
    expect(parsed.workflows[0]).toMatchObject({
      name: "broken-workflow",
      path: ".formctl/workflows/broken-workflow.yml",
      status: "error",
      error: {
        code: "workflow_invalid",
        message: "Workflow validation failed: fields, safety-metadata",
        fix: "Run formctl validate broken-workflow --json for detailed repair guidance.",
      },
      checks: [
        {
          name: "fields",
          status: "error",
          message: "Workflow must include at least one field with name, selector, and type.",
          fix: "Add fields entries with name, selector, and type for every required form field.",
        },
        {
          name: "safety-metadata",
          status: "error",
          message: "Workflow safety metadata must match the enforced dry-run, approval, selector drift, and file redaction contract.",
          fix: "Add safety.dryRunFirst: true, safety.approvalRequired: true, safety.selectorDrift: fail, and safety.fileInputs: redacted.",
        },
      ],
    });
    expect(parsed.workflows[1]).toEqual({
      name: "expense-report",
      path: ".formctl/workflows/expense-report.yml",
      url: "http://localhost:3000/expense",
      fieldCount: 1,
    });
  });

  test("validate --json confirms a reviewable workflow file", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-valid-workflow-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        "url: http://localhost:3000/expense",
        "safety:",
        "  dryRunFirst: true",
        "  approvalRequired: true",
        "  selectorDrift: fail",
        "  fileInputs: redacted",
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    const result = runFormctl(["validate", "expense-report", "--json"], workspace);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      status: "ok",
      command: "validate",
      workflow: "expense-report",
      path: ".formctl/workflows/expense-report.yml",
      exitCode: 0,
      checks: [
        { name: "readable-yaml", status: "ok" },
        { name: "workflow-name", status: "ok" },
        { name: "target-url", status: "ok" },
        { name: "fields", status: "ok" },
        { name: "field-names", status: "ok" },
        { name: "field-name-safety", status: "ok" },
        { name: "field-types", status: "ok" },
        { name: "submit-selector", status: "ok" },
        { name: "safety-metadata", status: "ok" },
      ],
    });
  });

  test("validate --json returns repair guidance when workflow YAML is unreadable", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-unreadable-yaml-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(path.join(workspace, ".formctl", "workflows", "expense-report.yml"), "name: [\n");

    const result = runFormctl(["validate", "expense-report", "--json"], workspace);
    const parsed = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(parsed.status).toBe("error");
    expect(parsed.command).toBe("validate");
    expect(parsed.workflow).toBe("expense-report");
    expect(parsed.path).toBe(".formctl/workflows/expense-report.yml");
    expect(parsed.exitCode).toBe(1);
    expect(parsed.checks).toHaveLength(1);
    expect(parsed.checks[0]).toMatchObject({
      name: "readable-yaml",
      status: "error",
      fix: "Repair .formctl/workflows/expense-report.yml so it is valid YAML before retrying validation.",
    });
    expect(parsed.checks[0].message).toEqual(expect.any(String));
  });

  test("inspect --json returns a machine-readable error when workflow YAML is unreadable", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-unreadable-inspect-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(path.join(workspace, ".formctl", "workflows", "expense-report.yml"), "name: [\n");

    const result = runFormctl(["inspect", "expense-report", "--json"], workspace);
    const parsed = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(parsed).toMatchObject({
      status: "error",
      command: "inspect",
      workflow: "expense-report",
      exitCode: 1,
      error: {
        code: "workflow_unreadable",
        path: ".formctl/workflows/expense-report.yml",
        fix: "Repair .formctl/workflows/expense-report.yml so it is valid YAML before retrying inspect.",
      },
    });
    expect(parsed.error.message).toEqual(expect.any(String));
  });

  test("submit --dry-run --json returns a machine-readable error when workflow YAML is unreadable", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-unreadable-submit-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(path.join(workspace, ".formctl", "workflows", "expense-report.yml"), "name: [\n");

    const result = runFormctl(["submit", "expense-report", "--dry-run", "--json"], workspace);
    const parsed = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(parsed).toMatchObject({
      status: "error",
      command: "submit",
      workflow: "expense-report",
      exitCode: 1,
      submitted: false,
      requiresApproval: false,
      error: {
        code: "workflow_unreadable",
        path: ".formctl/workflows/expense-report.yml",
        fix: "Repair .formctl/workflows/expense-report.yml so it is valid YAML before retrying submit.",
      },
    });
    expect(parsed.error.message).toEqual(expect.any(String));
  });

  test("inspect --json returns repair guidance when workflow schema is invalid", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-invalid-inspect-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        "url: http://localhost:3000/expense",
        "fields: []",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    const result = runFormctl(["inspect", "expense-report", "--json"], workspace);
    const parsed = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(parsed).toMatchObject({
      status: "error",
      command: "inspect",
      workflow: "expense-report",
      path: ".formctl/workflows/expense-report.yml",
      exitCode: 1,
      error: {
        code: "workflow_invalid",
        message: "Workflow validation failed: fields, safety-metadata",
        fix: "Run formctl validate expense-report --json for detailed repair guidance.",
      },
      checks: [
        {
          name: "fields",
          status: "error",
          message: "Workflow must include at least one field with name, selector, and type.",
          fix: "Add fields entries with name, selector, and type for every required form field.",
        },
        {
          name: "safety-metadata",
          status: "error",
          message: "Workflow safety metadata must match the enforced dry-run, approval, selector drift, and file redaction contract.",
          fix: "Add safety.dryRunFirst: true, safety.approvalRequired: true, safety.selectorDrift: fail, and safety.fileInputs: redacted.",
        },
      ],
    });
  });

  test("submit --dry-run --json returns repair guidance when workflow schema is invalid", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-invalid-submit-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        "url: http://127.0.0.1:1/expense",
        "fields: []",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    const result = runFormctl(["submit", "expense-report", "--dry-run", "--json"], workspace);
    const parsed = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(parsed).toMatchObject({
      status: "error",
      command: "submit",
      workflow: "expense-report",
      path: ".formctl/workflows/expense-report.yml",
      exitCode: 1,
      submitted: false,
      requiresApproval: false,
      error: {
        code: "workflow_invalid",
        message: "Workflow validation failed: fields, safety-metadata",
        fix: "Run formctl validate expense-report --json for detailed repair guidance.",
      },
      checks: [
        {
          name: "fields",
          status: "error",
          message: "Workflow must include at least one field with name, selector, and type.",
          fix: "Add fields entries with name, selector, and type for every required form field.",
        },
        {
          name: "safety-metadata",
          status: "error",
          message: "Workflow safety metadata must match the enforced dry-run, approval, selector drift, and file redaction contract.",
          fix: "Add safety.dryRunFirst: true, safety.approvalRequired: true, safety.selectorDrift: fail, and safety.fileInputs: redacted.",
        },
      ],
    });
  });

  test("submit --dry-run --json rejects invalid target URLs before browser work", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-invalid-target-url-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        "url: not-a-url",
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    const result = runFormctl([
      "submit",
      "expense-report",
      "--amount",
      "120000",
      "--dry-run",
      "--json",
      "--headless",
    ], workspace);
    const parsed = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(parsed).toMatchObject({
      status: "error",
      command: "submit",
      workflow: "expense-report",
      path: ".formctl/workflows/expense-report.yml",
      exitCode: 1,
      submitted: false,
      requiresApproval: false,
      error: {
        code: "workflow_invalid",
        message: "Workflow validation failed: target-url",
        fix: "Run formctl validate expense-report --json for detailed repair guidance.",
      },
      checks: [
        {
          name: "target-url",
          status: "error",
          message: "Workflow target URL must be an absolute http or https URL.",
          fix: "Set url to an absolute http:// or https:// URL for the form page.",
        },
      ],
    });
    expect(existsSync(path.join(workspace, ".formctl", "runs"))).toBe(false);
  });

  test("submit --dry-run --json rejects unsupported field types before browser work", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-unsupported-field-type-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        "url: http://127.0.0.1:9/expense",
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: range-slider",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    const result = runFormctl([
      "submit",
      "expense-report",
      "--amount",
      "120000",
      "--dry-run",
      "--json",
      "--headless",
    ], workspace);
    const parsed = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(parsed).toMatchObject({
      status: "error",
      command: "submit",
      workflow: "expense-report",
      path: ".formctl/workflows/expense-report.yml",
      exitCode: 1,
      submitted: false,
      requiresApproval: false,
      error: {
        code: "workflow_invalid",
        message: "Workflow validation failed: field-types",
        fix: "Run formctl validate expense-report --json for detailed repair guidance.",
      },
      checks: [
        {
          name: "field-types",
          status: "error",
          message: "Unsupported workflow field type(s): amount: range-slider.",
          fix: "Use one of: text, email, number, date, file, select, checkbox, textarea, url, tel, password, search.",
        },
      ],
    });
    expect(existsSync(path.join(workspace, ".formctl", "runs"))).toBe(false);
  });

  test("submit --dry-run --json rejects duplicate field names before browser work", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-duplicate-field-name-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        "url: http://127.0.0.1:9/expense",
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"subtotal\"]",
        "    type: number",
        "  - name: amount",
        "    selector: input[name=\"total\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    const result = runFormctl([
      "submit",
      "expense-report",
      "--amount",
      "120000",
      "--dry-run",
      "--json",
      "--headless",
    ], workspace);
    const parsed = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(parsed).toMatchObject({
      status: "error",
      command: "submit",
      workflow: "expense-report",
      path: ".formctl/workflows/expense-report.yml",
      exitCode: 1,
      submitted: false,
      requiresApproval: false,
      error: {
        code: "workflow_invalid",
        message: "Workflow validation failed: field-names",
        fix: "Run formctl validate expense-report --json for detailed repair guidance.",
      },
      checks: [
        {
          name: "field-names",
          status: "error",
          message: "Workflow field names must be unique. Duplicate field name(s): amount.",
          fix: "Use unique field names so CLI flags and values files map to exactly one form field.",
        },
      ],
    });
    expect(existsSync(path.join(workspace, ".formctl", "runs"))).toBe(false);
  });

  test("submit --dry-run --json rejects unsafe field names before browser work", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-unsafe-field-name-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        "url: http://127.0.0.1:9/expense",
        ...workflowSafetyYaml,
        "fields:",
        "  - name: dry-run",
        "    selector: input[name=\"dry-run\"]",
        "    type: text",
        "  - name: receipt.file",
        "    selector: input[name=\"receipt.file\"]",
        "    type: file",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    const result = runFormctl([
      "submit",
      "expense-report",
      "--dry-run",
      "preview",
      "--receipt.file",
      "receipt.txt",
      "--json",
      "--headless",
    ], workspace);
    const parsed = JSON.parse(result.stdout);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(parsed).toMatchObject({
      status: "error",
      command: "submit",
      workflow: "expense-report",
      path: ".formctl/workflows/expense-report.yml",
      exitCode: 1,
      submitted: false,
      requiresApproval: false,
      error: {
        code: "workflow_invalid",
        message: "Workflow validation failed: field-name-safety",
        fix: "Run formctl validate expense-report --json for detailed repair guidance.",
      },
      checks: [
        {
          name: "field-name-safety",
          status: "error",
          message: "Workflow field names must be safe CLI flags. Unsafe or reserved field name(s): dry-run, receipt.file.",
          fix: "Use names that start with a letter and contain only letters, numbers, underscores, or dashes, excluding formctl control flags.",
        },
      ],
    });
    expect(existsSync(path.join(workspace, ".formctl", "runs"))).toBe(false);
  });

  test("validate --json exits 1 when safety metadata is missing", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-invalid-workflow-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        "url: http://localhost:3000/expense",
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    const result = runFormctl(["validate", "expense-report", "--json"], workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      status: "error",
      command: "validate",
      workflow: "expense-report",
      path: ".formctl/workflows/expense-report.yml",
      exitCode: 1,
      checks: [
        { name: "readable-yaml", status: "ok" },
        { name: "workflow-name", status: "ok" },
        { name: "target-url", status: "ok" },
        { name: "fields", status: "ok" },
        { name: "field-names", status: "ok" },
        { name: "field-name-safety", status: "ok" },
        { name: "field-types", status: "ok" },
        { name: "submit-selector", status: "ok" },
        {
          name: "safety-metadata",
          status: "error",
          message: "Workflow safety metadata must match the enforced dry-run, approval, selector drift, and file redaction contract.",
          fix: "Add safety.dryRunFirst: true, safety.approvalRequired: true, safety.selectorDrift: fail, and safety.fileInputs: redacted.",
        },
      ],
    });
  });

  test("validate --json exits 1 when recording metadata is not redacted", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-invalid-recording-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        "url: http://localhost:3000/expense",
        "recording:",
        "  mode: manual",
        "  events:",
        "    - event: input",
        "      field: amount",
        "      selector: input[name=\"amount\"]",
        "      value: 120000",
        "safety:",
        "  dryRunFirst: true",
        "  approvalRequired: true",
        "  selectorDrift: fail",
        "  fileInputs: redacted",
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    const result = runFormctl(["validate", "expense-report", "--json"], workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      status: "error",
      command: "validate",
      workflow: "expense-report",
      path: ".formctl/workflows/expense-report.yml",
      exitCode: 1,
      checks: [
        { name: "readable-yaml", status: "ok" },
        { name: "workflow-name", status: "ok" },
        { name: "target-url", status: "ok" },
        { name: "fields", status: "ok" },
        { name: "field-names", status: "ok" },
        { name: "field-name-safety", status: "ok" },
        { name: "field-types", status: "ok" },
        { name: "submit-selector", status: "ok" },
        { name: "safety-metadata", status: "ok" },
        {
          name: "recording-metadata",
          status: "error",
          message: "Recording metadata must use manual mode, redacted input/change/select/file/click/wait events, known field selectors, and bounded navigation waits.",
          fix: "Use recording.mode: manual with redacted field events, named click selectors, or waitFor: navigation wait events.",
        },
      ],
    });
  });

  test("validate --json exits 1 when recording metadata references unknown fields", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-recording-unknown-field-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        "url: http://localhost:3000/expense",
        "recording:",
        "  mode: manual",
        "  events:",
        "    - event: input",
        "      field: total",
        "      selector: input[name=\"total\"]",
        "      value: \"[redacted]\"",
        "safety:",
        "  dryRunFirst: true",
        "  approvalRequired: true",
        "  selectorDrift: fail",
        "  fileInputs: redacted",
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    const result = runFormctl(["validate", "expense-report", "--json"], workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      status: "error",
      command: "validate",
      workflow: "expense-report",
      path: ".formctl/workflows/expense-report.yml",
      exitCode: 1,
      checks: [
        { name: "readable-yaml", status: "ok" },
        { name: "workflow-name", status: "ok" },
        { name: "target-url", status: "ok" },
        { name: "fields", status: "ok" },
        { name: "field-names", status: "ok" },
        { name: "field-name-safety", status: "ok" },
        { name: "field-types", status: "ok" },
        { name: "submit-selector", status: "ok" },
        { name: "safety-metadata", status: "ok" },
        {
          name: "recording-metadata",
          status: "error",
          message: "Recording metadata must use manual mode, redacted input/change/select/file/click/wait events, known field selectors, and bounded navigation waits.",
          fix: "Use recording.mode: manual with redacted field events, named click selectors, or waitFor: navigation wait events.",
        },
      ],
    });
  });

  test("validate --json exits 1 when click recording metadata uses an unbounded selector", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-recording-wide-click-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        "url: http://localhost:3000/expense",
        "recording:",
        "  mode: manual",
        "  events:",
        "    - event: click",
        "      selector: body",
        "      value: \"[redacted]\"",
        "safety:",
        "  dryRunFirst: true",
        "  approvalRequired: true",
        "  selectorDrift: fail",
        "  fileInputs: redacted",
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    const result = runFormctl(["validate", "expense-report", "--json"], workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      status: "error",
      command: "validate",
      workflow: "expense-report",
      path: ".formctl/workflows/expense-report.yml",
      exitCode: 1,
      checks: [
        { name: "readable-yaml", status: "ok" },
        { name: "workflow-name", status: "ok" },
        { name: "target-url", status: "ok" },
        { name: "fields", status: "ok" },
        { name: "field-names", status: "ok" },
        { name: "field-name-safety", status: "ok" },
        { name: "field-types", status: "ok" },
        { name: "submit-selector", status: "ok" },
        { name: "safety-metadata", status: "ok" },
        {
          name: "recording-metadata",
          status: "error",
          message: "Recording metadata must use manual mode, redacted input/change/select/file/click/wait events, known field selectors, and bounded navigation waits.",
          fix: "Use recording.mode: manual with redacted field events, named click selectors, or waitFor: navigation wait events.",
        },
      ],
    });
  });

  test("validate --json exits 1 when wait recording metadata stores a URL", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-recording-wait-url-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        "url: http://localhost:3000/expense",
        "recording:",
        "  mode: manual",
        "  events:",
        "    - event: wait",
        "      waitFor: navigation",
        "      url: http://internal.example/expense/details?token=secret",
        "      value: \"[redacted]\"",
        "safety:",
        "  dryRunFirst: true",
        "  approvalRequired: true",
        "  selectorDrift: fail",
        "  fileInputs: redacted",
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    const result = runFormctl(["validate", "expense-report", "--json"], workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      status: "error",
      command: "validate",
      workflow: "expense-report",
      path: ".formctl/workflows/expense-report.yml",
      exitCode: 1,
      checks: [
        { name: "readable-yaml", status: "ok" },
        { name: "workflow-name", status: "ok" },
        { name: "target-url", status: "ok" },
        { name: "fields", status: "ok" },
        { name: "field-names", status: "ok" },
        { name: "field-name-safety", status: "ok" },
        { name: "field-types", status: "ok" },
        { name: "submit-selector", status: "ok" },
        { name: "safety-metadata", status: "ok" },
        {
          name: "recording-metadata",
          status: "error",
          message: "Recording metadata must use manual mode, redacted input/change/select/file/click/wait events, known field selectors, and bounded navigation waits.",
          fix: "Use recording.mode: manual with redacted field events, named click selectors, or waitFor: navigation wait events.",
        },
      ],
    });
  });

  test("validate --json exits 1 when workflow steps use an unbounded selector", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-step-wide-selector-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "approval-modal.yml"),
      [
        "name: approval-modal",
        "url: http://localhost:3000/approval",
        "steps:",
        "  - name: open modal",
        "    action: click",
        "    selector: body",
        "    when: before-fields",
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    const result = runFormctl(["validate", "approval-modal", "--json"], workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "error",
      workflow: "approval-modal",
      exitCode: 1,
      checks: [
        { name: "readable-yaml", status: "ok" },
        { name: "workflow-name", status: "ok" },
        { name: "target-url", status: "ok" },
        { name: "fields", status: "ok" },
        { name: "field-names", status: "ok" },
        { name: "field-name-safety", status: "ok" },
        { name: "field-types", status: "ok" },
        { name: "submit-selector", status: "ok" },
        { name: "safety-metadata", status: "ok" },
        {
          name: "workflow-steps",
          status: "error",
          message: "Workflow steps must be bounded click steps. Navigation waits must be same-origin path-only targets.",
          fix: "Use name, action: click, selector: button[name=\"...\"] or input[name=\"...\"], when: before-fields or after-fields, and optional waitFor.type: navigation with sameOrigin: true and a path without query or fragment.",
        },
      ],
    });
  });

  test("validate --json rejects unsafe navigation workflow steps", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-step-navigation-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });

    const writeWorkflow = (name: string, stepYaml: string[]) => {
      writeFileSync(
        path.join(workspace, ".formctl", "workflows", `${name}.yml`),
        [
          `name: ${name}`,
          "url: http://localhost:3000/approval",
          "steps:",
          ...stepYaml,
          ...workflowSafetyYaml,
          "fields:",
          "  - name: amount",
          "    selector: input[name=\"amount\"]",
          "    type: number",
          "submit:",
          "  selector: button[type=\"submit\"]",
          "",
        ].join("\n"),
      );
    };

    writeWorkflow("full-url-navigation", [
      "  - name: continue to details",
      "    action: click",
      "    selector: button[name=\"continue\"]",
      "    when: after-fields",
      "    waitFor:",
      "      type: navigation",
      "      sameOrigin: true",
      "      url: https://admin.example.test/procurement/details?token=secret",
    ]);
    writeWorkflow("cross-origin-navigation", [
      "  - name: continue to external approval",
      "    action: click",
      "    selector: button[name=\"continue\"]",
      "    when: after-fields",
      "    waitFor:",
      "      type: navigation",
      "      sameOrigin: false",
      "      path: /procurement/details",
    ]);
    writeWorkflow("direct-navigation", [
      "  - name: open details directly",
      "    action: goto",
      "    url: https://admin.example.test/procurement/details",
      "    when: after-fields",
    ]);
    writeWorkflow("query-navigation", [
      "  - name: continue to details",
      "    action: click",
      "    selector: button[name=\"continue\"]",
      "    when: after-fields",
      "    waitFor:",
      "      type: navigation",
      "      sameOrigin: true",
      "      path: /procurement/details?token=secret",
    ]);

    for (const workflowName of ["full-url-navigation", "cross-origin-navigation", "direct-navigation", "query-navigation"]) {
      const result = runFormctl(["validate", workflowName, "--json"], workspace);

      expect(result.status).toBe(1);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        status: "error",
        workflow: workflowName,
        exitCode: 1,
        checks: expect.arrayContaining([
          {
            name: "workflow-steps",
            status: "error",
            message: "Workflow steps must be bounded click steps. Navigation waits must be same-origin path-only targets.",
            fix: "Use name, action: click, selector: button[name=\"...\"] or input[name=\"...\"], when: before-fields or after-fields, and optional waitFor.type: navigation with sameOrigin: true and a path without query or fragment.",
          },
        ]),
      });
    }
  });

  test("validate --json accepts same-origin path-only navigation workflow steps", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-step-navigation-valid-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "approval-navigation.yml"),
      [
        "name: approval-navigation",
        "url: http://localhost:3000/approval",
        "steps:",
        "  - name: continue to confirmation",
        "    action: click",
        "    selector: button[name=\"continue\"]",
        "    when: after-fields",
        "    waitFor:",
        "      type: navigation",
        "      sameOrigin: true",
        "      path: /approval/confirm",
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[name=\"final-submit\"]",
        "",
      ].join("\n"),
    );

    const result = runFormctl(["validate", "approval-navigation", "--json"], workspace);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "ok",
      workflow: "approval-navigation",
      checks: expect.arrayContaining([
        { name: "workflow-steps", status: "ok" },
      ]),
    });
  });

  test("validate --json accepts bounded before-fields and after-fields workflow steps", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-step-after-fields-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "approval-modal.yml"),
      [
        "name: approval-modal",
        "url: http://localhost:3000/approval",
        "steps:",
        "  - name: open modal",
        "    action: click",
        "    selector: button[name=\"open-approval\"]",
        "    when: before-fields",
        "  - name: review details",
        "    action: click",
        "    selector: button[name=\"review-details\"]",
        "    when: after-fields",
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    const result = runFormctl(["validate", "approval-modal", "--json"], workspace);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "ok",
      workflow: "approval-modal",
      checks: expect.arrayContaining([
        { name: "workflow-steps", status: "ok" },
      ]),
    });
  });

  test("validate prints repair guidance for invalid workflow files", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-invalid-workflow-human-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        "url: http://localhost:3000/expense",
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    const result = runFormctl(["validate", "expense-report"], workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("- safety-metadata: error");
    expect(result.stdout).toContain("message: Workflow safety metadata must match the enforced dry-run, approval, selector drift, and file redaction contract.");
    expect(result.stdout).toContain("fix: Add safety.dryRunFirst: true, safety.approvalRequired: true, safety.selectorDrift: fail, and safety.fileInputs: redacted.");
  });

  test("inspect --json reads a recorded workflow file", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-existing-workflow-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        "url: http://localhost:3000/expense",
        "screenshots:",
        "  baseline: .formctl/workflows/expense-report.baseline.png",
        "safety:",
        "  dryRunFirst: true",
        "  approvalRequired: true",
        "  selectorDrift: fail",
        "  fileInputs: redacted",
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "  - name: receipt",
        "    selector: input[name=\"receipt\"]",
        "    type: file",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    const result = runFormctl(["inspect", "expense-report", "--json"], workspace);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      status: "ok",
      workflow: "expense-report",
      url: "http://localhost:3000/expense",
      screenshots: {
        baseline: ".formctl/workflows/expense-report.baseline.png",
      },
      safety: {
        dryRunFirst: true,
        approvalRequired: true,
        selectorDrift: "fail",
        fileInputs: "redacted",
      },
      fields: [
        { name: "amount", selector: 'input[name="amount"]', type: "number" },
        { name: "receipt", selector: 'input[name="receipt"]', type: "file" },
      ],
      submit: { selector: 'button[type="submit"]' },
    });
  });

  test("inspect --json returns manual recording metadata when present", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-inspect-recording-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        "url: http://localhost:3000/expense",
        "recording:",
        "  mode: manual",
        "  events:",
        "    - event: input",
        "      field: amount",
        "      selector: input[name=\"amount\"]",
        "      value: \"[redacted]\"",
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    const result = runFormctl(["inspect", "expense-report", "--json"], workspace);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout).recording).toEqual({
      mode: "manual",
      events: [
        {
          event: "input",
          field: "amount",
          selector: 'input[name="amount"]',
          value: "[redacted]",
        },
      ],
    });
  });

  test("inspect --json returns workflow steps when present", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-inspect-steps-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "approval-modal.yml"),
      [
        "name: approval-modal",
        "url: http://localhost:3000/approval",
        "steps:",
        "  - name: open approval modal",
        "    action: click",
        "    selector: button[name=\"open-approval\"]",
        "    when: before-fields",
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    const result = runFormctl(["inspect", "approval-modal", "--json"], workspace);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "ok",
      workflow: "approval-modal",
      steps: [
        {
          name: "open approval modal",
          action: "click",
          selector: 'button[name="open-approval"]',
          when: "before-fields",
        },
      ],
    });
  });

  test("record creates a workflow file from a live form", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form aria-label="Expense report">
            <label>
              Amount
              <input name="amount" type="number" aria-describedby="amount-help" />
            </label>
            <p id="amount-help">Amount in KRW</p>
            <label>
              Receipt
              <input name="receipt" type="file" />
            </label>
            <button type="submit">Submit expense</button>
          </form>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-record-workflow-"));

    try {
      const result = await runFormctlAsync(["record", "expense-report", fixture.url, "--headless"], workspace);
      const workflowPath = path.join(workspace, ".formctl", "workflows", "expense-report.yml");
      const baselineScreenshotPath = path.join(workspace, ".formctl", "workflows", "expense-report.baseline.png");

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Recorded workflow: expense-report");
      expect(result.stdout).toContain(".formctl/workflows/expense-report.yml");
      expect(result.stdout).toContain(".formctl/workflows/expense-report.baseline.png");
      expect(existsSync(workflowPath)).toBe(true);
      expect(existsSync(baselineScreenshotPath)).toBe(true);
      expect(parse(readFileSync(workflowPath, "utf8"))).toEqual({
        name: "expense-report",
        url: fixture.url,
        screenshots: {
          baseline: ".formctl/workflows/expense-report.baseline.png",
        },
        safety: {
          dryRunFirst: true,
          approvalRequired: true,
          selectorDrift: "fail",
          fileInputs: "redacted",
        },
        fields: [
          {
            name: "amount",
            selector: 'input[name="amount"]',
            type: "number",
            label: "Amount",
            description: "Amount in KRW",
          },
          { name: "receipt", selector: 'input[name="receipt"]', type: "file", label: "Receipt" },
        ],
        submit: { selector: 'button[type="submit"]' },
      });
    } finally {
      await fixture.close();
    }
  });

  test("record uses a storage state file for authenticated forms", async () => {
    const server = http.createServer((request, response) => {
      const isAuthenticated = request.headers.cookie?.includes("formctl_session=valid") ?? false;
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(isAuthenticated ? `
        <!doctype html>
        <html>
          <body>
            <form aria-label="Expense report">
              <label>
                Amount
                <input name="amount" type="number" />
              </label>
              <button type="submit">Submit expense</button>
            </form>
          </body>
        </html>
      ` : `
        <!doctype html>
        <html>
          <body>
            <form aria-label="Sign in">
              <label>Email <input name="email" type="email" autocomplete="username" /></label>
              <label>Password <input name="password" type="password" autocomplete="current-password" /></label>
              <button type="submit">Sign in</button>
            </form>
          </body>
        </html>
      `);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Authenticated fixture server did not expose a TCP port");
    }

    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-record-storage-state-"));
    writeFileSync(
      path.join(workspace, "storage-state.json"),
      JSON.stringify({
        cookies: [
          {
            name: "formctl_session",
            value: "valid",
            domain: "127.0.0.1",
            path: "/",
            expires: -1,
            httpOnly: false,
            secure: false,
            sameSite: "Lax",
          },
        ],
        origins: [],
      }),
    );

    try {
      const result = await runFormctlAsync([
        "record",
        "expense-report",
        `http://127.0.0.1:${address.port}/expense`,
        "--storage-state",
        "storage-state.json",
        "--headless",
      ], workspace);
      const workflowPath = path.join(workspace, ".formctl", "workflows", "expense-report.yml");

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(parse(readFileSync(workflowPath, "utf8")).fields).toEqual([
        {
          name: "amount",
          selector: 'input[name="amount"]',
          type: "number",
          label: "Amount",
        },
      ]);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  test("record --manual waits for user confirmation before saving the workflow", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form aria-label="Expense report">
            <label>
              Amount
              <input name="amount" type="number" />
            </label>
            <button type="submit">Submit expense</button>
          </form>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-manual-record-"));
    const stdout = createWritableCapture();
    const stderr = createWritableCapture();
    const previousCwd = process.cwd();

    try {
      const { run } = await import("../src/cli.js");

      process.chdir(workspace);
      const status = await run(
        [
          process.execPath,
          cliPath,
          "record",
          "expense-report",
          fixture.url,
          "--manual",
          "--headless",
        ],
        stdout.stream,
        stderr.stream,
        createInteractiveInput("\n"),
      );
      const workflowPath = path.join(workspace, ".formctl", "workflows", "expense-report.yml");

      expect(status).toBe(0);
      expect(stderr.text()).toBe("");
      expect(stdout.text()).toContain("Manual record: complete the form in the browser, then press Enter here to save.");
      expect(stdout.text()).toContain("Recorded workflow: expense-report");
      expect(existsSync(workflowPath)).toBe(true);
    } finally {
      process.chdir(previousCwd);
      await fixture.close();
    }
  });

  test("record --manual cancels without saving when confirmation input closes", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form aria-label="Expense report">
            <label>
              Amount
              <input name="amount" type="number" />
            </label>
            <button type="submit">Submit expense</button>
          </form>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-manual-record-closed-"));
    const stdout = createWritableCapture();
    const stderr = createWritableCapture();
    const previousCwd = process.cwd();

    try {
      const { run } = await import("../src/cli.js");

      process.chdir(workspace);
      const status = await run(
        [
          process.execPath,
          cliPath,
          "record",
          "expense-report",
          fixture.url,
          "--manual",
          "--headless",
        ],
        stdout.stream,
        stderr.stream,
        createClosedInteractiveInput(),
      );
      const workflowPath = path.join(workspace, ".formctl", "workflows", "expense-report.yml");

      expect(status).toBe(1);
      expect(stdout.text()).toContain("Manual record: complete the form in the browser, then press Enter here to save.");
      expect(stderr.text()).toContain("Manual record canceled: no confirmation received.");
      expect(existsSync(workflowPath)).toBe(false);
    } finally {
      process.chdir(previousCwd);
      await fixture.close();
    }
  });

  test("record --manual captures redacted field interaction events", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form aria-label="Expense report">
            <label>
              Amount
              <input name="amount" type="number" />
            </label>
            <label>
              Receipt
              <input name="receipt" type="file" />
            </label>
            <label>
              Department
              <select name="department">
                <option value="">Choose department</option>
                <option value="ops">Ops</option>
              </select>
            </label>
            <button type="button" name="open-details">Open details</button>
            <button type="submit">Submit expense</button>
          </form>
          <script>
            const recordWhenReady = setInterval(() => {
              if (!window.__formctlManualReady) {
                return;
              }
              clearInterval(recordWhenReady);
              const openDetails = document.querySelector('button[name="open-details"]');
              openDetails.click();
              const amount = document.querySelector('input[name="amount"]');
              amount.value = "120000";
              amount.dispatchEvent(new Event("input", { bubbles: true }));
              const department = document.querySelector('select[name="department"]');
              department.value = "ops";
              department.dispatchEvent(new Event("change", { bubbles: true }));
              const receipt = document.querySelector('input[name="receipt"]');
              receipt.dispatchEvent(new Event("change", { bubbles: true }));
            }, 20);
          </script>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-manual-record-events-"));
    const stdout = createWritableCapture();
    const stderr = createWritableCapture();
    const previousCwd = process.cwd();

    try {
      const { run } = await import("../src/cli.js");

      process.chdir(workspace);
      const status = await run(
        [
          process.execPath,
          cliPath,
          "record",
          "expense-report",
          fixture.url,
          "--manual",
          "--headless",
        ],
        stdout.stream,
        stderr.stream,
        createDelayedInteractiveInput("\n", 1500),
      );
      const workflowPath = path.join(workspace, ".formctl", "workflows", "expense-report.yml");
      const workflow = parse(readFileSync(workflowPath, "utf8"));

      expect(status).toBe(0);
      expect(stderr.text()).toBe("");
      expect(workflow.recording).toEqual({
        mode: "manual",
        events: [
          {
            event: "click",
            selector: 'button[name="open-details"]',
            value: "[redacted]",
          },
          {
            event: "input",
            field: "amount",
            selector: 'input[name="amount"]',
            value: "[redacted]",
          },
          {
            event: "select",
            field: "department",
            selector: 'select[name="department"]',
            value: "[redacted]",
          },
          {
            event: "file",
            field: "receipt",
            selector: 'input[name="receipt"]',
            value: "[file]",
          },
        ],
      });
      const validation = await run(
        [process.execPath, cliPath, "validate", "expense-report", "--json"],
        createWritableCapture().stream,
        createWritableCapture().stream,
      );
      expect(validation).toBe(0);
    } finally {
      process.chdir(previousCwd);
      await fixture.close();
    }
  });

  test("record --manual captures explicit navigation wait events", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form aria-label="Expense report">
            <label>
              Amount
              <input name="amount" type="number" />
            </label>
            <a name="open-details" href="/expense/details">Open details</a>
            <button type="submit">Submit expense</button>
          </form>
          <script>
            const recordWhenReady = setInterval(() => {
              if (!window.__formctlManualReady || location.pathname !== "/expense") {
                return;
              }
              clearInterval(recordWhenReady);
              document.querySelector('a[name="open-details"]').click();
            }, 20);
          </script>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-manual-record-navigation-"));
    const stdout = createWritableCapture();
    const stderr = createWritableCapture();
    const previousCwd = process.cwd();

    try {
      const { run } = await import("../src/cli.js");

      process.chdir(workspace);
      const status = await run(
        [
          process.execPath,
          cliPath,
          "record",
          "expense-report",
          fixture.url,
          "--manual",
          "--headless",
        ],
        stdout.stream,
        stderr.stream,
        createDelayedInteractiveInput("\n", 1500),
      );
      const workflowPath = path.join(workspace, ".formctl", "workflows", "expense-report.yml");
      const workflow = parse(readFileSync(workflowPath, "utf8"));

      expect(status).toBe(0);
      expect(stderr.text()).toBe("");
      expect(workflow.recording).toEqual({
        mode: "manual",
        events: [
          {
            event: "click",
            selector: 'a[name="open-details"]',
            value: "[redacted]",
          },
          {
            event: "wait",
            waitFor: "navigation",
            value: "[redacted]",
          },
        ],
      });
      const validation = await run(
        [process.execPath, cliPath, "validate", "expense-report", "--json"],
        createWritableCapture().stream,
        createWritableCapture().stream,
      );
      expect(validation).toBe(0);
    } finally {
      process.chdir(previousCwd);
      await fixture.close();
    }
  });

  test("submit --dry-run fills a recorded workflow without submitting it", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form method="post" action="/submit" aria-label="Expense report">
            <label>
              Amount
              <input name="amount" type="number" />
            </label>
            <label>
              Receipt
              <input name="receipt" type="file" />
            </label>
            <button type="submit">Submit expense</button>
          </form>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-dry-run-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(path.join(workspace, "receipt.txt"), "receipt fixture\n");
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        `url: ${fixture.url}`,
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "  - name: receipt",
        "    selector: input[name=\"receipt\"]",
        "    type: file",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const result = await runFormctlAsync([
        "submit",
        "expense-report",
        "--amount",
        "120000",
        "--receipt",
        "receipt.txt",
        "--dry-run",
        "--headless",
      ], workspace);
      const runsDirectory = path.join(workspace, ".formctl", "runs");
      const runDirectories = existsSync(runsDirectory)
        ? readdirSync(runsDirectory)
        : [];
      const runDirectory = path.join(runsDirectory, runDirectories[0] ?? "");
      const runId = runDirectories[0] ?? "";
      const summaryPath = path.join(runDirectory, "summary.json");
      const screenshotPath = path.join(runDirectory, "dry-run.png");
      const diffPath = path.join(runDirectory, "field-diff.json");
      const auditPath = path.join(runDirectory, "audit.jsonl");

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Dry-run complete: expense-report");
      expect(fixture.postCount()).toBe(0);
      expect(runDirectories).toHaveLength(1);
      expect(existsSync(summaryPath)).toBe(true);
      expect(existsSync(screenshotPath)).toBe(true);
      expect(existsSync(diffPath)).toBe(true);
      expect(existsSync(auditPath)).toBe(true);
      expect(JSON.parse(readFileSync(summaryPath, "utf8"))).toEqual({
        status: "dry-run",
        workflow: "expense-report",
        submitted: false,
        fields: {
          amount: "120000",
          receipt: "[file]",
        },
        artifacts: {
          screenshot: `.formctl/runs/${runId}/dry-run.png`,
          diff: `.formctl/runs/${runId}/field-diff.json`,
          summary: `.formctl/runs/${runId}/summary.json`,
          audit: `.formctl/runs/${runId}/audit.jsonl`,
        },
      });
    } finally {
      await fixture.close();
    }
  });

  test("submit --dry-run accepts field values from a JSON file", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form method="post" action="/invite" aria-label="Admin invite">
            <input name="email" type="email" />
            <input name="notify" type="checkbox" />
            <button type="submit">Invite user</button>
          </form>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-values-json-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, "fields.json"),
      `${JSON.stringify({ email: "ops@example.com", notify: true }, null, 2)}\n`,
    );
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "admin-invite.yml"),
      [
        "name: admin-invite",
        `url: ${fixture.url}`,
        ...workflowSafetyYaml,
        "fields:",
        "  - name: email",
        "    selector: input[name=\"email\"]",
        "    type: email",
        "  - name: notify",
        "    selector: input[name=\"notify\"]",
        "    type: checkbox",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const result = await runFormctlAsync([
        "submit",
        "admin-invite",
        "--values",
        "fields.json",
        "--dry-run",
        "--json",
        "--headless",
      ], workspace);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      const parsed = JSON.parse(result.stdout);
      expect(parsed).toMatchObject({
        status: "dry-run",
        workflow: "admin-invite",
        submitted: false,
        fields: {
          email: "ops@example.com",
          notify: "true",
        },
      });
      expect(fixture.postCount()).toBe(0);
    } finally {
      await fixture.close();
    }
  });

  test("submit --dry-run writes a reviewable field diff artifact", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form method="post" action="/submit" aria-label="Expense report">
            <input name="amount" type="number" />
            <input name="receipt" type="file" />
            <button type="submit">Submit expense</button>
          </form>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-field-diff-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(path.join(workspace, "receipt.txt"), "receipt fixture\n");
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        `url: ${fixture.url}`,
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "  - name: receipt",
        "    selector: input[name=\"receipt\"]",
        "    type: file",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const result = await runFormctlAsync([
        "submit",
        "expense-report",
        "--amount",
        "120000",
        "--receipt",
        "receipt.txt",
        "--dry-run",
        "--json",
        "--headless",
      ], workspace);
      const parsed = JSON.parse(result.stdout);
      const diffPath = path.join(workspace, parsed.artifacts.diff);

      expect(result.status).toBe(0);
      expect(fixture.postCount()).toBe(0);
      expect(parsed.artifacts.diff).toBe(`.formctl/runs/${parsed.runId}/field-diff.json`);
      expect(JSON.parse(readFileSync(diffPath, "utf8"))).toEqual({
        status: "field-diff",
        workflow: "expense-report",
        submitted: false,
        fields: [
          {
            name: "amount",
            selector: 'input[name="amount"]',
            type: "number",
            action: "set",
            value: "120000",
          },
          {
            name: "receipt",
            selector: 'input[name="receipt"]',
            type: "file",
            action: "set",
            value: "[file]",
          },
        ],
      });
    } finally {
      await fixture.close();
    }
  });

  test("submit --dry-run --json rejects unknown keys from a values JSON file", async () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-values-unknown-key-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, "fields.json"),
      `${JSON.stringify({ amonut: 120000 }, null, 2)}\n`,
    );
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        "url: http://127.0.0.1:9/expense",
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    const result = await runFormctlAsync([
      "submit",
      "expense-report",
      "--values",
      "fields.json",
      "--dry-run",
      "--json",
      "--headless",
    ], workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      status: "error",
      workflow: "expense-report",
      exitCode: 1,
      submitted: false,
      requiresApproval: false,
      error: {
        code: "field_values_invalid",
        message: "Unknown --values field: amonut",
        unknownFields: ["amonut"],
      },
    });
    expect(existsSync(path.join(workspace, ".formctl", "runs"))).toBe(false);
  });

  test("submit --dry-run --json rejects unknown field flags before browser work", async () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-unknown-field-flag-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        "url: http://127.0.0.1:9/expense",
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    const result = await runFormctlAsync([
      "submit",
      "expense-report",
      "--amonut",
      "120000",
      "--dry-run",
      "--json",
      "--headless",
    ], workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      status: "error",
      workflow: "expense-report",
      exitCode: 1,
      submitted: false,
      requiresApproval: false,
      error: {
        code: "field_values_invalid",
        message: "Unknown submit field flag: amonut",
        unknownFields: ["amonut"],
      },
    });
    expect(existsSync(path.join(workspace, ".formctl", "runs"))).toBe(false);
  });

  test("submit --dry-run --json reports browser runtime failures without throwing", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-dry-run-runtime-failure-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        "url: http://127.0.0.1:9/expense",
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    const result = runFormctl([
      "submit",
      "expense-report",
      "--amount",
      "120000",
      "--dry-run",
      "--json",
      "--headless",
    ], workspace);
    const parsed = JSON.parse(result.stdout);

    expect(result.status).toBe(4);
    expect(result.stderr).toBe("");
    expect(parsed).toMatchObject({
      status: "error",
      workflow: "expense-report",
      exitCode: 4,
      submitted: false,
      requiresApproval: false,
      error: {
        code: "dry_run_failed",
      },
    });
    expect(parsed.error.message).toContain("Dry-run failed:");
    expect(parsed.runId).toMatch(/^\d+-dry-run$/);
    expect(parsed.artifacts).toEqual({
      failure: `.formctl/runs/${parsed.runId}/failure.json`,
      audit: `.formctl/runs/${parsed.runId}/audit.jsonl`,
    });
    expect(existsSync(path.join(workspace, parsed.artifacts.failure))).toBe(true);
    expect(existsSync(path.join(workspace, parsed.artifacts.audit))).toBe(true);
  });

  test("submit --dry-run writes an audit log with redacted values and artifacts", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form method="post" action="/submit" aria-label="Expense report">
            <input name="amount" type="number" />
            <input name="receipt" type="file" />
            <button type="submit">Submit expense</button>
          </form>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-audit-dry-run-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(path.join(workspace, "receipt.txt"), "receipt fixture\n");
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        `url: ${fixture.url}`,
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "  - name: receipt",
        "    selector: input[name=\"receipt\"]",
        "    type: file",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const result = await runFormctlAsync([
        "submit",
        "expense-report",
        "--amount",
        "120000",
        "--receipt",
        "receipt.txt",
        "--dry-run",
        "--headless",
      ], workspace);
      const runDirectories = readdirSync(path.join(workspace, ".formctl", "runs"));
      const runId = runDirectories[0] ?? "";
      const auditPath = path.join(workspace, ".formctl", "runs", runId, "audit.jsonl");
      const auditEvents = readFileSync(auditPath, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));

      expect(result.status).toBe(0);
      expect(auditEvents).toEqual([
        {
          event: "run_started",
          workflow: "expense-report",
          url: fixture.url,
          mode: "dry-run",
          submitted: false,
          approval: null,
          command: {
            dryRun: true,
            approve: false,
            headless: true,
            json: false,
          },
        },
        {
          event: "selector_check",
          role: "field",
          field: "amount",
          selector: 'input[name="amount"]',
          expectedMatches: 1,
          actualMatches: 1,
          result: "ok",
        },
        {
          event: "selector_check",
          role: "field",
          field: "receipt",
          selector: 'input[name="receipt"]',
          expectedMatches: 1,
          actualMatches: 1,
          result: "ok",
        },
        {
          event: "selector_check",
          role: "submit",
          selector: 'button[type="submit"]',
          expectedMatches: 1,
          actualMatches: 1,
          result: "ok",
        },
        {
          event: "fields_resolved",
          fields: {
            amount: "120000",
            receipt: "[file]",
          },
        },
        {
          event: "screenshot_saved",
          path: `.formctl/runs/${runId}/dry-run.png`,
        },
        {
          event: "run_finished",
          status: "dry-run",
          submitted: false,
          artifacts: {
            screenshot: `.formctl/runs/${runId}/dry-run.png`,
            diff: `.formctl/runs/${runId}/field-diff.json`,
            summary: `.formctl/runs/${runId}/summary.json`,
            audit: `.formctl/runs/${runId}/audit.jsonl`,
          },
        },
      ]);
    } finally {
      await fixture.close();
    }
  });

  test("submit --dry-run defaults to headless mode without an explicit mode flag", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form method="post" action="/submit" aria-label="Expense report">
            <input name="amount" type="number" />
            <button type="submit">Submit expense</button>
          </form>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-default-headless-dry-run-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        `url: ${fixture.url}`,
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const result = await runFormctlAsync([
        "submit",
        "expense-report",
        "--amount",
        "120000",
        "--dry-run",
      ], workspace);
      const runDirectories = readdirSync(path.join(workspace, ".formctl", "runs"));
      const runId = runDirectories[0] ?? "";
      const auditPath = path.join(workspace, ".formctl", "runs", runId, "audit.jsonl");
      const [runStarted] = readFileSync(auditPath, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(runStarted.command).toMatchObject({
        dryRun: true,
        approve: false,
        headless: true,
      });
      expect(fixture.postCount()).toBe(0);
    } finally {
      await fixture.close();
    }
  });

  test("submit --dry-run supports select fields and checkboxes", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form method="post" action="/invite" aria-label="Admin invite">
            <input name="email" type="email" />
            <select name="role">
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
            <input name="notify" type="checkbox" />
            <button type="submit">Invite user</button>
          </form>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-select-checkbox-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "admin-invite.yml"),
      [
        "name: admin-invite",
        `url: ${fixture.url}`,
        ...workflowSafetyYaml,
        "fields:",
        "  - name: email",
        "    selector: input[name=\"email\"]",
        "    type: email",
        "  - name: role",
        "    selector: select[name=\"role\"]",
        "    type: select",
        "  - name: notify",
        "    selector: input[name=\"notify\"]",
        "    type: checkbox",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const result = await runFormctlAsync([
        "submit",
        "admin-invite",
        "--email",
        "ops@example.com",
        "--role",
        "admin",
        "--notify",
        "true",
        "--dry-run",
        "--json",
        "--headless",
      ], workspace);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      const parsed = JSON.parse(result.stdout);
      expect(parsed).toMatchObject({
        status: "dry-run",
        workflow: "admin-invite",
        submitted: false,
        fields: {
          email: "ops@example.com",
          role: "admin",
          notify: "true",
        },
      });
      expect(fixture.postCount()).toBe(0);
    } finally {
      await fixture.close();
    }
  });

  test("submit --approve replays manual recording fields in event order", async () => {
    let submittedValues: URLSearchParams | undefined;
    const server = http.createServer((request, response) => {
      if (request.method === "POST") {
        let body = "";
        request.setEncoding("utf8");
        request.on("data", (chunk) => {
          body += chunk;
        });
        request.on("end", () => {
          submittedValues = new URLSearchParams(body);
          response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          response.end("<!doctype html><html><body>Submitted</body></html>");
        });
        return;
      }

      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`
        <!doctype html>
        <html>
          <body>
            <form method="post" action="/submit" aria-label="Escalation routing">
              <select name="department">
                <option value="">Choose department</option>
                <option value="sales">Sales</option>
              </select>
              <input name="managerEmail" type="email" />
              <input name="replayOrder" type="hidden" />
              <button type="submit">Route escalation</button>
            </form>
            <script>
              const seen = [];
              const order = document.querySelector('input[name="replayOrder"]');
              const mark = (name) => {
                if (seen.includes(name)) {
                  return;
                }
                seen.push(name);
                order.value = seen.join(">");
              };
              document.querySelector('select[name="department"]').addEventListener("change", () => mark("department"));
              document.querySelector('input[name="managerEmail"]').addEventListener("input", () => mark("managerEmail"));
            </script>
          </body>
        </html>
      `);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Manual recording replay fixture server did not expose a TCP port");
    }

    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-recording-replay-order-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "escalation-routing.yml"),
      [
        "name: escalation-routing",
        `url: http://127.0.0.1:${address.port}/routing`,
        "recording:",
        "  mode: manual",
        "  events:",
        "    - event: change",
        "      field: department",
        "      selector: select[name=\"department\"]",
        "      value: \"[redacted]\"",
        "    - event: input",
        "      field: managerEmail",
        "      selector: input[name=\"managerEmail\"]",
        "      value: \"[redacted]\"",
        ...workflowSafetyYaml,
        "fields:",
        "  - name: managerEmail",
        "    selector: input[name=\"managerEmail\"]",
        "    type: email",
        "  - name: department",
        "    selector: select[name=\"department\"]",
        "    type: select",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const result = await runFormctlAsync([
        "submit",
        "escalation-routing",
        "--managerEmail",
        "sales-manager@example.com",
        "--department",
        "sales",
        "--approve",
        "--json",
        "--headless",
      ], workspace);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        status: "submitted",
        workflow: "escalation-routing",
        submitted: true,
        fields: {
          managerEmail: "sales-manager@example.com",
          department: "sales",
        },
      });
      expect(submittedValues?.get("department")).toBe("sales");
      expect(submittedValues?.get("managerEmail")).toBe("sales-manager@example.com");
      expect(submittedValues?.get("replayOrder")).toBe("department>managerEmail");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  test("submit replays bounded setup clicks before field selector checks", async () => {
    let postCount = 0;
    let submittedValues: URLSearchParams | undefined;
    const server = http.createServer((request, response) => {
      if (request.method === "POST") {
        postCount += 1;
        let body = "";
        request.setEncoding("utf8");
        request.on("data", (chunk) => {
          body += chunk;
        });
        request.on("end", () => {
          submittedValues = new URLSearchParams(body);
          response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          response.end("<!doctype html><html><body>Submitted</body></html>");
        });
        return;
      }

      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`
        <!doctype html>
        <html>
          <body>
            <button type="button" name="open-approval">Open approval form</button>
            <div id="approval-root"></div>
            <script>
              document.querySelector('button[name="open-approval"]').addEventListener("click", () => {
                document.querySelector("#approval-root").innerHTML = [
                  '<form method="post" action="/submit" aria-label="Approval">',
                  '<input name="requestorEmail" type="email" />',
                  '<input name="amount" type="number" />',
                  '<button type="submit">Approve</button>',
                  '</form>'
                ].join("");
              });
            </script>
          </body>
        </html>
      `);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Setup click fixture server did not expose a TCP port");
    }

    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-setup-click-replay-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "approval-modal.yml"),
      [
        "name: approval-modal",
        `url: http://127.0.0.1:${address.port}/approval`,
        "recording:",
        "  mode: manual",
        "  events:",
        "    - event: click",
        "      selector: button[name=\"open-approval\"]",
        "      value: \"[redacted]\"",
        "    - event: input",
        "      field: requestorEmail",
        "      selector: input[name=\"requestorEmail\"]",
        "      value: \"[redacted]\"",
        ...workflowSafetyYaml,
        "fields:",
        "  - name: requestorEmail",
        "    selector: input[name=\"requestorEmail\"]",
        "    type: email",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const dryRun = await runFormctlAsync([
        "submit",
        "approval-modal",
        "--requestorEmail",
        "ops@example.com",
        "--amount",
        "4500",
        "--dry-run",
        "--json",
        "--headless",
      ], workspace);

      expect(dryRun.status).toBe(0);
      expect(dryRun.stderr).toBe("");
      const dryRunJson = JSON.parse(dryRun.stdout);
      expect(dryRunJson).toMatchObject({
        status: "dry-run",
        submitted: false,
        fields: {
          requestorEmail: "ops@example.com",
          amount: "4500",
        },
      });
      expect(postCount).toBe(0);
      const auditLog = readFileSync(path.join(workspace, dryRunJson.artifacts.audit), "utf8");
      expect(auditLog).toContain('"role":"setup-click"');
      expect(auditLog).toContain('"event":"setup_click"');

      const approved = await runFormctlAsync([
        "submit",
        "approval-modal",
        "--requestorEmail",
        "ops@example.com",
        "--amount",
        "4500",
        "--approve",
        "--json",
        "--headless",
      ], workspace);

      expect(approved.status).toBe(0);
      expect(approved.stderr).toBe("");
      expect(JSON.parse(approved.stdout)).toMatchObject({
        status: "submitted",
        submitted: true,
      });
      expect(postCount).toBe(1);
      expect(submittedValues?.get("requestorEmail")).toBe("ops@example.com");
      expect(submittedValues?.get("amount")).toBe("4500");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  test("submit replays structured before-field click steps with step screenshots", async () => {
    let postCount = 0;
    const server = http.createServer((request, response) => {
      if (request.method === "POST") {
        postCount += 1;
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end("<!doctype html><html><body>Submitted</body></html>");
        return;
      }

      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`
        <!doctype html>
        <html>
          <body>
            <button type="button" name="open-approval">Open approval form</button>
            <div id="approval-root"></div>
            <script>
              document.querySelector('button[name="open-approval"]').addEventListener("click", () => {
                document.querySelector("#approval-root").innerHTML = [
                  '<form method="post" action="/submit" aria-label="Approval">',
                  '<input name="requestorEmail" type="email" />',
                  '<button type="submit">Approve</button>',
                  '</form>'
                ].join("");
              });
            </script>
          </body>
        </html>
      `);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Structured step fixture server did not expose a TCP port");
    }

    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-structured-step-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "approval-modal.yml"),
      [
        "name: approval-modal",
        `url: http://127.0.0.1:${address.port}/approval`,
        "steps:",
        "  - name: open approval modal",
        "    action: click",
        "    selector: button[name=\"open-approval\"]",
        "    when: before-fields",
        "recording:",
        "  mode: manual",
        "  events:",
        "    - event: input",
        "      field: requestorEmail",
        "      selector: input[name=\"requestorEmail\"]",
        "      value: \"[redacted]\"",
        ...workflowSafetyYaml,
        "fields:",
        "  - name: requestorEmail",
        "    selector: input[name=\"requestorEmail\"]",
        "    type: email",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const result = await runFormctlAsync([
        "submit",
        "approval-modal",
        "--requestorEmail",
        "ops@example.com",
        "--dry-run",
        "--json",
        "--headless",
      ], workspace);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      const parsed = JSON.parse(result.stdout);
      expect(parsed).toMatchObject({
        status: "dry-run",
        submitted: false,
        fields: {
          requestorEmail: "ops@example.com",
        },
        artifacts: {
          steps: [
            {
              name: "open approval modal",
              screenshot: `.formctl/runs/${parsed.runId}/step-01-open-approval-modal.png`,
            },
          ],
        },
      });
      expect(postCount).toBe(0);
      expect(existsSync(path.join(workspace, parsed.artifacts.steps[0].screenshot))).toBe(true);
      const auditLog = readFileSync(path.join(workspace, parsed.artifacts.audit), "utf8");
      expect(auditLog).toContain('"event":"workflow_step"');
      expect(auditLog).toContain('"stepName":"open approval modal"');
      expect(auditLog).toContain('"event":"step_screenshot_saved"');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  test("submit replays structured after-field click steps before final submit", async () => {
    let postCount = 0;
    let submittedBody = "";
    const server = http.createServer((request, response) => {
      if (request.method === "POST") {
        postCount += 1;
        request.setEncoding("utf8");
        request.on("data", (chunk) => {
          submittedBody += chunk;
        });
        request.on("end", () => {
          response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          response.end("<!doctype html><html><body>Submitted</body></html>");
        });
        return;
      }

      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`
        <!doctype html>
        <html>
          <body>
            <form method="post" action="/submit" aria-label="Approval">
              <input name="amount" type="number" />
              <button type="button" name="review-details" disabled>Review details</button>
              <div id="submit-root"></div>
            </form>
            <script>
              const amountInput = document.querySelector('input[name="amount"]');
              const reviewButton = document.querySelector('button[name="review-details"]');
              amountInput.addEventListener("input", () => {
                reviewButton.disabled = amountInput.value.length === 0;
              });
              reviewButton.addEventListener("click", () => {
                document.querySelector("#submit-root").innerHTML = '<button type="submit" name="final-submit">Submit reviewed request</button>';
              });
            </script>
          </body>
        </html>
      `);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("After-field step fixture server did not expose a TCP port");
    }

    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-after-field-step-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "approval-modal.yml"),
      [
        "name: approval-modal",
        `url: http://127.0.0.1:${address.port}/approval`,
        "steps:",
        "  - name: review entered details",
        "    action: click",
        "    selector: button[name=\"review-details\"]",
        "    when: after-fields",
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[name=\"final-submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const dryRun = await runFormctlAsync([
        "submit",
        "approval-modal",
        "--amount",
        "4500",
        "--dry-run",
        "--json",
        "--headless",
      ], workspace);

      expect(dryRun.status).toBe(0);
      expect(dryRun.stderr).toBe("");
      const dryRunJson = JSON.parse(dryRun.stdout);
      expect(dryRunJson).toMatchObject({
        status: "dry-run",
        submitted: false,
        fields: {
          amount: "4500",
        },
        artifacts: {
          steps: [
            {
              name: "review entered details",
              screenshot: `.formctl/runs/${dryRunJson.runId}/step-01-review-entered-details.png`,
            },
          ],
        },
      });
      expect(postCount).toBe(0);
      expect(existsSync(path.join(workspace, dryRunJson.artifacts.steps[0].screenshot))).toBe(true);
      const auditLog = readFileSync(path.join(workspace, dryRunJson.artifacts.audit), "utf8");
      expect(auditLog).toContain('"event":"workflow_step"');
      expect(auditLog).toContain('"stepName":"review entered details"');
      expect(auditLog).toContain('"event":"step_screenshot_saved"');

      const approved = await runFormctlAsync([
        "submit",
        "approval-modal",
        "--amount",
        "4500",
        "--approve",
        "--json",
        "--headless",
      ], workspace);

      expect(approved.status).toBe(0);
      expect(approved.stderr).toBe("");
      expect(JSON.parse(approved.stdout)).toMatchObject({
        status: "submitted",
        submitted: true,
      });
      expect(postCount).toBe(1);
      expect(submittedBody).toContain("amount=4500");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  test("submit replays same-origin navigation steps before final submit", async () => {
    let postCount = 0;
    let submittedBody = "";
    const server = http.createServer((request, response) => {
      if (request.method === "POST") {
        postCount += 1;
        request.setEncoding("utf8");
        request.on("data", (chunk) => {
          submittedBody += chunk;
        });
        request.on("end", () => {
          response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          response.end("<!doctype html><html><body>Submitted</body></html>");
        });
        return;
      }

      if (request.url === "/approval/confirm") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(`
          <!doctype html>
          <html>
            <body>
              <form method="post" action="/submit" aria-label="Confirm approval">
                <input name="amount" type="hidden" />
                <button type="submit" name="final-submit">Submit approval</button>
              </form>
              <script>
                document.querySelector('input[name="amount"]').value = sessionStorage.getItem("amount") || "";
              </script>
            </body>
          </html>
        `);
        return;
      }

      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`
        <!doctype html>
        <html>
          <body>
            <form aria-label="Approval details">
              <input name="amount" type="number" />
              <button type="button" name="continue">Continue</button>
            </form>
            <script>
              document.querySelector('button[name="continue"]').addEventListener("click", () => {
                sessionStorage.setItem("amount", document.querySelector('input[name="amount"]').value);
                window.location.assign("/approval/confirm");
              });
            </script>
          </body>
        </html>
      `);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Navigation step fixture server did not expose a TCP port");
    }

    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-navigation-step-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "approval-navigation.yml"),
      [
        "name: approval-navigation",
        `url: http://127.0.0.1:${address.port}/approval`,
        "steps:",
        "  - name: continue to confirmation",
        "    action: click",
        "    selector: button[name=\"continue\"]",
        "    when: after-fields",
        "    waitFor:",
        "      type: navigation",
        "      sameOrigin: true",
        "      path: /approval/confirm",
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[name=\"final-submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const dryRun = await runFormctlAsync([
        "submit",
        "approval-navigation",
        "--amount",
        "4500",
        "--dry-run",
        "--json",
        "--headless",
      ], workspace);

      expect(dryRun.status).toBe(0);
      expect(dryRun.stderr).toBe("");
      const dryRunJson = JSON.parse(dryRun.stdout);
      expect(dryRunJson).toMatchObject({
        status: "dry-run",
        submitted: false,
        fields: {
          amount: "4500",
        },
        artifacts: {
          steps: [
            {
              name: "continue to confirmation",
              screenshot: `.formctl/runs/${dryRunJson.runId}/step-01-continue-to-confirmation.png`,
            },
          ],
        },
      });
      expect(postCount).toBe(0);
      expect(existsSync(path.join(workspace, dryRunJson.artifacts.steps[0].screenshot))).toBe(true);
      const auditLog = readFileSync(path.join(workspace, dryRunJson.artifacts.audit), "utf8");
      expect(auditLog).toContain('"event":"workflow_step"');
      expect(auditLog).toContain('"event":"navigation_wait"');
      expect(auditLog).toContain('"path":"/approval/confirm"');
      expect(auditLog).toContain('"event":"navigation_interaction_check"');
      expect(auditLog).toContain('"result":"ok"');

      const approved = await runFormctlAsync([
        "submit",
        "approval-navigation",
        "--amount",
        "4500",
        "--approve",
        "--json",
        "--headless",
      ], workspace);

      expect(approved.status).toBe(0);
      expect(approved.stderr).toBe("");
      expect(JSON.parse(approved.stdout)).toMatchObject({
        status: "submitted",
        submitted: true,
      });
      expect(postCount).toBe(1);
      expect(submittedBody).toContain("amount=4500");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  test("submit stops when a navigation step reaches an interaction wall", async () => {
    let postCount = 0;
    const server = http.createServer((request, response) => {
      if (request.method === "POST") {
        postCount += 1;
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end("<!doctype html><html><body>Submitted</body></html>");
        return;
      }

      if (request.url === "/approval/login") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(`
          <!doctype html>
          <html>
            <body>
              <form method="post" action="/login" aria-label="Sign in">
                <label>Password <input name="password" type="password" autocomplete="current-password" /></label>
                <button type="submit">Sign in</button>
              </form>
            </body>
          </html>
        `);
        return;
      }

      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`
        <!doctype html>
        <html>
          <body>
            <form aria-label="Approval details">
              <input name="amount" type="number" />
              <button type="button" name="continue">Continue</button>
            </form>
            <script>
              document.querySelector('button[name="continue"]').addEventListener("click", () => {
                window.location.assign("/approval/login");
              });
            </script>
          </body>
        </html>
      `);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Navigation interaction fixture server did not expose a TCP port");
    }

    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-navigation-interaction-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "approval-navigation.yml"),
      [
        "name: approval-navigation",
        `url: http://127.0.0.1:${address.port}/approval`,
        "steps:",
        "  - name: continue to protected confirmation",
        "    action: click",
        "    selector: button[name=\"continue\"]",
        "    when: after-fields",
        "    waitFor:",
        "      type: navigation",
        "      sameOrigin: true",
        "      path: /approval/login",
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[name=\"final-submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const result = await runFormctlAsync([
        "submit",
        "approval-navigation",
        "--amount",
        "4500",
        "--dry-run",
        "--json",
        "--headless",
      ], workspace);

      const parsed = JSON.parse(result.stdout);
      expect(result.status).toBe(6);
      expect(result.stderr).toBe("");
      expect(parsed).toMatchObject({
        status: "error",
        workflow: "approval-navigation",
        exitCode: 6,
        submitted: false,
        requiresApproval: false,
        error: {
          code: "interaction_required",
          detected: "password_input",
        },
      });
      expect(postCount).toBe(0);
      const auditLog = readFileSync(path.join(workspace, parsed.artifacts.audit), "utf8");
      expect(auditLog).toContain('"event":"navigation_wait"');
      expect(auditLog).toContain('"path":"/approval/login"');
      expect(auditLog).toContain('"event":"navigation_interaction_check"');
      expect(auditLog).toContain('"result":"blocked"');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  test("submit reports after-field step selector drift before field filling", async () => {
    let mutationCount = 0;
    let submitCount = 0;
    const server = http.createServer((request, response) => {
      if (request.method === "POST" && request.url === "/mutation") {
        mutationCount += 1;
        response.writeHead(204);
        response.end();
        return;
      }

      if (request.method === "POST") {
        submitCount += 1;
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end("<!doctype html><html><body>Submitted</body></html>");
        return;
      }

      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`
        <!doctype html>
        <html>
          <body>
            <form method="post" action="/submit" aria-label="Approval">
              <input name="amount" type="number" />
              <div id="submit-root"></div>
            </form>
            <script>
              document.querySelector('input[name="amount"]').addEventListener("input", () => {
                fetch("/mutation", { method: "POST", body: "field-filled" }).catch(() => {});
              });
            </script>
          </body>
        </html>
      `);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("After-field step drift fixture server did not expose a TCP port");
    }

    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-after-field-step-drift-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "approval-modal.yml"),
      [
        "name: approval-modal",
        `url: http://127.0.0.1:${address.port}/approval`,
        "steps:",
        "  - name: review entered details",
        "    action: click",
        "    selector: button[name=\"review-details\"]",
        "    when: after-fields",
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[name=\"final-submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const result = await runFormctlAsync([
        "submit",
        "approval-modal",
        "--amount",
        "4500",
        "--dry-run",
        "--json",
        "--headless",
      ], workspace);

      expect(result.status).toBe(3);
      expect(result.stderr).toBe("");
      const parsed = JSON.parse(result.stdout);
      expect(parsed).toMatchObject({
        status: "error",
        workflow: "approval-modal",
        exitCode: 3,
        submitted: false,
        error: {
          code: "selector_mismatch",
          role: "workflow-step",
          selector: "button[name=\"review-details\"]",
          expectedMatches: 1,
          actualMatches: 0,
        },
      });
      expect(mutationCount).toBe(0);
      expect(submitCount).toBe(0);
      const auditLog = readFileSync(path.join(workspace, parsed.artifacts.audit), "utf8");
      expect(auditLog).toContain('"role":"workflow-step"');
      expect(auditLog).toContain('"stepName":"review entered details"');
      expect(auditLog).toContain('"actualMatches":0');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  test("submit suggests a workflow-step selector repair but still exits 3 until YAML is updated", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form method="post" action="/submit" aria-label="Approval">
            <input name="amount" type="number" />
            <button type="button" name="review-details">Review entered details</button>
            <div id="submit-root"></div>
          </form>
          <script>
            document.querySelector('button[name="review-details"]').addEventListener("click", () => {
              document.querySelector("#submit-root").innerHTML = '<button type="submit" name="final-submit">Submit reviewed request</button>';
            });
          </script>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-workflow-step-selector-repair-"));
    const workflowPath = path.join(workspace, ".formctl", "workflows", "approval-modal.yml");
    mkdirSync(path.dirname(workflowPath), { recursive: true });
    const brokenWorkflow = [
      "name: approval-modal",
      `url: ${fixture.url}`,
      "steps:",
      "  - name: review entered details",
      "    action: click",
      "    selector: button[name=\"review-old\"]",
      "    when: after-fields",
      ...workflowSafetyYaml,
      "fields:",
      "  - name: amount",
      "    selector: input[name=\"amount\"]",
      "    type: number",
      "submit:",
      "  selector: button[name=\"final-submit\"]",
      "",
    ].join("\n");
    writeFileSync(workflowPath, brokenWorkflow);

    try {
      const broken = await runFormctlAsync([
        "submit",
        "approval-modal",
        "--amount",
        "4500",
        "--dry-run",
        "--json",
        "--headless",
      ], workspace);
      const brokenJson = JSON.parse(broken.stdout);

      expect(broken.status).toBe(3);
      expect(broken.stderr).toBe("");
      expect(brokenJson).toMatchObject({
        status: "error",
        workflow: "approval-modal",
        exitCode: 3,
        submitted: false,
        requiresApproval: false,
        error: {
          code: "selector_mismatch",
          role: "workflow-step",
          selector: 'button[name="review-old"]',
          expectedMatches: 1,
          actualMatches: 0,
          repair: {
            selector: 'button[name="review-details"]',
            confidence: "high",
            requiresReview: true,
          },
        },
      });
      expect(brokenJson.error.repair.reason).toContain('workflow step "review entered details"');
      const failureJson = JSON.parse(readFileSync(path.join(workspace, brokenJson.artifacts.failure), "utf8"));
      expect(failureJson.error.repair).toEqual(brokenJson.error.repair);
      const auditLog = readFileSync(path.join(workspace, brokenJson.artifacts.audit), "utf8");
      expect(auditLog).toContain('"event":"selector_repair_suggestion"');
      expect(auditLog).toContain('"role":"workflow-step"');
      expect(auditLog).toContain('"stepName":"review entered details"');
      expect(auditLog).toContain('"suggestedSelector":"button[name=\\"review-details\\"]"');
      expect(fixture.postCount()).toBe(0);

      writeFileSync(workflowPath, brokenWorkflow.replace('button[name="review-old"]', brokenJson.error.repair.selector));
      const repaired = await runFormctlAsync([
        "submit",
        "approval-modal",
        "--amount",
        "4500",
        "--dry-run",
        "--json",
        "--headless",
      ], workspace);

      expect(repaired.status).toBe(0);
      expect(JSON.parse(repaired.stdout)).toMatchObject({
        status: "dry-run",
        submitted: false,
        fields: {
          amount: "4500",
        },
      });
      expect(fixture.postCount()).toBe(0);
    } finally {
      await fixture.close();
    }
  }, 35_000);

  test.each([
    {
      name: "ambiguous named controls",
      controls: [
        '<button type="button" name="review-details">Review entered details</button>',
        '<button type="button" name="confirm-details">Review entered details</button>',
      ].join(""),
    },
    {
      name: "submit-typed control",
      controls: '<button type="submit" name="review-details">Review entered details</button>',
    },
  ])("submit omits workflow-step selector repair suggestions for $name", async ({ controls }) => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form method="post" action="/submit" aria-label="Approval">
            <input name="amount" type="number" />
            ${controls}
            <button type="submit" name="final-submit">Submit reviewed request</button>
          </form>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-workflow-step-repair-omitted-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "approval-modal.yml"),
      [
        "name: approval-modal",
        `url: ${fixture.url}`,
        "steps:",
        "  - name: review entered details",
        "    action: click",
        "    selector: button[name=\"review-old\"]",
        "    when: after-fields",
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[name=\"final-submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const result = await runFormctlAsync([
        "submit",
        "approval-modal",
        "--amount",
        "4500",
        "--dry-run",
        "--json",
        "--headless",
      ], workspace);
      const parsed = JSON.parse(result.stdout);

      expect(result.status).toBe(3);
      expect(result.stderr).toBe("");
      expect(parsed).toMatchObject({
        status: "error",
        workflow: "approval-modal",
        exitCode: 3,
        submitted: false,
        requiresApproval: false,
        error: {
          code: "selector_mismatch",
          role: "workflow-step",
          selector: 'button[name="review-old"]',
          expectedMatches: 1,
          actualMatches: 0,
        },
      });
      expect(parsed.error.repair).toBeUndefined();
      const auditLog = readFileSync(path.join(workspace, parsed.artifacts.audit), "utf8");
      expect(auditLog).not.toContain('"event":"selector_repair_suggestion"');
      expect(fixture.postCount()).toBe(0);
    } finally {
      await fixture.close();
    }
  }, 35_000);

  test.each([
    {
      name: "missing",
      setupControls: "",
      expectedError: {
        expectedMatches: 1,
        actualMatches: 0,
      },
      expectedAudit: '"actualMatches":0',
    },
    {
      name: "ambiguous",
      setupControls: [
        '<button type="button" name="open-approval">Open approval form</button>',
        '<button type="button" name="open-approval">Open duplicate approval form</button>',
      ].join(""),
      expectedError: {
        expectedMatches: 1,
        actualMatches: 2,
      },
      expectedAudit: '"actualMatches":2',
    },
    {
      name: "submit-typed",
      setupControls: '<button type="submit" name="open-approval">Open approval form</button>',
      expectedError: {
        expectedType: "non-submit",
        actualType: "submit",
      },
      expectedAudit: '"event":"setup_click_type_check"',
    },
  ])("submit reports setup-click selector drift before field filling: $name", async ({
    setupControls,
    expectedError,
    expectedAudit,
  }) => {
    let mutationCount = 0;
    let submitCount = 0;
    const server = http.createServer((request, response) => {
      if (request.method === "POST" && request.url === "/mutation") {
        mutationCount += 1;
        response.writeHead(204);
        response.end();
        return;
      }

      if (request.method === "POST") {
        submitCount += 1;
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end("<!doctype html><html><body>Submitted</body></html>");
        return;
      }

      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`
        <!doctype html>
        <html>
          <body>
            <form method="post" action="/submit" aria-label="Approval">
              ${setupControls}
              <input name="requestorEmail" type="email" />
              <button type="submit" name="final-submit">Approve</button>
            </form>
            <script>
              document.querySelector('input[name="requestorEmail"]').addEventListener("input", () => {
                fetch("/mutation", { method: "POST", body: "field-filled" }).catch(() => {});
              });
            </script>
          </body>
        </html>
      `);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Setup click drift fixture server did not expose a TCP port");
    }

    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-setup-click-drift-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "approval-modal.yml"),
      [
        "name: approval-modal",
        `url: http://127.0.0.1:${address.port}/approval`,
        "recording:",
        "  mode: manual",
        "  events:",
        "    - event: click",
        "      selector: button[name=\"open-approval\"]",
        "      value: \"[redacted]\"",
        "    - event: input",
        "      field: requestorEmail",
        "      selector: input[name=\"requestorEmail\"]",
        "      value: \"[redacted]\"",
        ...workflowSafetyYaml,
        "fields:",
        "  - name: requestorEmail",
        "    selector: input[name=\"requestorEmail\"]",
        "    type: email",
        "submit:",
        "  selector: button[name=\"final-submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const result = await runFormctlAsync([
        "submit",
        "approval-modal",
        "--requestorEmail",
        "ops@example.com",
        "--dry-run",
        "--json",
        "--headless",
      ], workspace);

      expect(result.status).toBe(3);
      expect(result.stderr).toBe("");
      const parsed = JSON.parse(result.stdout);
      expect(parsed).toMatchObject({
        status: "error",
        exitCode: 3,
        submitted: false,
        requiresApproval: false,
        error: {
          code: "selector_mismatch",
          role: "setup-click",
          selector: 'button[name="open-approval"]',
          ...expectedError,
        },
      });
      expect(mutationCount).toBe(0);
      expect(submitCount).toBe(0);
      const auditLog = readFileSync(path.join(workspace, parsed.artifacts.audit), "utf8");
      expect(auditLog).toContain('"role":"setup-click"');
      expect(auditLog).toContain(expectedAudit);
      expect(auditLog).not.toContain('"role":"field"');
      expect(auditLog).not.toContain('"event":"setup_click","selector":"button[name=\\"open-approval\\"]","result":"clicked"');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  test("submit does not replay clicks recorded after field events as setup", async () => {
    let submittedValues: URLSearchParams | undefined;
    const server = http.createServer((request, response) => {
      if (request.method === "POST") {
        let body = "";
        request.setEncoding("utf8");
        request.on("data", (chunk) => {
          body += chunk;
        });
        request.on("end", () => {
          submittedValues = new URLSearchParams(body);
          response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          response.end("<!doctype html><html><body>Submitted</body></html>");
        });
        return;
      }

      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`
        <!doctype html>
        <html>
          <body>
            <form method="post" action="/submit" aria-label="Approval">
              <input name="amount" type="number" />
              <input name="afterFieldClicked" type="hidden" value="false" />
              <button type="button" name="after-field-action">After field action</button>
              <button type="submit">Approve</button>
            </form>
            <script>
              document.querySelector('button[name="after-field-action"]').addEventListener("click", () => {
                document.querySelector('input[name="afterFieldClicked"]').value = "true";
              });
            </script>
          </body>
        </html>
      `);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Post-field click fixture server did not expose a TCP port");
    }

    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-post-field-click-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "approval.yml"),
      [
        "name: approval",
        `url: http://127.0.0.1:${address.port}/approval`,
        "recording:",
        "  mode: manual",
        "  events:",
        "    - event: input",
        "      field: amount",
        "      selector: input[name=\"amount\"]",
        "      value: \"[redacted]\"",
        "    - event: click",
        "      selector: button[name=\"after-field-action\"]",
        "      value: \"[redacted]\"",
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const result = await runFormctlAsync([
        "submit",
        "approval",
        "--amount",
        "4500",
        "--approve",
        "--json",
        "--headless",
      ], workspace);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      const parsed = JSON.parse(result.stdout);
      expect(parsed).toMatchObject({
        status: "submitted",
        submitted: true,
        fields: {
          amount: "4500",
        },
      });
      expect(submittedValues?.get("amount")).toBe("4500");
      expect(submittedValues?.get("afterFieldClicked")).toBe("false");
      const auditLog = readFileSync(path.join(workspace, parsed.artifacts.audit), "utf8");
      expect(auditLog).not.toContain('"event":"setup_click"');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  test("submit --dry-run supports textarea and date fields", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form method="post" action="/refund" aria-label="Support refund">
            <input name="orderId" type="text" />
            <input name="refundDate" type="date" />
            <textarea name="reason"></textarea>
            <button type="submit">Request refund</button>
          </form>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-textarea-date-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "support-refund.yml"),
      [
        "name: support-refund",
        `url: ${fixture.url}`,
        ...workflowSafetyYaml,
        "fields:",
        "  - name: orderId",
        "    selector: input[name=\"orderId\"]",
        "    type: text",
        "  - name: refundDate",
        "    selector: input[name=\"refundDate\"]",
        "    type: date",
        "  - name: reason",
        "    selector: textarea[name=\"reason\"]",
        "    type: textarea",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const result = await runFormctlAsync([
        "submit",
        "support-refund",
        "--orderId",
        "ORD-1001",
        "--refundDate",
        "2026-05-26",
        "--reason",
        "Duplicate charge",
        "--dry-run",
        "--json",
        "--headless",
      ], workspace);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      const parsed = JSON.parse(result.stdout);
      expect(parsed).toMatchObject({
        status: "dry-run",
        workflow: "support-refund",
        submitted: false,
        fields: {
          orderId: "ORD-1001",
          refundDate: "2026-05-26",
          reason: "Duplicate charge",
        },
      });
      expect(fixture.postCount()).toBe(0);
    } finally {
      await fixture.close();
    }
  });

  test("submit --dry-run --json reports machine-readable artifacts", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form method="post" action="/submit" aria-label="Expense report">
            <input name="amount" type="number" />
            <button type="submit">Submit expense</button>
          </form>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-json-dry-run-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        `url: ${fixture.url}`,
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const result = await runFormctlAsync([
        "submit",
        "expense-report",
        "--amount",
        "120000",
        "--dry-run",
        "--json",
        "--headless",
      ], workspace);
      const parsed = JSON.parse(result.stdout);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(parsed).toMatchObject({
        status: "dry-run",
        workflow: "expense-report",
        exitCode: 0,
        submitted: false,
        requiresApproval: false,
        fields: {
          amount: "120000",
        },
      });
      expect(parsed.runId).toMatch(/^\d+-dry-run$/);
      expect(parsed.artifacts).toEqual({
        screenshot: `.formctl/runs/${parsed.runId}/dry-run.png`,
        diff: `.formctl/runs/${parsed.runId}/field-diff.json`,
        summary: `.formctl/runs/${parsed.runId}/summary.json`,
        audit: `.formctl/runs/${parsed.runId}/audit.jsonl`,
      });
      expect(fixture.postCount()).toBe(0);
    } finally {
      await fixture.close();
    }
  });

  test("submit without dry-run or approve exits 5 without submitting", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form method="post" action="/submit" aria-label="Expense report">
            <input name="amount" type="number" />
            <button type="submit">Submit expense</button>
          </form>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-approval-required-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        `url: ${fixture.url}`,
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const result = await runFormctlAsync([
        "submit",
        "expense-report",
        "--amount",
        "120000",
        "--headless",
      ], workspace);

      expect(result.status).toBe(5);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("Approval required");
      expect(result.stderr).toContain("--dry-run");
      expect(result.stderr).toContain("--approve");
      expect(fixture.postCount()).toBe(0);
      expect(existsSync(path.join(workspace, ".formctl", "runs"))).toBe(false);
    } finally {
      await fixture.close();
    }
  });

  test("submit --json without dry-run or approve exits 5 with machine-readable approval error", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form method="post" action="/submit" aria-label="Expense report">
            <input name="amount" type="number" />
            <button type="submit">Submit expense</button>
          </form>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-json-approval-required-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        `url: ${fixture.url}`,
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const result = await runFormctlAsync([
        "submit",
        "expense-report",
        "--amount",
        "120000",
        "--json",
        "--headless",
      ], workspace);

      expect(result.status).toBe(5);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toEqual({
        status: "error",
        workflow: "expense-report",
        exitCode: 5,
        submitted: false,
        requiresApproval: true,
        error: {
          code: "approval_required",
          message: "Approval required: run with --dry-run to preview or --approve to submit.",
        },
      });
      expect(fixture.postCount()).toBe(0);
      expect(existsSync(path.join(workspace, ".formctl", "runs"))).toBe(false);
    } finally {
      await fixture.close();
    }
  });

  test("submit asks for interactive approval after showing the dry-run screenshot path", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form method="post" action="/submit" aria-label="Expense report">
            <input name="amount" type="number" />
            <button type="submit">Submit expense</button>
          </form>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-interactive-approval-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        `url: ${fixture.url}`,
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );
    const stdout = createWritableCapture();
    const stderr = createWritableCapture();
    const previousCwd = process.cwd();

    try {
      const { run } = await import("../src/cli.js");

      process.chdir(workspace);
      const status = await run(
        [
          process.execPath,
          cliPath,
          "submit",
          "expense-report",
          "--amount",
          "120000",
          "--headless",
        ],
        stdout.stream,
        stderr.stream,
        createInteractiveInput("approve\n"),
      );
      const runDirectories = readdirSync(path.join(workspace, ".formctl", "runs"));
      const runId = runDirectories[0] ?? "";
      const runDirectory = path.join(workspace, ".formctl", "runs", runId);
      const summaryPath = path.join(runDirectory, "summary.json");

      expect(status).toBe(0);
      expect(stderr.text()).toBe("");
      expect(stdout.text()).toContain(`Dry-run screenshot: .formctl/runs/${runId}/dry-run.png`);
      expect(stdout.text()).toContain('Type "approve" to submit');
      expect(stdout.text()).toContain("Submitted workflow: expense-report");
      expect(fixture.postCount()).toBe(1);
      expect(runDirectories).toHaveLength(1);
      expect(existsSync(path.join(runDirectory, "dry-run.png"))).toBe(true);
      expect(existsSync(path.join(runDirectory, "field-diff.json"))).toBe(true);
      expect(existsSync(path.join(runDirectory, "post-submit.png"))).toBe(true);
      expect(JSON.parse(readFileSync(summaryPath, "utf8"))).toEqual({
        status: "submitted",
        workflow: "expense-report",
        submitted: true,
        approval: "interactive",
        fields: {
          amount: "120000",
        },
        artifacts: {
          screenshot: `.formctl/runs/${runId}/post-submit.png`,
          dryRunScreenshot: `.formctl/runs/${runId}/dry-run.png`,
          diff: `.formctl/runs/${runId}/field-diff.json`,
          summary: `.formctl/runs/${runId}/summary.json`,
          audit: `.formctl/runs/${runId}/audit.jsonl`,
        },
      });
    } finally {
      process.chdir(previousCwd);
      await fixture.close();
    }
  }, 35_000);

  test("submit --approve performs the submit and stores post-submit artifacts", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form method="post" action="/submit" aria-label="Expense report">
            <input name="amount" type="number" />
            <button type="submit">Submit expense</button>
          </form>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-approved-submit-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        `url: ${fixture.url}`,
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const result = await runFormctlAsync([
        "submit",
        "expense-report",
        "--amount",
        "120000",
        "--approve",
        "--headless",
      ], workspace);
      const runsDirectory = path.join(workspace, ".formctl", "runs");
      const runDirectories = existsSync(runsDirectory)
        ? readdirSync(runsDirectory)
        : [];
      const runDirectory = path.join(runsDirectory, runDirectories[0] ?? "");
      const runId = runDirectories[0] ?? "";
      const summaryPath = path.join(runDirectory, "summary.json");
      const screenshotPath = path.join(runDirectory, "post-submit.png");
      const diffPath = path.join(runDirectory, "field-diff.json");
      const auditPath = path.join(runDirectory, "audit.jsonl");

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Submitted workflow: expense-report");
      expect(fixture.postCount()).toBe(1);
      expect(runDirectories).toHaveLength(1);
      expect(existsSync(summaryPath)).toBe(true);
      expect(existsSync(screenshotPath)).toBe(true);
      expect(existsSync(diffPath)).toBe(true);
      expect(existsSync(auditPath)).toBe(true);
      expect(JSON.parse(readFileSync(summaryPath, "utf8"))).toEqual({
        status: "submitted",
        workflow: "expense-report",
        submitted: true,
        approval: "flag",
        fields: {
          amount: "120000",
        },
        artifacts: {
          screenshot: `.formctl/runs/${runId}/post-submit.png`,
          diff: `.formctl/runs/${runId}/field-diff.json`,
          summary: `.formctl/runs/${runId}/summary.json`,
          audit: `.formctl/runs/${runId}/audit.jsonl`,
        },
      });
      expect(JSON.parse(readFileSync(diffPath, "utf8"))).toEqual({
        status: "field-diff",
        workflow: "expense-report",
        submitted: false,
        fields: [
          {
            name: "amount",
            selector: 'input[name="amount"]',
            type: "number",
            action: "set",
            value: "120000",
          },
        ],
      });
    } finally {
      await fixture.close();
    }
  });

  test("submit --dry-run exits 3 when a recorded field selector is missing", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form method="post" action="/submit" aria-label="Expense report">
            <input name="amount" type="number" />
            <button type="submit">Submit expense</button>
          </form>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-missing-selector-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        `url: ${fixture.url}`,
        ...workflowSafetyYaml,
        "fields:",
        "  - name: total",
        "    selector: input[name=\"total\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const result = await runFormctlAsync([
        "submit",
        "expense-report",
        "--total",
        "120000",
        "--dry-run",
        "--headless",
      ], workspace);

      expect(result.status).toBe(3);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("Selector mismatch");
      expect(result.stderr).toContain("input[name=\"total\"]");
      expect(result.stderr).toContain("expected exactly 1 match, found 0");
      expect(fixture.postCount()).toBe(0);
      const runsDirectory = path.join(workspace, ".formctl", "runs");
      const runDirectories = existsSync(runsDirectory)
        ? readdirSync(runsDirectory)
        : [];
      const runId = runDirectories[0] ?? "";
      const runDirectory = path.join(runsDirectory, runId);
      const auditPath = path.join(runDirectory, "audit.jsonl");
      const failurePath = path.join(runDirectory, "failure.json");
      const screenshotPath = path.join(runDirectory, "failure.png");
      const auditEvents = readFileSync(auditPath, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));

      expect(runDirectories).toHaveLength(1);
      expect(runId).toMatch(/^\d+-failed$/);
      expect(existsSync(auditPath)).toBe(true);
      expect(existsSync(failurePath)).toBe(true);
      expect(existsSync(screenshotPath)).toBe(true);
      expect(JSON.parse(readFileSync(failurePath, "utf8"))).toEqual({
        status: "error",
        workflow: "expense-report",
        exitCode: 3,
        submitted: false,
        requiresApproval: false,
        runId,
        error: {
          code: "selector_mismatch",
          selector: 'input[name="total"]',
          expectedMatches: 1,
          actualMatches: 0,
          message: 'Selector mismatch: input[name="total"] expected exactly 1 match, found 0',
        },
        artifacts: {
          screenshot: `.formctl/runs/${runId}/failure.png`,
          failure: `.formctl/runs/${runId}/failure.json`,
          audit: `.formctl/runs/${runId}/audit.jsonl`,
        },
      });
      expect(auditEvents).toEqual([
        {
          event: "run_started",
          workflow: "expense-report",
          url: fixture.url,
          mode: "dry-run",
          submitted: false,
          approval: null,
          command: {
            dryRun: true,
            approve: false,
            headless: true,
            json: false,
          },
        },
        {
          event: "selector_check",
          role: "field",
          field: "total",
          selector: 'input[name="total"]',
          expectedMatches: 1,
          actualMatches: 0,
          result: "mismatch",
        },
        {
          event: "screenshot_saved",
          path: `.formctl/runs/${runId}/failure.png`,
        },
        {
          event: "run_finished",
          status: "error",
          submitted: false,
          artifacts: {
            screenshot: `.formctl/runs/${runId}/failure.png`,
            failure: `.formctl/runs/${runId}/failure.json`,
            audit: `.formctl/runs/${runId}/audit.jsonl`,
          },
        },
      ]);
    } finally {
      await fixture.close();
    }
  }, 35_000);

  test("submit --dry-run --json exits 3 with machine-readable selector mismatch", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form method="post" action="/submit" aria-label="Expense report">
            <input name="amount" type="number" />
            <button type="submit">Submit expense</button>
          </form>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-json-selector-mismatch-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        `url: ${fixture.url}`,
        ...workflowSafetyYaml,
        "fields:",
        "  - name: total",
        "    selector: input[name=\"total\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const result = await runFormctlAsync([
        "submit",
        "expense-report",
        "--total",
        "120000",
        "--dry-run",
        "--json",
        "--headless",
      ], workspace);
      const parsed = JSON.parse(result.stdout);

      expect(result.status).toBe(3);
      expect(result.stderr).toBe("");
      expect(parsed).toMatchObject({
        status: "error",
        workflow: "expense-report",
        exitCode: 3,
        submitted: false,
        requiresApproval: false,
        error: {
          code: "selector_mismatch",
          selector: 'input[name="total"]',
          expectedMatches: 1,
          actualMatches: 0,
          message: 'Selector mismatch: input[name="total"] expected exactly 1 match, found 0',
        },
      });
      expect(parsed.runId).toMatch(/^\d+-failed$/);
      expect(parsed.artifacts).toEqual({
        screenshot: `.formctl/runs/${parsed.runId}/failure.png`,
        failure: `.formctl/runs/${parsed.runId}/failure.json`,
        audit: `.formctl/runs/${parsed.runId}/audit.jsonl`,
      });
      expect(existsSync(path.join(workspace, parsed.artifacts.screenshot))).toBe(true);
      expect(existsSync(path.join(workspace, parsed.artifacts.failure))).toBe(true);
      expect(existsSync(path.join(workspace, parsed.artifacts.audit))).toBe(true);
      expect(fixture.postCount()).toBe(0);
    } finally {
      await fixture.close();
    }
  });

  test("submit suggests a selector repair but still exits 3 until YAML is updated", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form method="post" action="/submit" aria-label="Expense report">
            <label>
              Amount
              <input name="amount" type="number" />
            </label>
            <button type="submit">Submit expense</button>
          </form>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-selector-repair-"));
    const workflowPath = path.join(workspace, ".formctl", "workflows", "expense-report.yml");
    mkdirSync(path.dirname(workflowPath), { recursive: true });
    const brokenWorkflow = [
      "name: expense-report",
      `url: ${fixture.url}`,
      ...workflowSafetyYaml,
      "fields:",
      "  - name: amount",
      "    selector: input[name=\"amountCents\"]",
      "    type: number",
      "    label: Amount",
      "submit:",
      "  selector: button[type=\"submit\"]",
      "",
    ].join("\n");
    writeFileSync(workflowPath, brokenWorkflow);

    try {
      const broken = await runFormctlAsync([
        "submit",
        "expense-report",
        "--amount",
        "120000",
        "--dry-run",
        "--json",
        "--headless",
      ], workspace);
      const brokenJson = JSON.parse(broken.stdout);

      expect(broken.status).toBe(3);
      expect(broken.stderr).toBe("");
      expect(brokenJson).toMatchObject({
        status: "error",
        workflow: "expense-report",
        exitCode: 3,
        submitted: false,
        requiresApproval: false,
        error: {
          code: "selector_mismatch",
          selector: 'input[name="amountCents"]',
          expectedMatches: 1,
          actualMatches: 0,
          repair: {
            selector: 'input[name="amount"]',
            confidence: "high",
            requiresReview: true,
          },
        },
      });
      expect(brokenJson.error.repair.reason).toContain('matching label "Amount"');
      expect(existsSync(path.join(workspace, brokenJson.artifacts.failure))).toBe(true);
      const failureJson = JSON.parse(readFileSync(path.join(workspace, brokenJson.artifacts.failure), "utf8"));
      expect(failureJson.error.repair).toEqual(brokenJson.error.repair);
      const auditLog = readFileSync(path.join(workspace, brokenJson.artifacts.audit), "utf8");
      expect(auditLog).toContain('"event":"selector_repair_suggestion"');
      expect(auditLog).toContain('"suggestedSelector":"input[name=\\"amount\\"]"');
      expect(fixture.postCount()).toBe(0);

      writeFileSync(workflowPath, brokenWorkflow.replace('input[name="amountCents"]', brokenJson.error.repair.selector));
      const repaired = await runFormctlAsync([
        "submit",
        "expense-report",
        "--amount",
        "120000",
        "--dry-run",
        "--json",
        "--headless",
      ], workspace);

      expect(repaired.status).toBe(0);
      expect(JSON.parse(repaired.stdout)).toMatchObject({
        status: "dry-run",
        submitted: false,
        fields: {
          amount: "120000",
        },
      });
      expect(fixture.postCount()).toBe(0);
    } finally {
      await fixture.close();
    }
  });

  test("submit suggests a submit selector repair but still exits 3 until YAML is updated", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form method="post" action="/submit" aria-label="Expense report">
            <input name="amount" type="number" />
            <button type="submit" name="send-expense">Send expense</button>
          </form>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-submit-selector-repair-"));
    const workflowPath = path.join(workspace, ".formctl", "workflows", "expense-report.yml");
    mkdirSync(path.dirname(workflowPath), { recursive: true });
    const brokenWorkflow = [
      "name: expense-report",
      `url: ${fixture.url}`,
      ...workflowSafetyYaml,
      "fields:",
      "  - name: amount",
      "    selector: input[name=\"amount\"]",
      "    type: number",
      "submit:",
      "  selector: button[name=\"old-submit\"]",
      "",
    ].join("\n");
    writeFileSync(workflowPath, brokenWorkflow);

    try {
      const broken = await runFormctlAsync([
        "submit",
        "expense-report",
        "--amount",
        "120000",
        "--dry-run",
        "--json",
        "--headless",
      ], workspace);
      const brokenJson = JSON.parse(broken.stdout);

      expect(broken.status).toBe(3);
      expect(broken.stderr).toBe("");
      expect(brokenJson).toMatchObject({
        status: "error",
        workflow: "expense-report",
        exitCode: 3,
        submitted: false,
        requiresApproval: false,
        error: {
          code: "selector_mismatch",
          role: "submit",
          selector: 'button[name="old-submit"]',
          expectedMatches: 1,
          actualMatches: 0,
          repair: {
            selector: 'button[name="send-expense"]',
            confidence: "high",
            requiresReview: true,
          },
        },
      });
      expect(brokenJson.error.repair.reason).toContain("one named submit control");
      expect(existsSync(path.join(workspace, brokenJson.artifacts.failure))).toBe(true);
      const failureJson = JSON.parse(readFileSync(path.join(workspace, brokenJson.artifacts.failure), "utf8"));
      expect(failureJson.error.repair).toEqual(brokenJson.error.repair);
      const auditLog = readFileSync(path.join(workspace, brokenJson.artifacts.audit), "utf8");
      expect(auditLog).toContain('"event":"selector_repair_suggestion"');
      expect(auditLog).toContain('"role":"submit"');
      expect(auditLog).toContain('"suggestedSelector":"button[name=\\"send-expense\\"]"');
      expect(fixture.postCount()).toBe(0);

      writeFileSync(workflowPath, brokenWorkflow.replace('button[name="old-submit"]', brokenJson.error.repair.selector));
      const repaired = await runFormctlAsync([
        "submit",
        "expense-report",
        "--amount",
        "120000",
        "--dry-run",
        "--json",
        "--headless",
      ], workspace);

      expect(repaired.status).toBe(0);
      expect(JSON.parse(repaired.stdout)).toMatchObject({
        status: "dry-run",
        submitted: false,
        fields: {
          amount: "120000",
        },
      });
      expect(fixture.postCount()).toBe(0);
    } finally {
      await fixture.close();
    }
  }, 35_000);

  test("submit omits submit selector repair suggestions when candidates are ambiguous", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form method="post" action="/submit" aria-label="Expense report">
            <input name="amount" type="number" />
            <button type="submit" name="save-draft">Save draft</button>
            <button type="submit" name="send-expense">Send expense</button>
          </form>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-submit-selector-ambiguous-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        `url: ${fixture.url}`,
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[name=\"old-submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const result = await runFormctlAsync([
        "submit",
        "expense-report",
        "--amount",
        "120000",
        "--dry-run",
        "--json",
        "--headless",
      ], workspace);
      const parsed = JSON.parse(result.stdout);

      expect(result.status).toBe(3);
      expect(result.stderr).toBe("");
      expect(parsed).toMatchObject({
        status: "error",
        workflow: "expense-report",
        exitCode: 3,
        submitted: false,
        requiresApproval: false,
        error: {
          code: "selector_mismatch",
          role: "submit",
          selector: 'button[name="old-submit"]',
          expectedMatches: 1,
          actualMatches: 0,
        },
      });
      expect(parsed.error.repair).toBeUndefined();
      const auditLog = readFileSync(path.join(workspace, parsed.artifacts.audit), "utf8");
      expect(auditLog).not.toContain('"event":"selector_repair_suggestion"');
      expect(fixture.postCount()).toBe(0);
    } finally {
      await fixture.close();
    }
  }, 35_000);

  test("submit --dry-run --json stops with interaction_required when the target page is a login wall", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form method="post" action="/login" aria-label="Sign in">
            <label>Email <input name="email" type="email" autocomplete="username" /></label>
            <label>Password <input name="password" type="password" autocomplete="current-password" /></label>
            <button type="submit">Sign in</button>
          </form>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-login-wall-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        `url: ${fixture.url}`,
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const result = await runFormctlAsync([
        "submit",
        "expense-report",
        "--amount",
        "120000",
        "--dry-run",
        "--json",
        "--headless",
      ], workspace);
      const parsed = JSON.parse(result.stdout);

      expect(result.status).toBe(6);
      expect(result.stderr).toBe("");
      expect(parsed).toMatchObject({
        status: "error",
        workflow: "expense-report",
        exitCode: 6,
        submitted: false,
        requiresApproval: false,
        error: {
          code: "interaction_required",
          detected: "password_input",
          message: "Manual interaction required: page appears to require login before form replay.",
          fix: "Log in with a headed browser or record after authentication, then retry submit.",
        },
      });
      expect(parsed.runId).toMatch(/^\d+-failed$/);
      expect(parsed.artifacts).toEqual({
        screenshot: `.formctl/runs/${parsed.runId}/failure.png`,
        failure: `.formctl/runs/${parsed.runId}/failure.json`,
        audit: `.formctl/runs/${parsed.runId}/audit.jsonl`,
      });
      expect(result.stdout).not.toContain("selector_mismatch");
      expect(existsSync(path.join(workspace, parsed.artifacts.screenshot))).toBe(true);
      expect(existsSync(path.join(workspace, parsed.artifacts.failure))).toBe(true);
      expect(existsSync(path.join(workspace, parsed.artifacts.audit))).toBe(true);
      expect(fixture.postCount()).toBe(0);
    } finally {
      await fixture.close();
    }
  });

  test("submit --dry-run --json stops with mfa_required for security-code prompts", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form method="post" action="/mfa" aria-label="Security check">
            <h1>Confirm sign in</h1>
            <label>Security code <input name="code" inputmode="numeric" /></label>
            <button type="submit">Continue</button>
          </form>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-mfa-wall-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        `url: ${fixture.url}`,
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const result = await runFormctlAsync([
        "submit",
        "expense-report",
        "--amount",
        "120000",
        "--dry-run",
        "--json",
        "--headless",
      ], workspace);
      const parsed = JSON.parse(result.stdout);

      expect(result.status).toBe(6);
      expect(result.stderr).toBe("");
      expect(parsed).toMatchObject({
        status: "error",
        workflow: "expense-report",
        exitCode: 6,
        submitted: false,
        requiresApproval: false,
        error: {
          code: "mfa_required",
          detected: "mfa_prompt",
          message: "Manual interaction required: page appears to require MFA before form replay.",
          fix: "Complete MFA in a headed browser or provide a valid local session, then retry submit.",
        },
      });
      expect(parsed.runId).toMatch(/^\d+-failed$/);
      expect(parsed.artifacts).toEqual({
        screenshot: `.formctl/runs/${parsed.runId}/failure.png`,
        failure: `.formctl/runs/${parsed.runId}/failure.json`,
        audit: `.formctl/runs/${parsed.runId}/audit.jsonl`,
      });
      expect(result.stdout).not.toContain("selector_mismatch");
      expect(existsSync(path.join(workspace, parsed.artifacts.screenshot))).toBe(true);
      expect(existsSync(path.join(workspace, parsed.artifacts.failure))).toBe(true);
      expect(existsSync(path.join(workspace, parsed.artifacts.audit))).toBe(true);
      expect(fixture.postCount()).toBe(0);
    } finally {
      await fixture.close();
    }
  });

  test("submit --dry-run --json stops with captcha_required for human-verification challenges", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <main aria-label="Security check">
            <h1>Verify you are human</h1>
            <p>Complete this check to continue.</p>
            <button type="button">Continue</button>
          </main>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-human-check-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        `url: ${fixture.url}`,
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const result = await runFormctlAsync([
        "submit",
        "expense-report",
        "--amount",
        "120000",
        "--dry-run",
        "--json",
        "--headless",
      ], workspace);
      const parsed = JSON.parse(result.stdout);

      expect(result.status).toBe(6);
      expect(result.stderr).toBe("");
      expect(parsed).toMatchObject({
        status: "error",
        workflow: "expense-report",
        exitCode: 6,
        submitted: false,
        requiresApproval: false,
        error: {
          code: "captcha_required",
          detected: "captcha_challenge",
          message: "Manual interaction required: page appears to require CAPTCHA before form replay.",
          fix: "Complete the challenge in a headed browser, then retry submit.",
        },
      });
      expect(parsed.runId).toMatch(/^\d+-failed$/);
      expect(parsed.artifacts).toEqual({
        screenshot: `.formctl/runs/${parsed.runId}/failure.png`,
        failure: `.formctl/runs/${parsed.runId}/failure.json`,
        audit: `.formctl/runs/${parsed.runId}/audit.jsonl`,
      });
      expect(result.stdout).not.toContain("selector_mismatch");
      expect(existsSync(path.join(workspace, parsed.artifacts.screenshot))).toBe(true);
      expect(existsSync(path.join(workspace, parsed.artifacts.failure))).toBe(true);
      expect(existsSync(path.join(workspace, parsed.artifacts.audit))).toBe(true);
      expect(fixture.postCount()).toBe(0);
    } finally {
      await fixture.close();
    }
  });

  test("submit --dry-run can resume after manual interaction before selector checks", async () => {
    let postCount = 0;
    const server = http.createServer((request, response) => {
      if (request.method === "POST") {
        postCount += 1;
      }
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`
        <!doctype html>
        <html>
          <body>
            <form id="login" method="post" action="/login" aria-label="Sign in">
              <label>Email <input name="email" type="email" autocomplete="username" /></label>
              <label>Password <input name="password" type="password" autocomplete="current-password" /></label>
              <button type="submit">Sign in</button>
            </form>
            <script>
              setTimeout(() => {
                document.body.innerHTML = '<form method="post" action="/submit" aria-label="Expense report"><label>Amount <input name="amount" type="number" /></label><button type="submit">Submit expense</button></form>';
              }, 50);
            </script>
          </body>
        </html>
      `);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Manual resume fixture server did not expose a TCP port");
    }

    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-manual-resume-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        `url: http://127.0.0.1:${address.port}/expense`,
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );
    const stdout = createWritableCapture();
    const stderr = createWritableCapture();
    const previousCwd = process.cwd();

    try {
      const { run } = await import("../src/cli.js");

      process.chdir(workspace);
      const status = await run(
        [
          process.execPath,
          cliPath,
          "submit",
          "expense-report",
          "--amount",
          "120000",
          "--dry-run",
          "--resume-after-interaction",
          "--headless",
        ],
        stdout.stream,
        stderr.stream,
        createDelayedInteractiveInput("\n", 120),
      );

      expect(status).toBe(0);
      expect(stderr.text()).toBe("");
      expect(stdout.text()).toContain("Manual interaction required: page appears to require login before form replay.");
      expect(stdout.text()).toContain("Press Enter to resume formctl after completing the browser step.");
      expect(stdout.text()).toContain("Dry-run complete: expense-report");
      const runs = readdirSync(path.join(workspace, ".formctl", "runs"));
      const summary = JSON.parse(readFileSync(path.join(workspace, ".formctl", "runs", runs[0], "summary.json"), "utf8"));
      expect(summary.fields).toEqual({ amount: "120000" });
      expect(postCount).toBe(0);
    } finally {
      process.chdir(previousCwd);
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  test("submit --dry-run does not resume CAPTCHA or MFA challenges without Enter", async () => {
    const challenges = [
      {
        name: "captcha",
        message: "Manual interaction required: page appears to require CAPTCHA before form replay.",
        initialHtml: `
          <main id="challenge">
            <h1>Verify you are human</h1>
          </main>
        `,
      },
      {
        name: "mfa",
        message: "Manual interaction required: page appears to require MFA before form replay.",
        initialHtml: `
          <form id="mfa" method="post" action="/mfa" aria-label="Security check">
            <label>Security code <input name="code" inputmode="numeric" /></label>
            <button type="submit">Verify</button>
          </form>
        `,
      },
    ];

    for (const challenge of challenges) {
      const fixture = await serveFixture(`
        <!doctype html>
        <html>
          <body>
            ${challenge.initialHtml}
            <script>
              setTimeout(() => {
                document.body.innerHTML = '<form method="post" action="/submit" aria-label="Expense report"><label>Amount <input name="amount" type="number" /></label><button type="submit">Submit expense</button></form>';
              }, 50);
            </script>
          </body>
        </html>
      `);
      const workspace = mkdtempSync(path.join(os.tmpdir(), `formctl-no-resume-${challenge.name}-`));
      mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
      writeFileSync(
        path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
        [
          "name: expense-report",
          `url: ${fixture.url}`,
          ...workflowSafetyYaml,
          "fields:",
          "  - name: amount",
          "    selector: input[name=\"amount\"]",
          "    type: number",
          "submit:",
          "  selector: button[type=\"submit\"]",
          "",
        ].join("\n"),
      );
      const stdout = createWritableCapture();
      const stderr = createWritableCapture();
      const previousCwd = process.cwd();

      try {
        const { run } = await import("../src/cli.js");

        process.chdir(workspace);
        const status = await run(
          [
            process.execPath,
            cliPath,
            "submit",
            "expense-report",
            "--amount",
            "120000",
            "--dry-run",
            "--resume-after-interaction",
            "--headless",
          ],
          stdout.stream,
          stderr.stream,
          createClosedInteractiveInput(),
        );

        expect(status).toBe(6);
        expect(stdout.text()).toContain(challenge.message);
        expect(stdout.text()).toContain("Press Enter to resume formctl after completing the browser step.");
        expect(stdout.text()).not.toContain("Dry-run complete");
        expect(stderr.text()).toContain(challenge.message);
        expect(fixture.postCount()).toBe(0);
      } finally {
        process.chdir(previousCwd);
        await fixture.close();
      }
    }
  });

  test("submit --dry-run --json uses a storage state file for authenticated forms", async () => {
    let postCount = 0;
    const server = http.createServer((request, response) => {
      if (request.method === "POST") {
        postCount += 1;
      }
      const isAuthenticated = request.headers.cookie?.includes("formctl_session=valid") ?? false;
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(isAuthenticated ? `
        <!doctype html>
        <html>
          <body>
            <form method="post" action="/submit" aria-label="Expense report">
              <label>Amount <input name="amount" type="number" /></label>
              <button type="submit">Submit expense</button>
            </form>
          </body>
        </html>
      ` : `
        <!doctype html>
        <html>
          <body>
            <form method="post" action="/login" aria-label="Sign in">
              <label>Email <input name="email" type="email" autocomplete="username" /></label>
              <label>Password <input name="password" type="password" autocomplete="current-password" /></label>
              <button type="submit">Sign in</button>
            </form>
          </body>
        </html>
      `);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Authenticated fixture server did not expose a TCP port");
    }

    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-storage-state-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        `url: http://127.0.0.1:${address.port}/expense`,
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );
    writeFileSync(
      path.join(workspace, "storage-state.json"),
      JSON.stringify({
        cookies: [
          {
            name: "formctl_session",
            value: "valid",
            domain: "127.0.0.1",
            path: "/",
            expires: -1,
            httpOnly: false,
            secure: false,
            sameSite: "Lax",
          },
        ],
        origins: [],
      }),
    );

    try {
      const result = await runFormctlAsync([
        "submit",
        "expense-report",
        "--amount",
        "120000",
        "--storage-state",
        "storage-state.json",
        "--dry-run",
        "--json",
        "--headless",
      ], workspace);
      const parsed = JSON.parse(result.stdout);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(parsed).toMatchObject({
        status: "dry-run",
        workflow: "expense-report",
        exitCode: 0,
        submitted: false,
        requiresApproval: false,
        fields: {
          amount: "120000",
        },
      });
      expect(parsed.artifacts).toEqual({
        screenshot: `.formctl/runs/${parsed.runId}/dry-run.png`,
        summary: `.formctl/runs/${parsed.runId}/summary.json`,
        diff: `.formctl/runs/${parsed.runId}/field-diff.json`,
        audit: `.formctl/runs/${parsed.runId}/audit.jsonl`,
      });
      expect(existsSync(path.join(workspace, parsed.artifacts.screenshot))).toBe(true);
      const auditEvents = readFileSync(path.join(workspace, parsed.artifacts.audit), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(auditEvents[0].command).toMatchObject({ storageState: true });
      expect(postCount).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  test("submit --dry-run exits 3 when a recorded field type changed", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form method="post" action="/submit" aria-label="Expense report">
            <input name="amount" type="text" />
            <button type="submit">Submit expense</button>
          </form>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-type-mismatch-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        `url: ${fixture.url}`,
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const result = await runFormctlAsync([
        "submit",
        "expense-report",
        "--amount",
        "120000",
        "--dry-run",
        "--json",
        "--headless",
      ], workspace);
      const parsed = JSON.parse(result.stdout);

      expect(result.status).toBe(3);
      expect(result.stderr).toBe("");
      expect(parsed).toMatchObject({
        status: "error",
        workflow: "expense-report",
        exitCode: 3,
        submitted: false,
        requiresApproval: false,
        error: {
          code: "selector_mismatch",
          selector: 'input[name="amount"]',
          expectedType: "number",
          actualType: "text",
        },
      });
      expect(parsed.error.message).toContain("expected type number, found text");
      expect(parsed.runId).toMatch(/^\d+-failed$/);
      expect(existsSync(path.join(workspace, parsed.artifacts.failure))).toBe(true);
      expect(existsSync(path.join(workspace, parsed.artifacts.screenshot))).toBe(true);
      expect(existsSync(path.join(workspace, parsed.artifacts.audit))).toBe(true);
      expect(fixture.postCount()).toBe(0);
    } finally {
      await fixture.close();
    }
  });

  test("submit --dry-run exits 3 when a recorded field label changed", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form method="post" action="/submit" aria-label="Expense report">
            <label>
              Total
              <input name="amount" type="number" />
            </label>
            <button type="submit">Submit expense</button>
          </form>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-label-mismatch-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        `url: ${fixture.url}`,
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "    label: Amount",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const result = await runFormctlAsync([
        "submit",
        "expense-report",
        "--amount",
        "120000",
        "--dry-run",
        "--json",
        "--headless",
      ], workspace);
      const parsed = JSON.parse(result.stdout);

      expect(result.status).toBe(3);
      expect(result.stderr).toBe("");
      expect(parsed).toMatchObject({
        status: "error",
        workflow: "expense-report",
        exitCode: 3,
        submitted: false,
        requiresApproval: false,
        error: {
          code: "selector_mismatch",
          selector: 'input[name="amount"]',
          expectedLabel: "Amount",
          actualLabel: "Total",
        },
      });
      expect(parsed.error.message).toContain("expected label Amount, found Total");
      expect(parsed.runId).toMatch(/^\d+-failed$/);
      expect(existsSync(path.join(workspace, parsed.artifacts.failure))).toBe(true);
      expect(existsSync(path.join(workspace, parsed.artifacts.screenshot))).toBe(true);
      expect(existsSync(path.join(workspace, parsed.artifacts.audit))).toBe(true);
      expect(fixture.postCount()).toBe(0);
    } finally {
      await fixture.close();
    }
  });

  test("submit --dry-run exits 3 when a recorded field description changed", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form method="post" action="/submit" aria-label="Expense report">
            <label>
              Amount
              <input name="amount" type="number" aria-describedby="amount-help" />
            </label>
            <p id="amount-help">Amount in USD</p>
            <button type="submit">Submit expense</button>
          </form>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-description-mismatch-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        `url: ${fixture.url}`,
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "    label: Amount",
        "    description: Amount in KRW",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const result = await runFormctlAsync([
        "submit",
        "expense-report",
        "--amount",
        "120000",
        "--dry-run",
        "--json",
        "--headless",
      ], workspace);
      const parsed = JSON.parse(result.stdout);

      expect(result.status).toBe(3);
      expect(result.stderr).toBe("");
      expect(parsed).toMatchObject({
        status: "error",
        workflow: "expense-report",
        exitCode: 3,
        submitted: false,
        requiresApproval: false,
        error: {
          code: "selector_mismatch",
          selector: 'input[name="amount"]',
          expectedDescription: "Amount in KRW",
          actualDescription: "Amount in USD",
        },
      });
      expect(parsed.error.message).toContain("expected description Amount in KRW, found Amount in USD");
      expect(parsed.runId).toMatch(/^\d+-failed$/);
      expect(existsSync(path.join(workspace, parsed.artifacts.failure))).toBe(true);
      expect(existsSync(path.join(workspace, parsed.artifacts.screenshot))).toBe(true);
      expect(existsSync(path.join(workspace, parsed.artifacts.audit))).toBe(true);
      expect(fixture.postCount()).toBe(0);
    } finally {
      await fixture.close();
    }
  });

  test("submit --dry-run exits 3 when a recorded field selector is ambiguous", async () => {
    const fixture = await serveFixture(`
      <!doctype html>
      <html>
        <body>
          <form method="post" action="/submit" aria-label="Expense report">
            <input name="amount" type="number" />
            <input name="amount" type="number" />
            <button type="submit">Submit expense</button>
          </form>
        </body>
      </html>
    `);
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-ambiguous-selector-"));
    mkdirSync(path.join(workspace, ".formctl", "workflows"), { recursive: true });
    writeFileSync(
      path.join(workspace, ".formctl", "workflows", "expense-report.yml"),
      [
        "name: expense-report",
        `url: ${fixture.url}`,
        ...workflowSafetyYaml,
        "fields:",
        "  - name: amount",
        "    selector: input[name=\"amount\"]",
        "    type: number",
        "submit:",
        "  selector: button[type=\"submit\"]",
        "",
      ].join("\n"),
    );

    try {
      const result = await runFormctlAsync([
        "submit",
        "expense-report",
        "--amount",
        "120000",
        "--dry-run",
        "--headless",
      ], workspace);

      expect(result.status).toBe(3);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("Selector mismatch");
      expect(result.stderr).toContain("input[name=\"amount\"]");
      expect(result.stderr).toContain("expected exactly 1 match, found 2");
      expect(fixture.postCount()).toBe(0);
      const runsDirectory = path.join(workspace, ".formctl", "runs");
      const runDirectories = existsSync(runsDirectory)
        ? readdirSync(runsDirectory)
        : [];
      const runId = runDirectories[0] ?? "";

      expect(runDirectories).toHaveLength(1);
      expect(runId).toMatch(/^\d+-failed$/);
      expect(existsSync(path.join(runsDirectory, runId, "audit.jsonl"))).toBe(true);
      expect(existsSync(path.join(runsDirectory, runId, "failure.json"))).toBe(true);
      expect(existsSync(path.join(runsDirectory, runId, "failure.png"))).toBe(true);
    } finally {
      await fixture.close();
    }
  });
});
