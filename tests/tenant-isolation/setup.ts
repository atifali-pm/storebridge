import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tenants, shops, users, storeLinks, auditLogs } from "@/db/schema";

config({ path: ".env.local" });
config({ path: ".env" });

export interface IsolationFixtures {
  tenantA: { id: string; slug: string };
  tenantB: { id: string; slug: string };
  shopA: { id: string };
  shopB: { id: string };
  shopA2: { id: string };
  shopB2: { id: string };
  userA: { id: string };
  userB: { id: string };
  linkA: { id: string };
  linkB: { id: string };
  auditA: { id: string };
  auditB: { id: string };
}

function base64Placeholder(bytes: number): string {
  return Buffer.alloc(bytes).toString("base64");
}

export async function seedFixtures(): Promise<IsolationFixtures> {
  const rand = () => randomBytes(4).toString("hex");
  const slugA = `iso-a-${rand()}.myshopify.com`;
  const slugB = `iso-b-${rand()}.myshopify.com`;

  const [a] = await db.insert(tenants).values({ name: "Tenant A", slug: slugA }).returning({ id: tenants.id });
  const [b] = await db.insert(tenants).values({ name: "Tenant B", slug: slugB }).returning({ id: tenants.id });

  const [sa] = await db
    .insert(shops)
    .values({
      tenantId: a.id,
      shopDomain: `a1-${rand()}.myshopify.com`,
      accessTokenEncrypted: base64Placeholder(40),
      scope: "read_products",
    })
    .returning({ id: shops.id });

  const [sa2] = await db
    .insert(shops)
    .values({
      tenantId: a.id,
      shopDomain: `a2-${rand()}.myshopify.com`,
      accessTokenEncrypted: base64Placeholder(40),
      scope: "read_products",
    })
    .returning({ id: shops.id });

  const [sb] = await db
    .insert(shops)
    .values({
      tenantId: b.id,
      shopDomain: `b1-${rand()}.myshopify.com`,
      accessTokenEncrypted: base64Placeholder(40),
      scope: "read_products",
    })
    .returning({ id: shops.id });

  const [sb2] = await db
    .insert(shops)
    .values({
      tenantId: b.id,
      shopDomain: `b2-${rand()}.myshopify.com`,
      accessTokenEncrypted: base64Placeholder(40),
      scope: "read_products",
    })
    .returning({ id: shops.id });

  const [ua] = await db
    .insert(users)
    .values({ tenantId: a.id, email: `owner@a-${rand()}.test`, role: "owner" })
    .returning({ id: users.id });
  const [ub] = await db
    .insert(users)
    .values({ tenantId: b.id, email: `owner@b-${rand()}.test`, role: "owner" })
    .returning({ id: users.id });

  const [la] = await db
    .insert(storeLinks)
    .values({ tenantId: a.id, sourceShopId: sa.id, targetShopId: sa2.id })
    .returning({ id: storeLinks.id });
  const [lb] = await db
    .insert(storeLinks)
    .values({ tenantId: b.id, sourceShopId: sb.id, targetShopId: sb2.id })
    .returning({ id: storeLinks.id });

  const [auA] = await db
    .insert(auditLogs)
    .values({ tenantId: a.id, action: "test.seed", resourceType: "tenant" })
    .returning({ id: auditLogs.id });
  const [auB] = await db
    .insert(auditLogs)
    .values({ tenantId: b.id, action: "test.seed", resourceType: "tenant" })
    .returning({ id: auditLogs.id });

  return {
    tenantA: { id: a.id, slug: slugA },
    tenantB: { id: b.id, slug: slugB },
    shopA: { id: sa.id },
    shopB: { id: sb.id },
    shopA2: { id: sa2.id },
    shopB2: { id: sb2.id },
    userA: { id: ua.id },
    userB: { id: ub.id },
    linkA: { id: la.id },
    linkB: { id: lb.id },
    auditA: { id: auA.id },
    auditB: { id: auB.id },
  };
}

export async function cleanup(f: IsolationFixtures): Promise<void> {
  await db.delete(tenants).where(eq(tenants.id, f.tenantA.id));
  await db.delete(tenants).where(eq(tenants.id, f.tenantB.id));
}
