import type { Shop } from "@/db/schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { shopifyGraphQL } from "./api-client";

const TOPIC_TO_ENUM: Record<string, string> = {
  "inventory_levels/update": "INVENTORY_LEVELS_UPDATE",
  "app/uninstalled": "APP_UNINSTALLED",
};

export const MANDATORY_TOPICS = Object.keys(TOPIC_TO_ENUM);

function callbackUrlFor(_topic: string): string {
  return new URL("/api/webhooks/shopify", env().SHOPIFY_APP_URL).toString();
}

export async function registerWebhooks(shop: Shop): Promise<void> {
  for (const topic of MANDATORY_TOPICS) {
    const topicEnum = TOPIC_TO_ENUM[topic];
    const callbackUrl = callbackUrlFor(topic);

    try {
      const data = await shopifyGraphQL<{
        webhookSubscriptionCreate: {
          webhookSubscription: { id: string } | null;
          userErrors: Array<{ field: string[]; message: string }>;
        };
      }>({
        shop,
        query: /* GraphQL */ `
          mutation WebhookCreate($topic: WebhookSubscriptionTopic!, $input: WebhookSubscriptionInput!) {
            webhookSubscriptionCreate(topic: $topic, webhookSubscription: $input) {
              webhookSubscription { id }
              userErrors { field message }
            }
          }
        `,
        variables: {
          topic: topicEnum,
          input: { callbackUrl, format: "JSON" },
        },
      });

      const errs = data.webhookSubscriptionCreate.userErrors;
      const takenByAnotherApp = errs.find((e) =>
        /already been taken|has already been taken|address for this topic has already been taken/i.test(e.message),
      );
      if (takenByAnotherApp) {
        logger.info({ shop: shop.shopDomain, topic, event: "webhook.already_registered" });
        continue;
      }
      if (errs.length > 0) {
        logger.warn({ shop: shop.shopDomain, topic, errs, event: "webhook.register.user_errors" });
        continue;
      }
      logger.info({
        shop: shop.shopDomain,
        topic,
        subscriptionId: data.webhookSubscriptionCreate.webhookSubscription?.id,
        event: "webhook.registered",
      });
    } catch (err) {
      logger.error({
        shop: shop.shopDomain,
        topic,
        err: err instanceof Error ? err.message : String(err),
        event: "webhook.register.failed",
      });
    }
  }
}
