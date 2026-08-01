import { describe, expect, test } from "bun:test";
import { processFilesSequentially } from "./file-batch.ts";

describe("processFilesSequentially", () => {
  test("continues after a failed file and preserves selection order", async () => {
    const files = [
      new File(["a"], "first.jpg", { type: "image/jpeg" }),
      new File(["b"], "broken.jpg", { type: "image/jpeg" }),
      new File(["c"], "last.jpg", { type: "image/jpeg" }),
    ];
    const processed = [];

    const results = await processFilesSequentially(files, async (file) => {
      processed.push(file.name);
      if (file.name === "broken.jpg") {
        throw new Error("upload failed");
      }
      return `${file.name}:uploaded`;
    });

    expect(processed).toEqual(["first.jpg", "broken.jpg", "last.jpg"]);
    expect(results.map(({ file, status }) => [file.name, status])).toEqual([
      ["first.jpg", "fulfilled"],
      ["broken.jpg", "rejected"],
      ["last.jpg", "fulfilled"],
    ]);
    expect(results[2]).toMatchObject({ status: "fulfilled", value: "last.jpg:uploaded" });
  });
});
