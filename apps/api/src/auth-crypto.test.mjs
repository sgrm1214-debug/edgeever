import { describe, expect, test } from "bun:test";
import { hashPassword, randomToken, verifyPassword } from "./auth-crypto";

describe("API authentication crypto", () => {
  test("round trips a password without accepting another password", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(hash).toMatch(/^pbkdf2-sha256\$100000\$/);
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("incorrect", hash)).toBe(false);
  });

  test("rejects malformed or intentionally weak hashes", async () => {
    expect(await verifyPassword("password", "plaintext")).toBe(false);
    expect(await verifyPassword("password", "pbkdf2-sha256$99999$c2FsdA$aGFzaA")).toBe(false);
  });

  test("creates URL-safe tokens with the requested entropy length", () => {
    const token = randomToken(32);

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBe(43);
  });
});
