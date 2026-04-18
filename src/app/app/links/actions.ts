"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { shops, storeLinks, auditLogs } from "@/db/schema";
import { withTenant, type TenantTx } from "@/db/tenant-scope";
import { logger } from "@/lib/logger";

const UUID = z.string().uuid();

async function assertShopInTenant(tx: TenantTx, shopId: string): Promise<void> {
  const [row] = await tx
    .select({ id: shops.id })
    .from(shops)
    .where(eq(shops.id, shopId))
    .limit(1);
  if (!row) throw new Error("shop not found in tenant");
}

async function recordAuditInTx(
  tx: TenantTx,
  event: {
    tenantId: string;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.insert(auditLogs).values({
    tenantId: event.tenantId,
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId ?? null,
    meta: event.meta ?? {},
  });
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

  try {
    await withTenant(tenantId, async (tx) => {
      await assertShopInTenant(tx, sourceShopId);
      await assertShopInTenant(tx, targetShopId);
      await tx.insert(storeLinks).values({ tenantId, sourceShopId, targetShopId });
      await recordAuditInTx(tx, {
        tenantId,
        action: "link.create",
        resourceType: "store_link",
        meta: { sourceShopId, targetShopId },
      });
    });
    logger.info({ event: "link.create", tenantId, sourceShopId, targetShopId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("store_links_pair_unique")) return { error: "link already exists" };
    if (msg.includes("shop not found in tenant")) return { error: "shop not in tenant" };
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
  await withTenant(parsed.data.tenantId, async (tx) => {
    await tx
      .update(storeLinks)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(storeLinks.id, parsed.data.linkId));

    await recordAuditInTx(tx, {
      tenantId: parsed.data.tenantId,
      action: enabled ? "link.enable" : "link.disable",
      resourceType: "store_link",
      resourceId: parsed.data.linkId,
    });
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

  await withTenant(parsed.data.tenantId, async (tx) => {
    await tx.delete(storeLinks).where(eq(storeLinks.id, parsed.data.linkId));
    await recordAuditInTx(tx, {
      tenantId: parsed.data.tenantId,
      action: "link.delete",
      resourceType: "store_link",
      resourceId: parsed.data.linkId,
    });
  });

  revalidatePath(`/app/links?shop=${encodeURIComponent(parsed.data.currentShop)}`);
  return {};
}
