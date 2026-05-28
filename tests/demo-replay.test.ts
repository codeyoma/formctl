import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = path.join(projectRoot, "src", "cli.ts");
const tsxLoaderPath = path.join(projectRoot, "node_modules", "tsx", "dist", "loader.mjs");

type ReplayCase = {
  name: string;
  route: string;
  submitRoute: string;
  htmlFile: string;
  args: string[];
  expectedFields: Record<string, string>;
  expectedAuditEvents?: string[];
  expectedStepArtifacts?: string[];
};

const replayCases: ReplayCase[] = [
  {
    name: "expense-report",
    route: "/expense",
    submitRoute: "/submit",
    htmlFile: "expense-report.html",
    args: ["--amount", "120000", "--receipt", path.join(projectRoot, "demo", "receipt.txt")],
    expectedFields: {
      amount: "120000",
      receipt: "[file]",
    },
  },
  {
    name: "admin-invite",
    route: "/admin-invite",
    submitRoute: "/admin-invite/submit",
    htmlFile: "admin-invite.html",
    args: ["--email", "ops@example.com", "--role", "admin", "--notify", "true"],
    expectedFields: {
      email: "ops@example.com",
      role: "admin",
      notify: "true",
    },
  },
  {
    name: "support-refund",
    route: "/support-refund",
    submitRoute: "/support-refund/submit",
    htmlFile: "support-refund.html",
    args: ["--orderId", "ORD-1001", "--refundDate", "2026-05-26", "--reason", "Duplicate charge"],
    expectedFields: {
      orderId: "ORD-1001",
      refundDate: "2026-05-26",
      reason: "Duplicate charge",
    },
  },
  {
    name: "vendor-onboarding",
    route: "/vendor-onboarding",
    submitRoute: "/vendor-onboarding/submit",
    htmlFile: "vendor-onboarding.html",
    args: [
      "--legalName",
      "Acme Supplies",
      "--website",
      "https://vendor.example",
      "--taxForm",
      path.join(projectRoot, "demo", "tax-form.txt"),
      "--riskTier",
      "medium",
      "--ndaSigned",
      "true",
      "--onboardingDate",
      "2026-05-26",
      "--notes",
      "Approved vendor",
    ],
    expectedFields: {
      legalName: "Acme Supplies",
      website: "https://vendor.example",
      taxForm: "[file]",
      riskTier: "medium",
      ndaSigned: "true",
      onboardingDate: "2026-05-26",
      notes: "Approved vendor",
    },
  },
  {
    name: "procurement-approval",
    route: "/procurement-approval",
    submitRoute: "/procurement-approval/submit",
    htmlFile: "procurement-approval.html",
    args: [
      "--requestorEmail",
      "buyer@example.com",
      "--department",
      "finance",
      "--amount",
      "98000",
      "--neededBy",
      "2026-06-01",
      "--justification",
      "Quarterly laptop refresh",
      "--urgent",
      "true",
    ],
    expectedFields: {
      requestorEmail: "buyer@example.com",
      department: "finance",
      amount: "98000",
      neededBy: "2026-06-01",
      justification: "Quarterly laptop refresh",
      urgent: "true",
    },
    expectedAuditEvents: ["workflow_step", "step_screenshot_saved"],
    expectedStepArtifacts: ["open approval modal"],
  },
  {
    name: "crm-update",
    route: "/crm-update",
    submitRoute: "/crm-update/submit",
    htmlFile: "crm-update.html",
    args: [
      "--accountName",
      "Northwind Traders",
      "--stage",
      "renewal",
      "--ownerEmail",
      "ae@example.com",
      "--nextContactDate",
      "2026-06-03",
      "--priority",
      "true",
      "--notes",
      "Renewal risk flagged",
    ],
    expectedFields: {
      accountName: "Northwind Traders",
      stage: "renewal",
      ownerEmail: "ae@example.com",
      nextContactDate: "2026-06-03",
      priority: "true",
      notes: "Renewal risk flagged",
    },
  },
  {
    name: "compliance-attestation",
    route: "/compliance-attestation",
    submitRoute: "/compliance-attestation/submit",
    htmlFile: "compliance-attestation.html",
    args: [
      "--employeeEmail",
      "auditor@example.com",
      "--controlArea",
      "security",
      "--attestationDate",
      "2026-06-15",
      "--compliant",
      "true",
      "--notes",
      "Quarterly access review complete",
    ],
    expectedFields: {
      employeeEmail: "auditor@example.com",
      controlArea: "security",
      attestationDate: "2026-06-15",
      compliant: "true",
      notes: "Quarterly access review complete",
    },
  },
];

