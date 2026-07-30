import { expect, test } from "bun:test";
import { findNewerMobileRelease } from "./mobile-release";

const responseWithTag = (tagName: string, androidVersion = tagName.replace(/^v/, "")) => new Response(JSON.stringify({
  assets: [{ name: `edgeever-android-v${androidVersion}-arm64-v8a.apk` }],
  tag_name: tagName,
}), {
  headers: { "Content-Type": "application/json" },
  status: 200,
});

test("finds a newer formal GitHub release", async () => {
  const release = await findNewerMobileRelease("0.4.14", async () => responseWithTag("v0.4.15"));

  expect(release).toEqual({ version: "0.4.15" });
});

test("does not treat the current or an older release as an update", async () => {
  expect(await findNewerMobileRelease("0.4.15", async () => responseWithTag("v0.4.15"))).toBeNull();
  expect(await findNewerMobileRelease("0.4.15", async () => responseWithTag("v0.4.14"))).toBeNull();
});

test("uses the actual reused Android asset version instead of the overall release tag", async () => {
  expect(await findNewerMobileRelease("1.6.50", async () => responseWithTag("v1.7.0", "1.6.50"))).toBeNull();
  expect(await findNewerMobileRelease("1.6.49", async () => responseWithTag("v1.7.0", "1.6.50"))).toEqual({
    version: "1.6.50",
  });
});

test("rejects invalid release responses instead of claiming the app is current", async () => {
  await expect(findNewerMobileRelease("0.4.14", async () => responseWithTag("latest"))).rejects.toThrow(
    "Invalid GitHub release version"
  );
  await expect(findNewerMobileRelease("0.4.14", async () => new Response(null, { status: 403 }))).rejects.toThrow(
    "status 403"
  );
  await expect(findNewerMobileRelease("0.4.14", async () => new Response(JSON.stringify({
    assets: [],
    tag_name: "v0.4.15",
  })))).rejects.toThrow("exactly one Android APK");
});
