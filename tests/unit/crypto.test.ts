import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.APP_URL = "http://localhost:3000";
  process.env.DATABASE_URL = "postgres://x:y@localhost:5432/x";
  process.env.SHOPIFY_API_KEY = "test_key";
  process.env.SHOPIFY_API_SECRET = "test_secret";
  process.env.SHOPIFY_SCOPES = "read_products";
  process.env.SHOPIFY_APP_URL = "http://localhost:3000";
});

describe("crypto", () => {
  it("round-trips plaintext through encrypt + decrypt", async () => {
    const { encrypt, decrypt } = await import("@/lib/crypto");
    const plain = "shpat_abc123def456";
    const ct = encrypt(plain);
    expect(ct).not.toBe(plain);
    expect(decrypt(ct)).toBe(plain);
  });

  it("produces a different ciphertext on each call (random IV)", async () => {
    const { encrypt } = await import("@/lib/crypto");
    const a = encrypt("same plaintext");
    const b = encrypt("same plaintext");
    expect(a).not.toBe(b);
  });

  it("rejects tampered ciphertext (auth tag fails)", async () => {
    const { encrypt, decrypt } = await import("@/lib/crypto");
    const ct = encrypt("secret");
    const raw = Buffer.from(ct, "base64");
    raw[raw.length - 1] ^= 0x01;
    const tampered = raw.toString("base64");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("safeEqual returns true for equal strings and false otherwise", async () => {
    const { safeEqual } = await import("@/lib/crypto");
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
