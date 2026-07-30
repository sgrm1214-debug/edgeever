import { describe, expect, test } from "bun:test";
import { validateStoreDelivery } from "./validate-store-delivery.mjs";

const validInput = {
  releaseTag: "v1.7.0",
  rootVersion: "1.7.0",
  mobileVersion: "1.7.0",
  currentVersionCode: 57,
  previousVersionCode: 56,
  changedFiles: ["apps/mobile/src/screens/WorkspaceScreen.tsx"],
  platform: "both",
  androidTrack: "production",
};

describe("store delivery validation", () => {
  test("accepts a mobile release with increasing versions", () => {
    expect(validateStoreDelivery(validInput)).toEqual({
      version: "1.7.0",
      versionCode: 57,
      relevantChanges: ["apps/mobile/src/screens/WorkspaceScreen.tsx"],
    });
  });

  test("rejects releases that reuse the existing mobile binary", () => {
    expect(() =>
      validateStoreDelivery({
        ...validInput,
        changedFiles: ["apps/web/src/app/App.tsx"],
      })
    ).toThrow("contains no mobile runtime changes");
  });

  test("requires release and mobile versions to match", () => {
    expect(() =>
      validateStoreDelivery({ ...validInput, mobileVersion: "1.6.99" })
    ).toThrow("versions to both equal 1.7.0");
  });

  test("requires Android versionCode to increase", () => {
    expect(() =>
      validateStoreDelivery({ ...validInput, currentVersionCode: 56 })
    ).toThrow("versionCode must increase");
  });
});
