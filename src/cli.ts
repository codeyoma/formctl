#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { parse, stringify } from "yaml";
import { resolveBrowserHeadless } from "./browser-mode.js";

const PACKAGE_VERSION = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
}).version;

const DEFAULT_WORKFLOW_SAFETY = {
  dryRunFirst: true,
  approvalRequired: true,
  selectorDrift: "fail",
  fileInputs: "redacted",
} as const;
const WORKFLOW_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const INVALID_WORKFLOW_NAME_MESSAGE = "Invalid workflow name: use letters, numbers, dots, underscores, or dashes only.";
const WORKFLOW_FIELD_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;
const SUPPORTED_FIELD_TYPE_LIST = [
  "text",
  "email",
  "number",
  "date",
  "file",
  "select",
  "checkbox",
  "textarea",
  "url",
  "tel",
  "password",
  "search",
] as const;
const SUPPORTED_FIELD_TYPES = new Set<string>(SUPPORTED_FIELD_TYPE_LIST);
const SUBMIT_CONTROL_OPTIONS = new Set([
  "approve",
  "dry-run",
  "headed",
  "headless",
  "help",
  "json",
  "resume-after-interaction",
  "storage-state",
  "values",
]);

const HELP_TEXT = `formctl runs recorded browser forms as safe CLI commands

Usage:
  formctl submit <workflow-name> --dry-run [flags]
  formctl submit <workflow-name> --approve [flags]
  formctl inspect <workflow-name>
  formctl workflows [--json]
  formctl validate <workflow-name> [--json]
  formctl record <workflow-name> <url>
  formctl doctor

Start:
  Start with an existing .formctl/workflows/<name>.yml file.
  Run submit --dry-run to preview.
  Run submit --approve only after review.
  Interactive submit shows a dry-run screenshot path before asking for approval.
  Use record only when you need to create a new workflow.

Flags:
  --help        Show this help message
  --version     Show the installed formctl version
  --headed      Run with a visible browser
  --headless    Run without a visible browser
  --storage-state PATH
                Use a local Playwright storageState JSON file for record or submit
  --resume-after-interaction
                For submit: pause after login, MFA, or CAPTCHA detection, then recheck
  --values PATH Load submit field values from a JSON object file
  --manual      For record: wait for Enter after you complete the form in the browser
`;

type WorkflowField = {
  name: string;
  selector: string;
  type: string;
  label?: string;
  description?: string;
};

type WorkflowRecordingEvent = {
  event: "input" | "change";
  field: string;
  selector: string;
  value: "[redacted]" | "[file]";
};

type Workflow = {
  name: string;
  url: string;
  screenshots?: {
    baseline: string;
  };
  recording?: {
    mode: "manual";
    events: WorkflowRecordingEvent[];
  };
  safety?: typeof DEFAULT_WORKFLOW_SAFETY;
  fields: WorkflowField[];
  submit: {
    selector: string;
  };
};

type WorkflowListItem = {
  name: string;
  path: string;
  url: string;
  fieldCount: number;
  screenshots?: Workflow["screenshots"];
  recording?: {
    mode: "manual";
    eventCount: number;
  };
} | {
  name: string;
  path: string;
  status: "error";
  error: {
    code: "workflow_unreadable";
    message: string;
    fix: string;
  };
} | {
  name: string;
  path: string;
  status: "error";
  error: {
    code: "workflow_invalid";
    message: string;
    fix: string;
  };
  checks: ValidationCheck[];
};

type AuditEvent = Record<string, unknown>;

type ApprovalInput = NodeJS.ReadableStream & {
  isTTY?: boolean;
  setEncoding?: (encoding: BufferEncoding) => unknown;
};

type FailureArtifacts = {
  screenshot: string;
  failure: string;
  audit: string;
};

type FieldDiff = {
  status: "field-diff";
  workflow: string;
  submitted: boolean;
  fields: Array<{
    name: string;
    selector: string;
    type: string;
    action: "set";
    value: string;
  }>;
};

type SelectorFailurePayload = {
  status: "error";
  workflow: string;
  exitCode: 3;
  submitted: false;
  requiresApproval: false;
  error: {
    code: "selector_mismatch";
    selector: string;
    message: string;
  } & (
    | { expectedMatches: 1; actualMatches: number }
    | { expectedType: string; actualType: string }
    | { expectedLabel: string; actualLabel: string }
    | { expectedDescription: string; actualDescription: string }
  );
};

type InteractionRequiredCode = "interaction_required" | "captcha_required" | "mfa_required";

type InteractionRequiredDetection = {
  code: InteractionRequiredCode;
  detected: string;
  message: string;
  fix: string;
};

type InteractionRequiredPayload = {
  status: "error";
  workflow: string;
  exitCode: 6;
  submitted: false;
  requiresApproval: false;
  error: {
    code: InteractionRequiredCode;
    detected: string;
    message: string;
    fix: string;
  };
};

type BrowserFailurePayload = SelectorFailurePayload | InteractionRequiredPayload;

type DoctorCheck = {
  name: string;
  status: "ok" | "error";
  executablePath?: string;
  installCommand?: string;
  message?: string;
};

type ValidationCheck = {
  name: string;
  status: "ok" | "error";
  message?: string;
  fix?: string;
};

function buildDoctorChecks(): DoctorCheck[] {
  const chromiumExecutablePath = chromium.executablePath();
  const chromiumInstalled = existsSync(chromiumExecutablePath);

  return [
    { name: "node", status: "ok" },
    { name: "workspace", status: "ok" },
    {
      name: "playwright-chromium",
      status: chromiumInstalled ? "ok" : "error",
      executablePath: chromiumExecutablePath,
      installCommand: "npx playwright install chromium",
      ...(chromiumInstalled ? {} : { message: "Playwright Chromium is not installed." }),
    },
  ];
}

function buildValidationCheck(name: string, valid: boolean, message: string, fix: string): ValidationCheck {
  return valid ? { name, status: "ok" } : { name, status: "error", message, fix };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected runtime error.";
}

function isValidWorkflowUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidWorkflowName(value: string): boolean {
  return WORKFLOW_NAME_PATTERN.test(value);
}

function writeInvalidWorkflowNameError(
  command: string,
  wantsJson: boolean,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
): number {
  if (wantsJson) {
    stdout.write(`${JSON.stringify({
      status: "error",
      command,
      exitCode: 1,
      error: {
        code: "invalid_workflow_name",
        message: INVALID_WORKFLOW_NAME_MESSAGE,
      },
    })}\n`);
    return 1;
  }

  stderr.write(`${INVALID_WORKFLOW_NAME_MESSAGE}\n`);
  return 1;
}

function writeWorkflowNotFoundError(
  command: string,
  workflowName: string,
  wantsJson: boolean,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
): number {
  const expectedPath = `.formctl/workflows/${workflowName}.yml`;
  if (wantsJson) {
    stdout.write(`${JSON.stringify({
      status: "error",
      command,
      workflow: workflowName,
      exitCode: 2,
      ...(command === "submit" ? { submitted: false, requiresApproval: false } : {}),
      error: {
        code: "workflow_not_found",
        message: `Workflow not found: ${workflowName}`,
        expectedPath,
      },
    })}\n`);
    return 2;
  }

  stderr.write(`Workflow not found: ${workflowName}\nExpected: ${expectedPath}\n`);
  return 2;
}

