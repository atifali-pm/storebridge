import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { shops, storeLinks } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { isValidShopDomain } from "@/lib/shopify/oauth";
import { signMergeToken } from "@/lib/merge-token";
import { LinksView } from "./links-view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Props {
  searchParams: Promise<{ shop?: string; host?: string }>;
}

export default async function LinksPage({ searchParams }: Props) {
  const { shop, host } = await searchParams;

  if (!shop || !isValidShopDomain(shop)) {
    return <LinksView state="invalid" />;
  }

  const [currentShop] = await db.select().from(shops).where(eq(shops.shopDomain, shop)).limit(1);
  if (!currentShop) {
    return <LinksView state="not_installed" shop={shop} host={host} />;
  }

  const { tenantShops, links } = await withTenant(currentShop.tenantId, async (tx) => {
    const tenantShops = await tx
      .select({
        id: shops.id,
        shopDomain: shops.shopDomain,
        installedAt: shops.installedAt,
        uninstalledAt: shops.uninstalledAt,
      })
      .from(shops)
      .orderBy(desc(shops.installedAt));

    const links = await tx
      .select({
        id: storeLinks.id,
        sourceShopId: storeLinks.sourceShopId,
        targetShopId: storeLinks.targetShopId,
        enabled: storeLinks.enabled,
        matchBy: storeLinks.matchBy,
        lastSyncAt: storeLinks.lastSyncAt,
        createdAt: storeLinks.createdAt,
      })
      .from(storeLinks)
      .orderBy(desc(storeLinks.createdAt));

    return { tenantShops, links };
  });

  const mergeToken = signMergeToken(currentShop.tenantId);

  return (
    <LinksView
      state="ready"
      shop={shop}
      host={host}
      tenantId={currentShop.tenantId}
      shops={tenantShops.map((s) => ({
        id: s.id,
        shopDomain: s.shopDomain,
        installedAt: s.installedAt.toISOString(),
        uninstalledAt: s.uninstalledAt ? s.uninstalledAt.toISOString() : null,
      }))}
      links={links.map((l) => ({
        id: l.id,
        sourceShopId: l.sourceShopId,
        targetShopId: l.targetShopId,
        enabled: l.enabled,
        matchBy: l.matchBy,
        lastSyncAt: l.lastSyncAt ? l.lastSyncAt.toISOString() : null,
        createdAt: l.createdAt.toISOString(),
      }))}
      mergeToken={mergeToken}
    />
  );
}