function runFormctlAsync(args: string[], cwd: string) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", tsxLoaderPath, cliPath, ...args], {
      cwd,
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
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

async function serveDemoFixtures() {
  const htmlByRoute = new Map(replayCases.map((fixture) => [
    fixture.route,
    readFileSync(path.join(projectRoot, "demo", fixture.htmlFile), "utf8"),
  ]));
  const postCounts = new Map(replayCases.map((fixture) => [fixture.submitRoute, 0]));
  const server = http.createServer((request, response) => {
    const requestUrl = request.url ?? "/";

    if (request.method === "POST" && postCounts.has(requestUrl)) {
      postCounts.set(requestUrl, (postCounts.get(requestUrl) ?? 0) + 1);
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("<h1>Submitted</h1>");
      return;
    }

    const html = htmlByRoute.get(requestUrl);
    if (html !== undefined) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(html);
      return;
    }

    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Demo fixture server did not expose a TCP port");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    postCount: (route: string) => postCounts.get(route) ?? 0,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    }),
  };
}

describe("demo fixture replay", () => {
  test("checked-in demo workflows dry-run without recording and approve exactly once", async () => {
    const server = await serveDemoFixtures();
    const workspace = mkdtempSync(path.join(os.tmpdir(), "formctl-demo-replay-"));
    const workflowDirectory = path.join(workspace, ".formctl", "workflows");
    mkdirSync(workflowDirectory, { recursive: true });

    try {
      for (const fixture of replayCases) {
        const shippedWorkflowPath = path.join(projectRoot, ".formctl", "workflows", `${fixture.name}.yml`);
        expect(existsSync(shippedWorkflowPath)).toBe(true);
        writeFileSync(
          path.join(workflowDirectory, `${fixture.name}.yml`),
          readFileSync(shippedWorkflowPath, "utf8").replaceAll("http://127.0.0.1:4173", server.baseUrl),
        );

        const dryRun = await runFormctlAsync([
          "submit",
          fixture.name,
          ...fixture.args,
          "--dry-run",
          "--json",
          "--headless",
        ], workspace);
        const dryRunJson = JSON.parse(dryRun.stdout);

        expect(dryRun.status).toBe(0);
        expect(dryRun.stderr).toBe("");
        expect(dryRunJson).toMatchObject({
          status: "dry-run",
          workflow: fixture.name,
          submitted: false,
          fields: fixture.expectedFields,
        });
        if (fixture.expectedAuditEvents !== undefined) {
          const auditLog = readFileSync(path.join(workspace, dryRunJson.artifacts.audit), "utf8");
          for (const eventName of fixture.expectedAuditEvents) {
            expect(auditLog).toContain(`"event":"${eventName}"`);
          }
        }
        if (fixture.expectedStepArtifacts !== undefined) {
          expect(dryRunJson.artifacts.steps).toEqual(fixture.expectedStepArtifacts.map((stepName, index) => ({
            name: stepName,
            screenshot: `.formctl/runs/${dryRunJson.runId}/step-${String(index + 1).padStart(2, "0")}-${stepName.replaceAll(" ", "-")}.png`,
          })));
          for (const stepArtifact of dryRunJson.artifacts.steps) {
            expect(existsSync(path.join(workspace, stepArtifact.screenshot))).toBe(true);
          }
        }
        expect(server.postCount(fixture.submitRoute)).toBe(0);

        const approved = await runFormctlAsync([
          "submit",
          fixture.name,
          ...fixture.args,
          "--approve",
          "--json",
          "--headless",
        ], workspace);
        const approvedJson = JSON.parse(approved.stdout);

        expect(approved.status).toBe(0);
        expect(approved.stderr).toBe("");
        expect(approvedJson).toMatchObject({
          status: "submitted",
          workflow: fixture.name,
          submitted: true,
          fields: fixture.expectedFields,
        });
        expect(server.postCount(fixture.submitRoute)).toBe(1);
      }
    } finally {
      await server.close();
    }
  }, 60_000);
});
