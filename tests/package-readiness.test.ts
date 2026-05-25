import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("npm package readiness", () => {
  test("package metadata exposes a built formctl binary", () => {
    const packageJson = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));

    expect(packageJson.bin).toEqual({
      formctl: "dist/cli.js",
      "formctl-mcp": "dist/mcp.js",
    });
    expect(packageJson.files).toEqual([
      "dist",
      "demo",
      "docs",
      "README.md",
      "LICENSE",
      "CHANGELOG.md",
    ]);
    expect(packageJson.scripts.build).toBe("tsc -p tsconfig.build.json");
    expect(packageJson.scripts.prepack).toBe("npm run build");
  });

  test("build config emits only runtime source into dist", () => {
    const buildConfigPath = path.join(projectRoot, "tsconfig.build.json");
    const buildConfig = JSON.parse(readFileSync(buildConfigPath, "utf8"));

    expect(buildConfig.extends).toBe("./tsconfig.json");
    expect(buildConfig.compilerOptions).toMatchObject({
      rootDir: "src",
      outDir: "dist",
      noEmit: false,
    });
    expect(buildConfig.include).toEqual(["src/**/*.ts"]);
    expect(buildConfig.exclude).toContain("tests/**/*.ts");
  });

  test("README documents npm install and npx smoke commands", () => {
    const readme = readFileSync(path.join(projectRoot, "README.md"), "utf8");

    expect(readme).toContain("## Install");
    expect(readme).toContain("npm install -g formctl");
    expect(readme).toContain("npx formctl doctor");
    expect(readme).toContain("npx formctl --help");
  });

  test("source CLI has a node shebang for the compiled npm binary", () => {
    const cliSource = readFileSync(path.join(projectRoot, "src", "cli.ts"), "utf8");

    expect(cliSource.startsWith("#!/usr/bin/env node\n")).toBe(true);
    expect(existsSync(path.join(projectRoot, "tsconfig.json"))).toBe(true);
  });
});
