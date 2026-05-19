# StoreBridge — Publishing Handoff

> Code is done (Phases 1-5 complete, 53 tests passing, Railway config committed). This doc lists what's left to actually call StoreBridge "shipped" across portfolio site, Contra, LinkedIn, Fiverr, and Upwork.
>
> Read this top-to-bottom before doing anything. Each step is gated on the previous one finishing cleanly.

## Current state (verified 2026-04-25)

- Code: all 5 phases committed; last 3 commits were Railway deploy fixes (`Pin Node 22`, `Move db:migrate from build to start`, `Drop output:standalone in next.config`)
- GitHub: https://github.com/atifali-pm/storebridge — public, last push 2026-04-20
- Docs: `docs/ARCHITECTURE.md`, `docs/SECURITY-AUDIT.md`, `docs/DEPLOYMENT.md`, `docs/SHOPIFY-SETUP.md` all present
- Tests: 37 unit + 16 tenant-isolation against real Postgres = 53 passing
- Railway project ID locked in `.env.local`: `37fa4068-6dee-4a7a-b417-78ea5c918a2c`
- **Live URL: not confirmed.** Last commit fixed a `next start` standalone-mode error; deploy status after that commit is unknown
- **Screenshots: none.** No `/screenshots/` directory exists

## Remaining work

### Step 1. Verify Railway deploy is actually live

Goal: a public HTTPS URL where `/api/health` returns 200 and the Shopify install route works.

Actions:
- `railway status` (or open the Railway dashboard for project `37fa4068-6dee-4a7a-b417-78ea5c918a2c`)
- Check the latest deployment's build + runtime logs. The fix in commit `3ec1134` removed `output: "standalone"` from `next.config.ts`. Confirm a deploy after that commit succeeded
- Hit the public URL: `curl -i https://<railway-url>/api/health` — expect `200 {"ok":true}` (or whatever shape the health route returns; check `src/app/api/health/route.ts`)
- Hit `/` and confirm the landing page renders (or returns a sane 401/redirect to install)
- Capture the live URL. Save it where the next steps can grab it

If the deploy is broken: read `docs/DEPLOYMENT.md` runbook, fix the issue, push, redeploy. Do not proceed to Step 2 until the URL is green.