function writeWorkflowUnreadableError(
  command: string,
  workflowName: string,
  message: string,
  wantsJson: boolean,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
): number {
  const expectedPath = `.formctl/workflows/${workflowName}.yml`;
  const fix = `Repair ${expectedPath} so it is valid YAML before retrying ${command}.`;
  if (wantsJson) {
    stdout.write(`${JSON.stringify({
      status: "error",
      command,
      workflow: workflowName,
      exitCode: 1,
      ...(command === "submit" ? { submitted: false, requiresApproval: false } : {}),
      error: {
        code: "workflow_unreadable",
        message,
        path: expectedPath,
        fix,
      },
    })}\n`);
    return 1;
  }

  stderr.write(`Workflow could not be read: ${workflowName}\nPath: ${expectedPath}\nmessage: ${message}\nfix: ${fix}\n`);
  return 1;
}

function writeWorkflowInvalidError(
  command: string,
  workflowName: string,
  checks: ValidationCheck[],
  wantsJson: boolean,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
): number {
  const expectedPath = `.formctl/workflows/${workflowName}.yml`;
  const failedChecks = checks.filter((check) => check.status === "error");
  const message = `Workflow validation failed: ${failedChecks.map((check) => check.name).join(", ")}`;
  const fix = `Run formctl validate ${workflowName} --json for detailed repair guidance.`;
  if (wantsJson) {
    stdout.write(`${JSON.stringify({
      status: "error",
      command,
      workflow: workflowName,
      path: expectedPath,
      exitCode: 1,
      ...(command === "submit" ? { submitted: false, requiresApproval: false } : {}),
      error: {
        code: "workflow_invalid",
        message,
        fix,
      },
      checks: failedChecks,
    })}\n`);
    return 1;
  }

  stderr.write(`${message}\nPath: ${expectedPath}\nfix: ${fix}\n`);
  for (const check of failedChecks) {
    stderr.write(`- ${check.name}: ${check.message ?? "invalid"}\n`);
    if (check.fix !== undefined) {
      stderr.write(`  fix: ${check.fix}\n`);
    }
  }
  return 1;
}

function hasCurrentSafetyMetadata(value: unknown): boolean {
  if (!isObject(value)) {
    return false;
  }

  return value.dryRunFirst === DEFAULT_WORKFLOW_SAFETY.dryRunFirst
    && value.approvalRequired === DEFAULT_WORKFLOW_SAFETY.approvalRequired
    && value.selectorDrift === DEFAULT_WORKFLOW_SAFETY.selectorDrift
    && value.fileInputs === DEFAULT_WORKFLOW_SAFETY.fileInputs;
}

function hasValidRecordingMetadata(value: unknown): boolean {
  if (!isObject(value) || value.mode !== "manual" || !Array.isArray(value.events)) {
    return false;
  }

  return value.events.every((event) => isObject(event)
    && (event.event === "input" || event.event === "change")
    && isNonEmptyString(event.field)
    && isNonEmptyString(event.selector)
    && (event.value === "[redacted]" || event.value === "[file]"));
}

function validateWorkflow(workflowName: string, workflow: unknown): ValidationCheck[] {
  const workflowObject = isObject(workflow) ? workflow : {};
  const fields = workflowObject.fields;
  const submit = workflowObject.submit;
  const fieldListValid = Array.isArray(fields)
    && fields.length > 0
    && fields.every((field) => isObject(field)
      && isNonEmptyString(field.name)
      && isNonEmptyString(field.selector)
      && isNonEmptyString(field.type));
  const duplicateFieldNames = Array.isArray(fields)
    ? fields.reduce<string[]>((duplicates, field, index, fieldList) => {
      if (!isObject(field) || !isNonEmptyString(field.name)) {
        return duplicates;
      }

      const firstIndex = fieldList.findIndex((candidate) => isObject(candidate) && candidate.name === field.name);
      if (firstIndex !== index && !duplicates.includes(field.name)) {
        duplicates.push(field.name);
      }

      return duplicates;
    }, [])
    : [];
  const unsafeFieldNames = Array.isArray(fields)
    ? fields.flatMap((field) => {
      if (!isObject(field) || !isNonEmptyString(field.name)) {
        return [];
      }

      if (WORKFLOW_FIELD_NAME_PATTERN.test(field.name) && !SUBMIT_CONTROL_OPTIONS.has(field.name)) {
        return [];
      }

      return [field.name];
    })
    : [];
  const unsupportedFieldTypes = Array.isArray(fields)
    ? fields.flatMap((field) => {
      if (!isObject(field) || !isNonEmptyString(field.type)) {
        return [];
      }

      if (SUPPORTED_FIELD_TYPES.has(field.type.toLowerCase())) {
        return [];
      }

      const fieldName = isNonEmptyString(field.name) ? field.name : "<unnamed>";
      return [`${fieldName}: ${field.type}`];
    })
    : [];

  return [
    buildValidationCheck(
      "workflow-name",
      workflowObject.name === workflowName,
      `Workflow name must match ${workflowName}.`,
      `Set name: ${workflowName}.`,
    ),
    buildValidationCheck(
      "target-url",
      isValidWorkflowUrl(workflowObject.url),
      "Workflow target URL must be an absolute http or https URL.",
      "Set url to an absolute http:// or https:// URL for the form page.",
    ),
    buildValidationCheck(
      "fields",
      fieldListValid,
      "Workflow must include at least one field with name, selector, and type.",
      "Add fields entries with name, selector, and type for every required form field.",
    ),
    ...(Array.isArray(fields) && fields.length > 0 ? [
      buildValidationCheck(
        "field-names",
        duplicateFieldNames.length === 0,
        `Workflow field names must be unique. Duplicate field name(s): ${duplicateFieldNames.join(", ")}.`,
        "Use unique field names so CLI flags and values files map to exactly one form field.",
      ),
    ] : []),
    ...(Array.isArray(fields) && fields.length > 0 ? [
      buildValidationCheck(
        "field-name-safety",
        unsafeFieldNames.length === 0,
        `Workflow field names must be safe CLI flags. Unsafe or reserved field name(s): ${unsafeFieldNames.join(", ")}.`,
        "Use names that start with a letter and contain only letters, numbers, underscores, or dashes, excluding formctl control flags.",
      ),
    ] : []),
    ...(Array.isArray(fields) && fields.length > 0 ? [
      buildValidationCheck(
        "field-types",
        unsupportedFieldTypes.length === 0,
        `Unsupported workflow field type(s): ${unsupportedFieldTypes.join(", ")}.`,
        `Use one of: ${SUPPORTED_FIELD_TYPE_LIST.join(", ")}.`,
      ),
    ] : []),
    buildValidationCheck(
      "submit-selector",
      isObject(submit) && isNonEmptyString(submit.selector),
      "Workflow must include submit.selector.",
      "Add submit.selector with the recorded submit button selector.",
    ),
    buildValidationCheck(
      "safety-metadata",
      hasCurrentSafetyMetadata(workflowObject.safety),
      "Workflow safety metadata must match the enforced dry-run, approval, selector drift, and file redaction contract.",
      "Add safety.dryRunFirst: true, safety.approvalRequired: true, safety.selectorDrift: fail, and safety.fileInputs: redacted.",
    ),
    ...(workflowObject.recording === undefined ? [] : [
      buildValidationCheck(
        "recording-metadata",
        hasValidRecordingMetadata(workflowObject.recording),
        "Recording metadata must use manual mode and redacted input/change events.",
        "Use recording.mode: manual and events with event input/change, field, selector, and value [redacted] or [file].",
      ),
    ]),
  ];
}

