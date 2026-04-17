import { env } from "../env";

const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export function isValidShopDomain(shop: string): boolean {
  if (shop.length > 255) return false;
  return SHOP_DOMAIN_RE.test(shop);
}

export function buildAuthorizeUrl(opts: { shop: string; state: string; redirectUri: string }): string {
  const { shop, state, redirectUri } = opts;
  const e = env();
  const params = new URLSearchParams({
    client_id: e.SHOPIFY_API_KEY,
    scope: e.SHOPIFY_SCOPES,
    redirect_uri: redirectUri,
    state,
  });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

export interface TokenExchangeResult {
  accessToken: string;
  scope: string;
}

export async function exchangeCodeForToken(opts: {
  shop: string;
  code: string;
}): Promise<TokenExchangeResult> {
  const { shop, code } = opts;
  const e = env();

  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: e.SHOPIFY_API_KEY,
      client_secret: e.SHOPIFY_API_SECRET,
      code,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Shopify token exchange failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as { access_token?: string; scope?: string };
  if (!json.access_token || !json.scope) {
    throw new Error("Shopify token exchange returned invalid payload");
  }

  return { accessToken: json.access_token, scope: json.scope };
}

export function embeddedAdminUrl(shop: string): string {
  return `https://${shop}/admin/apps/${env().SHOPIFY_API_KEY}`;
}
