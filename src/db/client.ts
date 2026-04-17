import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

declare global {
  var __storebridge_pg_pool__: Pool | undefined;
}

const pool =
  globalThis.__storebridge_pg_pool__ ??
  new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__storebridge_pg_pool__ = pool;
}

export const db = drizzle(pool, { schema });
export { pool };
export type Db = typeof db;
