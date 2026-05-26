import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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
    expect(result.stdout).toContain("formctl record <workflow-name> <url>");
    expect(result.stdout).toContain("formctl doctor");
    expect(result.stdout).toContain("Start with an existing .formctl/workflows/<name>.yml file.");
    expect(result.stdout).toContain("Use record only when you need to create a new workflow.");
    expect(result.stdout).toContain("--headed");
    expect(result.stdout).toContain("--headless");
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

  test("inspect returns exit code 2 when the workflow does not exist", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-missing-workflow-"));
    const result = runFormctl(["inspect", "expense-report"], workspace);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Workflow not found: expense-report");
    expect(result.stderr).toContain(".formctl/workflows/expense-report.yml");
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
        },
      ],
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
        { name: "submit-selector", status: "ok" },
        { name: "safety-metadata", status: "ok" },
      ],
    });
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
        { name: "submit-selector", status: "ok" },
        {
          name: "safety-metadata",
          status: "error",
          message: "Workflow safety metadata must match the enforced dry-run, approval, selector drift, and file redaction contract.",
        },
      ],
    });
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
      const auditPath = path.join(runDirectory, "audit.jsonl");

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Dry-run complete: expense-report");
      expect(fixture.postCount()).toBe(0);
      expect(runDirectories).toHaveLength(1);
      expect(existsSync(summaryPath)).toBe(true);
      expect(existsSync(screenshotPath)).toBe(true);
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
          summary: `.formctl/runs/${runId}/summary.json`,
          audit: `.formctl/runs/${runId}/audit.jsonl`,
        },
      });
    } finally {
      await fixture.close();
    }
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
      const auditPath = path.join(runDirectory, "audit.jsonl");

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Submitted workflow: expense-report");
      expect(fixture.postCount()).toBe(1);
      expect(runDirectories).toHaveLength(1);
      expect(existsSync(summaryPath)).toBe(true);
      expect(existsSync(screenshotPath)).toBe(true);
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
          summary: `.formctl/runs/${runId}/summary.json`,
          audit: `.formctl/runs/${runId}/audit.jsonl`,
        },
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