function readWorkflow(
  workflowName: string,
): {
  workflow?: Workflow;
  error?: string;
  errorKind?: "invalid_workflow_name" | "workflow_not_found" | "workflow_unreadable" | "workflow_invalid";
  path: string;
  checks?: ValidationCheck[];
} {
  if (!isValidWorkflowName(workflowName)) {
    return {
      path: path.join(process.cwd(), ".formctl", "workflows"),
      errorKind: "invalid_workflow_name",
      error: `${INVALID_WORKFLOW_NAME_MESSAGE}\n`,
    };
  }

  const workflowPath = path.join(process.cwd(), ".formctl", "workflows", `${workflowName}.yml`);
  if (!existsSync(workflowPath)) {
    return {
      path: workflowPath,
      errorKind: "workflow_not_found",
      error: `Workflow not found: ${workflowName}\nExpected: .formctl/workflows/${workflowName}.yml\n`,
    };
  }

  try {
    const workflow = parse(readFileSync(workflowPath, "utf8"));
    const failedChecks = validateWorkflow(workflowName, workflow).filter((check) => check.status === "error");
    if (failedChecks.length > 0) {
      return {
        path: workflowPath,
        errorKind: "workflow_invalid",
        error: `Workflow validation failed: ${failedChecks.map((check) => check.name).join(", ")}`,
        checks: failedChecks,
      };
    }

    return {
      path: workflowPath,
      workflow: workflow as Workflow,
    };
  } catch (error) {
    return {
      path: workflowPath,
      errorKind: "workflow_unreadable",
      error: error instanceof Error ? error.message : "Workflow YAML could not be parsed.",
    };
  }
}

function listWorkflowFiles(): WorkflowListItem[] {
  const workflowDirectory = path.join(process.cwd(), ".formctl", "workflows");
  if (!existsSync(workflowDirectory)) {
    return [];
  }

  return readdirSync(workflowDirectory)
    .filter((entry) => entry.endsWith(".yml") || entry.endsWith(".yaml"))
    .sort()
    .map((entry) => {
      const displayPath = `.formctl/workflows/${entry}`;
      let workflow: unknown;
      try {
        workflow = parse(readFileSync(path.join(workflowDirectory, entry), "utf8"));
      } catch (error) {
        return {
          name: entry.replace(/\.ya?ml$/, ""),
          path: displayPath,
          status: "error",
          error: {
            code: "workflow_unreadable",
            message: error instanceof Error ? error.message : "Workflow YAML could not be parsed.",
            fix: `Repair ${displayPath} so it is valid YAML before retrying workflows.`,
          },
        };
      }

      const workflowName = isObject(workflow) && isNonEmptyString(workflow.name)
        ? workflow.name
        : entry.replace(/\.ya?ml$/, "");
      const failedChecks = validateWorkflow(workflowName, workflow).filter((check) => check.status === "error");
      if (failedChecks.length > 0) {
        return {
          name: workflowName,
          path: displayPath,
          status: "error",
          error: {
            code: "workflow_invalid",
            message: `Workflow validation failed: ${failedChecks.map((check) => check.name).join(", ")}`,
            fix: `Run formctl validate ${workflowName} --json for detailed repair guidance.`,
          },
          checks: failedChecks,
        };
      }

      const workflowItem = workflow as Workflow;
      return {
        name: workflowItem.name,
        path: displayPath,
        url: workflowItem.url,
        fieldCount: workflowItem.fields.length,
        ...(workflowItem.screenshots === undefined ? {} : { screenshots: workflowItem.screenshots }),
        ...(workflowItem.recording === undefined ? {} : {
          recording: {
            mode: workflowItem.recording.mode,
            eventCount: workflowItem.recording.events.length,
          },
        }),
      };
    });
}

function parseOptions(args: string[]): Map<string, string | true> {
  const options = new Map<string, string | true>();

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const name = token.slice(2);
    const next = args[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      options.set(name, next);
      index += 1;
      continue;
    }

    options.set(name, true);
  }

  return options;
}

function readSubmitFieldValues(
  options: Map<string, string | true>,
  fields: WorkflowField[],
): { values: Map<string, string> } | { error: { message: string; unknownFields?: string[] } } {
  const values = new Map<string, string>();
  const valuesFile = options.get("values");
  const workflowFieldNames = new Set(fields.map((field) => field.name));
  const unknownFieldFlags = Array.from(options.keys())
    .filter((optionName) => !SUBMIT_CONTROL_OPTIONS.has(optionName) && !workflowFieldNames.has(optionName));

  if (unknownFieldFlags.length > 0) {
    const plural = unknownFieldFlags.length === 1 ? "flag" : "flags";
    return {
      error: {
        message: `Unknown submit field ${plural}: ${unknownFieldFlags.join(", ")}`,
        unknownFields: unknownFieldFlags,
      },
    };
  }

  if (valuesFile !== undefined) {
    if (typeof valuesFile !== "string") {
      return { error: { message: "--values requires a JSON file path." } };
    }

    let parsedValues: unknown;
    try {
      const valuesPath = path.isAbsolute(valuesFile) ? valuesFile : path.join(process.cwd(), valuesFile);
      parsedValues = JSON.parse(readFileSync(valuesPath, "utf8"));
    } catch (error) {
      return { error: { message: error instanceof Error ? error.message : "Could not read --values JSON file." } };
    }

    if (!isObject(parsedValues) || Array.isArray(parsedValues)) {
      return { error: { message: "--values JSON must be an object." } };
    }

    const unknownFields = Object.keys(parsedValues).filter((fieldName) => !workflowFieldNames.has(fieldName));
    if (unknownFields.length > 0) {
      const plural = unknownFields.length === 1 ? "field" : "fields";
      return {
        error: {
          message: `Unknown --values ${plural}: ${unknownFields.join(", ")}`,
          unknownFields,
        },
      };
    }

    for (const [fieldName, value] of Object.entries(parsedValues)) {
      if (!["string", "number", "boolean"].includes(typeof value)) {
        return { error: { message: `--values field ${fieldName} must be a string, number, or boolean.` } };
      }

      values.set(fieldName, String(value));
    }
  }

  for (const field of fields) {
    const value = options.get(field.name);
    if (typeof value === "string") {
      values.set(field.name, value);
    }
  }

  return { values };
}

function readStorageStateOption(
  options: Map<string, string | true>,
): { storageStatePath?: string } | { error: { message: string } } {
  const storageState = options.get("storage-state");
  if (storageState === undefined) {
    return {};
  }
  if (typeof storageState !== "string") {
    return { error: { message: "--storage-state requires a Playwright storageState JSON file path." } };
  }

  const storageStatePath = path.isAbsolute(storageState) ? storageState : path.join(process.cwd(), storageState);
  if (!existsSync(storageStatePath)) {
    return { error: { message: `--storage-state file not found: ${storageState}` } };
  }

  return { storageStatePath };
}

function buildSelectorMismatchPayload(
  workflowName: string,
  selector: string,
  actualMatches: number,
): SelectorFailurePayload {
  const message = `Selector mismatch: ${selector} expected exactly 1 match, found ${actualMatches}`;

  return {
    status: "error",
    workflow: workflowName,
    exitCode: 3,
    submitted: false,
    requiresApproval: false,
    error: {
      code: "selector_mismatch",
      selector,
      expectedMatches: 1,
      actualMatches,
      message,
    },
  };
}

