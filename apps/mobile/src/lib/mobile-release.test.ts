import { expect, test } from "bun:test";
import { findNewerMobileRelease } from "./mobile-release";

const responseWithTag = (tagName: string) => new Response(JSON.stringify({ tag_name: tagName }), {
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

test("rejects invalid release responses instead of claiming the app is current", async () => {
  await expect(findNewerMobileRelease("0.4.14", async () => responseWithTag("latest"))).rejects.toThrow(
    "Invalid GitHub release version"
  );
  await expect(findNewerMobileRelease("0.4.14", async () => new Response(null, { status: 403 }))).rejects.toThrow(
    "status 403"
  );
});
