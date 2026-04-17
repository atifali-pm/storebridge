import { env } from "../env";

export interface ShopInfo {
  id: number;
  name: string;
  email: string;
  domain: string;
  myshopifyDomain: string;
  currency: string;
  ianaTimezone: string;
}

export async function fetchShopInfo(opts: {
  shop: string;
  accessToken: string;
}): Promise<ShopInfo> {
  const { shop, accessToken } = opts;
  const version = env().SHOPIFY_API_VERSION;

  const res = await fetch(`https://${shop}/admin/api/${version}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({
      query: /* GraphQL */ `
        query ShopInfo {
          shop {
            id
            name
            email
            primaryDomain { host }
            myshopifyDomain
            currencyCode
            ianaTimezone
          }
        }
      `,
    }),
  });

  if (!res.ok) {
    throw new Error(`Shopify shop info failed (${res.status})`);
  }

  const json = (await res.json()) as {
    data?: {
      shop?: {
        id: string;
        name: string;
        email: string;
        primaryDomain: { host: string };
        myshopifyDomain: string;
        currencyCode: string;
        ianaTimezone: string;
      };
    };
    errors?: unknown;
  };

  if (json.errors || !json.data?.shop) {
    throw new Error(`Shopify shop info returned errors: ${JSON.stringify(json.errors ?? {})}`);
  }

  const s = json.data.shop;
  const idMatch = s.id.match(/(\d+)$/);
  return {
    id: idMatch ? Number(idMatch[1]) : 0,
    name: s.name,
    email: s.email,
    domain: s.primaryDomain.host,
    myshopifyDomain: s.myshopifyDomain,
    currency: s.currencyCode,
    ianaTimezone: s.ianaTimezone,
  };
}
