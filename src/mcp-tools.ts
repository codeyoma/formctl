export type McpToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export function createMcpToolDefinitions(): McpToolDefinition[] {
  return [
    {
      name: "formctl_doctor",
      description: "Run formctl doctor with JSON output.",
      inputSchema: {
        type: "object",
        properties: {
          workspace: { type: "string" },
        },
        additionalProperties: false,
      },
    },
    {
      name: "formctl_inspect",
      description: "Inspect a recorded formctl workflow with JSON output.",
      inputSchema: {
        type: "object",
        required: ["workflow"],
        properties: {
          workflow: { type: "string" },
          workspace: { type: "string" },
        },
        additionalProperties: false,
      },
    },
    {
      name: "formctl_validate",
      description: "Validate a recorded formctl workflow file with JSON output before trusting it.",
      inputSchema: {
        type: "object",
        required: ["workflow"],
        properties: {
          workflow: { type: "string" },
          workspace: { type: "string" },
        },
        additionalProperties: false,
      },
    },
    {
      name: "formctl_submit_dry_run",
      description: "Preview a recorded form workflow as a dry-run with screenshots, JSON artifacts, and no final submit click.",
      inputSchema: {
        type: "object",
        required: ["workflow"],
        properties: {
          workflow: { type: "string" },
          fields: {
            type: "object",
            additionalProperties: {
              anyOf: [
                { type: "string" },
                { type: "number" },
                { type: "boolean" },
              ],
            },
          },
          headed: { type: "boolean" },
          workspace: { type: "string" },
        },
        additionalProperties: false,
      },
    },
  ];
}

type ToolInput = {
  workflow?: unknown;
  fields?: unknown;
  headed?: unknown;
};

const RESERVED_FIELD_NAMES = new Set([
  "approve",
  "dry-run",
  "headless",
  "headed",
  "help",
  "json",
]);

function asRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {};
  }

  return input as Record<string, unknown>;
}

function readWorkflowName(input: ToolInput): string {
  if (typeof input.workflow !== "string" || input.workflow.length === 0) {
    throw new Error("MCP tool input requires a workflow name.");
  }

  return input.workflow;
}

function assertSafeFieldName(fieldName: string): void {
  if (RESERVED_FIELD_NAMES.has(fieldName)) {
    throw new Error(`Reserved formctl flag is not allowed through MCP fields: ${fieldName}`);
  }

  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(fieldName)) {
    throw new Error(`Unsafe form field name is not allowed through MCP fields: ${fieldName}`);
  }
}

export function buildFormctlArgsForTool(toolName: string, input: unknown): string[] {
  const parsedInput = asRecord(input) as ToolInput;

  if (toolName === "formctl_doctor") {
    return ["doctor", "--json"];
  }

  if (toolName === "formctl_inspect") {
    return ["inspect", readWorkflowName(parsedInput), "--json"];
  }

  if (toolName === "formctl_validate") {
    return ["validate", readWorkflowName(parsedInput), "--json"];
  }

  if (toolName === "formctl_submit_dry_run") {
    const args = [
      "submit",
      readWorkflowName(parsedInput),
      "--dry-run",
      "--json",
      parsedInput.headed === true ? "--headed" : "--headless",
    ];
    const fields = asRecord(parsedInput.fields);

    for (const [fieldName, value] of Object.entries(fields)) {
      assertSafeFieldName(fieldName);
      if (!["string", "number", "boolean"].includes(typeof value)) {
        throw new Error(`Unsupported form field value for MCP field: ${fieldName}`);
      }

      args.push(`--${fieldName}`, String(value));
    }

    return args;
  }

  throw new Error(`Unknown MCP tool: ${toolName}`);
}
