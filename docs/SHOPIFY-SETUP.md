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

## Phase 3: inventory sync

### 1. Start the background worker
Webhook processing and inventory sync run in a separate Node process:
```bash
pnpm worker
```
Keep it running alongside `pnpm dev`. It pulls jobs from BullMQ (Redis on port 6390) and pushes inventory updates to linked stores.

### 2. Install on a second store
Inside the embedded admin on your first store, go to **Store links** → **Connect another store**. Enter `<second-shop>.myshopify.com` and start the install. The callback flow carries a signed `merge_into` token so the new shop joins the same tenant.

### 3. Create a sync link
Once both stores are under one tenant, the **New link** card shows. Pick a source and target, click **Create link**. Links are SKU-matched and one-way.

### 4. Test a sync end to end
1. In the source store admin, change the inventory level for a product with a known SKU.
2. Shopify fires `inventory_levels/update` → StoreBridge webhook.
3. Worker picks it up, finds the matching SKU in the target store, sets inventory on the target's primary active location.
4. Verify:
   ```sql
   SELECT source_shop_id, target_shop_id, status, sku, available, error_message, completed_at
   FROM sync_jobs ORDER BY created_at DESC LIMIT 5;
   ```
5. Inventory on the target store should reflect the change within a few seconds.

### Echo loop protection
Phase 3 ships **one-way** links. Creating both A→B and B→A will loop. Future phases may add debouncing.

### Uninstall
If a merchant uninstalls the app, Shopify fires `app/uninstalled`. StoreBridge marks `shops.uninstalled_at` and the worker skips syncs involving uninstalled stores.
