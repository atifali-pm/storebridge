import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { shops, webhookEvents } from "@/db/schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { verifyWebhookHmac } from "@/lib/shopify/hmac";
import { isValidShopDomain } from "@/lib/shopify/oauth";
import { inventorySyncQueue } from "@/lib/queue/queues";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface InventoryLevelPayload {
  inventory_item_id: number;
  location_id: number;
  available: number;
}

export async function POST(req: NextRequest) {
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");
  const topic = req.headers.get("x-shopify-topic");
  const shopDomain = req.headers.get("x-shopify-shop-domain");
  const webhookId = req.headers.get("x-shopify-webhook-id");

  if (!hmacHeader || !topic || !shopDomain) {
    logger.warn({ event: "webhook.bad_headers", topic, shopDomain });
    return NextResponse.json({ error: "missing required shopify headers" }, { status: 400 });
  }
  if (!isValidShopDomain(shopDomain)) {
    logger.warn({ event: "webhook.bad_shop", shopDomain });
    return NextResponse.json({ error: "invalid shop" }, { status: 400 });
  }

  const raw = await req.text();

  if (!verifyWebhookHmac(raw, hmacHeader, env().SHOPIFY_API_SECRET)) {
    logger.warn({ event: "webhook.hmac_fail", topic, shopDomain });
    return NextResponse.json({ error: "hmac verification failed" }, { status: 401 });
  }

  const payloadHash = createHash("sha256").update(raw, "utf8").digest("hex");
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(raw);
  } catch {
    logger.warn({ event: "webhook.bad_json", topic, shopDomain });
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  let eventRow: { id: string } | null = null;
  let duplicate = false;
  try {
    const [row] = await db
      .insert(webhookEvents)
      .values({
        shopifyWebhookId: webhookId,
        shopDomain,
        topic,
        payloadHash,
        payload,
        status: "received",
      })
      .returning({ id: webhookEvents.id });
    eventRow = row;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("webhook_events_webhook_id_unique") || msg.includes("duplicate key")) {
      duplicate = true;
      logger.info({ event: "webhook.duplicate", topic, shopDomain, webhookId });
    } else {
      logger.error({ event: "webhook.persist_error", err: msg, topic, shopDomain });
      return NextResponse.json({ error: "internal error" }, { status: 500 });
    }
  }

  if (duplicate || !eventRow) {
    return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
  }

  try {
    await dispatch(topic, shopDomain, payload, eventRow.id);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    logger.error({
      event: "webhook.dispatch_error",
      err: err instanceof Error ? err.message : String(err),
      topic,
      shopDomain,
    });
    await db
      .update(webhookEvents)
      .set({ status: "failed", errorMessage: err instanceof Error ? err.message : String(err) })
      .where(eq(webhookEvents.id, eventRow.id));
    return NextResponse.json({ ok: true, processed: false }, { status: 200 });
  }
}

async function dispatch(
  topic: string,
  shopDomain: string,
  payload: Record<string, unknown>,
  eventId: string,
): Promise<void> {
  switch (topic) {
    case "inventory_levels/update":
      await handleInventoryUpdate(shopDomain, payload as unknown as InventoryLevelPayload, eventId);
      return;
    case "app/uninstalled":
      await handleAppUninstalled(shopDomain, eventId);
      return;
    default:
      logger.info({ event: "webhook.unhandled_topic", topic, shopDomain });
      await db
        .update(webhookEvents)
        .set({ status: "processed", processedAt: new Date() })
        .where(eq(webhookEvents.id, eventId));
  }
}

async function handleInventoryUpdate(
  shopDomain: string,
  payload: InventoryLevelPayload,
  eventId: string,
): Promise<void> {
  if (
    typeof payload.inventory_item_id !== "number" ||
    typeof payload.location_id !== "number" ||
    typeof payload.available !== "number"
  ) {
    throw new Error("invalid inventory_levels/update payload shape");
  }

  await inventorySyncQueue().add(
    "sync",
    {
      webhookEventId: eventId,
      sourceShopDomain: shopDomain,
      inventoryItemId: payload.inventory_item_id,
      locationId: payload.location_id,
      available: payload.available,
    },
    { jobId: eventId },
  );

  await db
    .update(webhookEvents)
    .set({ status: "enqueued" })
    .where(eq(webhookEvents.id, eventId));
}

async function handleAppUninstalled(shopDomain: string, eventId: string): Promise<void> {
  const [shop] = await db
    .select({ id: shops.id, tenantId: shops.tenantId })
    .from(shops)
    .where(eq(shops.shopDomain, shopDomain))
    .limit(1);

  if (shop) {
    await db
      .update(shops)
      .set({ uninstalledAt: new Date(), updatedAt: new Date() })
      .where(eq(shops.id, shop.id));

    await recordAudit({
      tenantId: shop.tenantId,
      action: "shop.uninstall",
      resourceType: "shop",
      resourceId: shop.id,
      meta: { shop: shopDomain },
    });
  }

  await db
    .update(webhookEvents)
    .set({ status: "processed", processedAt: new Date() })
    .where(eq(webhookEvents.id, eventId));
}
