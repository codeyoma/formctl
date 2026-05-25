type BrowserCommand = "record" | "submit";

export function resolveBrowserHeadless({
  command,
  flags,
  isDryRun,
}: {
  command: BrowserCommand;
  flags: Set<string>;
  isDryRun: boolean;
}): boolean {
  if (flags.has("--headless")) {
    return true;
  }

  if (flags.has("--headed")) {
    return false;
  }

  return command === "submit" && isDryRun;
}
