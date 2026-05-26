# MCP Setup Guide

Use `formctl-mcp` when an MCP client should call the safe parts of `formctl` directly.

The server exposes:

- `formctl_doctor`
- `formctl_inspect`
- `formctl_validate`
- `formctl_submit_dry_run`

It does not expose approved submit; approval stays in the CLI with an explicit `formctl submit ... --approve` command.

## Run from a local checkout

Use this before npm publish, or when testing a branch:

```bash
npm install
npm run build
```

Then configure an MCP stdio client with the repository as the working directory:

```json
{
  "mcpServers": {
    "formctl": {
      "command": "node",
      "args": ["dist/mcp.js"],
      "cwd": "/absolute/path/to/formctl"
    }
  }
}
```

## Run after npm publish

Use this after the package is published and available through npm:

```json
{
  "mcpServers": {
    "formctl": {
      "command": "npx",
      "args": ["formctl-mcp"],
      "cwd": "/absolute/path/to/workspace"
    }
  }
}
```

Use the workspace that contains `.formctl/workflows/<name>.yml`.

## Safe tool flow

1. Call `formctl_doctor` to verify the workspace.
2. Call `formctl_validate` before `formctl_inspect` or `formctl_submit_dry_run` when using a checked-in workflow.
3. Call `formctl_inspect` with a workflow name.
4. Call `formctl_submit_dry_run` with the workflow and field values.
5. Inspect `.formctl/runs/<run-id>/summary.json`, screenshots, and `audit.jsonl`.
6. Ask for explicit approval before running `formctl submit ... --approve` outside MCP.

## MCP SDK smoke test

From a local checkout after `npm run build`:

```bash
node --input-type=module <<'NODE'
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/mcp.js"],
  cwd: process.cwd(),
  stderr: "pipe"
});
const client = new Client({ name: "formctl-smoke", version: "0.0.0" });
await client.connect(transport);
console.log((await client.listTools()).tools.map((tool) => tool.name));
console.log(await client.callTool({ name: "formctl_doctor", arguments: { workspace: process.cwd() } }));
await client.close();
NODE
```

Expected tools:

```text
formctl_doctor
formctl_inspect
formctl_validate
formctl_submit_dry_run
```
