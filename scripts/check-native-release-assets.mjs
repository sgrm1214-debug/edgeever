import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const nativeReleaseAssetsReady = ({
  platform,
  rebuild,
  currentTag,
  desktopVersion,
  assetNames,
}) => {
  if (platform === "mobile") {
    const apkNames = assetNames.filter((name) =>
      /^edgeever-android-v.*-arm64-v8a\.apk$/.test(name),
    );
    if (apkNames.length !== 1) return false;
    return (
      !rebuild ||
      apkNames[0] === `edgeever-android-${currentTag}-arm64-v8a.apk`
    );
  }

  if (platform === "desktop") {
    const dmgNames = assetNames.filter((name) =>
      /^EdgeEver-.*-mac-arm64\.dmg$/.test(name),
    );
    const blockmapNames = assetNames.filter((name) =>
      /^EdgeEver-.*-mac-arm64\.dmg\.blockmap$/.test(name),
    );
    if (
      dmgNames.length !== 1 ||
      blockmapNames.length !== 1 ||
      assetNames.filter((name) => name === "latest-mac.yml").length !== 1 ||
      blockmapNames[0] !== `${dmgNames[0]}.blockmap`
    ) {
      return false;
    }
    return (
      !rebuild ||
      dmgNames[0] === `EdgeEver-${desktopVersion}-mac-arm64.dmg`
    );
  }

  throw new Error(`Unsupported native release platform: ${platform}`);
};

const run = () => {
  const [platform, rebuildValue, currentTag, desktopVersion = ""] =
    process.argv.slice(2);
  if (
    !["mobile", "desktop"].includes(platform) ||
    !["true", "false"].includes(rebuildValue) ||
    !currentTag
  ) {
    console.error(
      "Usage: node scripts/check-native-release-assets.mjs <mobile|desktop> <true|false> <current-tag> [desktop-version]",
    );
    process.exit(1);
  }

  const assetNames = readFileSync(0, "utf8").split("\n").filter(Boolean);
  process.stdout.write(
    String(
      nativeReleaseAssetsReady({
        platform,
        rebuild: rebuildValue === "true",
        currentTag,
        desktopVersion,
        assetNames,
      }),
    ),
  );
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  run();
}