Common failure points to check first:
- Required env vars missing in Railway: `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `APP_ENCRYPTION_KEY` (32-byte base64), `DATABASE_URL` (Railway Postgres add-on), `REDIS_URL` (Railway Redis add-on), `SHOPIFY_APP_URL` (set to the Railway URL itself, not localhost), `BETTER_AUTH_URL` (same)
- Worker service: the BullMQ worker is a separate Railway service. Confirm both web and worker are deployed and healthy
- Migrations: `pnpm db:migrate` runs on start. If the DB is empty or the connection string is wrong, the start command fails

### Step 2. Install on a Shopify dev store and capture screenshots

Goal: 4-6 screenshots saved to `/screenshots/` at the repo root, ready for the portfolio-maintainer agent to pick up.

Prereqs:
- Live Railway URL from Step 1
- Shopify Partner account with at least one dev store (per `docs/SHOPIFY-SETUP.md`)
- The Partner-dashboard app entry's "App URL" and "Allowed redirection URLs" must point to the live Railway URL, not localhost

Actions:
- Create the `/screenshots/` directory at the repo root: `mkdir -p screenshots && touch screenshots/.gitkeep`
- Update `.gitignore` to NOT ignore `/screenshots/` (verify it isn't already on the ignore list)
- Install StoreBridge on dev store A from the Partner dashboard. Capture:
  - `01-shopify-install-consent.png` — the OAuth scope-grant screen
  - `02-embedded-admin-empty.png` — the Polaris admin shell after install, before any data
- Install on dev store B (or use the merge-token flow per `docs/SHOPIFY-SETUP.md`). Capture:
  - `03-merchant-merge-flow.png` — the second-shop attach UI
- Trigger an inventory change in store A. Capture:
  - `04-inventory-sync-running.png` — the admin showing the sync in flight or completed
  - `05-audit-log-view.png` — the audit log row that proves the mutation was captured (IP, action, before/after)
- Optional: capture the test suite output as a screenshot (`06-tests-passing.png` showing `53 passed`) since the tenant isolation suite is the marquee feature

Naming rules: `NN-short-description.png`, lowercase, hyphen-separated. The portfolio-maintainer reads this directory.

Resolution: at least 1280px wide. Crop to relevant content, no full-desktop noise.

### Step 3. Promote to atifali.pages.dev

Goal: a StoreBridge case study live on the portfolio site.

Actions (run from `~/projects/portfolio/`, NOT from this repo):

```bash
cd ~/projects/portfolio
claude
```

In that session:

```
@portfolio-maintainer dry-run
```

The agent reads this repo's README, screenshots, and metadata, then drafts the case-study entry. Review the dry-run output. If it looks right:

```
@portfolio-maintainer
```

That commits and pushes the case study. The site auto-deploys via Cloudflare Pages within a minute or two.

After the page is live, verify:
- Banner image renders
- All screenshots load
- GitHub link points to atifali-pm/storebridge
- Live demo link points to the Railway URL from Step 1

### Step 4. Distribute to other surfaces

These are independent and can be done in any order once Steps 1-3 are clean.

#### 4a. Contra case study
- Open the Contra case study playbook at `~/.claude/projects/-home-atif-projects-portfolio/memory/reference_contra_case_study_playbook.md`
- Use the 11-section block structure
- Publish at `contra.com/atif_ali_awtxw4wu`

#### 4b. LinkedIn
- Add to **Featured** section with link to the atifali.pages.dev case study (NOT to GitHub; per [feedback_portfolio_link_to_website.md])
- Add to **Projects** section
- Compose 1 announcement post: angle = "I shipped StoreBridge — multi-tenant Shopify SaaS with Postgres RLS, HMAC webhooks, AES-256 token storage at rest. 16-assertion tenant-isolation suite. MIT." Keep it terse, no AI-tell phrases (no "seamless", "robust", "leverage")

#### 4c. Fiverr portfolio package
- Build the package at `/home/atif/projects/portfolio/fiverr-portfolio/output/storebridge/`
- Follow `~/.claude/projects/-home-atif-projects-portfolio/memory/reference_fiverr_publishing_guide.md`
- Link to the right Fiverr gig: probably the Shopify-adjacent gig if there is one, otherwise the senior backend / SaaS gig

#### 4d. Upwork portfolio entry
- Add a portfolio item linking to the atifali.pages.dev case study URL
- Same copy-style rules: no em dashes, no " - " separators, no AI-tell phrases

#### 4e. (Optional) 90-second demo video
- Loom or OBS, 90 seconds max
- Show: Shopify install → admin shell → inventory change in store A → see it propagate to store B → audit log row
- Embed in the atifali.pages.dev case study and the Contra entry

## Hard rules (do not violate)

- **No Co-Authored-By or AI attribution in any commit.** Ever. The `.mailmap` file is already in place to suppress stale Claude attribution from older commits
- **No em dashes, no " - " sentence pauses** in any copy (case study, LinkedIn post, Contra entry, README updates)
- **All portfolio surface links go to atifali.pages.dev**, not GitHub. The case study is the canonical landing surface
- **Railway free tier:** the live demo will sleep after inactivity. Mention this in the case study so cold-load delays aren't a credibility hit
- **Don't refactor or add features during the publishing pass.** If a real bug is found, fix it. Otherwise stay focused on shipping what exists

## Paste-ready kickoff prompt (for the storebridge Claude session)

Drop this into a fresh Claude session opened in `/home/atif/projects/storebridge/`:

```
Read HANDS-ON-PUBLISH.md top to bottom. Start at Step 1: verify the Railway
deploy is actually live. Use `railway status` and curl the health endpoint.
If the deploy is broken, fix it before doing anything else (the runbook is
in docs/DEPLOYMENT.md). Once the URL is green, save it and stop. Do not
proceed to Step 2 without me confirming.
```

After Step 1 lands, the next iteration prompt is:

```
Step 1 is done. Live URL is <paste URL>. Move to Step 2: install on Shopify
dev stores and capture the 5-6 screenshots listed in HANDS-ON-PUBLISH.md.
Drop them into /screenshots/ at the repo root with the naming pattern from
the doc. Stop after screenshots land; I'll run the portfolio-maintainer
from the portfolio session.
```
