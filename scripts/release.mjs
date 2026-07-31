import {
  createHash,
} from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { nativeReleaseAssetsReady } from "./check-native-release-assets.mjs";
import { planNativeRelease } from "./plan-native-release.mjs";

const DEFAULT_REPOSITORY = "tianma-if/edgeever";
const VERSION_BUMPS = new Set(["patch", "minor", "major"]);
const POLL_INTERVAL_MS = 10_000;
const RUN_DISCOVERY_TIMEOUT_MS = 60_000;
const RELEASE_WORKFLOWS = {
  desktop: "desktop-build.yml",
  mobile: "mobile-build.yml",
  demo: "deploy-demo.yml",
};

export const RELEASE_VALIDATIONS = [
  { label: "Web typecheck", args: ["run", "typecheck"] },
  { label: "Mobile typecheck", args: ["run", "typecheck:mobile"] },
  { label: "Web build", args: ["run", "build:web"] },
  {
    label: "Native release planning tests",
    args: [
      "test",
      "scripts/plan-native-release.test.mjs",
      "scripts/check-native-release-assets.test.mjs",
      "scripts/release.test.mjs",
      "scripts/validate-store-delivery.test.mjs",
      "scripts/store-delivery.test.mjs",
      "apps/web/src/lib/version-check.test.mjs",
      "apps/mobile/src/lib/mobile-release.test.ts",
    ],
  },
];

const usage = `Usage:
  bun run release -- \\
    --bump minor \\
    --issue-title "Release issue title" \\
    --label bug \\
    --change-en "English user-facing change" \\
    --change-zh "中文用户更新说明"

Repeat --change-en and --change-zh for multiple paired release bullets.

Options:
  --bump <level>            Required version bump: patch, minor, or major
  --repository <owner/name>  GitHub repository (default: ${DEFAULT_REPOSITORY})
  --issue-title <title>      Required umbrella Issue title
  --label <label>            Required Issue label; may be repeated
  --change-en <text>         Required English release bullet; may be repeated
  --change-zh <text>         Required Chinese release bullet; may be repeated
  --skip-install             Do not install the final DMG after publication
  --dry-run                  Print the plan and generated notes without mutations
  --help                     Show this help
`;

export const parseReleaseArgs = (argv) => {
  const options = {
    repository: DEFAULT_REPOSITORY,
    bump: "",
    issueTitle: "",
    labels: [],
    changesEn: [],
    changesZh: [],
    skipInstall: false,
    dryRun: false,
    help: false,
  };

  const valueOptions = new Map([
    ["--repository", "repository"],
    ["--bump", "bump"],
    ["--issue-title", "issueTitle"],
    ["--label", "labels"],
    ["--change-en", "changesEn"],
    ["--change-zh", "changesZh"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--skip-install") {
      options.skipInstall = true;
      continue;
    }
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (argument === "--help") {
      options.help = true;
      continue;
    }

    const key = valueOptions.get(argument);
    if (!key) {
      throw new Error(`Unknown option: ${argument}`);
    }
    const value = argv[index + 1]?.trim();
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value.`);
    }
    index += 1;
    if (Array.isArray(options[key])) {
      options[key].push(value);
    } else {
      options[key] = value;
    }
  }

  if (options.help) {
    return options;
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(options.repository)) {
    throw new Error("--repository must use owner/name format.");
  }
  if (!VERSION_BUMPS.has(options.bump)) {
    throw new Error("--bump must be patch, minor, or major.");
  }
  if (!options.issueTitle) {
    throw new Error("--issue-title is required.");
  }
  if (options.labels.length === 0) {
    throw new Error("At least one --label is required.");
  }
  if (options.changesEn.length === 0 || options.changesZh.length === 0) {
    throw new Error("At least one --change-en and --change-zh are required.");
  }
  if (options.changesEn.length !== options.changesZh.length) {
    throw new Error("--change-en and --change-zh must have the same count.");
  }
  return options;
};

export const nextVersion = (version, bump) => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Expected a stable X.Y.Z version, received: ${version}`);
  }
  if (!VERSION_BUMPS.has(bump)) {
    throw new Error(`Expected patch, minor, or major bump, received: ${bump}`);
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
};

export const buildReleaseTitle = (tag) => {
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) {
    throw new Error(`Expected a stable vX.Y.Z tag, received: ${tag}`);
  }
  return tag;
};

