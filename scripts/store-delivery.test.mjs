import { describe, expect, test } from "bun:test";
import { parseStoreDeliveryArgs } from "./store-delivery.mjs";

describe("store delivery command", () => {
  test("uses safe testing defaults", () => {
    expect(
      parseStoreDeliveryArgs(["--release", "v1.7.0"]),
    ).toMatchObject({
      releaseTag: "v1.7.0",
      platform: "both",
      androidTrack: "internal",
      productionConfirmation: "",
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

  test("requires exact confirmation for Google Play production", () => {
    expect(() =>
      parseStoreDeliveryArgs([
        "--release",
        "v1.7.0",
        "--platform",
        "android",
        "--android-track",
        "production",
      ])
    ).toThrow("--confirm-production v1.7.0");
  });
});
