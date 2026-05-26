# Agent Safety Guide

Use this guide when calling `formctl` from Codex, Claude Code, Cursor, Copilot CLI, or another coding agent.

## Default Flow

1. Run `formctl doctor --json` before browser-backed work.

2. Record or inspect the workflow before submitting:

```bash
formctl inspect expense-report --json
```

3. Always run `submit --dry-run --json` before any approved submit.

```bash
formctl submit expense-report --amount 120000 --receipt ./receipt.txt --dry-run --json --headless
```

4. Inspect `.formctl/runs/<run-id>/summary.json`, screenshots, and `audit.jsonl` before approval.

5. Never pass `--approve` unless the user or policy explicitly authorizes submission.

```bash
formctl submit expense-report --amount 120000 --receipt ./receipt.txt --approve --json --headless
```

## JSON Branching

Branch on JSON fields such as `status`, `exitCode`, `requiresApproval`, and `artifacts`.

- `exitCode: 0` means the dry-run or approved submit completed.
- `exitCode: 3` means selector mismatch. Stop and inspect artifacts.
- `exitCode: 5` means approval is required.

Treat exit code `5` as an approval gate, not a retryable failure.

## Doctor JSON

Use `doctor --json` to verify local prerequisites before starting a browser-backed workflow.

```json
{
  "status": "ok",
  "command": "doctor",
  "exitCode": 0,
  "checks": [
    { "name": "node", "status": "ok" },
    { "name": "workspace", "status": "ok" },
    {
      "name": "playwright-chromium",
      "status": "ok",
      "executablePath": "/path/to/chromium",
      "installCommand": "npx playwright install chromium"
    }
  ]
}
```

If the `playwright-chromium` check is not `ok`, stop and run the returned `installCommand` instead of attempting `record` or `submit`.

## MCP Server

Run `formctl-mcp` when an MCP client should discover the safe command surface directly:

```bash
npx formctl-mcp
```

The MCP server exposes `formctl_doctor`, `formctl_inspect`, and `formctl_submit_dry_run`. It does not expose approved submit; agents must switch back to the CLI and get explicit authorization before running `formctl submit ... --approve`.

MCP setup guide: docs/MCP.md

## Artifact Rules

- Dry-run artifacts include `summary.json`, `dry-run.png`, and `audit.jsonl`.
- Approved submit artifacts include `summary.json`, `post-submit.png`, and `audit.jsonl`.
- Selector mismatch failures are safe stops and include `failure.json`, `failure.png`, and `audit.jsonl`.
- Agents should report artifact paths instead of embedding screenshots or file contents in chat.

## Secret Handling

- Do not print secrets, file contents, cookies, or private page data.
- Do not paste `audit.jsonl` or screenshots into public issues without review.
- File inputs are reported as `[file]`; keep that redaction intact.
- Use local browser sessions or external secret managers; do not store credentials in workflow files.

## Approval Rules

- Dry-run first.
- Show artifact paths to the user.
- Ask for explicit approval before `--approve`.
- Never infer approval from a successful dry-run.
- Never retry a failed real submit without user review.
