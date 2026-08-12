import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  deploymentPrompts,
  manualDeploymentCopy,
} from "../apps/site/src/deployment-prompts";
import { decideUpstreamSync } from "../scripts/upstream-sync-plan.mjs";

const repositoryRoot = resolve(import.meta.dir, "..");
const readRepositoryFile = (path: string) => readFileSync(resolve(repositoryRoot, path), "utf8");
const extractTextPrompt = (document: string, sectionHeading: string) => {
  const sectionStart = document.indexOf(sectionHeading);
  if (sectionStart === -1) throw new Error(`Missing deployment section: ${sectionHeading}`);
  const match = document.slice(sectionStart).match(/```text\n([\s\S]*?)\n```/);
  if (!match?.[1]) throw new Error(`Missing deployment prompt after: ${sectionHeading}`);
  return match[1];
};
const extractSection = (document: string, sectionHeading: string) => {
  const sectionStart = document.indexOf(sectionHeading);
  if (sectionStart === -1) throw new Error(`Missing section: ${sectionHeading}`);
  const sectionEnd = document.indexOf("\n---", sectionStart);
  return document.slice(sectionStart, sectionEnd === -1 ? undefined : sectionEnd);
};
const normalizeMarkdownCopy = (value: string) =>
  value.replace(/[`*]/g, "").replace(/\s+/g, " ").trim();

describe("Cloudflare deployment entrypoints", () => {
  test("all entrypoints converge on the common deployment pipeline", () => {
    const packageJson = JSON.parse(readRepositoryFile("package.json"));
    const scripts = packageJson.scripts as Record<string, string>;

    expect(scripts.deploy).toContain("bun run build:cloudflare");
    expect(scripts.deploy).toContain("EDGE_EVER_USE_EXISTING_AUTH_SECRET=true");
    expect(scripts.deploy).toContain("deploy:ci");
    expect(scripts["deploy:manual"]).toBe(
      "export EDGE_EVER_DEPLOYMENT_TRIGGER=manual EDGE_EVER_DEPLOYMENT_METHOD=local_cli && bun run deploy:doctor && bun run build:cloudflare && bun run deploy:ci",
    );
    expect(scripts["deploy:ci"]).toBe(
      "bun run db:migrate:remote && bun run deploy:worker && bun run deploy:verify",
    );
    expect(scripts["deploy:cloudflare-builds"]).toBe("bun run deploy:ci");
  });

  test("online deployment declares the required authentication Secret", () => {
    const example = readRepositoryFile(".dev.vars.example");
    expect(example).toMatch(/^EDGE_EVER_AUTH_PASSWORD=\s*$/m);

    const packageJson = JSON.parse(readRepositoryFile("package.json"));
    expect(packageJson.cloudflare.bindings.EDGE_EVER_AUTH_PASSWORD.description).toBeTruthy();
  });

  test("online deployment resolves the D1 id without editing the repository config", () => {
    const runner = readRepositoryFile("scripts/run-wrangler.mjs");
    const englishAgentDoc = readRepositoryFile("docs/agent-deploy-cloudflare.md");
    const chineseAgentDoc = readRepositoryFile("docs/agent-deploy-cloudflare.zh-CN.md");

    expect(runner).toContain('"d1", "list", "--json"');
    expect(runner).toContain("findD1DatabaseIdByName");
    expect(englishAgentDoc).toContain("automatically resolves the D1 UUID");
    expect(chineseAgentDoc).toContain("自动查询 D1 UUID");
  });

  test("keeps D1 resolver diagnostics out of Wrangler JSON stdout", () => {
    const workingDirectory = mkdtempSync(resolve(tmpdir(), "edgeever-wrangler-output-"));
    const wranglerBinDirectory = resolve(
      workingDirectory,
      "node_modules",
      "wrangler",
      "bin",
    );
    const queryOutput = JSON.stringify([{ results: [{ name: "users" }] }]);
    const inheritedEnvironment = Object.fromEntries(
      ["PATH", "Path", "PATHEXT", "SystemRoot", "ComSpec", "TEMP", "TMP"]
        .map((name) => [name, process.env[name]])
        .filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
    const environment = {
      ...inheritedEnvironment,
      EDGE_EVER_INSTANCE: "",
      WRANGLER_CONFIG: resolve(workingDirectory, "wrangler.toml"),
    };

    try {
      mkdirSync(wranglerBinDirectory, { recursive: true });
      writeFileSync(
        resolve(workingDirectory, "wrangler.toml"),
        [
          'name = "edgeever"',
          'database_name = "edgeever"',
          'database_id = "00000000-0000-0000-0000-000000000000"',
          'bucket_name = "edgeever-resources"',
          'preview_bucket_name = "edgeever-resources-preview"',
          'migrations_dir = "migrations"',
          "",
        ].join("\n"),
      );
      writeFileSync(
        resolve(wranglerBinDirectory, "wrangler.js"),
        [
          'const args = process.argv.slice(2);',
          'if (args.includes("list")) {',
          '  process.stdout.write(JSON.stringify([{ name: "edgeever", uuid: "11111111-1111-1111-1111-111111111111" }]));',
          "} else {",
          `  process.stdout.write(${JSON.stringify(`${queryOutput}\n`)});`,
          "}",
          "",
        ].join("\n"),
      );

      const resultPath = resolve(workingDirectory, "result.json");
      const runnerArguments = [
        "d1",
        "execute",
        "DB",
        "--remote",
        "--command",
        "SELECT name FROM sqlite_master",
        "--json",
      ];
      const harness = spawnSync(
        "node",
        [
          "-e",
          [
            'const { spawnSync } = require("node:child_process");',
            'const { writeFileSync } = require("node:fs");',
            "const result = spawnSync(",
            "  process.env.EDGE_TEST_RUNTIME,",
            "  [process.env.EDGE_TEST_RUNNER, ...JSON.parse(process.env.EDGE_TEST_ARGUMENTS)],",
            '  { cwd: process.env.EDGE_TEST_CWD, encoding: "utf8", env: process.env },',
            ");",
            "writeFileSync(process.env.EDGE_TEST_RESULT, JSON.stringify({",
            "  status: result.status,",
            "  stdout: result.stdout,",
            "  stderr: result.stderr,",
            "  error: result.error?.message,",
            "}));",
          ].join("\n"),
        ],
        {
          env: {
            ...environment,
            EDGE_TEST_ARGUMENTS: JSON.stringify(runnerArguments),
            EDGE_TEST_CWD: workingDirectory,
            EDGE_TEST_RESULT: resultPath,
            EDGE_TEST_RUNNER: resolve(repositoryRoot, "scripts", "run-wrangler.mjs"),
            EDGE_TEST_RUNTIME: process.execPath,
          },
        },
      );
      expect(harness.status).toBe(0);
      const result = JSON.parse(readFileSync(resultPath, "utf8")) as {
        error?: string;
        status: number;
        stderr: string;
        stdout: string;
      };

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(`${queryOutput}\n`);
      expect(result.stderr).toContain("[info] resolving Cloudflare D1 database id for edgeever");
      expect(result.stderr).toContain("[ok] resolved D1 database edgeever");
    } finally {
      rmSync(workingDirectory, { force: true, recursive: true });
    }
  });

  test("deployed repositories receive guarded daily upstream updates", () => {
    const workflow = readRepositoryFile(".github/workflows/sync-edgeever-upstream.yml");
    const bunConfig = readRepositoryFile("bunfig.toml");
    const packageJson = JSON.parse(readRepositoryFile("package.json"));
    const scripts = packageJson.scripts as Record<string, string>;

    expect(workflow).toContain("github.repository != 'tianma-if/edgeever'");
    expect(workflow).toContain("UPSTREAM_REPOSITORY: tianma-if/edgeever");
    expect(workflow).toContain("Require a GitHub Fork");
    expect(workflow).toContain(".fork");
    expect(workflow).toContain("EDGE_EVER_UPDATE_CHANNEL");
    expect(workflow).toContain("stable)");
    expect(workflow).toContain("edge)");
    expect(workflow).toContain("force_redeploy");
    expect(workflow).toContain("bun run db:migrate:local");
    expect(bunConfig).toContain('pathIgnorePatterns = ["tests/e2e/**"]');
    expect(scripts.test).toBe("bun test --path-ignore-patterns='tests/e2e/**'");
    expect(workflow).toContain(scripts.test);
    expect(workflow.match(/if: steps\.upstream\.outputs\.align_mode == 'merge'/g)).toHaveLength(2);
    expect(workflow).toContain("git push origin HEAD:main");
    expect(workflow).toContain("git push --force-with-lease origin HEAD:main");
    expect(workflow).toContain('if [ "${REASON}" = "behind_target" ]');
    expect(workflow).toContain("mode=fast_forward");
    expect(workflow).toContain("git reset --hard");
    expect(workflow).toContain("content_matches_target");
    expect(workflow).toContain("already_on_target");
    expect(workflow).toContain("fork_mode=mirror");
    expect(workflow).toContain("GITHUB_STEP_SUMMARY");
    expect(workflow).toContain("EDGE_EVER_CLOUDFLARE_DEPLOY_HOOK_URL");
    expect(workflow).toContain("EDGE_EVER_PRESERVE_FORK_CHANGES");
    expect(workflow).toContain("PRESERVE_FORK_CHANGES");
    expect(workflow).not.toContain("upstream_merge_base");
    expect(workflow).not.toContain("local_app_changes");
    expect(workflow).toContain("scripts/upstream-sync-plan.mjs");
    expect(workflow).toContain("Prefer this workflow over GitHub **Sync fork**");
  });

  test("forks skip every workflow job except upstream updates", () => {
    const workflowsDirectory = resolve(repositoryRoot, ".github/workflows");
    const workflowFiles = readdirSync(workflowsDirectory)
      .filter((file) => /\.ya?ml$/.test(file))
      .filter((file) => file !== "sync-edgeever-upstream.yml");

    for (const file of workflowFiles) {
      const workflow = readRepositoryFile(`.github/workflows/${file}`);
      const jobs = workflow.slice(workflow.indexOf("\njobs:\n") + "\njobs:\n".length);
      const jobStarts = [...jobs.matchAll(/^  ([A-Za-z0-9_-]+):\s*$/gm)];

      expect(jobStarts.length).toBeGreaterThan(0);
      for (const [index, match] of jobStarts.entries()) {
        const nextJob = jobStarts[index + 1];
        const job = jobs.slice(match.index, nextJob?.index);
        expect(job).toContain("github.repository == 'tianma-if/edgeever'");
      }
    }
  });

  test("keeps a forced-redeploy commit on the deploy-mirror update path", () => {
    expect(
      decideUpstreamSync({
        contentMatchesTarget: false,
        forceRedeploy: false,
        headEqualsTarget: false,
        headIsAncestorOfTarget: false,
        preserveForkChanges: false,
        targetIsAncestorOfHead: false,
      }),
    ).toEqual({
      alignMode: "reset",
      reason: "deploy_mirror_reset",
      republishOnly: false,
      updateRequired: true,
    });
  });

  test("resets a deploy mirror that moved ahead of the stable release", () => {
    expect(
      decideUpstreamSync({
        contentMatchesTarget: false,
        forceRedeploy: false,
        headEqualsTarget: false,
        headIsAncestorOfTarget: false,
        preserveForkChanges: false,
        targetIsAncestorOfHead: true,
      }),
    ).toEqual({
      alignMode: "reset",
      reason: "deploy_mirror_ahead",
      republishOnly: false,
      updateRequired: true,
    });
  });

  test("preserves changes only when a customized fork explicitly opts in", () => {
    expect(
      decideUpstreamSync({
        contentMatchesTarget: false,
        forceRedeploy: false,
        headEqualsTarget: false,
        headIsAncestorOfTarget: false,
        preserveForkChanges: true,
        targetIsAncestorOfHead: true,
      }),
    ).toEqual({
      alignMode: "none",
      reason: "customized_contains_target",
      republishOnly: false,
      updateRequired: false,
    });
  });

  test("merges a diverged customized fork only after explicit opt-in", () => {
    expect(
      decideUpstreamSync({
        contentMatchesTarget: false,
        forceRedeploy: false,
        headEqualsTarget: false,
        headIsAncestorOfTarget: false,
        preserveForkChanges: true,
        targetIsAncestorOfHead: false,
      }),
    ).toEqual({
      alignMode: "merge",
      reason: "customized_merge",
      republishOnly: false,
      updateRequired: true,
    });
  });

  test("public deployment documentation exposes only Fork and Agent paths", () => {
    const englishReadme = readRepositoryFile("README.md");
    const chineseReadme = readRepositoryFile("README.zh-CN.md");

    expect(englishReadme).not.toContain("deploy.workers.cloudflare.com");
    expect(englishReadme).not.toContain("Option C: Manual Deployment");
    expect(englishReadme).toContain("Fork https://github.com/tianma-if/edgeever");
    expect(chineseReadme).not.toContain("deploy.workers.cloudflare.com");
    expect(chineseReadme).not.toContain("方案 C：手动部署");
    expect(chineseReadme).toContain("Fork https://github.com/tianma-if/edgeever");
  });

  test("product site deployment prompts mirror the root READMEs", () => {
    const englishReadme = readRepositoryFile("README.md");
    const chineseReadme = readRepositoryFile("README.zh-CN.md");
    const siteDeploymentComponent = readRepositoryFile(
      "apps/site/src/components/agent-install-tabs.astro",
    );

    expect(deploymentPrompts["en-US"]).toBe(
      extractTextPrompt(englishReadme, "### Option A: Deploy with an AI Agent (Recommended)"),
    );
    expect(deploymentPrompts["zh-CN"]).toBe(
      extractTextPrompt(chineseReadme, "### 方案一：AI Agent 一键部署（推荐）"),
    );
    expect(siteDeploymentComponent).toContain('deploymentPrompts["en-US"]');
    expect(siteDeploymentComponent).toContain('deploymentPrompts["zh-CN"]');
    expect(siteDeploymentComponent).toContain('manualDeploymentCopy["en-US"]');
    expect(siteDeploymentComponent).toContain('manualDeploymentCopy["zh-CN"]');

    for (const [locale, readme, heading, separator] of [
      ["en-US", englishReadme, "### Option B: Manual Online Deployment", ": "],
      ["zh-CN", chineseReadme, "### 方案二：手动在线部署", "："],
    ] as const) {
      const section = normalizeMarkdownCopy(extractSection(readme, heading));
      const manualCopy = manualDeploymentCopy[locale];
      expect(section).toContain(manualCopy.intro);
      manualCopy.steps.forEach((step, index) => {
        expect(section).toContain(
          normalizeMarkdownCopy(`${index + 1}. ${step.title}${separator}${step.body}`),
        );
      });
    }
  });

  test("AI Agent deployment remains fully online", () => {
    const englishAgentDoc = readRepositoryFile("docs/agent-deploy-cloudflare.md");
    const chineseAgentDoc = readRepositoryFile("docs/agent-deploy-cloudflare.zh-CN.md");

    expect(englishAgentDoc).toContain("Workers & Pages");
    expect(englishAgentDoc).toContain("Update deployed EdgeEver");
    expect(englishAgentDoc).toContain("deployment mirror by default");
    expect(englishAgentDoc).toContain("EDGE_EVER_PRESERVE_FORK_CHANGES");
    expect(englishAgentDoc).not.toContain("bun run deploy:manual");
    expect(englishAgentDoc).not.toContain("deploy:setup");
    expect(englishAgentDoc).not.toContain(".env.local");
    expect(chineseAgentDoc).toContain("Workers & Pages");
    expect(chineseAgentDoc).toContain("默认作为部署镜像");
    expect(chineseAgentDoc).toContain("EDGE_EVER_PRESERVE_FORK_CHANGES");
    expect(chineseAgentDoc).not.toContain("bun run deploy:manual");
    expect(chineseAgentDoc).not.toContain("bun run deploy:manual");
  });
});
