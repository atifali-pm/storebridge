import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tenants, shops } from "@/db/schema";
import { env } from "@/lib/env";
import { encrypt, safeEqual } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { verifyQueryHmac } from "@/lib/shopify/hmac";
import { embeddedAdminUrl, exchangeCodeForToken, isValidShopDomain } from "@/lib/shopify/oauth";
import { fetchShopInfo } from "@/lib/shopify/shop-info";
import { recordAudit } from "@/lib/audit";
import { verifyMergeToken } from "@/lib/merge-token";
import { registerWebhooks } from "@/lib/shopify/webhooks-register";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATE_COOKIE = "shopify_oauth_state";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const shop = params.get("shop") ?? "";
  const code = params.get("code") ?? "";
  const state = params.get("state") ?? "";

  if (!isValidShopDomain(shop) || !code || !state) {
    logger.warn({ event: "oauth.callback.bad_params", shop });
    return NextResponse.json({ error: "invalid callback parameters" }, { status: 400 });
  }

  if (!verifyQueryHmac(params, env().SHOPIFY_API_SECRET)) {
    logger.warn({ event: "oauth.callback.hmac_fail", shop });
    return NextResponse.json({ error: "hmac verification failed" }, { status: 401 });
  }

  const cookieValue = req.cookies.get(STATE_COOKIE)?.value ?? "";
  const cookieParts = cookieValue.split(":");
  const cookieShop = cookieParts[0] ?? "";
  const cookieState = cookieParts[1] ?? "";
  const mergeTokenRaw = cookieParts.slice(2).join(":");
  if (
    !cookieShop ||
    !cookieState ||
    !safeEqual(cookieShop, shop) ||
    !safeEqual(cookieState, state)
  ) {
    logger.warn({ event: "oauth.callback.state_mismatch", shop });
    return NextResponse.json({ error: "state mismatch" }, { status: 403 });
  }

  const mergeTenantId = mergeTokenRaw ? verifyMergeToken(mergeTokenRaw)?.tenantId ?? null : null;
  if (mergeTokenRaw && !mergeTenantId) {
    logger.warn({ event: "oauth.callback.merge_token_invalid", shop });
    return NextResponse.json({ error: "invalid merge token" }, { status: 403 });
  }

  const { accessToken, scope } = await exchangeCodeForToken({ shop, code });
  const info = await fetchShopInfo({ shop, accessToken });

  const { tenantId, shopId, isNewInstall } = await db.transaction(async (tx) => {
    const existing = await tx.select().from(shops).where(eq(shops.shopDomain, shop)).limit(1);

    if (existing.length > 0) {
      const prior = existing[0];
      await tx
        .update(shops)
        .set({
          accessTokenEncrypted: encrypt(accessToken),
          scope,
          shopifyShopId: info.id || prior.shopifyShopId,
          uninstalledAt: null,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(shops.id, prior.id));
      return { tenantId: prior.tenantId, shopId: prior.id, isNewInstall: false };
    }

    let tenantIdForShop = mergeTenantId;
    if (tenantIdForShop) {
      const [tenantRow] = await tx
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.id, tenantIdForShop))
        .limit(1);
      if (!tenantRow) tenantIdForShop = null;
    }

    if (!tenantIdForShop) {
      const [tenant] = await tx
        .insert(tenants)
        .values({ name: info.name || shop, slug: shop })
        .returning({ id: tenants.id });
      tenantIdForShop = tenant.id;
    }

    const [inserted] = await tx
      .insert(shops)
      .values({
        tenantId: tenantIdForShop,
        shopDomain: shop,
        shopifyShopId: info.id || null,
        accessTokenEncrypted: encrypt(accessToken),
        scope,
      })
      .returning({ id: shops.id });

    return { tenantId: tenantIdForShop, shopId: inserted.id, isNewInstall: true };
  });

  await recordAudit({
    tenantId,
    action: isNewInstall ? "shop.install" : "shop.reinstall",
    resourceType: "shop",
    resourceId: shopId,
    meta: { shop, scope, shopifyShopId: info.id || null },
    ipAddress: req.headers.get("x-forwarded-for") ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });

  logger.info({ event: "oauth.callback.success", shop, tenantId, shopId, isNewInstall });

  if (isNewInstall) {
    const [shopRow] = await db.select().from(shops).where(eq(shops.id, shopId)).limit(1);
    if (shopRow) {
      void registerWebhooks(shopRow).catch((err) =>
        logger.error({
          event: "oauth.callback.register_webhooks_error",
          err: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  const res = NextResponse.redirect(embeddedAdminUrl(shop), 302);
  res.cookies.delete(STATE_COOKIE);
  return res;
}
