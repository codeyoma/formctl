import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { buildFormctlArgsForTool, createMcpToolDefinitions } from "../src/mcp-tools.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("formctl MCP wrapper", () => {
  test("package and docs expose a safe MCP server binary", () => {
    const packageJson = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));
    const readme = readFileSync(path.join(projectRoot, "README.md"), "utf8");
    const agents = readFileSync(path.join(projectRoot, "docs", "agents.md"), "utf8");

    expect(packageJson.bin).toMatchObject({
      formctl: "dist/cli.js",
      "formctl-mcp": "dist/mcp.js",
    });
    expect(packageJson.dependencies["@modelcontextprotocol/sdk"]).toBeDefined();
    expect(readme).toContain("## MCP Server");
    expect(readme).toContain("npx formctl-mcp");
    expect(readme).toContain("formctl_doctor");
    expect(readme).toContain("formctl_inspect");
    expect(readme).toContain("formctl_submit_dry_run");
    expect(readme).toContain("The MCP server does not expose approved submit.");
    expect(agents).toContain("MCP server");
    expect(agents).toContain("does not expose approved submit");
  });

  test("tool definitions expose only dry-run-safe operations", () => {
    const tools = createMcpToolDefinitions();

    expect(tools.map((tool) => tool.name)).toEqual([
      "formctl_doctor",
      "formctl_inspect",
      "formctl_submit_dry_run",
    ]);
    expect(JSON.stringify(tools)).toContain("dry-run");
    expect(JSON.stringify(tools)).not.toContain("approve");
  });

  test("submit dry-run tool always builds approval-safe CLI args", () => {
    expect(buildFormctlArgsForTool("formctl_doctor", {})).toEqual(["doctor", "--json"]);
    expect(buildFormctlArgsForTool("formctl_inspect", { workflow: "expense-report" })).toEqual([
      "inspect",
      "expense-report",
      "--json",
    ]);
    expect(buildFormctlArgsForTool("formctl_submit_dry_run", {
      workflow: "expense-report",
      fields: {
        amount: 120000,
        receipt: "demo/receipt.txt",
        reimburse: true,
      },
    })).toEqual([
      "submit",
      "expense-report",
      "--dry-run",
      "--json",
      "--headless",
      "--amount",
      "120000",
      "--receipt",
      "demo/receipt.txt",
      "--reimburse",
      "true",
    ]);
    expect(() => buildFormctlArgsForTool("formctl_submit_dry_run", {
      workflow: "expense-report",
      fields: { approve: true },
    })).toThrow("Reserved formctl flag is not allowed through MCP fields: approve");
  });
});
