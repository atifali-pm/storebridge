# Shopify Partner setup

Steps to wire StoreBridge into a real Shopify Partner app and two dev stores.

## 1. Create a Shopify Partner account
- https://partners.shopify.com/signup (free)

## 2. Create a custom app
- Partner dashboard → **Apps** → **Create app** → **Create app manually**
- App name: `StoreBridge` (or `StoreBridge Dev`)
- App URL: `http://localhost:3000/app` (local) or your prod URL `/app`
- Allowed redirection URL(s): `http://localhost:3000/api/auth/shopify/callback`
- Copy **Client ID** → `SHOPIFY_API_KEY` in `.env.local`
- Copy **Client secret** → `SHOPIFY_API_SECRET` in `.env.local`

## 3. Configure scopes
In the app settings, confirm required scopes match `.env.local` `SHOPIFY_SCOPES`:
- `read_products`, `write_products`, `read_inventory`, `write_inventory`

## 4. Generate local crypto keys
```bash
# Token encryption key (32 bytes base64)
openssl rand -base64 32

# Better Auth secret (hex)
openssl rand -hex 32
```
Paste into `APP_ENCRYPTION_KEY` and `BETTER_AUTH_SECRET` in `.env.local`.

## 5. Create two dev stores
- Partner dashboard → **Stores** → **Add store** → **Development store**
- Create two: e.g. `storebridge-dev-a` and `storebridge-dev-b`
- Each gets a URL like `storebridge-dev-a.myshopify.com`

## 6. Expose localhost to Shopify
Shopify OAuth requires HTTPS. For local dev, use `cloudflared` or `ngrok`:
```bash
cloudflared tunnel --url http://localhost:3000
# copy the https://*.trycloudflare.com URL
```

Update `.env.local`:
```
APP_URL=https://your-tunnel.trycloudflare.com
SHOPIFY_APP_URL=https://your-tunnel.trycloudflare.com
```

Update Partner dashboard app settings:
- App URL: `https://your-tunnel.trycloudflare.com/app`
- Allowed redirection URL: `https://your-tunnel.trycloudflare.com/api/auth/shopify/callback`

## 7. Install the app on a dev store
Open in browser:
```
https://your-tunnel.trycloudflare.com/api/auth/shopify/install?shop=storebridge-dev-a.myshopify.com
```
This starts the OAuth flow. After approval, you'll land in the embedded admin at `/app` inside Shopify.

Repeat for the second dev store.

## Verifying the install
```sql
-- Connect to the local DB
docker exec -it storebridge-postgres psql -U storebridge -d storebridge

-- One row per installed shop
SELECT id, shop_domain, scope, installed_at FROM shops;

-- One audit log per install
SELECT tenant_id, action, resource_type, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 10;
```

## Gotchas
- The **embedded admin iframe requires HTTPS** — it won't load over `http://localhost`. Use the tunnel.
- The redirect URL in Partner dashboard must match exactly — no trailing slash mismatch.
- Dev store access tokens start with `shpat_` — stored encrypted in `shops.access_token_encrypted`.
- Polaris 13 shows an unmet React 19 peer warning — cosmetic, does not affect runtime.
