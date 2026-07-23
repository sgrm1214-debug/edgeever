import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "..");
const readRepositoryFile = (path: string) => readFileSync(resolve(repositoryRoot, path), "utf8");

describe("Cloudflare deployment entrypoints", () => {
  test("all entrypoints converge on the common deployment pipeline", () => {
    const packageJson = JSON.parse(readRepositoryFile("package.json"));
    const scripts = packageJson.scripts as Record<string, string>;

    expect(scripts.deploy).toContain("bun run build:cloudflare");
    expect(scripts.deploy).toContain("EDGE_EVER_USE_EXISTING_AUTH_SECRET=true");
    expect(scripts.deploy).toContain("deploy:ci");
    expect(scripts["deploy:manual"]).toBe(
      "bun run deploy:doctor && bun run build:cloudflare && bun run deploy:ci",
    );
    expect(scripts["deploy:ci"]).toBe(
      "bun run db:migrate:remote && bun run deploy:worker && bun run deploy:verify",
    );
    expect(scripts["deploy:cloudflare-builds"]).toBe("bun run deploy:ci");
  });

  test("one-click deployment declares the required authentication Secret", () => {
    const example = readRepositoryFile(".dev.vars.example");
    expect(example).toMatch(/^EDGE_EVER_AUTH_PASSWORD=\s*$/m);

    const packageJson = JSON.parse(readRepositoryFile("package.json"));
    expect(packageJson.cloudflare.bindings.EDGE_EVER_AUTH_PASSWORD.description).toBeTruthy();
  });

  test("deployed repositories receive guarded daily upstream updates", () => {
    const workflow = readRepositoryFile(".github/workflows/sync-edgeever-upstream.yml");

    expect(workflow).toContain("github.repository != 'tianma-if/edgeever'");
    expect(workflow).toContain("UPSTREAM_REPOSITORY: tianma-if/edgeever");
    expect(workflow).toContain("EDGE_EVER_UPDATE_CHANNEL");
    expect(workflow).toContain("stable)");
    expect(workflow).toContain("edge)");
    expect(workflow).toContain("bun run db:migrate:local");
    expect(workflow).toContain("bun test");
    expect(workflow).toContain("git push origin HEAD:main");
  });
});
