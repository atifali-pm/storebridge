"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { shops, storeLinks } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

const UUID = z.string().uuid();

async function assertShopInTenant(shopId: string, tenantId: string): Promise<void> {
  const [row] = await db
    .select({ id: shops.id })
    .from(shops)
    .where(and(eq(shops.id, shopId), eq(shops.tenantId, tenantId)))
    .limit(1);
  if (!row) throw new Error("shop not found in tenant");
}

const CreateLinkSchema = z.object({
  tenantId: UUID,
  sourceShopId: UUID,
  targetShopId: UUID,
  currentShop: z.string(),
});

export async function createLinkAction(formData: FormData): Promise<{ error?: string }> {
  const parsed = CreateLinkSchema.safeParse({
    tenantId: formData.get("tenantId"),
    sourceShopId: formData.get("sourceShopId"),
    targetShopId: formData.get("targetShopId"),
    currentShop: formData.get("currentShop"),
  });
  if (!parsed.success) return { error: "invalid form" };

  const { tenantId, sourceShopId, targetShopId, currentShop } = parsed.data;
  if (sourceShopId === targetShopId) return { error: "source and target must differ" };

  await assertShopInTenant(sourceShopId, tenantId);
  await assertShopInTenant(targetShopId, tenantId);

  try {
    await db.insert(storeLinks).values({ tenantId, sourceShopId, targetShopId });
    await recordAudit({
      tenantId,
      action: "link.create",
      resourceType: "store_link",
      meta: { sourceShopId, targetShopId },
    });
    logger.info({ event: "link.create", tenantId, sourceShopId, targetShopId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("store_links_pair_unique")) return { error: "link already exists" };
    logger.error({ event: "link.create_error", err: msg });
    return { error: "failed to create link" };
  }

  revalidatePath(`/app/links?shop=${encodeURIComponent(currentShop)}`);
  return {};
}

const ToggleSchema = z.object({
  tenantId: UUID,
  linkId: UUID,
  enabled: z.string(),
  currentShop: z.string(),
});

export async function toggleLinkAction(formData: FormData): Promise<{ error?: string }> {
  const parsed = ToggleSchema.safeParse({
    tenantId: formData.get("tenantId"),
    linkId: formData.get("linkId"),
    enabled: formData.get("enabled"),
    currentShop: formData.get("currentShop"),
  });
  if (!parsed.success) return { error: "invalid form" };

  const enabled = parsed.data.enabled === "true";
  await db
    .update(storeLinks)
    .set({ enabled, updatedAt: new Date() })
    .where(and(eq(storeLinks.id, parsed.data.linkId), eq(storeLinks.tenantId, parsed.data.tenantId)));

  await recordAudit({
    tenantId: parsed.data.tenantId,
    action: enabled ? "link.enable" : "link.disable",
    resourceType: "store_link",
    resourceId: parsed.data.linkId,
  });

  revalidatePath(`/app/links?shop=${encodeURIComponent(parsed.data.currentShop)}`);
  return {};
}

const DeleteSchema = z.object({
  tenantId: UUID,
  linkId: UUID,
  currentShop: z.string(),
});

export async function deleteLinkAction(formData: FormData): Promise<{ error?: string }> {
  const parsed = DeleteSchema.safeParse({
    tenantId: formData.get("tenantId"),
    linkId: formData.get("linkId"),
    currentShop: formData.get("currentShop"),
  });
  if (!parsed.success) return { error: "invalid form" };

  await db
    .delete(storeLinks)
    .where(and(eq(storeLinks.id, parsed.data.linkId), eq(storeLinks.tenantId, parsed.data.tenantId)));

  await recordAudit({
    tenantId: parsed.data.tenantId,
    action: "link.delete",
    resourceType: "store_link",
    resourceId: parsed.data.linkId,
  });

  revalidatePath(`/app/links?shop=${encodeURIComponent(parsed.data.currentShop)}`);
  return {};
}
