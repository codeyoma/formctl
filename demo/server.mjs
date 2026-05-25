import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const demoDir = dirname(fileURLToPath(import.meta.url));
const expenseReportHtml = readFileSync(join(demoDir, "expense-report.html"), "utf8");
const adminInviteHtml = readFileSync(join(demoDir, "admin-invite.html"), "utf8");
const supportRefundHtml = readFileSync(join(demoDir, "support-refund.html"), "utf8");
const vendorOnboardingHtml = readFileSync(join(demoDir, "vendor-onboarding.html"), "utf8");
const procurementApprovalHtml = readFileSync(join(demoDir, "procurement-approval.html"), "utf8");
const crmUpdateHtml = readFileSync(join(demoDir, "crm-update.html"), "utf8");
const complianceAttestationHtml = readFileSync(join(demoDir, "compliance-attestation.html"), "utf8");
let expenseSubmissions = 0;
let adminInviteSubmissions = 0;
let supportRefundSubmissions = 0;
let vendorOnboardingSubmissions = 0;
let procurementApprovalSubmissions = 0;
let crmUpdateSubmissions = 0;
let complianceAttestationSubmissions = 0;

const server = createServer((request, response) => {
  if (request.method === "POST" && request.url === "/submit") {
    expenseSubmissions += 1;
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<h1>Expense submitted</h1><p>Total submissions: ${expenseSubmissions}</p>`);
    return;
  }

  if (request.method === "POST" && request.url === "/admin-invite/submit") {
    adminInviteSubmissions += 1;
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<h1>Invite submitted</h1><p>Total submissions: ${adminInviteSubmissions}</p>`);
    return;
  }

  if (request.method === "POST" && request.url === "/support-refund/submit") {
    supportRefundSubmissions += 1;
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<h1>Refund submitted</h1><p>Total submissions: ${supportRefundSubmissions}</p>`);
    return;
  }

  if (request.method === "POST" && request.url === "/vendor-onboarding/submit") {
    vendorOnboardingSubmissions += 1;
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<h1>Vendor onboarded</h1><p>Total submissions: ${vendorOnboardingSubmissions}</p>`);
    return;
  }

  if (request.method === "POST" && request.url === "/procurement-approval/submit") {
    procurementApprovalSubmissions += 1;
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<h1>Procurement approved</h1><p>Total submissions: ${procurementApprovalSubmissions}</p>`);
    return;
  }

  if (request.method === "POST" && request.url === "/crm-update/submit") {
    crmUpdateSubmissions += 1;
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<h1>CRM updated</h1><p>Total submissions: ${crmUpdateSubmissions}</p>`);
    return;
  }

  if (request.method === "POST" && request.url === "/compliance-attestation/submit") {
    complianceAttestationSubmissions += 1;
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<h1>Compliance attested</h1><p>Total submissions: ${complianceAttestationSubmissions}</p>`);
    return;
  }

  if (request.url === "/admin-invite") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(adminInviteHtml);
    return;
  }

  if (request.url === "/support-refund") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(supportRefundHtml);
    return;
  }

  if (request.url === "/vendor-onboarding") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(vendorOnboardingHtml);
    return;
  }

  if (request.url === "/procurement-approval") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(procurementApprovalHtml);
    return;
  }

  if (request.url === "/crm-update") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(crmUpdateHtml);
    return;
  }

  if (request.url === "/compliance-attestation") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(complianceAttestationHtml);
    return;
  }

  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(expenseReportHtml);
});

server.listen(4173, "127.0.0.1", () => {
  console.log("formctl demo running at http://127.0.0.1:4173/expense");
  console.log("admin invite demo running at http://127.0.0.1:4173/admin-invite");
  console.log("support refund demo running at http://127.0.0.1:4173/support-refund");
  console.log("vendor onboarding demo running at http://127.0.0.1:4173/vendor-onboarding");
  console.log("procurement approval demo running at http://127.0.0.1:4173/procurement-approval");
  console.log("CRM update demo running at http://127.0.0.1:4173/crm-update");
  console.log("compliance attestation demo running at http://127.0.0.1:4173/compliance-attestation");
});