export const buildIssueBody = ({ changesEn, changesZh }) => [
  "## Summary",
  "",
  ...changesEn.map((change) => `- ${change}`),
  "",
  "## 中文说明",
  "",
  ...changesZh.map((change) => `- ${change}`),
  "",
  "## Acceptance criteria",
  "",
  "- Required type checks, Web build, and native release planning tests pass.",
  "- The Draft Release contains audited macOS arm64 and x64 DMGs and an Android arm64 APK.",
  "- Post-publication native asset audits pass.",
].join("\n");

export const buildReleaseNotes = ({
  changesEn,
  changesZh,
  issueNumber,
}) => [
  "## Key Changes",
  "",
  ...changesEn.map((change) => `- ${change}`),
  "",
  `Related Issue: #${issueNumber}`,
  "",
  "## 🇨🇳 中文说明 / Chinese Changelog",
  "",
  "## 主要更新",
  "",
  ...changesZh.map((change) => `- ${change}`),
  "",
  `关联 Issue：#${issueNumber}`,
  "",
].join("\n");

export const reusedAssetMatches = (previousAssets, currentAssets, name) => {
  const previous = previousAssets.find((asset) => asset.name === name);
  const current = currentAssets.find((asset) => asset.name === name);
  return Boolean(
    previous &&
    current &&
    previous.digest &&
    previous.digest === current.digest &&
    previous.size === current.size,
  );
};

