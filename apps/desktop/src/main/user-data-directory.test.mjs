import { describe, expect, test } from "bun:test";
import { userDataDirectoryFromArguments } from "./user-data-directory.mjs";

describe("desktop user data directory", () => {
  test("reads the equals form", () => {
    expect(userDataDirectoryFromArguments(["EdgeEver", "--user-data-dir=/tmp/edgeever-profile"]))
      .toBe("/tmp/edgeever-profile");
  });

  test("reads the separate value form", () => {
    expect(userDataDirectoryFromArguments(["EdgeEver", "--user-data-dir", "/tmp/edgeever-profile"]))
      .toBe("/tmp/edgeever-profile");
  });

  test("ignores missing and empty values", () => {
    expect(userDataDirectoryFromArguments(["EdgeEver"])).toBe("");
    expect(userDataDirectoryFromArguments(["EdgeEver", "--user-data-dir="])).toBe("");
  });
});