function buildFieldTypeMismatchPayload(
  workflowName: string,
  selector: string,
  expectedType: string,
  actualType: string,
): SelectorFailurePayload {
  const message = `Selector mismatch: ${selector} expected type ${expectedType}, found ${actualType}`;

  return {
    status: "error",
    workflow: workflowName,
    exitCode: 3,
    submitted: false,
    requiresApproval: false,
    error: {
      code: "selector_mismatch",
      selector,
      expectedType,
      actualType,
      message,
    },
  };
}

function buildFieldLabelMismatchPayload(
  workflowName: string,
  selector: string,
  expectedLabel: string,
  actualLabel: string,
): SelectorFailurePayload {
  const message = `Selector mismatch: ${selector} expected label ${expectedLabel}, found ${actualLabel}`;

  return {
    status: "error",
    workflow: workflowName,
    exitCode: 3,
    submitted: false,
    requiresApproval: false,
    error: {
      code: "selector_mismatch",
      selector,
      expectedLabel,
      actualLabel,
      message,
    },
  };
}

function buildFieldDescriptionMismatchPayload(
  workflowName: string,
  selector: string,
  expectedDescription: string,
  actualDescription: string,
): SelectorFailurePayload {
  const message = `Selector mismatch: ${selector} expected description ${expectedDescription}, found ${actualDescription}`;

  return {
    status: "error",
    workflow: workflowName,
    exitCode: 3,
    submitted: false,
    requiresApproval: false,
    error: {
      code: "selector_mismatch",
      selector,
      expectedDescription,
      actualDescription,
      message,
    },
  };
}

function buildInteractionRequiredPayload(
  workflowName: string,
  detection: InteractionRequiredDetection,
): InteractionRequiredPayload {
  return {
    status: "error",
    workflow: workflowName,
    exitCode: 6,
    submitted: false,
    requiresApproval: false,
    error: detection,
  };
}

function writeSelectorFailure(
  output: NodeJS.WritableStream,
  failurePayload: BrowserFailurePayload,
  wantsJson: boolean,
  runId?: string,
  artifacts?: FailureArtifacts,
): void {
  const payload = {
    ...failurePayload,
    ...(runId === undefined ? {} : { runId }),
    ...(artifacts === undefined ? {} : { artifacts }),
  };

  if (wantsJson) {
    output.write(`${JSON.stringify(payload)}\n`);
    return;
  }

  output.write(`${payload.error.message}\n`);
  if (runId !== undefined) {
    output.write(`Run: .formctl/runs/${runId}\n`);
  }
}

function appendAuditEvent(auditPath: string, event: AuditEvent): void {
  appendFileSync(auditPath, `${JSON.stringify(event)}\n`);
}

function buildFieldDiff(workflow: Workflow, filledFields: Record<string, string>, submitted: boolean): FieldDiff {
  return {
    status: "field-diff",
    workflow: workflow.name,
    submitted,
    fields: workflow.fields.flatMap((field) => {
      const value = filledFields[field.name];
      if (value === undefined) {
        return [];
      }

      return [{
        name: field.name,
        selector: field.selector,
        type: field.type,
        action: "set" as const,
        value,
      }];
    }),
  };
}

function orderFieldsForReplay(workflow: Workflow): WorkflowField[] {
  if (workflow.recording === undefined) {
    return workflow.fields;
  }

  const fieldsByName = new Map(workflow.fields.map((field) => [field.name, field]));
  const orderedFields: WorkflowField[] = [];
  const seenFields = new Set<string>();
  for (const event of workflow.recording.events) {
    const field = fieldsByName.get(event.field);
    if (field === undefined || seenFields.has(field.name)) {
      continue;
    }

    orderedFields.push(field);
    seenFields.add(field.name);
  }

  for (const field of workflow.fields) {
    if (!seenFields.has(field.name)) {
      orderedFields.push(field);
    }
  }

  return orderedFields;
}

async function readApprovalLine(stdin: ApprovalInput): Promise<string | undefined> {
  stdin.setEncoding?.("utf8");

  return new Promise((resolve) => {
    let input = "";
    let settled = false;
    const finish = (value: string | undefined) => {
      if (settled) {
        return;
      }

      settled = true;
      stdin.removeListener("data", onData);
      stdin.removeListener("end", onEnd);
      stdin.removeListener("error", onError);
      resolve(value);
    };
    const onData = (chunk: string | Buffer) => {
      input += chunk.toString();
      if (input.includes("\n")) {
        finish(input.split(/\r?\n/, 1)[0]?.trim() ?? "");
      }
    };
    const onEnd = () => {
      finish(undefined);
    };
    const onError = () => {
      finish(undefined);
    };

    stdin.on("data", onData);
    stdin.on("end", onEnd);
    stdin.on("error", onError);
  });
}

