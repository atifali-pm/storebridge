# Security audit

This document enumerates the threats StoreBridge considers, the controls in place for each, and the known gaps a reviewer should weigh. It is structured so a security auditor can cross-reference every claim to a specific file, test, or migration.

## Scope

In scope:
- OAuth install + token handling for Shopify merchants
- Webhook ingress from Shopify
- Cross-tenant isolation in a multi-tenant database
- Embedded-admin iframe security
- Background worker integrity

Out of scope (documented as gaps):
- Subscription/billing fraud (no real billing — demo only)
- Denial-of-service at network layer (relies on hosting provider)
- Supply-chain review of NPM dependencies
- Full PII/GDPR data-subject workflow

## Threat model

| # | Threat | Controls | Evidence |
|---|---|---|---|
| T1 | **Cross-tenant data leakage** via app logic bug | App-level `tenant_id` scoping **plus** Postgres RLS policies keyed to `current_setting('storebridge.tenant_id')`. `withTenant()` wraps every tenant-scoped code path in a transaction, switches role to `app_user` (no `BYPASSRLS`), and sets the tenant GUC with `set_config()` (parameterized, no interpolation). | [`src/db/migrations/0003_rls_policies.sql`](../src/db/migrations/0003_rls_policies.sql), [`src/db/tenant-scope.ts`](../src/db/tenant-scope.ts), [`tests/tenant-isolation/rls.test.ts`](../tests/tenant-isolation/rls.test.ts) (16 assertions, SELECT/UPDATE/DELETE/INSERT attempts + fail-closed behavior) |
| T2 | **Webhook spoofing** — attacker posts forged `inventory_levels/update` to change inventory | Raw body is read *before* `JSON.parse`. `verifyWebhookHmac` computes `HMAC-SHA256(raw, SHOPIFY_API_SECRET)` and compares with the `X-Shopify-Hmac-Sha256` header using `timingSafeEqual`. Mismatch → 401. | [`src/app/api/webhooks/shopify/route.ts`](../src/app/api/webhooks/shopify/route.ts), [`src/lib/shopify/hmac.ts`](../src/lib/shopify/hmac.ts), [`tests/unit/hmac.test.ts`](../tests/unit/hmac.test.ts) |
| T3 | **OAuth CSRF / install hijacking** — attacker tricks merchant into installing under attacker-controlled state | Install route generates a 32-byte random `state`, stores `{shop}:{state}:{merge_token}` in an HttpOnly, SameSite=Lax, Secure-in-prod cookie. Callback verifies (a) HMAC over Shopify's query, (b) cookie shop matches query shop, (c) cookie state matches query state — all with `timingSafeEqual`. | [`src/app/api/auth/shopify/install/route.ts`](../src/app/api/auth/shopify/install/route.ts), [`src/app/api/auth/shopify/callback/route.ts`](../src/app/api/auth/shopify/callback/route.ts) |
| T4 | **Shop-domain injection** — `?shop=evil.com` or `?shop=shop.myshopify.com.attacker.com` | `isValidShopDomain()` enforces a strict regex `^[a-z0-9][a-z0-9-]*\.myshopify\.com$` and a 255-char length bound. Every code path that receives a shop parameter (install, callback, webhooks) validates it. | [`src/lib/shopify/oauth.ts`](../src/lib/shopify/oauth.ts), [`tests/unit/shop-domain.test.ts`](../tests/unit/shop-domain.test.ts) (accepts 4 valid forms, rejects 10 invalid forms including directory traversal and trailing whitespace) |
| T5 | **Access token theft via DB dump** | Tokens stored in `shops.access_token_encrypted` as AES-256-GCM ciphertext. Key from `APP_ENCRYPTION_KEY` env (32 bytes base64). Each encryption uses a fresh 12-byte IV; the GCM auth tag detects tampering. | [`src/lib/crypto.ts`](../src/lib/crypto.ts), [`tests/unit/crypto.test.ts`](../tests/unit/crypto.test.ts) (round-trip, random-IV uniqueness, auth-tag tamper detection) |
| T6 | **Webhook replay / duplicate processing** — Shopify retries or an attacker replays captured POSTs | `webhook_events.shopify_webhook_id` is a unique index. The insert happens before any business logic; a unique-violation triggers a 200 response with `duplicate: true` and no enqueue. BullMQ's `jobId` equals `webhook_events.id`, so even a bypass of the DB check cannot enqueue twice. | [`src/app/api/webhooks/shopify/route.ts`](../src/app/api/webhooks/shopify/route.ts), [`src/db/schema.ts`](../src/db/schema.ts) |
| T7 | **SQL injection via tenant id** — `withTenant(attacker-controlled-string, …)` | `withTenant` rejects any value not matching the UUID regex *before* reaching SQL. The tenant GUC is then set via `set_config(name, $1, true)` — a parameterized call, not string concatenation. | [`src/db/tenant-scope.ts`](../src/db/tenant-scope.ts), [`tests/tenant-isolation/rls.test.ts`](../tests/tenant-isolation/rls.test.ts) (the `"'; DROP TABLE …"` case) |
| T8 | **Merge-token forgery** — attacker forges a `merge_into` token to graft their shop into a victim tenant | Tokens are HMAC-SHA256(tenantId.expiresAt, SHOPIFY_API_SECRET). Verify runs a timing-safe hex compare and rejects expired, malformed, tampered-payload, and tampered-signature tokens. TTL is 15 minutes. | [`src/lib/merge-token.ts`](../src/lib/merge-token.ts), [`tests/unit/merge-token.test.ts`](../tests/unit/merge-token.test.ts) (5 cases) |
| T9 | **Iframe clickjacking / unauthorized embedding** | Middleware sets `Content-Security-Policy: frame-ancestors https://{shop} https://admin.shopify.com` for `/app/*` and deletes `X-Frame-Options`. Shop is validated against the same regex before interpolation. Routes outside `/app/*` get no frame-ancestors override — Next's defaults apply. | [`src/middleware.ts`](../src/middleware.ts) |
| T10 | **Outbound rate-limit exhaustion** — StoreBridge bursts > 40 req/s to a shop and triggers Shopify throttling or bans | Per-shop serial rate limiter: minInterval 50 ms (≈ 20 req/s per shop). Limiter enforces ordering via a promise chain so retries can't race. | [`src/lib/rate-limit.ts`](../src/lib/rate-limit.ts), [`tests/unit/rate-limit.test.ts`](../tests/unit/rate-limit.test.ts) |
| T11 | **Log-based token leakage** | pino logger redacts `access_token`, `accessToken`, `password`, `authorization`, `cookie` at any path depth before serialization. | [`src/lib/logger.ts`](../src/lib/logger.ts) |
| T12 | **Uninstalled-shop continued access** | `app/uninstalled` webhook sets `shops.uninstalled_at`. Worker skips jobs whose source or target shop is uninstalled before making any Shopify call. | [`src/app/api/webhooks/shopify/route.ts`](../src/app/api/webhooks/shopify/route.ts), [`src/workers/inventory-sync.worker.ts`](../src/workers/inventory-sync.worker.ts) |
| T13 | **Inventory sync echo loop** between two linked shops A↔B | Phase 3 ships **one-way links only** — A→B does not imply B→A. If an operator creates both A→B and B→A, the echo is possible. Planned mitigation: de-duplicate on (target_shop, inventory_item, quantity) within a sliding window. | [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md), [`src/workers/inventory-sync.worker.ts`](../src/workers/inventory-sync.worker.ts) |

