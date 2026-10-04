import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Script } from "node:vm";
import { fileURLToPath } from "node:url";
import { build } from "vite";

test("the injected page capture is a standalone classic script", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "edgeever-capture-"));
  try {
    await build({
      configFile: fileURLToPath(new URL("./vite.config.ts", import.meta.url)),
      logLevel: "silent",
      build: { outDir },
    });

    const capture = await readFile(join(outDir, "assets/capture.js"), "utf8");
    expect(() => new Script(capture)).not.toThrow();
    expect(capture).toContain("capturedPage");
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
