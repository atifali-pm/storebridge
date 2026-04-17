import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.APP_URL = "http://localhost:3000";
  process.env.DATABASE_URL = "postgres://x:y@localhost:5432/x";
  process.env.SHOPIFY_API_KEY = "test_key";
  process.env.SHOPIFY_API_SECRET = "test_secret_minimum_long";
  process.env.SHOPIFY_SCOPES = "read_products";
  process.env.SHOPIFY_APP_URL = "http://localhost:3000";
});

describe("merge-token", () => {
  it("round-trips a tenant id", async () => {
    const { signMergeToken, verifyMergeToken } = await import("@/lib/merge-token");
    const token = signMergeToken("tenant-abc");
    expect(verifyMergeToken(token)?.tenantId).toBe("tenant-abc");
  });

  it("rejects tampered payload", async () => {
    const { signMergeToken, verifyMergeToken } = await import("@/lib/merge-token");
    const token = signMergeToken("tenant-abc");
    const [, exp, mac] = token.split(".");
    const evil = `tenant-evil.${exp}.${mac}`;
    expect(verifyMergeToken(evil)).toBeNull();
  });

  it("rejects tampered signature", async () => {
    const { signMergeToken, verifyMergeToken } = await import("@/lib/merge-token");
    const token = signMergeToken("tenant-abc");
    const parts = token.split(".");
    parts[2] = "0".repeat(parts[2].length);
    expect(verifyMergeToken(parts.join("."))).toBeNull();
  });

  it("rejects expired token", async () => {
    const { verifyMergeToken } = await import("@/lib/merge-token");
    const { createHmac } = await import("node:crypto");
    const pastExp = Math.floor(Date.now() / 1000) - 100;
    const body = `tenant-abc.${pastExp}`;
    const mac = createHmac("sha256", process.env.SHOPIFY_API_SECRET!).update(body).digest("hex");
    expect(verifyMergeToken(`${body}.${mac}`)).toBeNull();
  });

  it("rejects malformed token", async () => {
    const { verifyMergeToken } = await import("@/lib/merge-token");
    expect(verifyMergeToken("")).toBeNull();
    expect(verifyMergeToken("a.b")).toBeNull();
    expect(verifyMergeToken("a.b.c.d")).toBeNull();
  });
});
