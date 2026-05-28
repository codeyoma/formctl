#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageName = "formctl";
const npmAuthCommand = "npm whoami";
const packageNameCommand = "npm view formctl version --json";
const packDryRunCommand = "npm pack --dry-run --json";

function run(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8",
  });
}

function runCommandLine(commandLine) {
  const [command, ...args] = commandLine.split(" ");

  return run(command, args);
}

function combinedOutput(result) {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function trimmedError(result) {
  return (result.stderr || result.stdout || "command failed").trim();
}

export function describeNpmAuth(result) {
  if (result.status === 0) {
    return {
      name: "npm-auth",
      status: "ok",
      message: `Logged in to npm as ${result.stdout.trim()}.`,
    };
  }

  if (combinedOutput(result).includes("ENEEDAUTH")) {
    return {
      name: "npm-auth",
      status: "blocked",
      code: "npm_auth_required",
      message: "npm whoami returned ENEEDAUTH",
      fix: "Run npm adduser or npm login, then rerun npm run publish:check.",
    };
  }

  return {
    name: "npm-auth",
    status: "blocked",
    code: "npm_auth_unknown",
    message: trimmedError(result),
    fix: "Verify npm registry authentication, then rerun npm run publish:check.",
  };
}

export function describePackageName(result) {
  if (result.status === 0) {
    const version = JSON.parse(result.stdout);

    return {
      name: "package-name",
      status: "warning",
      code: "package_name_exists",
      message: `npm reports ${packageName} version ${version}. Verify package ownership before publishing.`,
    };
  }

  if (combinedOutput(result).includes("E404")) {
    return {
      name: "package-name",
      status: "ok",
      code: "package_name_available",
      message: "formctl is not published on npm yet.",
    };
  }

  return {
    name: "package-name",
    status: "blocked",
    code: "package_name_unknown",
    message: trimmedError(result),
    fix: "Verify npm registry access before publishing.",
  };
}

export function describePackDryRun(result) {
  if (result.status !== 0) {
    return {
      name: "pack-dry-run",
      status: "blocked",
      code: "pack_dry_run_failed",
      message: trimmedError(result),
      fix: "Fix npm pack errors before publishing.",
    };
  }

  const [pack] = JSON.parse(result.stdout);

  return {
    name: "pack-dry-run",
    status: "ok",
    filename: pack.filename,
    size: pack.size,
    entryCount: pack.entryCount,
    message: `npm pack --dry-run produced ${pack.filename}.`,
  };
}

export function createPublishReport(checks) {
  const blocked = checks.filter((check) => check.status === "blocked");

  return {
    status: blocked.length > 0 ? "blocked" : "ok",
    package: packageName,
    checks,
    nextAction: blocked.length > 0
      ? "Fix blocked checks before running npm publish."
      : "Run npm publish when you are ready to release.",
  };
}

function printTextReport(report) {
  process.stdout.write(`formctl publish check: ${report.status}\n`);
  for (const check of report.checks) {
    process.stdout.write(`- ${check.name}: ${check.status} - ${check.message}\n`);
    if (check.fix !== undefined) {
      process.stdout.write(`  fix: ${check.fix}\n`);
    }
  }
  process.stdout.write(`Next: ${report.nextAction}\n`);
}

function printReport({ json }) {
  const report = createPublishReport([
    describeNpmAuth(runCommandLine(npmAuthCommand)),
    describePackageName(runCommandLine(packageNameCommand)),
    describePackDryRun(runCommandLine(packDryRunCommand)),
  ]);

  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printTextReport(report);
  }

  return report.status === "ok" ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = printReport({ json: process.argv.includes("--json") });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
