import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyQueryHmac(params: URLSearchParams, secret: string): boolean {
  const provided = params.get("hmac");
  if (!provided) return false;

  const entries: [string, string][] = [];
  for (const [key, value] of params.entries()) {
    if (key === "hmac" || key === "signature") continue;
    entries.push([key, value]);
  }
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const message = entries
    .map(([k, v]) => `${encodeShopifyParam(k)}=${encodeShopifyParam(v)}`)
    .join("&");

  const expected = createHmac("sha256", secret).update(message).digest("hex");
  return safeEqualHex(expected, provided);
}

export function verifyWebhookHmac(rawBody: Buffer | string, headerHmac: string, secret: string): boolean {
  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  const expected = createHmac("sha256", secret).update(body).digest("base64");
  return safeEqualUtf8(expected, headerHmac);
}

function encodeShopifyParam(s: string): string {
  return encodeURIComponent(s).replace(/%20/g, "+");
}

function safeEqualHex(expectedHex: string, providedHex: string): boolean {
  if (expectedHex.length !== providedHex.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expectedHex, "hex"), Buffer.from(providedHex, "hex"));
  } catch {
    return false;
  }
}

function safeEqualUtf8(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
