import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyQueryHmac, verifyWebhookHmac } from "@/lib/shopify/hmac";

const SECRET = "shpss_test_secret_0123456789abcdef";

function signQuery(params: Record<string, string>): string {
  const entries = Object.entries(params).sort(([a], [b]) => (a < b ? -1 : 1));
  const message = entries
    .map(([k, v]) => `${encodeURIComponent(k).replace(/%20/g, "+")}=${encodeURIComponent(v).replace(/%20/g, "+")}`)
    .join("&");
  return createHmac("sha256", SECRET).update(message).digest("hex");
}

describe("verifyQueryHmac", () => {
  it("accepts a correctly signed query", () => {
    const base = {
      code: "abc123",
      shop: "acme-dev.myshopify.com",
      state: "deadbeef",
      timestamp: "1700000000",
    };
    const hmac = signQuery(base);
    const params = new URLSearchParams({ ...base, hmac });
    expect(verifyQueryHmac(params, SECRET)).toBe(true);
  });

  it("rejects a tampered query", () => {
    const base = {
      code: "abc123",
      shop: "acme-dev.myshopify.com",
      state: "deadbeef",
      timestamp: "1700000000",
    };
    const hmac = signQuery(base);
    const params = new URLSearchParams({ ...base, shop: "evil.myshopify.com", hmac });
    expect(verifyQueryHmac(params, SECRET)).toBe(false);
  });

  it("rejects a missing hmac", () => {
    const params = new URLSearchParams({ shop: "acme-dev.myshopify.com" });
    expect(verifyQueryHmac(params, SECRET)).toBe(false);
  });

  it("rejects signing with a different secret", () => {
    const base = { shop: "acme-dev.myshopify.com", code: "x" };
    const hmac = signQuery(base);
    const params = new URLSearchParams({ ...base, hmac });
    expect(verifyQueryHmac(params, "different-secret")).toBe(false);
  });

  it("excludes the signature param from the signed message", () => {
    const base = { shop: "acme-dev.myshopify.com", code: "x" };
    const hmac = signQuery(base);
    const params = new URLSearchParams({ ...base, signature: "legacy-value", hmac });
    expect(verifyQueryHmac(params, SECRET)).toBe(true);
  });

  it("url-encodes special characters when signing", () => {
    const base = { shop: "acme-dev.myshopify.com", note: "hello world & friends" };
    const hmac = signQuery(base);
    const params = new URLSearchParams({ ...base, hmac });
    expect(verifyQueryHmac(params, SECRET)).toBe(true);
  });
});

describe("verifyWebhookHmac", () => {
  it("accepts a valid body+signature pair", () => {
    const body = JSON.stringify({ id: 1, quantity: 5 });
    const sig = createHmac("sha256", SECRET).update(body, "utf8").digest("base64");
    expect(verifyWebhookHmac(body, sig, SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const body = JSON.stringify({ id: 1, quantity: 5 });
    const sig = createHmac("sha256", SECRET).update(body, "utf8").digest("base64");
    expect(verifyWebhookHmac(JSON.stringify({ id: 1, quantity: 9999 }), sig, SECRET)).toBe(false);
  });

  it("rejects a mismatched secret", () => {
    const body = "{}";
    const sig = createHmac("sha256", SECRET).update(body, "utf8").digest("base64");
    expect(verifyWebhookHmac(body, sig, "other-secret")).toBe(false);
  });
});
