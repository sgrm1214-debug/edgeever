import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import {
  buildWranglerInvocation,
  buildWranglerEnvironment,
  buildWranglerSpawnOptions,
  isD1MigrationApplyCommand,
  normalizeD1MigrationSql,
  resolveWranglerCliPath,
  resolveWranglerRuntimeExecutable,
  runWranglerSync,
} from "../scripts/wrangler-runner.mjs";

describe("cross-platform Wrangler runner", () => {
  test("uses the installed JavaScript CLI instead of a platform shell shim", () => {
    const invocation = buildWranglerInvocation(["--version"], {
      cwd: process.cwd(),
      runtimeExecutable: process.execPath,
    });

    expect(invocation.executable).toBe(process.execPath);
    expect(invocation.args).toEqual([resolveWranglerCliPath(process.cwd()), "--version"]);
    expect(invocation.args[0]).toEndWith(["node_modules", "wrangler", "bin", "wrangler.js"].join(sep));
    expect(invocation.args[0]).not.toEndWith("wrangler.cmd");
  });

  test("runs the project-local Wrangler without a global installation", () => {
    const result = runWranglerSync(["--version"], { cwd: process.cwd(), encoding: "utf8" });

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^\d+\.\d+\.\d+/);
  });

  test("runs Wrangler with Node when the project command itself uses Bun", () => {
    expect(resolveWranglerRuntimeExecutable()).toBe(process.versions.bun ? "node" : process.execPath);
  });

  test("forces D1 migration apply into non-interactive CI mode", () => {
    const args = ["--config", "generated.toml", "d1", "migrations", "apply", "DB", "--remote"];

    expect(isD1MigrationApplyCommand(args)).toBe(true);
    expect(buildWranglerEnvironment(args, { EXISTING: "value" })).toMatchObject({
      EXISTING: "value",
      CI: "true",
    });
    expect(buildWranglerEnvironment(["d1", "migrations", "list", "DB"], {})).not.toHaveProperty("CI");
    expect(buildWranglerSpawnOptions(args, { stdio: "inherit" })).toEqual({
      input: "y\n",
      stdio: ["pipe", "inherit", "inherit"],
    });
  });

  test("normalizes Windows migration line endings for remote D1", () => {
    expect(normalizeD1MigrationSql("CREATE TABLE demo (id TEXT);\r\n\r\nSELECT 1;\r")).toBe(
      "CREATE TABLE demo (id TEXT);\n\nSELECT 1;\n",
    );
  });

  test("keeps every D1 trigger on one physical line for remote compatibility", () => {
    const migrationSql = ["0001_initial.sql", "0013_mobile_sync_changes.sql"]
      .map((file) => readFileSync(resolve("migrations", file), "utf8"))
      .join("\n");
    const triggerLines = migrationSql
      .split("\n")
      .filter((line) => line.startsWith("CREATE TRIGGER "));

    expect(triggerLines).toHaveLength(7);
    for (const triggerLine of triggerLines) {
      expect(triggerLine).toEndWith(" END;");
    }
  });
});
