import { expect, test } from "bun:test";
import { prepareUploadAsset } from "./mobile-image-upload";

test("uploads the compressed WebP URI when image compression is enabled", async () => {
  const calls: Array<{ uri: string; actions: unknown[]; options: unknown }> = [];
  const manipulateImage = async (uri: string, actions: unknown[], options: unknown) => {
    calls.push({ uri, actions, options });
    return calls.length === 1
      ? { uri: "file:///cache/measured.jpg", width: 4000, height: 2000 }
      : { uri: "file:///cache/compressed.webp", width: 2560, height: 1280 };
  };

  const result = await prepareUploadAsset(
    { uri: "file:///cache/original.jpg", name: "photo.jpg", mimeType: "image/jpeg" },
    true,
    manipulateImage
  );

  expect(calls).toEqual([
    {
      uri: "file:///cache/original.jpg",
      actions: [],
      options: { compress: 1, format: "jpeg" },
    },
    {
      uri: "file:///cache/original.jpg",
      actions: [{ resize: { width: 2560 } }],
      options: { compress: 0.82, format: "webp" },
    },
  ]);
  expect(result).toEqual({
    uri: "file:///cache/compressed.webp",
    name: "photo.webp",
    type: "image/webp",
  });
});

test("keeps the original URI when image compression is disabled", async () => {
  const result = await prepareUploadAsset(
    { uri: "file:///cache/original.png", name: "photo.png", mimeType: "image/png" },
    false,
    async () => {
      throw new Error("the image manipulator should not run");
    }
  );

  expect(result).toEqual({
    uri: "file:///cache/original.png",
    name: "photo.png",
    type: "image/png",
  });
});
