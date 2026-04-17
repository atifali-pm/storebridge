import { decrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import type { Shop } from "@/db/schema";

export interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; locations?: unknown; path?: unknown }>;
  extensions?: unknown;
}

export async function shopifyGraphQL<T>(opts: {
  shop: { shopDomain: string; accessTokenEncrypted: string } | Shop;
  query: string;
  variables?: Record<string, unknown>;
}): Promise<T> {
  const version = env().SHOPIFY_API_VERSION;
  const token = decrypt(opts.shop.accessTokenEncrypted);

  const res = await fetch(`https://${opts.shop.shopDomain}/admin/api/${version}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
      Accept: "application/json",
    },
    body: JSON.stringify({ query: opts.query, variables: opts.variables ?? {} }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Shopify GraphQL ${opts.shop.shopDomain} HTTP ${res.status}: ${body.slice(0, 500)}`);
  }

  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors && json.errors.length > 0) {
    throw new Error(
      `Shopify GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`,
    );
  }
  if (!json.data) {
    throw new Error("Shopify GraphQL returned empty data");
  }
  return json.data;
}
