import { sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { db } from "./client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TenantTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function withTenant<T>(
  tenantId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(tenantId)) {
    throw new Error("withTenant: invalid tenant id");
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE app_user`);
    await tx.execute(sql`SELECT set_config('storebridge.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

/**
 * Run `fn` inside a transaction with RLS disabled (owner role) but still
 * carrying a tenant context set for audit/log purposes. For internal paths
 * where we need to reach across tenant boundaries (e.g. worker resolving
 * a sync link) but still want SET LOCAL for observability.
 */
export async function withSystemTenantContext<T>(
  tenantId: string | null,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    if (tenantId) {
      if (!UUID_RE.test(tenantId)) {
        throw new Error("withSystemTenantContext: invalid tenant id");
      }
      await tx.execute(sql`SELECT set_config('storebridge.tenant_id', ${tenantId}, true)`);
    }
    return fn(tx);
  });
}
