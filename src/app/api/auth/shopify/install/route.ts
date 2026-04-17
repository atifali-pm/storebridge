import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { buildAuthorizeUrl, isValidShopDomain } from "@/lib/shopify/oauth";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATE_COOKIE = "shopify_oauth_state";
const STATE_MAX_AGE = 10 * 60;

export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get("shop");
  const mergeToken = req.nextUrl.searchParams.get("merge_into") ?? "";
  if (!shop || !isValidShopDomain(shop)) {
    return NextResponse.json({ error: "invalid shop" }, { status: 400 });
  }

  const state = randomBytes(32).toString("hex");
  const redirectUri = new URL("/api/auth/shopify/callback", env().SHOPIFY_APP_URL).toString();
  const authorizeUrl = buildAuthorizeUrl({ shop, state, redirectUri });

  logger.info({ shop, event: "oauth.install.begin", hasMergeToken: !!mergeToken });

  const res = NextResponse.redirect(authorizeUrl, 302);
  res.cookies.set({
    name: STATE_COOKIE,
    value: `${shop}:${state}:${mergeToken}`,
    httpOnly: true,
    sameSite: "lax",
    secure: env().NODE_ENV === "production",
    path: "/",
    maxAge: STATE_MAX_AGE,
  });
  return res;
}
