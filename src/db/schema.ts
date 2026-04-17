import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  bigint,
  boolean,
  integer,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tenants_slug_unique").on(t.slug)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    role: text("role", { enum: ["owner", "admin", "member"] }).notNull().default("member"),
    passwordHash: text("password_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_tenant_email_unique").on(t.tenantId, t.email),
    index("users_tenant_idx").on(t.tenantId),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("audit_logs_resource_idx").on(t.resourceType, t.resourceId),
  ],
);

export const shops = pgTable(
  "shops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    shopDomain: text("shop_domain").notNull(),
    shopifyShopId: bigint("shopify_shop_id", { mode: "number" }),
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    scope: text("scope").notNull(),
    installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
    uninstalledAt: timestamp("uninstalled_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("shops_shop_domain_unique").on(t.shopDomain),
    index("shops_tenant_idx").on(t.tenantId),
  ],
);

export const storeLinks = pgTable(
  "store_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sourceShopId: uuid("source_shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    targetShopId: uuid("target_shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    matchBy: text("match_by", { enum: ["sku"] }).notNull().default("sku"),
    enabled: boolean("enabled").notNull().default(true),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("store_links_pair_unique").on(t.sourceShopId, t.targetShopId),
    index("store_links_tenant_idx").on(t.tenantId),
    index("store_links_source_idx").on(t.sourceShopId),
    check("store_links_no_self", sql`${t.sourceShopId} != ${t.targetShopId}`),
  ],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopifyWebhookId: text("shopify_webhook_id"),
    shopDomain: text("shop_domain").notNull(),
    topic: text("topic").notNull(),
    payloadHash: text("payload_hash").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    status: text("status", {
      enum: ["received", "enqueued", "processed", "failed", "skipped_duplicate"],
    })
      .notNull()
      .default("received"),
    errorMessage: text("error_message"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
  },
  (t) => [
    uniqueIndex("webhook_events_webhook_id_unique").on(t.shopifyWebhookId),
    index("webhook_events_shop_topic_idx").on(t.shopDomain, t.topic),
    index("webhook_events_received_idx").on(t.receivedAt),
  ],
);

export const syncJobs = pgTable(
  "sync_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    linkId: uuid("link_id")
      .notNull()
      .references(() => storeLinks.id, { onDelete: "cascade" }),
    sourceShopId: uuid("source_shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    targetShopId: uuid("target_shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    sourceInventoryItemId: bigint("source_inventory_item_id", { mode: "number" }).notNull(),
    sku: text("sku"),
    available: integer("available").notNull(),
    status: text("status", {
      enum: ["queued", "running", "completed", "failed", "skipped"],
    })
      .notNull()
      .default("queued"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sync_jobs_link_created_idx").on(t.linkId, t.createdAt),
    index("sync_jobs_status_idx").on(t.status),
  ],
);

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type Shop = typeof shops.$inferSelect;
export type NewShop = typeof shops.$inferInsert;
export type StoreLink = typeof storeLinks.$inferSelect;
export type NewStoreLink = typeof storeLinks.$inferInsert;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;
export type SyncJob = typeof syncJobs.$inferSelect;
export type NewSyncJob = typeof syncJobs.$inferInsert;
