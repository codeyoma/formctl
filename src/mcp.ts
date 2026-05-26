#!/usr/bin/env node
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { buildFormctlArgsForTool, createMcpToolDefinitions } from "./mcp-tools.js";

type CliResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type ToolInput = {
  workspace?: string;
};

function resolveCliProcess(args: string[]): { command: string; args: string[] } {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDirectory = path.dirname(currentFile);
  const isTypeScriptSource = currentFile.endsWith(".ts");
  const cliPath = path.join(currentDirectory, isTypeScriptSource ? "cli.ts" : "cli.js");

  return {
    command: process.execPath,
    args: isTypeScriptSource ? ["--import", "tsx", cliPath, ...args] : [cliPath, ...args],
  };
}

function runFormctl(args: string[], workspace?: string): Promise<CliResult> {
  const cli = resolveCliProcess(args);

  return new Promise((resolve, reject) => {
    const child = spawn(cli.command, cli.args, {
      cwd: workspace ?? process.cwd(),
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
    child.on("close", (code) => {
      resolve({
        exitCode: code ?? 10,
        stdout,
        stderr,
      });
    });
  });
}

function toolResult(result: CliResult) {
  const text = result.stdout.trim().length > 0 ? result.stdout.trim() : result.stderr.trim();

  return {
    isError: result.exitCode !== 0,
    content: [
      {
        type: "text" as const,
        text: text.length > 0 ? text : JSON.stringify({ exitCode: result.exitCode }),
      },
    ],
  };
}

function registerFormctlTools(server: McpServer): void {
  const [doctor, workflows, inspect, validate, submitDryRun] = createMcpToolDefinitions();

  server.registerTool(
    doctor.name,
    {
      title: "formctl doctor",
      description: doctor.description,
      inputSchema: {
        workspace: z.string().optional(),
      },
    },
    async (input: ToolInput) => toolResult(await runFormctl(
      buildFormctlArgsForTool(doctor.name, input),
      input.workspace,
    )),
  );

  server.registerTool(
    workflows.name,
    {
      title: "formctl workflows",
      description: workflows.description,
      inputSchema: {
        workspace: z.string().optional(),
      },
    },
    async (input: ToolInput) => toolResult(await runFormctl(
      buildFormctlArgsForTool(workflows.name, input),
      input.workspace,
    )),
  );

  server.registerTool(
    inspect.name,
    {
      title: "formctl inspect",
      description: inspect.description,
      inputSchema: {
        workflow: z.string().min(1),
        workspace: z.string().optional(),
      },
    },
    async (input: ToolInput & { workflow: string }) => toolResult(await runFormctl(
      buildFormctlArgsForTool(inspect.name, input),
      input.workspace,
    )),
  );

  server.registerTool(
    validate.name,
    {
      title: "formctl validate",
      description: validate.description,
      inputSchema: {
        workflow: z.string().min(1),
        workspace: z.string().optional(),
      },
    },
    async (input: ToolInput & { workflow: string }) => toolResult(await runFormctl(
      buildFormctlArgsForTool(validate.name, input),
      input.workspace,
    )),
  );

  server.registerTool(
    submitDryRun.name,
    {
      title: "formctl submit dry-run",
      description: submitDryRun.description,
      inputSchema: {
        workflow: z.string().min(1),
        fields: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
        headed: z.boolean().optional(),
        workspace: z.string().optional(),
      },
    },
    async (input: ToolInput & { workflow: string; fields?: Record<string, string | number | boolean>; headed?: boolean }) => {
      try {
        return toolResult(await runFormctl(
          buildFormctlArgsForTool(submitDryRun.name, input),
          input.workspace,
        ));
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: error instanceof Error ? error.message : "Unknown MCP wrapper error",
            },
          ],
        };
      }
    },
  );
}

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: "formctl",
    version: "0.1.0",
  });

  registerFormctlTools(server);
  await server.connect(new StdioServerTransport());
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  await startMcpServer();
}
