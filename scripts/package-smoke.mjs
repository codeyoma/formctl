#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const tempRoot = mkdtempSync(path.join(os.tmpdir(), "formctl-package-smoke-"));
const packDirectory = path.join(tempRoot, "pack");
const installPrefix = path.join(tempRoot, "prefix");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    ...options,
  });

  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`${command} ${args.join(" ")} exited ${result.status}`);
  }

  return result;
}

async function smokeMcpServer(command) {
  const transport = new StdioClientTransport({
    command,
    cwd: projectRoot,
    stderr: "pipe",
  });
  const client = new Client({ name: "formctl-package-smoke", version: "0.0.0" });

  await client.connect(transport);
  const tools = await client.listTools();
  const toolNames = tools.tools.map((tool) => tool.name);
  if (!toolNames.includes("formctl_doctor")) {
    throw new Error(`Installed formctl-mcp did not expose formctl_doctor: ${JSON.stringify(toolNames)}`);
  }
  if (!toolNames.includes("formctl_workflows")) {
    throw new Error(`Installed formctl-mcp did not expose formctl_workflows: ${JSON.stringify(toolNames)}`);
  }
  if (!toolNames.includes("formctl_validate")) {
    throw new Error(`Installed formctl-mcp did not expose formctl_validate: ${JSON.stringify(toolNames)}`);
  }
  await client.close();
}

try {
  mkdirSync(packDirectory, { recursive: true });
  mkdirSync(installPrefix, { recursive: true });

  run("npm", ["pack", "--pack-destination", packDirectory, "--json"]);
  const tarball = readdirSync(packDirectory).find((file) => file.endsWith(".tgz"));
  if (tarball === undefined) {
    throw new Error("npm pack did not produce a tarball");
  }

  run("npm", [
    "install",
    "--global",
    "--prefix",
    installPrefix,
    "--no-audit",
    "--no-fund",
    path.join(packDirectory, tarball),
  ]);

  const binaryDirectory = process.platform === "win32" ? installPrefix : path.join(installPrefix, "bin");
  const formctl = path.join(binaryDirectory, process.platform === "win32" ? "formctl.cmd" : "formctl");
  const formctlMcp = path.join(binaryDirectory, process.platform === "win32" ? "formctl-mcp.cmd" : "formctl-mcp");

  const version = run(formctl, ["--version"]);
  if (!version.stdout.trim().startsWith("formctl ")) {
    throw new Error(`Unexpected version output: ${version.stdout}`);
  }

  const help = run(formctl, ["--help"]);
  if (!help.stdout.includes("formctl runs recorded browser forms as safe CLI commands")) {
    throw new Error("Installed formctl --help output did not include the product line");
  }

  const doctor = run(formctl, ["doctor", "--json"]);
  const doctorPayload = JSON.parse(doctor.stdout);
  if (doctorPayload.status !== "ok" || doctorPayload.exitCode !== 0) {
    throw new Error(`Installed formctl doctor failed: ${doctor.stdout}`);
  }

  const validation = run(formctl, ["validate", "expense-report", "--json"]);
  const validationPayload = JSON.parse(validation.stdout);
  if (validationPayload.status !== "ok" || validationPayload.exitCode !== 0) {
    throw new Error(`Installed formctl validate failed: ${validation.stdout}`);
  }

  run(process.execPath, [path.join(projectRoot, "scripts", "agent-branch-smoke.mjs")], {
    env: {
      ...process.env,
      FORMCTL_BINARY: formctl,
    },
  });

  await smokeMcpServer(formctlMcp);

  process.stdout.write("Package smoke passed\n");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
