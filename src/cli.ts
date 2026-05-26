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

function hasCurrentSafetyMetadata(value: unknown): boolean {
  if (!isObject(value)) {
    return false;
  }

  return value.dryRunFirst === DEFAULT_WORKFLOW_SAFETY.dryRunFirst
    && value.approvalRequired === DEFAULT_WORKFLOW_SAFETY.approvalRequired
    && value.selectorDrift === DEFAULT_WORKFLOW_SAFETY.selectorDrift
    && value.fileInputs === DEFAULT_WORKFLOW_SAFETY.fileInputs;
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

  return [
    buildValidationCheck(
      "workflow-name",
      workflowObject.name === workflowName,
      `Workflow name must match ${workflowName}.`,
      `Set name: ${workflowName}.`,
    ),
    buildValidationCheck(
      "target-url",
      isNonEmptyString(workflowObject.url),
      "Workflow must include a target URL.",
      "Add a non-empty url field with the form page URL.",
    ),
    buildValidationCheck(
      "fields",
      fieldListValid,
      "Workflow must include at least one field with name, selector, and type.",
      "Add fields entries with name, selector, and type for every required form field.",
    ),
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
  ];
}

function readWorkflow(workflowName: string): { workflow?: Workflow; error?: string; path: string } {
  const workflowPath = path.join(process.cwd(), ".formctl", "workflows", `${workflowName}.yml`);
  if (!existsSync(workflowPath)) {
    return {
      path: workflowPath,
      error: `Workflow not found: ${workflowName}\nExpected: .formctl/workflows/${workflowName}.yml\n`,
    };
  }

  return {
    path: workflowPath,
    workflow: parse(readFileSync(workflowPath, "utf8")),
  };
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
      const workflow = parse(readFileSync(path.join(workflowDirectory, entry), "utf8")) as Workflow;

      return {
        name: workflow.name,
        path: `.formctl/workflows/${entry}`,
        url: workflow.url,
        fieldCount: workflow.fields.length,
        ...(workflow.screenshots === undefined ? {} : { screenshots: workflow.screenshots }),
        ...(workflow.recording === undefined ? {} : {
          recording: {
            mode: workflow.recording.mode,
            eventCount: workflow.recording.events.length,
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

function writeSelectorFailure(
  output: NodeJS.WritableStream,
  failurePayload: SelectorFailurePayload,
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

async function readApprovalLine(stdin: ApprovalInput): Promise<string> {
  stdin.setEncoding?.("utf8");

  return new Promise((resolve) => {
    let input = "";
    let settled = false;
    const finish = (value: string) => {
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
      finish(input.trim());
    };
    const onError = () => {
      finish(input.trim());
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

async function writeSelectorMismatchFailureArtifacts(
  page: Page,
  workingDirectory: string,
  failurePayload: SelectorFailurePayload,
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

    const result = readWorkflow(workflowName);
    if (result.error !== undefined || result.workflow === undefined) {
      stderr.write(result.error ?? "Workflow could not be read\n");
      return 2;
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

    const workflowPath = path.join(process.cwd(), ".formctl", "workflows", `${workflowName}.yml`);
    const displayPath = `.formctl/workflows/${workflowName}.yml`;
    if (!existsSync(workflowPath)) {
      stderr.write(`Workflow not found: ${workflowName}\nExpected: ${displayPath}\n`);
      return 2;
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
      stderr.write(result.error ?? "Workflow could not be read\n");
      return 2;
    }

    const options = parseOptions(args.slice(4));
    const workflow = result.workflow;
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
      const page = await browser.newPage();
      await page.goto(workflow.url, { waitUntil: "domcontentloaded" });
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
        },
      });

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

      for (const field of workflow.fields) {
        const value = options.get(field.name);
        if (typeof value !== "string") {
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

    const browser = await chromium.launch({
      headless: resolveBrowserHeadless({ command: "record", flags, isDryRun: false }),
    });
    try {
      const page = await browser.newPage();
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
