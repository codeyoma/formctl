#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const githubCommand = "gh api repos/codeyoma/formctl";
const npmCommand = "npm view formctl version --json";
const defaultNextAction = "Post one example-led outreach message";

function run(commandLine) {
  const [command, ...args] = commandLine.split(" ");

  return spawnSync(command, args, {
    encoding: "utf8",
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function parseArgs(args) {
  const options = {
    format: "markdown",
    date: today(),
    nextAction: defaultNextAction,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      options.format = "json";
    } else if (arg === "--markdown") {
      options.format = "markdown";
    } else if (arg === "--date") {
      options.date = args[index + 1] ?? options.date;
      index += 1;
    } else if (arg === "--next-action") {
      options.nextAction = args[index + 1] ?? options.nextAction;
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function parseGithubRepo(stdout) {
  const repo = JSON.parse(stdout);

  return {
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    openIssues: repo.open_issues_count,
  };
}

function describeNpmStatus(result) {
  const output = `${result.stdout}\n${result.stderr}`;

  if (result.status === 0) {
    const version = JSON.parse(result.stdout);
    return `Published: ${version}`;
  }

  if (output.includes("E404")) {
    return "Not published: `npm view formctl` returns `E404`";
  }

  return `Unknown: ${result.stderr.trim() || "npm view failed"}`;
}

export function formatMarkdownRow(snapshot) {
  return `| ${snapshot.date} | ${snapshot.stars} | ${snapshot.forks} | ${snapshot.openIssues} | ${snapshot.npmDownloads} | ${snapshot.demoViews} | ${snapshot.workflowLeads} | ${snapshot.nextAction} |`;
}

export function createSnapshot({ date, github, npmDownloads, nextAction }) {
  return {
    date,
    githubRepository: "codeyoma/formctl",
    stars: github.stars,
    forks: github.forks,
    openIssues: github.openIssues,
    npmDownloads,
    demoViews: "Not measured",
    workflowLeads: 0,
    nextAction,
  };
}

function printSnapshot(options) {
  const githubResult = run(githubCommand);
  if (githubResult.status !== 0) {
    throw new Error(`GitHub metrics failed: ${githubResult.stderr.trim()}`);
  }

  const npmResult = run(npmCommand);
  const snapshot = createSnapshot({
    date: options.date,
    github: parseGithubRepo(githubResult.stdout),
    npmDownloads: describeNpmStatus(npmResult),
    nextAction: options.nextAction,
  });

  if (options.format === "json") {
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatMarkdownRow(snapshot)}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    printSnapshot(parseArgs(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
