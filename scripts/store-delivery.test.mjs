import { describe, expect, test } from "bun:test";
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
});