export const selectPublishedDmg = (assets, arch = process.arch) => {
  if (!["arm64", "x64"].includes(arch)) {
    throw new Error(`Unsupported macOS architecture for installation: ${arch}.`);
  }
  const matches = assets.filter((asset) =>
    new RegExp(`^EdgeEver-(.+)-mac-${arch}\\.dmg$`).test(asset.name)
  );
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one macOS ${arch} DMG, found ${matches.length}.`);
  }
  const version = new RegExp(`^EdgeEver-(.+)-mac-${arch}\\.dmg$`).exec(matches[0].name)?.[1];
  if (!version || !matches[0].digest?.startsWith("sha256:")) {
    throw new Error("Published DMG is missing its version or SHA-256 digest.");
  }
  return { asset: matches[0], version };
};

const run = (executable, args, { capture = false, allowFailure = false } = {}) => {
  const result = spawnSync(executable, args, {
    cwd: resolve("."),
    encoding: "utf8",
    env: process.env,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.status !== 0 && !allowFailure) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(
      `${executable} ${args.join(" ")} exited with status ${result.status ?? 1}${detail ? `:\n${detail}` : ""}`,
    );
  }
  return capture ? String(result.stdout ?? "").trim() : result;
};

const ghJson = (args) => JSON.parse(run("gh", args, { capture: true }));
const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

export const runParallelValidations = async ({
  executable = process.execPath,
  validations = RELEASE_VALIDATIONS,
} = {}) => {
  console.log(`[release] running ${validations.length} validations in parallel`);
  const results = await Promise.all(
    validations.map(({ label, args }) => new Promise((resolveValidation) => {
      console.log(`[release] start: ${label}`);
      const child = spawn(executable, args, {
        cwd: resolve("."),
        env: process.env,
        stdio: "inherit",
      });
      child.on("error", (error) => resolveValidation({ label, error }));
      child.on("exit", (code, signal) => resolveValidation({ label, code, signal }));
    })),
  );
  const failures = results.filter((result) => result.error || result.code !== 0);
  if (failures.length > 0) {
    throw new Error(
      `Release validation failed: ${failures.map(({ label }) => label).join(", ")}`,
    );
  }
  console.log("[release] all parallel validations passed");
};

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

const changedFilesBetween = (baseRef, headRef) => run(
  "git",
  ["diff", "--name-only", `${baseRef}...${headRef}`],
  { capture: true },
).split("\n").filter(Boolean);

const assertReleasePreconditions = ({ repository, previousTag }) => {
  if (run("git", ["branch", "--show-current"], { capture: true }) !== "main") {
    throw new Error("Releases must run directly from the main branch.");
  }
  if (run("git", ["status", "--porcelain"], { capture: true })) {
    throw new Error("The working tree must be clean before starting a release.");
  }
  run("git", ["fetch", "origin", "main", "--tags"]);
  const [behind, ahead] = run(
    "git",
    ["rev-list", "--left-right", "--count", "origin/main...main"],
    { capture: true },
  ).split(/\s+/).map(Number);
  if (behind !== 0 || ahead !== 0) {
    throw new Error("main must exactly match origin/main before starting a release.");
  }
  if (run("gh", ["auth", "status"], { allowFailure: true }).status !== 0) {
    throw new Error("GitHub CLI authentication is required.");
  }
  run("git", ["rev-parse", "--verify", `${previousTag}^{commit}`], { capture: true });
  const remote = run("gh", ["repo", "view", repository, "--json", "nameWithOwner", "--jq", ".nameWithOwner"], { capture: true });
  if (remote !== repository) {
    throw new Error(`Unable to resolve repository ${repository}.`);
  }
};

const updateReleaseVersions = ({ nextVersion, desktopRebuild, mobileRebuild }) => {
  const changedPaths = ["package.json"];
  const rootPackage = readJson("package.json");
  rootPackage.version = nextVersion;
  writeJson("package.json", rootPackage);

  if (desktopRebuild) {
    const desktopPackage = readJson("apps/desktop/package.json");
    desktopPackage.version = nextVersion;
    writeJson("apps/desktop/package.json", desktopPackage);
    changedPaths.push("apps/desktop/package.json");
  }

  if (mobileRebuild) {
    const mobileConfig = readJson("apps/mobile/app.json");
    mobileConfig.expo.version = nextVersion;
    mobileConfig.expo.android.versionCode += 1;
    writeJson("apps/mobile/app.json", mobileConfig);
    changedPaths.push("apps/mobile/app.json");
  }
  return changedPaths;
};

const parseRunId = (output) => {
  const match = output.match(/\/actions\/runs\/(\d+)/);
  return match ? Number(match[1]) : null;
};

const waitForRun = async ({ repository, runId, label }) => {
  let lastStatus = "";
  while (true) {
    const runView = ghJson([
      "run",
      "view",
      String(runId),
      "--repo",
      repository,
      "--json",
      "status,conclusion,url,headSha",
    ]);
    const statusLabel = `${runView.status}${runView.conclusion ? `/${runView.conclusion}` : ""}`;
    if (statusLabel !== lastStatus) {
      console.log(`[release] ${label}: ${statusLabel} (${runView.url})`);
      lastStatus = statusLabel;
    }
    if (runView.status === "completed") {
      if (runView.conclusion !== "success") {
        throw new Error(`${label} failed: ${runView.url}`);
      }
      return runView;
    }
    await wait(POLL_INTERVAL_MS);
  }
};

const listWorkflowRuns = ({ repository, workflow, event }) => ghJson([
  "run",
  "list",
  "--repo",
  repository,
  "--workflow",
  workflow,
  "--event",
  event,
  "--limit",
  "20",
  "--json",
  "databaseId,displayTitle,headSha,createdAt,url,status,conclusion",
]);

const dispatchReleaseWorkflow = async ({
  repository,
  workflow,
  tag,
  headSha,
}) => {
  const existingRunIds = new Set(
    listWorkflowRuns({
      repository,
      workflow,
      event: "workflow_dispatch",
    }).map((candidate) => candidate.databaseId),
  );
  const dispatchedAt = Date.now();
  const output = run("gh", [
    "workflow",
    "run",
    workflow,
    "--repo",
    repository,
    "--ref",
    "main",
    "-f",
    `release_tag=${tag}`,
  ], { capture: true });
  const returnedRunId = parseRunId(output);
  if (returnedRunId) {
    return returnedRunId;
  }

  const deadline = Date.now() + RUN_DISCOVERY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const match = listWorkflowRuns({
      repository,
      workflow,
      event: "workflow_dispatch",
    }).find((candidate) =>
      !existingRunIds.has(candidate.databaseId) &&
      candidate.headSha === headSha &&
      Date.parse(candidate.createdAt) >= dispatchedAt - 5_000
    );
    if (match) {
      return match.databaseId;
    }
    await wait(2_000);
  }
  throw new Error(`Timed out discovering dispatched ${workflow} run for ${tag}.`);
};

const findReleaseRun = async ({
  repository,
  workflow,
  tag,
  headSha,
  publishedAfter,
}) => {
  const deadline = Date.now() + RUN_DISCOVERY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const runs = listWorkflowRuns({ repository, workflow, event: "release" });
    const match = runs.find((candidate) =>
      candidate.displayTitle === tag &&
      candidate.headSha === headSha &&
      Date.parse(candidate.createdAt) >= publishedAfter - 5_000
    );
    if (match) {
      return match;
    }
    await wait(2_000);
  }
  throw new Error(`Timed out discovering ${workflow} for ${tag}.`);
};

const assertDraftAssets = ({
  assets,
  previousAssets,
  tag,
  version,
  desktopRebuild,
  mobileRebuild,
}) => {
  const assetNames = assets.map((asset) => asset.name);
  if (!nativeReleaseAssetsReady({
    platform: "desktop",
    rebuild: desktopRebuild,
    currentTag: tag,
    desktopVersion: version,
    assetNames,
  })) {
    throw new Error("Draft Release desktop assets are incomplete or incompatible.");
  }
  if (!nativeReleaseAssetsReady({
    platform: "mobile",
    rebuild: mobileRebuild,
    currentTag: tag,
    assetNames,
  })) {
    throw new Error("Draft Release Android assets are incomplete or incompatible.");
  }

  if (!mobileRebuild) {
    const previousApk = previousAssets.find((asset) =>
      /^edgeever-android-v.*-arm64-v8a\.apk$/.test(asset.name)
    );
    if (!previousApk || !reusedAssetMatches(previousAssets, assets, previousApk.name)) {
      throw new Error("Reused Android APK filename, size, or checksum changed.");
    }
  }
  if (!desktopRebuild) {
    const previousDesktopNames = previousAssets
      .map((asset) => asset.name)
      .filter((name) =>
        /^EdgeEver-.*-mac-(?:arm64|x64)\.(?:dmg|zip)(?:\.blockmap)?$/.test(name) ||
        name === "latest-mac.yml"
      );
    if (
      previousDesktopNames.length !== 9 ||
      !previousDesktopNames.every((name) =>
        reusedAssetMatches(previousAssets, assets, name)
      )
    ) {
      throw new Error("Reused desktop asset filename, size, or checksum changed.");
    }
  }
};

const sha256File = (path) => new Promise((resolveHash, rejectHash) => {
  const hash = createHash("sha256");
  const stream = createReadStream(path);
  stream.on("error", rejectHash);
  stream.on("data", (chunk) => hash.update(chunk));
  stream.on("end", () => resolveHash(hash.digest("hex")));
});

export const installPublishedDmg = async ({ repository, tag, assets }) => {
  if (process.platform !== "darwin") {
    throw new Error("Final DMG installation requires macOS; use --skip-install elsewhere.");
  }
  const { asset: dmg, version: nativeVersion } = selectPublishedDmg(assets);

  const temporaryDirectory = mkdtempSync(join(tmpdir(), "edgeever-release-"));
  const mountDirectory = join(temporaryDirectory, "mount");
  const dmgPath = join(temporaryDirectory, dmg.name);
  mkdirSync(mountDirectory);
  let mounted = false;
  let backupPath = "";

  try {
    run("gh", [
      "release",
      "download",
      tag,
      "--repo",
      repository,
      "--pattern",
      dmg.name,
      "--dir",
      temporaryDirectory,
    ]);
    const digest = await sha256File(dmgPath);
    if (`sha256:${digest}` !== dmg.digest) {
      throw new Error(`Downloaded DMG checksum mismatch: ${digest}`);
    }

    run("hdiutil", [
      "attach",
      dmgPath,
      "-nobrowse",
      "-readonly",
      "-mountpoint",
      mountDirectory,
    ]);
    mounted = true;
    const sourceApp = join(mountDirectory, "EdgeEver.app");
    if (!existsSync(sourceApp)) {
      throw new Error("Mounted DMG does not contain EdgeEver.app.");
    }

    run("osascript", ["-e", 'tell application "EdgeEver" to quit'], { allowFailure: true });
    await wait(2_000);
    const installedApp = "/Applications/EdgeEver.app";
    if (existsSync(installedApp)) {
      const trashDirectory = join(process.env.HOME || "", ".Trash");
      if (!trashDirectory.startsWith(`${sep}Users${sep}`)) {
        throw new Error("Could not resolve a safe Trash directory for the previous app.");
      }
      backupPath = join(trashDirectory, `EdgeEver.app.pre-${tag}`);
      if (existsSync(backupPath)) {
        backupPath = `${backupPath}.${Date.now()}`;
      }
      renameSync(installedApp, backupPath);
    }
    try {
      run("ditto", [sourceApp, installedApp]);
      const installedVersion = run(
        "defaults",
        ["read", join(installedApp, "Contents/Info.plist"), "CFBundleShortVersionString"],
        { capture: true },
      );
      if (installedVersion !== nativeVersion) {
        throw new Error(
          `Installed app version is ${installedVersion}, expected reused native version ${nativeVersion}.`,
        );
      }
      run("codesign", ["--verify", "--deep", "--strict", installedApp]);
    } catch (error) {
      if (existsSync(installedApp) && backupPath) {
        renameSync(installedApp, `${backupPath}.failed-${Date.now()}`);
      }
      if (backupPath && existsSync(backupPath)) {
        renameSync(backupPath, installedApp);
      }
      throw error;
    }
    run("open", ["-a", installedApp]);
    console.log(
      `[release] installed and launched EdgeEver ${nativeVersion} from ${tag}`,
    );
    if (backupPath) {
      console.log(`[release] previous app backup: ${backupPath}`);
    }
  } finally {
    if (mounted) {
      run("hdiutil", ["detach", mountDirectory], { allowFailure: true });
    }
    if (temporaryDirectory.startsWith(`${tmpdir()}${sep}edgeever-release-`)) {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }
};

export const installReleaseDmg = async ({ repository, tag }) => {
  const published = ghJson([
    "release",
    "view",
    tag,
    "--repo",
    repository,
    "--json",
    "assets",
  ]);
  await installPublishedDmg({ repository, tag, assets: published.assets });
};

const releaseMain = async (options) => {
  const latestRelease = ghJson([
    "api",
    `repos/${options.repository}/releases/latest`,
    "--jq",
    "{tagName:.tag_name,assets:[.assets[]|{name,size,digest}]}",
  ]);
  const previousTag = latestRelease.tagName;
  assertReleasePreconditions({ repository: options.repository, previousTag });

  const rootPackage = readJson("package.json");
  const previousVersion = previousTag.replace(/^v/, "");
  const expectedNextVersion = nextVersion(previousVersion, options.bump);
  const headShaBeforeRelease = run("git", ["rev-parse", "HEAD"], { capture: true });
  let resumedDraft = null;
  if (rootPackage.version === expectedNextVersion) {
    const draftCandidate = ghJson([
      "release",
      "view",
      `v${rootPackage.version}`,
      "--repo",
      options.repository,
      "--json",
      "tagName,isDraft,isPrerelease,targetCommitish,body,assets,url",
    ]);
    if (
      !draftCandidate.isDraft ||
      draftCandidate.isPrerelease ||
      draftCandidate.targetCommitish !== headShaBeforeRelease
    ) {
      throw new Error(
        `${draftCandidate.tagName} exists but is not a compatible Draft for the current HEAD.`,
      );
    }
    resumedDraft = draftCandidate;
  } else if (rootPackage.version !== previousVersion) {
    throw new Error(
      `package.json version ${rootPackage.version} must match ${previousVersion}, or ${expectedNextVersion} with a resumable Draft.`,
    );
  }
  const releaseVersion = resumedDraft ? rootPackage.version : expectedNextVersion;
  const tag = `v${releaseVersion}`;
  const changedFiles = changedFilesBetween(previousTag, headShaBeforeRelease);
  if (changedFiles.length === 0) {
    throw new Error(`There are no committed changes after ${previousTag}.`);
  }
  const desktopPlan = planNativeRelease("desktop", changedFiles);
  const mobilePlan = planNativeRelease("mobile", changedFiles);

  console.log(`[release] ${previousTag} -> ${tag}`);
  console.log(`[release] desktop: ${desktopPlan.rebuild ? "rebuild" : "reuse"}`);
  console.log(`[release] Android: ${mobilePlan.rebuild ? "rebuild" : "reuse"}`);

  if (options.dryRun) {
    console.log(buildReleaseNotes({
      changesEn: options.changesEn,
      changesZh: options.changesZh,
      issueNumber: 0,
    }));
    return;
  }

  let issueNumber;
  let releaseSha;
  if (resumedDraft) {
    const issueMatch = resumedDraft.body.match(/Related Issue: #(\d+)/);
    if (!issueMatch) {
      throw new Error(`${tag} Draft notes do not contain a Related Issue number.`);
    }
    issueNumber = Number(issueMatch[1]);
    releaseSha = headShaBeforeRelease;
    console.log(`[release] resuming existing Draft: ${resumedDraft.url}`);
  } else {
    await runParallelValidations();

    const issueUrl = run("gh", [
      "issue",
      "create",
      "--repo",
      options.repository,
      "--title",
      options.issueTitle,
      ...options.labels.flatMap((label) => ["--label", label]),
      "--body",
      buildIssueBody(options),
    ], { capture: true });
    const issueMatch = issueUrl.match(/\/issues\/(\d+)/);
    if (!issueMatch) {
      throw new Error(`Could not parse created Issue URL: ${issueUrl}`);
    }
    issueNumber = Number(issueMatch[1]);
    console.log(`[release] created Issue #${issueNumber}: ${issueUrl}`);

    const versionPaths = updateReleaseVersions({
      nextVersion: releaseVersion,
      desktopRebuild: desktopPlan.rebuild,
      mobileRebuild: mobilePlan.rebuild,
    });
    run("git", ["add", ...versionPaths]);
    run("git", ["diff", "--cached", "--check"]);
    run("git", ["commit", "-m", `chore: release ${tag} [skip ci]`]);
    run("git", ["push", "origin", "main"]);
    releaseSha = run("git", ["rev-parse", "HEAD"], { capture: true });

    const notes = buildReleaseNotes({
      changesEn: options.changesEn,
      changesZh: options.changesZh,
      issueNumber,
    });
    const draftUrl = run("gh", [
      "release",
      "create",
      tag,
      "--repo",
      options.repository,
      "--target",
      releaseSha,
      "--title",
      buildReleaseTitle(tag),
      "--draft",
      "--notes",
      notes,
    ], { capture: true });
    console.log(`[release] Draft created: ${draftUrl}`);
  }

  const [desktopRunId, mobileRunId] = await Promise.all([
    dispatchReleaseWorkflow({
      repository: options.repository,
      workflow: RELEASE_WORKFLOWS.desktop,
      tag,
      headSha: releaseSha,
    }),
    dispatchReleaseWorkflow({
      repository: options.repository,
      workflow: RELEASE_WORKFLOWS.mobile,
      tag,
      headSha: releaseSha,
    }),
  ]);
  await Promise.all([
    waitForRun({
      repository: options.repository,
      runId: desktopRunId,
      label: "Draft desktop assets",
    }),
    waitForRun({
      repository: options.repository,
      runId: mobileRunId,
      label: "Draft Android assets",
    }),
  ]);

  const draft = ghJson([
    "release",
    "view",
    tag,
    "--repo",
    options.repository,
    "--json",
    "isDraft,isPrerelease,targetCommitish,body,assets",
  ]);
  if (!draft.isDraft || draft.isPrerelease || draft.targetCommitish !== releaseSha) {
    throw new Error("Draft Release metadata does not match the release commit.");
  }
  if (draft.body.includes("\\n")) {
    throw new Error("Release notes contain a literal \\\\n sequence.");
  }
  assertDraftAssets({
    assets: draft.assets,
    previousAssets: latestRelease.assets,
    tag,
    version: releaseVersion,
    desktopRebuild: desktopPlan.rebuild,
    mobileRebuild: mobilePlan.rebuild,
  });

  const publishedAt = Date.now();
  const releaseUrl = run("gh", [
    "release",
    "edit",
    tag,
    "--repo",
    options.repository,
    "--draft=false",
    "--latest",
  ], { capture: true });
  console.log(`[release] published: ${releaseUrl}`);

  const [desktopAudit, mobileAudit] = await Promise.all([
    findReleaseRun({
      repository: options.repository,
      workflow: RELEASE_WORKFLOWS.desktop,
      tag,
      headSha: releaseSha,
      publishedAfter: publishedAt,
    }),
    findReleaseRun({
      repository: options.repository,
      workflow: RELEASE_WORKFLOWS.mobile,
      tag,
      headSha: releaseSha,
      publishedAfter: publishedAt,
    }),
  ]);
  const demoRuns = listWorkflowRuns({
    repository: options.repository,
    workflow: RELEASE_WORKFLOWS.demo,
    event: "release",
  });
  const demoRun = demoRuns.find((candidate) =>
    candidate.displayTitle === tag && candidate.headSha === releaseSha
  );
  console.log(
    demoRun
      ? `[release] Demo deployment continues in background: ${demoRun.url}`
      : `[release] Demo deployment continues in background: https://github.com/${options.repository}/actions/workflows/${RELEASE_WORKFLOWS.demo}`,
  );

  try {
    await Promise.all([
      waitForRun({
        repository: options.repository,
        runId: desktopAudit.databaseId,
        label: "Published desktop asset audit",
      }),
      waitForRun({
        repository: options.repository,
        runId: mobileAudit.databaseId,
        label: "Published Android asset audit",
      }),
    ]);
  } catch (error) {
    run("gh", [
      "release",
      "edit",
      tag,
      "--repo",
      options.repository,
      "--draft=true",
    ], { allowFailure: true });
    throw error;
  }

  run("gh", [
    "issue",
    "comment",
    String(issueNumber),
    "--repo",
    options.repository,
    "--body",
    `Released in [${tag}](${releaseUrl}).\n\nRequired local validations, Draft asset preparation, and post-publication native asset audits passed.`,
  ]);
  run("gh", [
    "issue",
    "close",
    String(issueNumber),
    "--repo",
    options.repository,
    "--reason",
    "completed",
  ]);
  console.log(`[release] ${tag} is complete; Demo deployment is not blocking completion`);

  if (!options.skipInstall) {
    await installReleaseDmg({
      repository: options.repository,
      tag,
    });
  }
};

if (import.meta.main) {
  try {
    const options = parseReleaseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage);
    } else {
      await releaseMain(options);
    }
  } catch (error) {
    console.error(`[release] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
