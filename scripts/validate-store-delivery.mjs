import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { planNativeRelease } from "./plan-native-release.mjs";

const STABLE_RELEASE_TAG = /^v(\d+\.\d+\.\d+)$/;
const PLATFORMS = new Set(["android", "ios", "both"]);
const ANDROID_TRACKS = new Set(["internal", "alpha", "beta", "production"]);

export const validateStoreDelivery = ({
  releaseTag,
  rootVersion,
  mobileVersion,
  currentVersionCode,
  previousVersionCode,
  changedFiles,
  platform,
  androidTrack,
}) => {
  const version = STABLE_RELEASE_TAG.exec(releaseTag)?.[1];
  if (!version) {
    throw new Error(`Release tag must use stable vX.Y.Z format: ${releaseTag}`);
  }
  if (!ANDROID_TRACKS.has(androidTrack)) {
    throw new Error(`Unsupported Google Play track: ${androidTrack}`);
  }
  if (!PLATFORMS.has(platform)) {
    throw new Error(`Unsupported store platform: ${platform}`);
  }

  const mobilePlan = planNativeRelease("mobile", changedFiles);
  if (!mobilePlan.rebuild) {
    throw new Error(
      `${releaseTag} contains no mobile runtime changes; keep the existing store binary.`,
    );
  }
  if (rootVersion !== version || mobileVersion !== version) {
    throw new Error(
      `${releaseTag} requires package.json and apps/mobile/app.json versions to both equal ${version}.`,
    );
  }
  if (
    !Number.isInteger(currentVersionCode) ||
    !Number.isInteger(previousVersionCode) ||
    currentVersionCode <= previousVersionCode
  ) {
    throw new Error(
      `Android versionCode must increase beyond ${previousVersionCode}; received ${currentVersionCode}.`,
    );
  }
  return {
    version,
    versionCode: currentVersionCode,
    relevantChanges: mobilePlan.relevantChanges,
  };
};

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const run = () => {
  const [
    releaseTag,
    previousTag,
    platform = "both",
    androidTrack = "production",
  ] = process.argv.slice(2);
  if (!releaseTag || !previousTag) {
    console.error(
      "Usage: node scripts/validate-store-delivery.mjs <release-tag> <previous-tag> [platform] [android-track]",
    );
    process.exit(2);
  }

  const git = (...args) =>
    execFileSync("git", args, { encoding: "utf8" }).trim();
  const changedFiles = git(
    "diff",
    "--name-only",
    `${previousTag}...${releaseTag}`,
  ).split("\n").filter(Boolean);
  const rootPackage = readJson("package.json");
  const mobileConfig = readJson("apps/mobile/app.json");
  const previousMobileConfig = JSON.parse(
    git("show", `${previousTag}:apps/mobile/app.json`),
  );
  const result = validateStoreDelivery({
    releaseTag,
    rootVersion: rootPackage.version,
    mobileVersion: mobileConfig.expo.version,
    currentVersionCode: mobileConfig.expo.android.versionCode,
    previousVersionCode: previousMobileConfig.expo.android.versionCode,
    changedFiles,
    platform,
    androidTrack,
  });

  process.stdout.write(`version=${result.version}\n`);
  process.stdout.write(`version_code=${result.versionCode}\n`);
  process.stdout.write("mobile_changed=true\n");
  process.stderr.write(
    `Store delivery ${releaseTag}: ${result.relevantChanges.join(", ")}\n`,
  );
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    run();
  } catch (error) {
    console.error(
      `[store-delivery] failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}
