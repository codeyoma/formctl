import { describe, expect, test } from "vitest";
import { resolveBrowserHeadless } from "../src/browser-mode.js";

describe("browser mode resolution", () => {
  test("record defaults to headed while dry-run submit defaults to headless", () => {
    expect(resolveBrowserHeadless({
      command: "record",
      flags: new Set(),
      isDryRun: false,
    })).toBe(false);
    expect(resolveBrowserHeadless({
      command: "submit",
      flags: new Set(),
      isDryRun: true,
    })).toBe(true);
  });

  test("explicit headed and headless flags override command defaults", () => {
    expect(resolveBrowserHeadless({
      command: "record",
      flags: new Set(["--headless"]),
      isDryRun: false,
    })).toBe(true);
    expect(resolveBrowserHeadless({
      command: "submit",
      flags: new Set(["--headed"]),
      isDryRun: true,
    })).toBe(false);
    expect(resolveBrowserHeadless({
      command: "submit",
      flags: new Set(["--headless"]),
      isDryRun: false,
    })).toBe(true);
  });
});
