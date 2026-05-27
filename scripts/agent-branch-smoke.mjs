#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const cliPath = path.join(projectRoot, "src", "cli.ts");
const tsxLoaderPath = path.join(projectRoot, "node_modules", "tsx", "dist", "loader.mjs");
const tempRoot = mkdtempSync(path.join(os.tmpdir(), "formctl-agent-branch-smoke-"));

function runFormctl(args) {
  return spawnSync(process.execPath, ["--import", tsxLoaderPath, cliPath, ...args], {
    cwd: tempRoot,
    encoding: "utf8",
  });
}

function parseJson(stdout, label) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${label} did not emit JSON on stdout: ${stdout}\n${error}`);
  }
}

function expectBranch(label, args, expectedStatus, expectedErrorCode, extraCheck = () => {}) {
  const result = runFormctl(args);
  const payload = parseJson(result.stdout, label);

  if (result.status !== expectedStatus) {
    throw new Error(`${label} exited ${result.status}, expected ${expectedStatus}: ${result.stdout}${result.stderr}`);
  }
  if (result.stderr !== "") {
    throw new Error(`${label} wrote stderr in JSON mode: ${result.stderr}`);
  }
  if (payload.status !== "error") {
    throw new Error(`${label} did not return error status: ${result.stdout}`);
  }
  if (payload.exitCode !== expectedStatus) {
    throw new Error(`${label} returned exitCode ${payload.exitCode}, expected ${expectedStatus}`);
  }
  if (payload.error?.code !== expectedErrorCode) {
    throw new Error(`${label} returned error code ${payload.error?.code}, expected ${expectedErrorCode}`);
  }

  extraCheck(payload);
}

try {
  const workflowsDirectory = path.join(tempRoot, ".formctl", "workflows");
  mkdirSync(workflowsDirectory, { recursive: true });

  expectBranch("invalid workflow name", ["inspect", "../leaked", "--json"], 1, "invalid_workflow_name");
  expectBranch("missing workflow", ["inspect", "expense-report", "--json"], 2, "workflow_not_found", (payload) => {
    if (payload.error.expectedPath !== ".formctl/workflows/expense-report.yml") {
      throw new Error(`missing workflow returned unexpected path: ${JSON.stringify(payload)}`);
    }
  });

  writeFileSync(path.join(workflowsDirectory, "unreadable.yml"), "name: [\n");
  expectBranch("unreadable workflow", ["inspect", "unreadable", "--json"], 1, "workflow_unreadable", (payload) => {
    if (payload.error.path !== ".formctl/workflows/unreadable.yml" || !payload.error.fix.includes("valid YAML")) {
      throw new Error(`unreadable workflow returned weak repair guidance: ${JSON.stringify(payload)}`);
    }
  });

  writeFileSync(
    path.join(workflowsDirectory, "invalid.yml"),
    [
      "name: invalid",
      "url: http://127.0.0.1:1/invalid",
      "fields: []",
      "submit:",
      "  selector: button[type=\"submit\"]",
      "",
    ].join("\n"),
  );
  expectBranch("invalid workflow inspect", ["inspect", "invalid", "--json"], 1, "workflow_invalid", (payload) => {
    const failedChecks = payload.checks?.map((check) => check.name) ?? [];
    if (!failedChecks.includes("fields") || !failedChecks.includes("safety-metadata")) {
      throw new Error(`invalid workflow did not report failed checks: ${JSON.stringify(payload)}`);
    }
  });
  expectBranch("invalid workflow submit", ["submit", "invalid", "--dry-run", "--json"], 1, "workflow_invalid", (payload) => {
    if (payload.submitted !== false || payload.requiresApproval !== false) {
      throw new Error(`invalid submit returned unsafe state: ${JSON.stringify(payload)}`);
    }
  });

  writeFileSync(
    path.join(workflowsDirectory, "valid.yml"),
    [
      "name: valid",
      "url: http://127.0.0.1:1/valid",
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
  expectBranch("approval gate", ["submit", "valid", "--json"], 5, "approval_required", (payload) => {
    if (payload.submitted !== false || payload.requiresApproval !== true) {
      throw new Error(`approval gate returned unexpected state: ${JSON.stringify(payload)}`);
    }
  });

  process.stdout.write("Agent branch smoke passed\n");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
