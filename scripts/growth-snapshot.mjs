#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const githubCommand = "gh api repos/codeyoma/formctl";
const githubDiscussionsCommand = "gh api graphql";
const discussionsQuery = "query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { discussions(first: 1) { totalCount } } }";
const npmCommand = "npm view formctl version --json";
const defaultNextAction = "Post one example-led outreach message";

function run(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8",
  });
}

function runCommandLine(commandLine) {
  const [command, ...args] = commandLine.split(" ");

  return run(command, args);
}

function defaultTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function formatDateForTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function parseArgs(args) {
  const options = {
    demoViews: "Not measured",
    format: "markdown",
    date: undefined,
    nextAction: defaultNextAction,
    timezone: defaultTimeZone(),
    workflowLeads: 0,
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
    } else if (arg === "--timezone") {
      options.timezone = args[index + 1] ?? options.timezone;
      index += 1;
    } else if (arg === "--demo-views") {
      options.demoViews = args[index + 1] ?? options.demoViews;
      index += 1;
    } else if (arg === "--workflow-leads") {
      options.workflowLeads = Number.parseInt(args[index + 1] ?? `${options.workflowLeads}`, 10);
      index += 1;
    } else if (arg === "--next-action") {
      options.nextAction = args[index + 1] ?? options.nextAction;
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  options.date ??= formatDateForTimeZone(new Date(), options.timezone);

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

function parseGithubDiscussions(stdout) {
  const response = JSON.parse(stdout);

  return response.data.repository.discussions.totalCount;
}

function fetchGithubDiscussions() {
  const [command, ...args] = githubDiscussionsCommand.split(" ");
  const result = run(command, [
    ...args,
    "-F",
    "owner=codeyoma",
    "-F",
    "name=formctl",
    "-f",
    `query=${discussionsQuery}`,
  ]);

  if (result.status !== 0) {
    return 0;
  }

  return parseGithubDiscussions(result.stdout);
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
  return `| ${snapshot.date} | ${snapshot.stars} | ${snapshot.forks} | ${snapshot.openIssues} | ${snapshot.discussions} | ${snapshot.npmDownloads} | ${snapshot.demoViews} | ${snapshot.workflowLeads} | ${snapshot.nextAction} |`;
}

export function createSnapshot({ date, github, discussions, npmDownloads, demoViews, workflowLeads, nextAction }) {
  return {
    date,
    githubRepository: "codeyoma/formctl",
    stars: github.stars,
    forks: github.forks,
    openIssues: github.openIssues,
    discussions,
    npmDownloads,
    demoViews,
    workflowLeads,
    nextAction,
  };
}

function printSnapshot(options) {
  const githubResult = runCommandLine(githubCommand);
  if (githubResult.status !== 0) {
    throw new Error(`GitHub metrics failed: ${githubResult.stderr.trim()}`);
  }

  const npmResult = runCommandLine(npmCommand);
  const snapshot = createSnapshot({
    date: options.date,
    github: parseGithubRepo(githubResult.stdout),
    discussions: fetchGithubDiscussions(),
    npmDownloads: describeNpmStatus(npmResult),
    demoViews: options.demoViews,
    workflowLeads: options.workflowLeads,
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
