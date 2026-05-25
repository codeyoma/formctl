import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, test } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(projectRoot, "src", "cli.ts");
const tsxLoaderPath = path.join(projectRoot, "node_modules", "tsx", "dist", "loader.mjs");

function runFormctl(args: string[], cwd = projectRoot) {
  return spawnSync(process.execPath, ["--import", tsxLoaderPath, cliPath, ...args], {
    cwd,
    encoding: "utf8",
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
    expect(result.stdout).toContain("formctl turns browser-recorded web forms into safe CLI commands");
    expect(result.stdout).toContain("formctl record <workflow-name> <url>");
    expect(result.stdout).toContain("formctl submit <workflow-name> [flags]");
    expect(result.stdout).toContain("formctl inspect <workflow-name>");
    expect(result.stdout).toContain("formctl doctor");
  });

  test("doctor --json reports a machine-readable ok status", () => {
    const result = runFormctl(["doctor", "--json"]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      status: "ok",
      command: "doctor",
      checks: [
        { name: "node", status: "ok" },
        { name: "workspace", status: "ok" },
      ],
    });
  });

  test("inspect returns exit code 2 when the workflow does not exist", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-missing-workflow-"));
    const result = runFormctl(["inspect", "expense-report"], workspace);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Workflow not found: expense-report");
    expect(result.stderr).toContain(".formctl/workflows/expense-report.yml");
  });

  test("inspect --json reads a recorded workflow file", () => {
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-existing-workflow-"));
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
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-record-workflow-"));

    try {
      const result = await runFormctlAsync(["record", "expense-report", fixture.url, "--headless"], workspace);
      const workflowPath = path.join(workspace, ".formctl", "workflows", "expense-report.yml");

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Recorded workflow: expense-report");
      expect(result.stdout).toContain(".formctl/workflows/expense-report.yml");
      expect(existsSync(workflowPath)).toBe(true);
      expect(parse(readFileSync(workflowPath, "utf8"))).toEqual({
        name: "expense-report",
        url: fixture.url,
        fields: [
          { name: "amount", selector: 'input[name="amount"]', type: "number" },
          { name: "receipt", selector: 'input[name="receipt"]', type: "file" },
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

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Dry-run complete: expense-report");
      expect(fixture.postCount()).toBe(0);
      expect(runDirectories).toHaveLength(1);
      expect(existsSync(summaryPath)).toBe(true);
      expect(existsSync(screenshotPath)).toBe(true);
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
        },
      });
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

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Submitted workflow: expense-report");
      expect(fixture.postCount()).toBe(1);
      expect(runDirectories).toHaveLength(1);
      expect(existsSync(summaryPath)).toBe(true);
      expect(existsSync(screenshotPath)).toBe(true);
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
      expect(existsSync(path.join(workspace, ".formctl", "runs"))).toBe(false);
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

      expect(result.status).toBe(3);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toEqual({
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
      expect(fixture.postCount()).toBe(0);
      expect(existsSync(path.join(workspace, ".formctl", "runs"))).toBe(false);
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
      expect(existsSync(path.join(workspace, ".formctl", "runs"))).toBe(false);
    } finally {
      await fixture.close();
    }
  });
});
