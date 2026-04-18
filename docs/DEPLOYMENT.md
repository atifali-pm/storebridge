# Deployment (Railway, free tier)

This runbook walks deploying StoreBridge to Railway with two services (web + worker) and Railway-managed Postgres + Redis. Everything here stays inside Railway's free starter plan.

## 1. Create the Railway project

1. Sign up at https://railway.app (GitHub auth).
2. **New project** → **Deploy from GitHub repo** → select `atifali-pm/storebridge`.
3. Railway auto-detects the Next.js app and creates a web service.

## 2. Add Postgres

1. In the project → **+ New** → **Database** → **Add PostgreSQL**.
2. Railway injects `DATABASE_URL` into the project's shared variables.

**Session pooling note:** StoreBridge's RLS relies on `SET LOCAL` inside transactions. Use the **direct connection** URL (not a transaction-pooled URL). Railway's default Postgres is session-mode; no config needed.

## 3. Add Redis

1. **+ New** → **Database** → **Add Redis**.
2. Railway injects `REDIS_URL`.

## 4. Add the worker service

1. **+ New** → **Empty Service** → name it `worker`.
2. Settings → **Source** → connect to the same repo.
3. Settings → **Deploy** → **Start command**: `pnpm worker`
4. Share variables from the web service (Railway UI: "Add shared variable").

## 5. Environment variables

Set these in **Project Variables** (shared by both services):

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `APP_URL` | your Railway public URL, e.g. `https://storebridge.up.railway.app` |
| `SHOPIFY_APP_URL` | same as `APP_URL` |
| `SHOPIFY_API_KEY` | from Shopify Partner dashboard |
| `SHOPIFY_API_SECRET` | from Shopify Partner dashboard |
| `SHOPIFY_SCOPES` | `read_products,write_products,read_inventory,write_inventory` |
| `SHOPIFY_API_VERSION` | `2025-01` |
| `APP_ENCRYPTION_KEY` | `openssl rand -base64 32` (KEEP STABLE — rotating breaks stored tokens) |
| `LOG_LEVEL` | `info` |
| `SENTRY_DSN` | optional |

`DATABASE_URL` and `REDIS_URL` are auto-injected by the Railway add-ons.

## 6. Run migrations on first deploy

The web service should run `pnpm db:migrate` before `next start`. Either:

**A — deployment command:** Set the web service **Deploy Command** to `pnpm db:migrate && pnpm build && pnpm start` (if Railway doesn't already run build).

**B — manual first run:** Open a Railway shell on the web service and run `pnpm db:migrate` once. Subsequent migrations go through a migration step in CI or a separate migration service.

## 7. Configure Shopify Partner app

1. Partner dashboard → your app → **App setup**.
2. **App URL:** `https://<your-prod-url>/app`
3. **Allowed redirection URL:** `https://<your-prod-url>/api/auth/shopify/callback`
4. Save.

## 8. Install on dev stores

For each dev store:

```
https://<your-prod-url>/api/auth/shopify/install?shop=<shop>.myshopify.com
```

Approve the scopes; the callback redirects you back into the Shopify admin with the embedded StoreBridge UI.

## 9. Verify

- `curl https://<your-prod-url>/api/health` → `{"status":"ok","db":"ok",…}`
- Railway web service logs should show `event: "oauth.install.begin"` when a merchant starts install.
- Railway worker service logs should show `event: "worker.started"` at boot.
- After a test inventory change:
  - Web logs: `event: "webhook.enqueued"` or similar
  - Worker logs: `event: "sync.completed"`
  - Database: `SELECT * FROM sync_jobs ORDER BY created_at DESC LIMIT 5`

## 10. Custom domain (optional)

Railway → Web service → **Settings** → **Networking** → **Custom domain** → add your domain, create the CNAME record, update `APP_URL` and Partner-dashboard URLs accordingly.

## Free-tier guardrails

- Railway free plan: 500 execution hours/month shared across services. Two services at 24/7 uses ~720 h/month → **scale the worker to 0 when idle** (Railway allows pause/resume), or consolidate into a single process if load is trivial.
- Postgres free tier: 1 GB storage, 100 h runtime/month on the starter.
- Shopify dev stores: unlimited, no cost, no review process.
- Do **not** enable billed plugins — the app's billing code path is feature-flagged off and never hits Shopify Billing API.

## Rollback

Railway keeps deployment history; **Deployments** → select a prior one → **Redeploy**.

For DB rollbacks, Drizzle doesn't auto-generate down migrations. Keep a tested SQL rollback script alongside each schema migration, or restore from Railway's daily Postgres backup.
