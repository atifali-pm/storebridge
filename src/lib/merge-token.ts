import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

const TOKEN_TTL_SECONDS = 15 * 60;

function hmacKey(): string {
  return env().SHOPIFY_API_SECRET;
}

export function signMergeToken(tenantId: string): string {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const body = `${tenantId}.${expiresAt}`;
  const mac = createHmac("sha256", hmacKey()).update(body).digest("hex");
  return `${body}.${mac}`;
}

export function verifyMergeToken(token: string): { tenantId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [tenantId, expiresAtStr, mac] = parts;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt)) return null;
  if (expiresAt < Math.floor(Date.now() / 1000)) return null;

  const body = `${tenantId}.${expiresAtStr}`;
  const expected = createHmac("sha256", hmacKey()).update(body).digest("hex");
  if (expected.length !== mac.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(mac, "hex"))) return null;
  } catch {
    return null;
  }
  return { tenantId };
}
