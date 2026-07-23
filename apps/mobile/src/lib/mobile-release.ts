import { clean, gt, valid } from "semver";

const LATEST_RELEASE_API_URL = "https://api.github.com/repos/tianma-if/edgeever/releases/latest";

export const GITHUB_LATEST_RELEASE_URL = "https://github.com/tianma-if/edgeever/releases/latest";
export const GOOGLE_PLAY_URL = "https://play.google.com/store/apps/details?id=org.edgeever.mobile";

type LatestReleaseResponse = {
  tag_name?: unknown;
};

export type MobileRelease = {
  version: string;
};

const normalizeVersion = (value: string) => {
  const normalized = clean(value);
  return normalized && valid(normalized) ? normalized : null;
};

export const findNewerMobileRelease = async (
  currentVersion: string,
  fetchRelease: typeof fetch = fetch
): Promise<MobileRelease | null> => {
  const normalizedCurrentVersion = normalizeVersion(currentVersion);
  if (!normalizedCurrentVersion) {
    throw new Error(`Invalid installed app version: ${currentVersion}`);
  }

  const response = await fetchRelease(LATEST_RELEASE_API_URL, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub release check failed with status ${response.status}`);
  }

  const release = await response.json() as LatestReleaseResponse;
  if (typeof release.tag_name !== "string") {
    throw new Error("GitHub release response does not contain a version tag");
  }
  const latestVersion = normalizeVersion(release.tag_name);
  if (!latestVersion) {
    throw new Error(`Invalid GitHub release version: ${release.tag_name}`);
  }

  return gt(latestVersion, normalizedCurrentVersion) ? { version: latestVersion } : null;
};
