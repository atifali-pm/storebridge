import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { shops, storeLinks, tenants, users, auditLogs } from "@/db/schema";
import { withTenant } from "@/db/tenant-scope";
import { db } from "@/db/client";
import { seedFixtures, cleanup, type IsolationFixtures } from "./setup";

let F: IsolationFixtures;

beforeAll(async () => {
  F = await seedFixtures();
});

afterAll(async () => {
  if (F) await cleanup(F);
});

describe("RLS: select isolation", () => {
  it("tenant A sees only its own shops", async () => {
    const rows = await withTenant(F.tenantA.id, (tx) => tx.select().from(shops));
    expect(rows.length).toBe(2);
    for (const r of rows) expect(r.tenantId).toBe(F.tenantA.id);
  });

  it("tenant B sees only its own shops", async () => {
    const rows = await withTenant(F.tenantB.id, (tx) => tx.select().from(shops));
    expect(rows.length).toBe(2);
    for (const r of rows) expect(r.tenantId).toBe(F.tenantB.id);
  });

  it("tenant A cannot see tenant B's tenants row", async () => {
    const rows = await withTenant(F.tenantA.id, (tx) => tx.select().from(tenants));
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(F.tenantA.id);
  });

  it("tenant A cannot see tenant B's users", async () => {
    const rows = await withTenant(F.tenantA.id, (tx) => tx.select().from(users));
    for (const r of rows) expect(r.tenantId).toBe(F.tenantA.id);
    expect(rows.find((r) => r.id === F.userB.id)).toBeUndefined();
  });

  it("tenant A cannot see tenant B's store_links", async () => {
    const rows = await withTenant(F.tenantA.id, (tx) => tx.select().from(storeLinks));
    for (const r of rows) expect(r.tenantId).toBe(F.tenantA.id);
    expect(rows.find((r) => r.id === F.linkB.id)).toBeUndefined();
  });

  it("tenant A cannot see tenant B's audit_logs", async () => {
    const rows = await withTenant(F.tenantA.id, (tx) => tx.select().from(auditLogs));
    for (const r of rows) expect(r.tenantId).toBe(F.tenantA.id);
  });
});

describe("RLS: mutation isolation", () => {
  it("tenant A cannot UPDATE tenant B's shop (affects 0 rows)", async () => {
    const result = await withTenant(F.tenantA.id, (tx) =>
      tx.execute(sql`UPDATE shops SET scope = 'pwned' WHERE id = ${F.shopB.id}`),
    );
    expect(result.rowCount).toBe(0);

    const row = (
      await db.execute(sql`SELECT scope FROM shops WHERE id = ${F.shopB.id}`)
    ).rows[0] as { scope: string } | undefined;
    expect(row?.scope).not.toBe("pwned");
  });

  it("tenant A cannot DELETE tenant B's store_link (affects 0 rows)", async () => {
    const result = await withTenant(F.tenantA.id, (tx) =>
      tx.execute(sql`DELETE FROM store_links WHERE id = ${F.linkB.id}`),
    );
    expect(result.rowCount).toBe(0);

    const row = (
      await db.execute(sql`SELECT id FROM store_links WHERE id = ${F.linkB.id}`)
    ).rows[0];
    expect(row).toBeDefined();
  });

  it("tenant A cannot INSERT a shop with tenant_id = B (WITH CHECK fails)", async () => {
    await expect(
      withTenant(F.tenantA.id, (tx) =>
        tx.execute(sql`
          INSERT INTO shops (tenant_id, shop_domain, access_token_encrypted, scope)
          VALUES (${F.tenantB.id}::uuid, 'inj.myshopify.com', 'x', 'read_products')
        `),
      ),
    ).rejects.toThrow();
    const [row] = (
      await db.execute(sql`SELECT id FROM shops WHERE shop_domain = 'inj.myshopify.com'`)
    ).rows as { id: string }[];
    expect(row).toBeUndefined();
  });

  it("tenant A cannot INSERT a store_link under tenant B", async () => {
    await expect(
      withTenant(F.tenantA.id, (tx) =>
        tx.execute(sql`
          INSERT INTO store_links (tenant_id, source_shop_id, target_shop_id)
          VALUES (${F.tenantB.id}::uuid, ${F.shopB.id}::uuid, ${F.shopB2.id}::uuid)
        `),
      ),
    ).rejects.toThrow();
  });

  it("tenant A UPDATE of its own shop succeeds", async () => {
    const result = await withTenant(F.tenantA.id, (tx) =>
      tx.execute(sql`UPDATE shops SET scope = 'read_products,write_products' WHERE id = ${F.shopA.id}`),
    );
    expect(result.rowCount).toBe(1);
  });
});

describe("RLS: fail-closed behavior", () => {
  it("without tenant context, app_user sees zero rows", async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE app_user`);
      return tx.select().from(shops);
    });
    expect(rows).toEqual([]);
  });

  it("without tenant context, INSERT as app_user is rejected", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL ROLE app_user`);
        await tx.execute(sql`
          INSERT INTO shops (tenant_id, shop_domain, access_token_encrypted, scope)
          VALUES (${F.tenantA.id}::uuid, 'no-ctx.myshopify.com', 'x', 'read_products')
        `);
      }),
    ).rejects.toThrow();
  });

  it("withTenant rejects non-UUID input (no SQL injection via set_config)", async () => {
    await expect(
      withTenant("'; DROP TABLE tenants; --", async () => {
        /* never reached */
      }),
    ).rejects.toThrow(/invalid tenant id/);
  });

  it("after transaction ends, tenant setting does not leak to next query", async () => {
    await withTenant(F.tenantA.id, (tx) => tx.select().from(shops));
    const result = await db.execute(sql`SELECT current_setting('storebridge.tenant_id', true) AS v`);
    const v = (result.rows?.[0] as { v: string | null } | undefined)?.v ?? null;
    expect(v === null || v === "").toBe(true);
  });
});

describe("RLS: tenant switching within same connection", () => {
  it("switching tenant via a new withTenant block returns that tenant's data", async () => {
    const aShops = await withTenant(F.tenantA.id, (tx) => tx.select().from(shops));
    const bShops = await withTenant(F.tenantB.id, (tx) => tx.select().from(shops));
    expect(aShops.every((s) => s.tenantId === F.tenantA.id)).toBe(true);
    expect(bShops.every((s) => s.tenantId === F.tenantB.id)).toBe(true);
    const aIds = new Set(aShops.map((s) => s.id));
    const bIds = new Set(bShops.map((s) => s.id));
    for (const id of aIds) expect(bIds.has(id)).toBe(false);
  });
});
