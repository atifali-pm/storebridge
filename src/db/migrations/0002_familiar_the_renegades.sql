CREATE TABLE "store_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source_shop_id" uuid NOT NULL,
	"target_shop_id" uuid NOT NULL,
	"match_by" text DEFAULT 'sku' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_links_no_self" CHECK ("store_links"."source_shop_id" != "store_links"."target_shop_id")
);
--> statement-breakpoint
CREATE TABLE "sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"link_id" uuid NOT NULL,
	"source_shop_id" uuid NOT NULL,
	"target_shop_id" uuid NOT NULL,
	"source_inventory_item_id" bigint NOT NULL,
	"sku" text,
	"available" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shopify_webhook_id" text,
	"shop_domain" text NOT NULL,
	"topic" text NOT NULL,
	"payload_hash" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"status" text DEFAULT 'received' NOT NULL,
	"error_message" text,
	"payload" jsonb
);
--> statement-breakpoint
ALTER TABLE "store_links" ADD CONSTRAINT "store_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_links" ADD CONSTRAINT "store_links_source_shop_id_shops_id_fk" FOREIGN KEY ("source_shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_links" ADD CONSTRAINT "store_links_target_shop_id_shops_id_fk" FOREIGN KEY ("target_shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_link_id_store_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."store_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_source_shop_id_shops_id_fk" FOREIGN KEY ("source_shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_target_shop_id_shops_id_fk" FOREIGN KEY ("target_shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "store_links_pair_unique" ON "store_links" USING btree ("source_shop_id","target_shop_id");--> statement-breakpoint
CREATE INDEX "store_links_tenant_idx" ON "store_links" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "store_links_source_idx" ON "store_links" USING btree ("source_shop_id");--> statement-breakpoint
CREATE INDEX "sync_jobs_link_created_idx" ON "sync_jobs" USING btree ("link_id","created_at");--> statement-breakpoint
CREATE INDEX "sync_jobs_status_idx" ON "sync_jobs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_webhook_id_unique" ON "webhook_events" USING btree ("shopify_webhook_id");--> statement-breakpoint
CREATE INDEX "webhook_events_shop_topic_idx" ON "webhook_events" USING btree ("shop_domain","topic");--> statement-breakpoint
CREATE INDEX "webhook_events_received_idx" ON "webhook_events" USING btree ("received_at");