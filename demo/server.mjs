import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const demoDir = dirname(fileURLToPath(import.meta.url));
const expenseReportHtml = readFileSync(join(demoDir, "expense-report.html"), "utf8");
const adminInviteHtml = readFileSync(join(demoDir, "admin-invite.html"), "utf8");
const supportRefundHtml = readFileSync(join(demoDir, "support-refund.html"), "utf8");
let expenseSubmissions = 0;
let adminInviteSubmissions = 0;
let supportRefundSubmissions = 0;

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

  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(expenseReportHtml);
});

server.listen(4173, "127.0.0.1", () => {
  console.log("formctl demo running at http://127.0.0.1:4173/expense");
  console.log("admin invite demo running at http://127.0.0.1:4173/admin-invite");
  console.log("support refund demo running at http://127.0.0.1:4173/support-refund");
});
