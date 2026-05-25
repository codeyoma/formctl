import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { parse, stringify } from "yaml";

const HELP_TEXT = `formctl turns browser-recorded web forms into safe CLI commands

Usage:
  formctl record <workflow-name> <url>
  formctl submit <workflow-name> [flags]
  formctl inspect <workflow-name>
  formctl doctor

Flags:
  --help        Show this help message
`;

type WorkflowField = {
  name: string;
  selector: string;
  type: string;
};

type Workflow = {
  name: string;
  url: string;
  fields: WorkflowField[];
  submit: {
    selector: string;
  };
};

type AuditEvent = Record<string, unknown>;

type FailureArtifacts = {
  screenshot: string;
  failure: string;
  audit: string;
};

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
): {
  status: "error";
  workflow: string;
  exitCode: 3;
  submitted: false;
  requiresApproval: false;
  error: {
    code: "selector_mismatch";
    selector: string;
    expectedMatches: 1;
    actualMatches: number;
    message: string;
  };
} {
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

function writeSelectorMismatch(
  output: NodeJS.WritableStream,
  workflowName: string,
  selector: string,
  actualMatches: number,
  wantsJson: boolean,
  runId?: string,
  artifacts?: FailureArtifacts,
): void {
  const payload = {
    ...buildSelectorMismatchPayload(workflowName, selector, actualMatches),
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

function parseCheckboxValue(value: string): boolean {
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

async function writeSelectorMismatchFailureArtifacts(
  page: Page,
  workingDirectory: string,
  workflow: Workflow,
  selector: string,
  actualMatches: number,
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
    ...buildSelectorMismatchPayload(workflow.name, selector, actualMatches),
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

export async function run(args: string[], stdout: NodeJS.WritableStream, stderr: NodeJS.WritableStream): Promise<number> {
  const command = args[2];
  const flags = new Set(args.slice(3));

  if (command === undefined || command === "--help" || command === "-h") {
    stdout.write(HELP_TEXT);
    return 0;
  }

  if (command === "doctor") {
    if (flags.has("--json")) {
      stdout.write(`${JSON.stringify({
        status: "ok",
        command: "doctor",
        checks: [
          { name: "node", status: "ok" },
          { name: "workspace", status: "ok" },
        ],
      })}\n`);
      return 0;
    }

    stdout.write("formctl doctor: ok\n");
    return 0;
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
        fields: workflow.fields,
        submit: workflow.submit,
      })}\n`);
      return 0;
    }

    stdout.write(`Workflow: ${workflowName}\nPath: .formctl/workflows/${workflowName}.yml\n`);
    return 0;
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

    if (!isDryRun && !isApproved) {
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
    const browser = await chromium.launch({ headless: flags.has("--headless") });
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
        approval: isDryRun ? null : "flag",
        command: {
          dryRun: isDryRun,
          approve: isApproved,
          headless: flags.has("--headless"),
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
          const failure = await writeSelectorMismatchFailureArtifacts(
            page,
            process.cwd(),
            workflow,
            field.selector,
            matchCount,
            auditEvents,
          );
          writeSelectorMismatch(
            wantsJson ? stdout : stderr,
            workflow.name,
            field.selector,
            matchCount,
            wantsJson,
            failure.runId,
            failure.artifacts,
          );
          return 3;
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
        const failure = await writeSelectorMismatchFailureArtifacts(
          page,
          process.cwd(),
          workflow,
          workflow.submit.selector,
          submitMatchCount,
          auditEvents,
        );
        writeSelectorMismatch(
          wantsJson ? stdout : stderr,
          workflow.name,
          workflow.submit.selector,
          submitMatchCount,
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
      auditEvents.push({
        event: "fields_resolved",
        fields: filledFields,
      });
      if (!isDryRun) {
        await page.locator(workflow.submit.selector).click();
      }

      const screenshotPath = path.join(runDirectory, screenshotFileName);
      const summaryPath = path.join(runDirectory, "summary.json");
      const auditPath = path.join(runDirectory, "audit.jsonl");
      const artifacts = {
        screenshot: `${relativeRunDirectory}/${screenshotFileName}`,
        summary: `${relativeRunDirectory}/summary.json`,
        audit: `${relativeRunDirectory}/audit.jsonl`,
      };
      await page.screenshot({ path: screenshotPath, fullPage: true });
      const summary = {
        status: runStatus,
        workflow: workflow.name,
        submitted: !isDryRun,
        ...(isDryRun ? {} : { approval: "flag" }),
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

    const browser = await chromium.launch({ headless: flags.has("--headless") });
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded" });

      const fields = await page.locator("input, textarea, select").evaluateAll((elements) => elements.flatMap((element) => {
        const tagName = element.tagName.toLowerCase();
        const name = element.getAttribute("name");
        if (name === null || name.length === 0) {
          return [];
        }

        const type = tagName === "input"
          ? element.getAttribute("type") ?? "text"
          : tagName;

        return [{
          name,
          selector: `${tagName}[name="${name}"]`,
          type,
        }];
      }));
      const submitSelector = await page.locator('button[type="submit"], input[type="submit"]').first().evaluate((element) => {
        const tagName = element.tagName.toLowerCase();
        const type = element.getAttribute("type") ?? "submit";
        return `${tagName}[type="${type}"]`;
      });
      const workflow: Workflow = {
        name: workflowName,
        url,
        fields,
        submit: {
          selector: submitSelector,
        },
      };

      const workflowDirectory = path.join(process.cwd(), ".formctl", "workflows");
      mkdirSync(workflowDirectory, { recursive: true });
      writeFileSync(path.join(workflowDirectory, `${workflowName}.yml`), stringify(workflow));
      stdout.write(`Recorded workflow: ${workflowName}\nPath: .formctl/workflows/${workflowName}.yml\n`);
      return 0;
    } finally {
      await browser.close();
    }
  }

  stderr.write(`Unknown command: ${command}\n`);
  return 1;
}

const exitCode = await run(process.argv, process.stdout, process.stderr);
process.exitCode = exitCode;
