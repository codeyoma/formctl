import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const demoDir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(demoDir, "expense-report.html"), "utf8");
let submissions = 0;

const server = createServer((request, response) => {
  if (request.method === "POST" && request.url === "/submit") {
    submissions += 1;
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<h1>Submitted</h1><p>Total submissions: ${submissions}</p>`);
    return;
  }

  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
});

server.listen(4173, "127.0.0.1", () => {
  console.log("formctl demo running at http://127.0.0.1:4173/expense");
});

