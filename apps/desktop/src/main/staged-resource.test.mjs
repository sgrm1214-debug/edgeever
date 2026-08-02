import { describe, expect, test } from "bun:test";
import { MAX_STAGED_RESOURCE_BYTES, normalizeStagedResourceInput, remapStagedResourceMetadata } from "./staged-resource.mjs";

describe("desktop staged resource input", () => {
  test("normalizes valid structured-clone payloads", () => {
    const input = normalizeStagedResourceInput({ memoId: "memo-1", name: " photo.png ", type: " image/png ", bytes: new ArrayBuffer(3) });
    expect(input).toMatchObject({ memoId: "memo-1", name: "photo.png", type: "image/png" });
    expect(input.bytes).toBeInstanceOf(Uint8Array);
  });

  test("rejects control characters and invalid or oversized payloads", () => {
    expect(() => normalizeStagedResourceInput({ memoId: "memo-1", name: "bad\u0000name", bytes: new Uint8Array() })).toThrow("Invalid staged resource name");
    expect(() => normalizeStagedResourceInput({ memoId: "memo-1", name: "large.bin", bytes: { byteLength: MAX_STAGED_RESOURCE_BYTES + 1 } })).toThrow("Staged resource exceeds");
  });

  test("remaps a staged image from its temporary memo id to the server id", () => {
    const metadata = { id: "stage-1", memoId: "memo_local_1", name: "photo.png" };

    expect(remapStagedResourceMetadata(metadata, [["memo_local_1", "memo_remote_1"]])).toEqual({
      ...metadata,
      memoId: "memo_remote_1",
    });
    expect(remapStagedResourceMetadata(metadata, [["another", "memo_remote_2"]])).toBe(metadata);
  });
});
