import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { shops } from "@/db/schema";
import { isValidShopDomain } from "@/lib/shopify/oauth";
import { EmbeddedHome } from "./embedded-home";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Props {
  searchParams: Promise<{ shop?: string; host?: string }>;
}

export default async function EmbeddedRoot({ searchParams }: Props) {
  const { shop, host } = await searchParams;

  if (!shop || !isValidShopDomain(shop)) {
    return <EmbeddedHome state="invalid" />;
  }

  const [row] = await db
    .select({ id: shops.id, shopDomain: shops.shopDomain, installedAt: shops.installedAt })
    .from(shops)
    .where(eq(shops.shopDomain, shop))
    .limit(1);

  if (!row) {
    return <EmbeddedHome state="not_installed" shop={shop} host={host} />;
  }

  return (
    <EmbeddedHome
      state="installed"
      shop={row.shopDomain}
      host={host}
      installedAt={row.installedAt.toISOString()}
    />
  );
}
