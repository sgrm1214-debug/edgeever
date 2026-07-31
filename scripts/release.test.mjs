import { describe, expect, test } from "bun:test";
import {
  buildIssueBody,
  buildReleaseNotes,
  buildReleaseTitle,
  nextVersion,
  parseReleaseArgs,
  reusedAssetMatches,
  selectPublishedDmg,
} from "./release.mjs";

describe("release automation", () => {
  test("parses paired bilingual changes and labels", () => {
    expect(
      parseReleaseArgs([
        "--issue-title",
        "Improve release flow",
        "--bump",
        "minor",
        "--label",
        "enhancement",
        "--change-en",
        "Run checks in parallel.",
        "--change-zh",
        "并行运行检查。",
      ]),
    ).toMatchObject({
      issueTitle: "Improve release flow",
      bump: "minor",
      labels: ["enhancement"],
      changesEn: ["Run checks in parallel."],
      changesZh: ["并行运行检查。"],
    });
  });

  test("rejects mismatched bilingual changes", () => {
    expect(() =>
      parseReleaseArgs([
        "--issue-title",
        "Broken input",
        "--bump",
        "patch",
        "--label",
        "bug",
        "--change-en",
        "Only English.",
      ])
    ).toThrow("--change-en and --change-zh");
  });

  test("increments stable semantic versions", () => {
    expect(nextVersion("1.6.50", "patch")).toBe("1.6.51");
    expect(nextVersion("1.6.50", "minor")).toBe("1.7.0");
    expect(nextVersion("1.6.50", "major")).toBe("2.0.0");
    expect(() => nextVersion("1.6", "patch")).toThrow("stable X.Y.Z");
    expect(() => nextVersion("1.6.50", "automatic")).toThrow("patch, minor, or major");
  });

  test("uses the stable tag as the GitHub Release title", () => {
    expect(buildReleaseTitle("v1.6.55")).toBe("v1.6.55");
    expect(() => buildReleaseTitle("1.6.55")).toThrow("stable vX.Y.Z tag");
  });

  test("requires an explicit version bump", () => {
    expect(() =>
      parseReleaseArgs([
        "--issue-title",
        "Missing bump",
        "--label",
        "bug",
        "--change-en",
        "Fix a bug.",
        "--change-zh",
        "修复问题。",
      ])
    ).toThrow("--bump must be patch, minor, or major");
  });

  test("builds concise user-facing bilingual release notes", () => {
    const notes = buildReleaseNotes({
      changesEn: ["Improve the release flow."],
      changesZh: ["优化发布流程。"],
      issueNumber: 126,
    });
    expect(notes).toContain("## Key Changes");
    expect(notes).toContain("Related Issue: #126");
    expect(notes).toContain("## 🇨🇳 中文说明 / Chinese Changelog");
    expect(notes).toContain("关联 Issue：#126");
    expect(notes).not.toContain("## Verification");
    expect(notes).not.toContain("## 验证");
    expect(notes).not.toContain("bun run");
    expect(notes).not.toContain("Version bump");
    expect(notes).not.toContain("release plan");
    expect(notes).not.toContain("\\n");
  });

  test("builds a bilingual umbrella Issue", () => {
    const body = buildIssueBody({
      changesEn: ["Parallel checks."],
      changesZh: ["并行检查。"],
    });
    expect(body).toContain("## Summary");
    expect(body).toContain("- Parallel checks.");
    expect(body).toContain("## 中文说明");
    expect(body).toContain("- 并行检查。");
  });

  test("requires reused assets to keep name, size, and digest", () => {
    const previous = [{ name: "app.apk", size: 10, digest: "sha256:abc" }];
    expect(reusedAssetMatches(previous, [...previous], "app.apk")).toBe(true);
    expect(
      reusedAssetMatches(previous, [{ ...previous[0], digest: "sha256:def" }], "app.apk"),
    ).toBe(false);
  });

  test("selects the DMG matching the current Mac architecture", () => {
    const assets = [
      {
        name: "EdgeEver-1.6.51-mac-arm64.dmg",
        size: 10,
        digest: "sha256:abc",
      },
      {
        name: "EdgeEver-1.6.51-mac-x64.dmg",
        size: 11,
        digest: "sha256:def",
      },
    ];
    expect(
      selectPublishedDmg(assets, "arm64"),
    ).toMatchObject({
      asset: { name: "EdgeEver-1.6.51-mac-arm64.dmg" },
      version: "1.6.51",
    });
    expect(selectPublishedDmg(assets, "x64")).toMatchObject({
      asset: { name: "EdgeEver-1.6.51-mac-x64.dmg" },
      version: "1.6.51",
    });
  });
});