function parseCheckboxValue(value: string): boolean {
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function normalizeFieldType(type: string): string {
  return type.toLowerCase();
}

function normalizeLabel(label: string): string {
  return label.replace(/\s+/g, " ").trim();
}

function normalizeDescription(description: string): string {
  return description.replace(/\s+/g, " ").trim();
}

async function readElementType(page: Page, selector: string): Promise<string> {
  return page.locator(selector).evaluate((element) => {
    const tagName = element.tagName.toLowerCase();
    if (tagName === "input") {
      return (element.getAttribute("type") ?? "text").toLowerCase();
    }

    return tagName;
  });
}

async function readElementLabel(page: Page, selector: string): Promise<string> {
  return page.locator(selector).evaluate((element) => {
    const labelableElement = element as Element & { labels?: NodeListOf<HTMLLabelElement> | null };
    const labels = Array.from(labelableElement.labels ?? []);
    const label = labels
      .map((labelElement) => labelElement.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .find((labelText) => labelText.length > 0)
      ?? element.getAttribute("aria-label")
      ?? "";

    return label.replace(/\s+/g, " ").trim();
  });
}

async function readElementDescription(page: Page, selector: string): Promise<string> {
  return page.locator(selector).evaluate((element) => {
    const describedBy = element.getAttribute("aria-describedby") ?? "";
    const description = describedBy
      .split(/\s+/)
      .filter((id) => id.length > 0)
      .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "")
      .join(" ");

    return description.replace(/\s+/g, " ").trim();
  });
}

async function detectInteractionRequired(page: Page): Promise<InteractionRequiredDetection | undefined> {
  return page.evaluate<InteractionRequiredDetection | undefined>(`(() => {
    const normalize = (value) => (value ?? "").toLowerCase();
    const inputElements = Array.from(document.querySelectorAll("input"));
    const visibleText = normalize(document.body?.innerText);
    const hasPasswordInput = inputElements.some((input) => input.type === "password"
      || normalize(input.autocomplete) === "current-password");
    const hasMfaInput = inputElements.some((input) => normalize(input.autocomplete) === "one-time-code"
      || normalize(input.name).includes("otp")
      || normalize(input.id).includes("otp")
      || normalize(input.name).includes("mfa")
      || normalize(input.id).includes("mfa"));
    const hasMfaText = visibleText.includes("multi-factor")
      || visibleText.includes("two-factor")
      || visibleText.includes("one-time code")
      || visibleText.includes("verification code")
      || visibleText.includes("security code")
      || visibleText.includes("authentication code")
      || visibleText.includes("authenticator code")
      || visibleText.includes("2fa code");
    const hasHumanVerificationText = visibleText.includes("verify you are human")
      || visibleText.includes("are you human")
      || visibleText.includes("human verification");
    const hasCaptcha = Array.from(document.querySelectorAll("iframe, input, div, section")).some((element) => {
      const signature = [
        element.getAttribute("id"),
        element.getAttribute("class"),
        element.getAttribute("name"),
        element.getAttribute("title"),
        element.getAttribute("src"),
        element.getAttribute("data-testid"),
        element.textContent,
      ].map(normalize).join(" ");

      return signature.includes("captcha")
        || signature.includes("recaptcha")
        || signature.includes("hcaptcha")
        || signature.includes("turnstile");
    });

    if (hasCaptcha || hasHumanVerificationText) {
      return {
        code: "captcha_required",
        detected: "captcha_challenge",
        message: "Manual interaction required: page appears to require CAPTCHA before form replay.",
        fix: "Complete the challenge in a headed browser, then retry submit.",
      };
    }

    if (hasMfaInput || hasMfaText) {
      return {
        code: "mfa_required",
        detected: "mfa_prompt",
        message: "Manual interaction required: page appears to require MFA before form replay.",
        fix: "Complete MFA in a headed browser or provide a valid local session, then retry submit.",
      };
    }

    if (hasPasswordInput) {
      return {
        code: "interaction_required",
        detected: "password_input",
        message: "Manual interaction required: page appears to require login before form replay.",
        fix: "Log in with a headed browser or record after authentication, then retry submit.",
      };
    }

    return undefined;
  })()`);
}

async function writeSelectorMismatchFailureArtifacts(
  page: Page,
  workingDirectory: string,
  failurePayload: BrowserFailurePayload,
  auditEvents: AuditEvent[],
): Promise<{ runId: string; artifacts: FailureArtifacts }> {
  const runId = `${Date.now()}-failed`;
  const runDirectory = path.join(workingDirectory, ".formctl", "runs", runId);
  const relativeRunDirectory = `.formctl/runs/${runId}`;
  const artifacts = {
    screenshot: `${relativeRunDirectory}/failure.png`,
    failure: `${relativeRunDirectory}/failure.json`,
    audit: `${relativeRunDirectory}/audit.jsonl`,
  };
  const screenshotPath = path.join(runDirectory, "failure.png");
  const failurePath = path.join(runDirectory, "failure.json");
  const auditPath = path.join(runDirectory, "audit.jsonl");
  const failure = {
    ...failurePayload,
    runId,
    artifacts,
  };

  mkdirSync(runDirectory, { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true });
  writeFileSync(failurePath, `${JSON.stringify(failure, null, 2)}\n`);
  auditEvents.push(
    {
      event: "screenshot_saved",
      path: artifacts.screenshot,
    },
    {
      event: "run_finished",
      status: "error",
      submitted: false,
      artifacts,
    },
  );
  for (const event of auditEvents) {
    appendAuditEvent(auditPath, event);
  }

  return { runId, artifacts };
}

export async function run(
  args: string[],
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
  stdin: ApprovalInput = process.stdin,
): Promise<number> {
  const command = args[2];
  const flags = new Set(args.slice(3));

  if (command === undefined || command === "--help" || command === "-h") {
    stdout.write(HELP_TEXT);
    return 0;
  }

  if (command === "--version") {
    stdout.write(`formctl ${PACKAGE_VERSION}\n`);
    return 0;
  }

  if (command === "doctor") {
    const checks = buildDoctorChecks();
    const status = checks.every((check) => check.status === "ok") ? "ok" : "error";
    const exitCode = status === "ok" ? 0 : 1;

    if (flags.has("--json")) {
      stdout.write(`${JSON.stringify({
        status,
        command: "doctor",
        exitCode,
        checks,
      })}\n`);
      return exitCode;
    }

    stdout.write(`formctl doctor: ${status}\n`);
    for (const check of checks) {
      stdout.write(`- ${check.name}: ${check.status}\n`);
      if (check.executablePath !== undefined) {
        stdout.write(`  executable: ${check.executablePath}\n`);
      }
      if (check.message !== undefined) {
        stdout.write(`  message: ${check.message}\n`);
      }
      if (check.status === "error" && check.installCommand !== undefined) {
        stdout.write(`  install: ${check.installCommand}\n`);
      }
    }
    return exitCode;
  }

  if (command === "inspect") {
    const workflowName = args[3];

    if (workflowName === undefined) {
      stderr.write("Usage: formctl inspect <workflow-name>\n");
      return 1;
    }
    if (!isValidWorkflowName(workflowName)) {
      return writeInvalidWorkflowNameError(command, flags.has("--json"), stdout, stderr);
    }

    const result = readWorkflow(workflowName);
    if (result.error !== undefined || result.workflow === undefined) {
      if (result.errorKind === "workflow_unreadable") {
        return writeWorkflowUnreadableError(command, workflowName, result.error ?? "Workflow YAML could not be parsed.", flags.has("--json"), stdout, stderr);
      }
      if (result.errorKind === "workflow_invalid") {
        return writeWorkflowInvalidError(command, workflowName, result.checks ?? [], flags.has("--json"), stdout, stderr);
      }
      return writeWorkflowNotFoundError(command, workflowName, flags.has("--json"), stdout, stderr);
    }

    if (flags.has("--json")) {
      const workflow = result.workflow;
      stdout.write(`${JSON.stringify({
        status: "ok",
        workflow: workflow.name,
        url: workflow.url,
        ...(workflow.screenshots === undefined ? {} : { screenshots: workflow.screenshots }),
        ...(workflow.recording === undefined ? {} : { recording: workflow.recording }),
        ...(workflow.safety === undefined ? {} : { safety: workflow.safety }),
        fields: workflow.fields,
        submit: workflow.submit,
      })}\n`);
      return 0;
    }

    stdout.write(`Workflow: ${workflowName}\nPath: .formctl/workflows/${workflowName}.yml\n`);
    return 0;
  }

  if (command === "workflows") {
    const workflows = listWorkflowFiles();

    if (flags.has("--json")) {
      stdout.write(`${JSON.stringify({
        status: "ok",
        workflows,
      })}\n`);
      return 0;
    }

    if (workflows.length === 0) {
      stdout.write("No workflows found in .formctl/workflows\n");
      return 0;
    }

    stdout.write("Workflows:\n");
    for (const workflow of workflows) {
      stdout.write(`- ${workflow.name}: ${workflow.path}\n`);
    }
    return 0;
  }

  if (command === "validate") {
    const workflowName = args[3];

    if (workflowName === undefined) {
      stderr.write("Usage: formctl validate <workflow-name> [--json]\n");
      return 1;
    }
    if (!isValidWorkflowName(workflowName)) {
      return writeInvalidWorkflowNameError(command, flags.has("--json"), stdout, stderr);
    }

    const workflowPath = path.join(process.cwd(), ".formctl", "workflows", `${workflowName}.yml`);
    const displayPath = `.formctl/workflows/${workflowName}.yml`;
    if (!existsSync(workflowPath)) {
      return writeWorkflowNotFoundError(command, workflowName, flags.has("--json"), stdout, stderr);
    }

    let workflow: unknown;
    const checks: ValidationCheck[] = [];
    try {
      workflow = parse(readFileSync(workflowPath, "utf8"));
      checks.push({ name: "readable-yaml", status: "ok" });
      checks.push(...validateWorkflow(workflowName, workflow));
    } catch (error) {
      checks.push({
        name: "readable-yaml",
        status: "error",
        message: error instanceof Error ? error.message : "Workflow YAML could not be parsed.",
        fix: `Repair ${displayPath} so it is valid YAML before retrying validation.`,
      });
    }

    const status = checks.every((check) => check.status === "ok") ? "ok" : "error";
    const exitCode = status === "ok" ? 0 : 1;

    if (flags.has("--json")) {
      stdout.write(`${JSON.stringify({
        status,
        command: "validate",
        workflow: workflowName,
        path: displayPath,
        exitCode,
        checks,
      })}\n`);
      return exitCode;
    }

    stdout.write(`Workflow validation: ${status}\nPath: ${displayPath}\n`);
    for (const check of checks) {
      stdout.write(`- ${check.name}: ${check.status}\n`);
      if (check.message !== undefined) {
        stdout.write(`  message: ${check.message}\n`);
      }
      if (check.fix !== undefined) {
        stdout.write(`  fix: ${check.fix}\n`);
      }
    }
    return exitCode;
  }

  if (command === "submit") {
    const workflowName = args[3];

    if (workflowName === undefined) {
      stderr.write("Usage: formctl submit <workflow-name> [flags]\n");
      return 1;
    }
    if (!isValidWorkflowName(workflowName)) {
      return writeInvalidWorkflowNameError(command, flags.has("--json"), stdout, stderr);
    }

    const isDryRun = flags.has("--dry-run");
    const isApproved = flags.has("--approve");
    const wantsJson = flags.has("--json");
    const isInteractiveApproval = !isDryRun && !isApproved && !wantsJson && stdin.isTTY === true;

    if (!isDryRun && !isApproved && !isInteractiveApproval) {
      const message = "Approval required: run with --dry-run to preview or --approve to submit.";
      if (wantsJson) {
        stdout.write(`${JSON.stringify({
          status: "error",
          workflow: workflowName,
          exitCode: 5,
          submitted: false,
          requiresApproval: true,
          error: {
            code: "approval_required",
            message,
          },
        })}\n`);
        return 5;
      }

      stderr.write(`${message}\n`);
      return 5;
    }

    const result = readWorkflow(workflowName);
    if (result.error !== undefined || result.workflow === undefined) {
      if (result.errorKind === "workflow_unreadable") {
        return writeWorkflowUnreadableError(command, workflowName, result.error ?? "Workflow YAML could not be parsed.", wantsJson, stdout, stderr);
      }
      if (result.errorKind === "workflow_invalid") {
        return writeWorkflowInvalidError(command, workflowName, result.checks ?? [], wantsJson, stdout, stderr);
      }
      return writeWorkflowNotFoundError(command, workflowName, wantsJson, stdout, stderr);
    }

    const options = parseOptions(args.slice(4));
    const workflow = result.workflow;
    const fieldValuesResult = readSubmitFieldValues(options, workflow.fields);
    if ("error" in fieldValuesResult) {
      const payload = {
        status: "error",
        workflow: workflowName,
        exitCode: 1,
        submitted: false,
        requiresApproval: false,
        error: {
          code: "field_values_invalid",
          message: fieldValuesResult.error.message,
          ...(fieldValuesResult.error.unknownFields === undefined ? {} : { unknownFields: fieldValuesResult.error.unknownFields }),
        },
      };
      if (wantsJson) {
        stdout.write(`${JSON.stringify(payload)}\n`);
      } else {
        stderr.write(`${fieldValuesResult.error.message}\n`);
      }
      return 1;
    }
    const storageStateResult = readStorageStateOption(options);
    if ("error" in storageStateResult) {
      const payload = {
        status: "error",
        workflow: workflowName,
        exitCode: 1,
        submitted: false,
        requiresApproval: false,
        error: {
          code: "storage_state_invalid",
          message: storageStateResult.error.message,
        },
      };
      if (wantsJson) {
        stdout.write(`${JSON.stringify(payload)}\n`);
      } else {
        stderr.write(`${storageStateResult.error.message}\n`);
      }
      return 1;
    }
    const browserHeadless = resolveBrowserHeadless({ command: "submit", flags, isDryRun: isDryRun || isInteractiveApproval });
    const browser = await chromium.launch({ headless: browserHeadless });
    const runStatus = isDryRun ? "dry-run" : "submitted";
    const screenshotFileName = isDryRun ? "dry-run.png" : "post-submit.png";
    const runId = `${Date.now()}-${runStatus}`;
    const runDirectory = path.join(process.cwd(), ".formctl", "runs", runId);
    const relativeRunDirectory = `.formctl/runs/${runId}`;
    const filledFields: Record<string, string> = {};
    const auditEvents: AuditEvent[] = [];

    try {
      auditEvents.push({
        event: "run_started",
        workflow: workflow.name,
        url: workflow.url,
        mode: runStatus,
        submitted: !isDryRun,
        approval: isDryRun ? null : isInteractiveApproval ? "interactive" : "flag",
        command: {
          dryRun: isDryRun,
          approve: isApproved,
          ...(isInteractiveApproval ? { interactive: true } : {}),
          headless: browserHeadless,
          json: wantsJson,
          ...(storageStateResult.storageStatePath === undefined ? {} : { storageState: true }),
        },
      });
      const context = await browser.newContext(
        storageStateResult.storageStatePath === undefined ? {} : { storageState: storageStateResult.storageStatePath },
      );
      const page = await context.newPage();
      await page.goto(workflow.url, { waitUntil: "domcontentloaded" });
      let interactionRequired = await detectInteractionRequired(page);
      if (interactionRequired !== undefined) {
        const canResumeAfterInteraction = flags.has("--resume-after-interaction") && !wantsJson && stdin.isTTY === true;
        if (canResumeAfterInteraction) {
          auditEvents.push({
            event: "interaction_required",
            code: interactionRequired.code,
            detected: interactionRequired.detected,
            result: "paused",
          });
          stdout.write(`${interactionRequired.message}\n`);
          stdout.write("Press Enter to resume formctl after completing the browser step.\n");
          const resumeInput = await readApprovalLine(stdin);
          if (resumeInput !== undefined) {
            await page.waitForTimeout(100);
            interactionRequired = await detectInteractionRequired(page);
            auditEvents.push({
              event: "interaction_resume_checked",
              result: interactionRequired === undefined ? "ok" : "blocked",
              ...(interactionRequired === undefined ? {} : {
                code: interactionRequired.code,
                detected: interactionRequired.detected,
              }),
            });
          } else {
            auditEvents.push({
              event: "interaction_resume_checked",
              result: "blocked",
              code: interactionRequired.code,
              detected: interactionRequired.detected,
              reason: "input_closed",
            });
          }
        }
      }
      if (interactionRequired !== undefined) {
        const failurePayload = buildInteractionRequiredPayload(workflow.name, interactionRequired);
        auditEvents.push({
          event: "interaction_required",
          code: interactionRequired.code,
          detected: interactionRequired.detected,
          result: "blocked",
        });
        const failure = await writeSelectorMismatchFailureArtifacts(
          page,
          process.cwd(),
          failurePayload,
          auditEvents,
        );
        writeSelectorFailure(
          wantsJson ? stdout : stderr,
          failurePayload,
          wantsJson,
          failure.runId,
          failure.artifacts,
        );
        return 6;
      }

      for (const field of workflow.fields) {
        const matchCount = await page.locator(field.selector).count();
        auditEvents.push({
          event: "selector_check",
          role: "field",
          field: field.name,
          selector: field.selector,
          expectedMatches: 1,
          actualMatches: matchCount,
          result: matchCount === 1 ? "ok" : "mismatch",
        });
        if (matchCount !== 1) {
          const failurePayload = buildSelectorMismatchPayload(
            workflow.name,
            field.selector,
            matchCount,
          );
          const failure = await writeSelectorMismatchFailureArtifacts(
            page,
            process.cwd(),
            failurePayload,
            auditEvents,
          );
          writeSelectorFailure(
            wantsJson ? stdout : stderr,
            failurePayload,
            wantsJson,
            failure.runId,
            failure.artifacts,
          );
          return 3;
        }

        const expectedType = normalizeFieldType(field.type);
        const actualType = await readElementType(page, field.selector);
        if (actualType !== expectedType) {
          const failurePayload = buildFieldTypeMismatchPayload(
            workflow.name,
            field.selector,
            expectedType,
            actualType,
          );
          auditEvents.push({
            event: "field_type_check",
            role: "field",
            field: field.name,
            selector: field.selector,
            expectedType,
            actualType,
            result: "mismatch",
          });
          const failure = await writeSelectorMismatchFailureArtifacts(
            page,
            process.cwd(),
            failurePayload,
            auditEvents,
          );
          writeSelectorFailure(
            wantsJson ? stdout : stderr,
            failurePayload,
            wantsJson,
            failure.runId,
            failure.artifacts,
          );
          return 3;
        }

        if (field.label !== undefined) {
          const expectedLabel = normalizeLabel(field.label);
          const actualLabel = await readElementLabel(page, field.selector);
          if (actualLabel !== expectedLabel) {
            const failurePayload = buildFieldLabelMismatchPayload(
              workflow.name,
              field.selector,
              expectedLabel,
              actualLabel,
            );
            auditEvents.push({
              event: "field_label_check",
              role: "field",
              field: field.name,
              selector: field.selector,
              expectedLabel,
              actualLabel,
              result: "mismatch",
            });
            const failure = await writeSelectorMismatchFailureArtifacts(
              page,
              process.cwd(),
              failurePayload,
              auditEvents,
            );
            writeSelectorFailure(
              wantsJson ? stdout : stderr,
              failurePayload,
              wantsJson,
              failure.runId,
              failure.artifacts,
            );
            return 3;
          }
        }

        if (field.description !== undefined) {
          const expectedDescription = normalizeDescription(field.description);
          const actualDescription = await readElementDescription(page, field.selector);
          if (actualDescription !== expectedDescription) {
            const failurePayload = buildFieldDescriptionMismatchPayload(
              workflow.name,
              field.selector,
              expectedDescription,
              actualDescription,
            );
            auditEvents.push({
              event: "field_description_check",
              role: "field",
              field: field.name,
              selector: field.selector,
              expectedDescription,
              actualDescription,
              result: "mismatch",
            });
            const failure = await writeSelectorMismatchFailureArtifacts(
              page,
              process.cwd(),
              failurePayload,
              auditEvents,
            );
            writeSelectorFailure(
              wantsJson ? stdout : stderr,
              failurePayload,
              wantsJson,
              failure.runId,
              failure.artifacts,
            );
            return 3;
          }
        }
      }

      const submitMatchCount = await page.locator(workflow.submit.selector).count();
      auditEvents.push({
        event: "selector_check",
        role: "submit",
        selector: workflow.submit.selector,
        expectedMatches: 1,
        actualMatches: submitMatchCount,
        result: submitMatchCount === 1 ? "ok" : "mismatch",
      });
      if (submitMatchCount !== 1) {
        const failurePayload = buildSelectorMismatchPayload(
          workflow.name,
          workflow.submit.selector,
          submitMatchCount,
        );
        const failure = await writeSelectorMismatchFailureArtifacts(
          page,
          process.cwd(),
          failurePayload,
          auditEvents,
        );
        writeSelectorFailure(
          wantsJson ? stdout : stderr,
          failurePayload,
          wantsJson,
          failure.runId,
          failure.artifacts,
        );
        return 3;
      }

      for (const field of orderFieldsForReplay(workflow)) {
        const value = fieldValuesResult.values.get(field.name);
        if (value === undefined) {
          continue;
        }

        if (field.type === "file") {
          const filePath = path.isAbsolute(value) ? value : path.join(process.cwd(), value);
          await page.locator(field.selector).setInputFiles(filePath);
          filledFields[field.name] = "[file]";
          continue;
        }

        if (field.type === "select") {
          await page.locator(field.selector).selectOption(value);
          filledFields[field.name] = value;
          continue;
        }

        if (field.type === "checkbox") {
          const shouldCheck = parseCheckboxValue(value);
          await page.locator(field.selector).setChecked(shouldCheck);
          filledFields[field.name] = String(shouldCheck);
          continue;
        }

        await page.locator(field.selector).fill(value);
        filledFields[field.name] = value;
      }

      mkdirSync(runDirectory, { recursive: true });
      const auditPath = path.join(runDirectory, "audit.jsonl");
      const fieldDiffArtifact = `${relativeRunDirectory}/field-diff.json`;
      writeFileSync(
        path.join(runDirectory, "field-diff.json"),
        `${JSON.stringify(buildFieldDiff(workflow, filledFields, false), null, 2)}\n`,
      );
      let dryRunScreenshotArtifact: string | undefined;
      auditEvents.push({
        event: "fields_resolved",
        fields: filledFields,
      });
      if (isInteractiveApproval) {
        dryRunScreenshotArtifact = `${relativeRunDirectory}/dry-run.png`;
        await page.screenshot({ path: path.join(runDirectory, "dry-run.png"), fullPage: true });
        auditEvents.push({
          event: "screenshot_saved",
          path: dryRunScreenshotArtifact,
        });
        stdout.write(`Dry-run screenshot: ${dryRunScreenshotArtifact}\n`);
        stdout.write('Type "approve" to submit: ');
        const approvalText = await readApprovalLine(stdin);
        stdout.write("\n");
        const approved = approvalText === "approve";
        auditEvents.push({
          event: "approval_prompt_answered",
          approved,
        });
        if (!approved) {
          const artifacts = {
            screenshot: dryRunScreenshotArtifact,
            diff: fieldDiffArtifact,
            audit: `${relativeRunDirectory}/audit.jsonl`,
          };
          auditEvents.push({
            event: "run_finished",
            status: "approval-required",
            submitted: false,
            artifacts,
          });
          for (const event of auditEvents) {
            appendAuditEvent(auditPath, event);
          }

          stderr.write("Approval declined; not submitted.\n");
          return 5;
        }
      }
      if (!isDryRun) {
        await page.locator(workflow.submit.selector).click();
      }

      const screenshotPath = path.join(runDirectory, screenshotFileName);
      const summaryPath = path.join(runDirectory, "summary.json");
      const artifacts = {
        screenshot: `${relativeRunDirectory}/${screenshotFileName}`,
        ...(dryRunScreenshotArtifact === undefined ? {} : { dryRunScreenshot: dryRunScreenshotArtifact }),
        diff: fieldDiffArtifact,
        summary: `${relativeRunDirectory}/summary.json`,
        audit: `${relativeRunDirectory}/audit.jsonl`,
      };
      await page.screenshot({ path: screenshotPath, fullPage: true });
      const summary = {
        status: runStatus,
        workflow: workflow.name,
        submitted: !isDryRun,
        ...(isDryRun ? {} : { approval: isInteractiveApproval ? "interactive" : "flag" }),
        fields: filledFields,
        artifacts,
      };
      writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
      auditEvents.push(
        {
          event: "screenshot_saved",
          path: artifacts.screenshot,
        },
        {
          event: "run_finished",
          status: runStatus,
          submitted: !isDryRun,
          artifacts,
        },
      );
      for (const event of auditEvents) {
        appendAuditEvent(auditPath, event);
      }

      if (wantsJson) {
        stdout.write(`${JSON.stringify({
          ...summary,
          exitCode: 0,
          runId,
          requiresApproval: false,
        })}\n`);
        return 0;
      }

      stdout.write(`${isDryRun ? "Dry-run complete" : "Submitted workflow"}: ${workflow.name}\nRun: ${relativeRunDirectory}\n`);
      return 0;
    } catch (error) {
      if (!isDryRun && !isInteractiveApproval) {
        throw error;
      }

      mkdirSync(runDirectory, { recursive: true });
      const failureArtifact = `${relativeRunDirectory}/failure.json`;
      const auditArtifact = `${relativeRunDirectory}/audit.jsonl`;
      const artifacts = {
        failure: failureArtifact,
        audit: auditArtifact,
      };
      const message = `Dry-run failed: ${getErrorMessage(error)}`;
      const payload = {
        status: "error",
        workflow: workflow.name,
        exitCode: 4,
        runId,
        submitted: false,
        requiresApproval: false,
        artifacts,
        error: {
          code: "dry_run_failed",
          message,
        },
      };
      auditEvents.push({
        event: "run_failed",
        status: "dry-run-failed",
        submitted: false,
        error: payload.error,
        artifacts,
      });
      writeFileSync(path.join(runDirectory, "failure.json"), `${JSON.stringify(payload, null, 2)}\n`);
      for (const event of auditEvents) {
        appendAuditEvent(path.join(runDirectory, "audit.jsonl"), event);
      }

      if (wantsJson) {
        stdout.write(`${JSON.stringify(payload)}\n`);
      } else {
        stderr.write(`${message}\nRun: ${relativeRunDirectory}\n`);
      }
      return 4;
    } finally {
      await browser.close();
    }
  }

  if (command === "record") {
    const workflowName = args[3];
    const url = args[4];

    if (workflowName === undefined || url === undefined) {
      stderr.write("Usage: formctl record <workflow-name> <url>\n");
      return 1;
    }
    if (!isValidWorkflowName(workflowName)) {
      return writeInvalidWorkflowNameError(command, flags.has("--json"), stdout, stderr);
    }

    const options = parseOptions(args.slice(5));
    const storageStateResult = readStorageStateOption(options);
    if ("error" in storageStateResult) {
      stderr.write(`${storageStateResult.error.message}\n`);
      return 1;
    }

    const browser = await chromium.launch({
      headless: resolveBrowserHeadless({ command: "record", flags, isDryRun: false }),
    });
    try {
      const context = await browser.newContext(
        storageStateResult.storageStatePath === undefined ? {} : { storageState: storageStateResult.storageStatePath },
      );
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded" });
      let recordingEvents: WorkflowRecordingEvent[] | undefined;
      if (flags.has("--manual")) {
        await page.evaluate(() => {
          type RecordingWindow = Window & {
            __formctlRecordingEvents?: Array<{
              event: "input" | "change";
              field: string;
              selector: string;
              value: "[redacted]" | "[file]";
            }>;
            __formctlManualReady?: boolean;
          };

          const recordingWindow = window as RecordingWindow;
          recordingWindow.__formctlRecordingEvents = [];
          for (const element of Array.from(document.querySelectorAll("input, textarea, select"))) {
            const tagName = element.tagName.toLowerCase();
            const field = element.getAttribute("name");
            if (field === null || field.length === 0) {
              continue;
            }

            const inputType = tagName === "input" ? element.getAttribute("type") ?? "text" : tagName;
            const selector = `${tagName}[name="${field}"]`;
            const record = (event: Event) => {
              recordingWindow.__formctlRecordingEvents?.push({
                event: event.type === "change" ? "change" : "input",
                field,
                selector,
                value: inputType === "file" ? "[file]" : "[redacted]",
              });
            };

            element.addEventListener("input", record);
            element.addEventListener("change", record);
          }
          recordingWindow.__formctlManualReady = true;
        });
        stdout.write("Manual record: complete the form in the browser, then press Enter here to save.\n");
        await readApprovalLine(stdin);
        recordingEvents = await page.evaluate(() => {
          return (window as Window & { __formctlRecordingEvents?: WorkflowRecordingEvent[] }).__formctlRecordingEvents ?? [];
        });
      }

      const fields = await page.locator("input, textarea, select").evaluateAll((elements) => elements.flatMap((element) => {
        const tagName = element.tagName.toLowerCase();
        const name = element.getAttribute("name");
        if (name === null || name.length === 0) {
          return [];
        }

        const type = tagName === "input"
          ? element.getAttribute("type") ?? "text"
          : tagName;
        const labelableElement = element as Element & { labels?: NodeListOf<HTMLLabelElement> | null };
        const labels = Array.from(labelableElement.labels ?? []);
        const label = labels
          .map((labelElement) => labelElement.textContent?.replace(/\s+/g, " ").trim() ?? "")
          .find((labelText) => labelText.length > 0)
          ?? element.getAttribute("aria-label")
          ?? "";
        const describedBy = element.getAttribute("aria-describedby") ?? "";
        const description = describedBy
          .split(/\s+/)
          .filter((id) => id.length > 0)
          .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "")
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

        return [{
          name,
          selector: `${tagName}[name="${name}"]`,
          type,
          ...(label.length === 0 ? {} : { label }),
          ...(description.length === 0 ? {} : { description }),
        }];
      }));
      const submitSelector = await page.locator('button[type="submit"], input[type="submit"]').first().evaluate((element) => {
        const tagName = element.tagName.toLowerCase();
        const type = element.getAttribute("type") ?? "submit";
        return `${tagName}[type="${type}"]`;
      });
      const workflowDirectory = path.join(process.cwd(), ".formctl", "workflows");
      const baselineScreenshot = `.formctl/workflows/${workflowName}.baseline.png`;
      const workflow: Workflow = {
        name: workflowName,
        url,
        screenshots: {
          baseline: baselineScreenshot,
        },
        ...(recordingEvents === undefined ? {} : {
          recording: {
            mode: "manual",
            events: recordingEvents,
          },
        }),
        safety: DEFAULT_WORKFLOW_SAFETY,
        fields,
        submit: {
          selector: submitSelector,
        },
      };

      mkdirSync(workflowDirectory, { recursive: true });
      await page.screenshot({ path: path.join(workflowDirectory, `${workflowName}.baseline.png`), fullPage: true });
      writeFileSync(path.join(workflowDirectory, `${workflowName}.yml`), stringify(workflow));
      stdout.write(`Recorded workflow: ${workflowName}\nPath: .formctl/workflows/${workflowName}.yml\nBaseline: ${baselineScreenshot}\n`);
      return 0;
    } finally {
      await browser.close();
    }
  }

  stderr.write(`Unknown command: ${command}\n`);
  return 1;
}

function resolveEntrypointPath(entrypointPath: string): string {
  try {
    return realpathSync(entrypointPath);
  } catch {
    return path.resolve(entrypointPath);
  }
}

const entrypoint = process.argv[1];
const isDirectRun = entrypoint !== undefined
  && resolveEntrypointPath(entrypoint) === resolveEntrypointPath(fileURLToPath(import.meta.url));

if (isDirectRun) {
  const exitCode = await run(process.argv, process.stdout, process.stderr, process.stdin);
  process.exitCode = exitCode;
}
