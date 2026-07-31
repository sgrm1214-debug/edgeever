import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseStoreDeliveryArgs } from "./store-delivery.mjs";

describe("store delivery command", () => {
  test("uses full production delivery defaults", () => {
    expect(
      parseStoreDeliveryArgs(["--release", "v1.7.0"]),
    ).toMatchObject({
      releaseTag: "v1.7.0",
      platform: "both",
      androidTrack: "production",
    });
  });

  test("accepts an explicit single platform", () => {
    expect(
      parseStoreDeliveryArgs([
        "--release",
        "v1.7.0",
        "--platform",
        "ios",
      ]).platform,
    ).toBe("ios");
  });

  test("rejects malformed release tags", () => {
    expect(() =>
      parseStoreDeliveryArgs(["--release", "latest"])
    ).toThrow("stable vX.Y.Z");
  });

  test("uses the pinned official EAS CLI setup in store jobs", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/store-delivery.yml", import.meta.url),
      "utf8",
    );

    expect(workflow).not.toContain("bunx eas-cli");
    expect(workflow.match(/uses: expo\/expo-github-action@v8/g)).toHaveLength(2);
    expect(workflow.match(/eas-version: 21\.4\.0/g)).toHaveLength(2);
    expect(workflow.match(/packager: npm/g)).toHaveLength(2);
  });
});
