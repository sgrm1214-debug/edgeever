import { describe, expect, test } from "bun:test";
import {
  buildIssueBody,
  buildReleaseNotes,
  nextPatchVersion,
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
        "--label",
        "enhancement",
        "--change-en",
        "Run checks in parallel.",
        "--change-zh",
        "并行运行检查。",
      ]),
    ).toMatchObject({
      issueTitle: "Improve release flow",
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
        "--label",
        "bug",
        "--change-en",
        "Only English.",
      ])
    ).toThrow("--change-en and --change-zh");
  });

  test("increments stable patch versions", () => {
    expect(nextPatchVersion("1.6.50")).toBe("1.6.51");
    expect(() => nextPatchVersion("1.6")).toThrow("stable X.Y.Z");
  });

  test("builds required bilingual release note structure with real newlines", () => {
    const notes = buildReleaseNotes({
      changesEn: ["Improve the release flow."],
      changesZh: ["优化发布流程。"],
      issueNumber: 126,
      desktopRebuild: false,
      mobileRebuild: false,
      previousTag: "v1.6.50",
    });
    expect(notes).toContain("## Key Changes");
    expect(notes).toContain("Related Issue: #126");
    expect(notes).toContain("## 🇨🇳 中文说明 / Chinese Changelog");
    expect(notes).toContain("关联 Issue：#126");
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

  test("selects a reused DMG and derives its native version", () => {
    expect(
      selectPublishedDmg([
        {
          name: "EdgeEver-1.6.51-mac-arm64.dmg",
          size: 10,
          digest: "sha256:abc",
        },
        {
          name: "edgeever-android-v1.6.51-arm64-v8a.apk",
          size: 10,
          digest: "sha256:def",
        },
      ]),
    ).toMatchObject({
      asset: { name: "EdgeEver-1.6.51-mac-arm64.dmg" },
      version: "1.6.51",
    });
  });
});