## Control map

- **Authentication** → Shopify OAuth 2.0 for merchants; (future) Better Auth for StoreBridge team/admin users
- **Authorization** → RLS policies + withTenant wrapper (T1)
- **Cryptographic integrity** → HMAC-SHA256 on OAuth query, webhooks, and merge tokens (T2, T3, T8)
- **Cryptographic confidentiality** → AES-256-GCM for access tokens at rest (T5)
- **Input validation** → Zod schemas on every server-action form, regex on shop domain, UUID regex on tenant id (T4, T7)
- **Idempotency** → unique shopify_webhook_id + BullMQ jobId (T6)
- **Rate limiting** → per-shop outbound limiter (T10)
- **Audit** → `audit_logs` row on every tenant-affecting mutation
- **Observability** → pino structured logs with redaction (T11), `/api/health`, Sentry hook

## Known gaps and tradeoffs

The following are intentional omissions or planned work, flagged here so a reviewer knows what is not claimed:

1. **Sentry integration is hook-level, not full instrumentation.** `captureException` exists but the full `@sentry/nextjs` wizard (sourcemaps upload, edge runtime, etc.) is deferred.
2. **`webhook_events` table has no RLS.** It is a system-owned log table, accessed only by the owner role (webhook handler + worker). Exposing this table to tenant-scoped queries would require an additional RLS policy joining via `shops.shop_domain`.
3. **Inbound rate limiting on `/api/auth/shopify/install`** — bots can trigger arbitrary Shopify authorize redirects. Since the redirect is cheap and merchants must still grant scopes, impact is low. Adding an IP-based limiter is future work.
4. **Bidirectional inventory sync**, if enabled manually by creating both A→B and B→A links, will echo. Phase 3 documents this; Phase 4 does not fix it.
5. **Token decryption materializes plaintext in process memory** during GraphQL calls. A memory-dump attacker with host access could extract tokens. Mitigation would require an HSM or remote signing — out of scope for a free-tier demo.
6. **PgBouncer compatibility.** RLS + `SET LOCAL` relies on transaction-scoped GUCs, which require session-mode pooling or a pooler that preserves transaction boundaries. If deploying behind PgBouncer, use session mode, not transaction mode.
7. **Supply-chain.** No `npm audit` automation or dependency pinning beyond pnpm-lock. A production deploy should add Dependabot or Renovate.
8. **CSRF on Server Actions.** Next.js 14+ Server Actions use an encrypted action id — considered safe by default. No additional CSRF token is in place.

## Verifying the claims

| Claim | Command |
|---|---|
| Unit-test HMAC, crypto, merge-token, rate limit, shop domain | `pnpm test` (37 tests) |
| Postgres RLS prevents cross-tenant access | `pnpm test:isolation` (16 tests) |
| Migration applies cleanly | `pnpm db:migrate` |
| Type safety | `pnpm typecheck` |

## Change log

- **2026-04-18** — Phase 4: RLS policies + app_user role + withTenant wrapper + tenant-isolation suite + outbound rate limiter. This document written.
- **2026-04-17** — Phase 2: HMAC for OAuth + webhooks, AES-256-GCM token storage. Phase 3: webhook idempotency + merge-token signing.
