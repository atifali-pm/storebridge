import { Worker, type Job } from "bullmq";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { shops, storeLinks, syncJobs, webhookEvents } from "@/db/schema";
import { logger } from "@/lib/logger";
import { getRedis } from "@/lib/queue/connection";
import { QUEUE_INVENTORY_SYNC, type InventorySyncJobData } from "@/lib/queue/queues";
import {
  fetchInventoryItemById,
  fetchInventoryItemBySku,
  fetchPrimaryLocationId,
  setInventoryOnHand,
} from "@/lib/shopify/inventory";

const CONCURRENCY = 4;

export function startInventorySyncWorker(): Worker<InventorySyncJobData> {
  const worker = new Worker<InventorySyncJobData>(
    QUEUE_INVENTORY_SYNC,
    handleJob,
    {
      connection: getRedis(),
      concurrency: CONCURRENCY,
    },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, event: "sync.completed" });
  });
  worker.on("failed", (job, err) => {
    logger.error({
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      err: err.message,
      event: "sync.failed",
    });
  });

  return worker;
}

async function handleJob(job: Job<InventorySyncJobData>): Promise<void> {
  const { webhookEventId, sourceShopDomain, inventoryItemId, available } = job.data;

  const [sourceShop] = await db
    .select()
    .from(shops)
    .where(eq(shops.shopDomain, sourceShopDomain))
    .limit(1);

  if (!sourceShop) {
    logger.warn({ sourceShopDomain, event: "sync.source_shop_missing" });
    await markWebhookProcessed(webhookEventId);
    return;
  }

  if (sourceShop.uninstalledAt) {
    logger.info({ sourceShopDomain, event: "sync.source_uninstalled" });
    await markWebhookProcessed(webhookEventId);
    return;
  }

  const sourceItem = await fetchInventoryItemById({
    shop: sourceShop,
    inventoryItemId,
  });
  if (!sourceItem || !sourceItem.sku) {
    logger.info({
      sourceShopDomain,
      inventoryItemId,
      event: "sync.source_item_missing_or_no_sku",
    });
    await markWebhookProcessed(webhookEventId);
    return;
  }

  const links = await db
    .select()
    .from(storeLinks)
    .where(and(eq(storeLinks.sourceShopId, sourceShop.id), eq(storeLinks.enabled, true)));

  if (links.length === 0) {
    logger.debug({ sourceShopDomain, event: "sync.no_links" });
    await markWebhookProcessed(webhookEventId);
    return;
  }

  for (const link of links) {
    const [targetShop] = await db
      .select()
      .from(shops)
      .where(eq(shops.id, link.targetShopId))
      .limit(1);
    if (!targetShop || targetShop.uninstalledAt) {
      logger.info({
        link: link.id,
        event: "sync.target_unavailable",
      });
      continue;
    }

    const [syncRow] = await db
      .insert(syncJobs)
      .values({
        tenantId: link.tenantId,
        linkId: link.id,
        sourceShopId: sourceShop.id,
        targetShopId: targetShop.id,
        sourceInventoryItemId: inventoryItemId,
        sku: sourceItem.sku,
        available,
        status: "running",
        startedAt: new Date(),
      })
      .returning({ id: syncJobs.id });

    try {
      const targetItem = await fetchInventoryItemBySku({
        shop: targetShop,
        sku: sourceItem.sku,
      });
      if (!targetItem) {
        await db
          .update(syncJobs)
          .set({
            status: "skipped",
            errorMessage: `no inventory item with SKU ${sourceItem.sku} in ${targetShop.shopDomain}`,
            completedAt: new Date(),
          })
          .where(eq(syncJobs.id, syncRow.id));
        continue;
      }

      // Use the location where the target item is actually stocked. Falling
      // back to "primary" is a guess; if the item lives at a different
      // location, inventorySetOnHandQuantities returns ITEM_NOT_STOCKED_AT_LOCATION.
      const targetLocationGid =
        targetItem.stockedLocationGid ?? (await fetchPrimaryLocationId({ shop: targetShop }));

      await setInventoryOnHand({
        shop: targetShop,
        inventoryItemGid: targetItem.id,
        locationGid: targetLocationGid,
        quantity: available,
        reason: "correction",
      });

      await db
        .update(syncJobs)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(syncJobs.id, syncRow.id));

      await db
        .update(storeLinks)
        .set({ lastSyncAt: new Date(), updatedAt: new Date() })
        .where(eq(storeLinks.id, link.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db
        .update(syncJobs)
        .set({ status: "failed", errorMessage: msg, completedAt: new Date() })
        .where(eq(syncJobs.id, syncRow.id));
      throw err;
    }
  }

  await markWebhookProcessed(webhookEventId);
}

async function markWebhookProcessed(eventId: string): Promise<void> {
  await db
    .update(webhookEvents)
    .set({ status: "processed", processedAt: new Date() })
    .where(eq(webhookEvents.id, eventId));
}
