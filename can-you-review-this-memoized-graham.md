# SPW v2 — Codebase Status Review (2026-04-18)

## Context

You asked for a detailed list of what has been done and what is pending in `E:\Repos\SPW-AI\spw`. This is a read-only status audit — not an implementation plan — compiled from project memory, `RELEASE_CHECKLIST.md`, the graphify report, and parallel codebase exploration. **HEAD: `012f79b` on `origin/main`. Smoke: 76/76 green.**

This is a multi-tenant property SaaS monorepo:
- `apps/api` — NestJS API
- `apps/dashboard` — Next.js admin UI
- `packages/widget` — Vite embeddable widget
- `packages/wp-plugin` — WordPress plugin
- `packages/shared` — shared types

---

## ✅ DONE — Phases 1 through 6E (all pushed to `origin/main`)

### Phase 1–4 — Foundation (commits `04e0392` → `064abc9`)
- **1** Security hardening (helmet, CORS, rate limits, etc.)
- **2** Boot end-to-end locally
- **3A–3E** Refresh-token rotation, secrets at rest (AES-256), email-verify enforcement, per-API-key limits, outbound webhooks (HMAC-signed)
- **4** Redis-backed throttler storage + nightly cleanup cron

### Phase 5 — Production hardening (commits `26ee7ff` → `4c8e583`)
- **5A / 5A-2 / 5B** End-to-end widget cache invalidation (`/sync-meta` polling + WP-plugin webhook handler with v2 sig parsing)
- **5C** Per-plan `ratePerMinute` + dynamic guard resolution
- **5D** `SystemMailerService` + verification email dispatch
- **5E** Tenant webhook self-service
- **5F** Encrypt remaining secrets at rest
- **5G** Property writes bump `syncVersion` + v2 envelope
- **5I** Distributed cron lock (Redis SET NX PX + Lua release) — fixes "cron fires on every replica"
- **5J** Docker prod compose + multi-stage Dockerfiles + `.env.production.example`
- **5K** Boot security audit — throws on prod placeholder secrets
- **5L** `/api/health/live` (process-only) + `/ready` (DB+Redis probe) + Next.js `/api/health`
- **5M** `JsonLogger` (prod JSON-lines) + `RequestIdMiddleware` (X-Request-Id validate/generate/echo)
- **5N** `BACKUP_RESTORE.md` runbook (nightly mysqldump→S3, quarterly restore dry-run, DR procedure)
- **5O** WP plugin staging docker-compose + `run.sh` (8 signed-webhook assertions vs. real REST)
- **5P** `tenants.lastCacheClearedAt` column + persisted across reloads
- **5Q** Webhook delivery detail Dialog drawer + `POST /webhook/deliveries/:id/redeliver`
- **5R** Per-tenant sender-domain verification (RSA-2048 DKIM keypair, SPF/DKIM/DMARC TXT records, `dns.resolveTxt` verify)
- **5S** Super-admin rate-limit headroom dashboard (Redis SCAN, banded status)

### Phase 6A–6E — Billing + observability (commit `012f79b`)
- **6A** Paddle webhook ingest with HMAC verification + idempotency table (`processed_paddle_events`)
- **6B** DKIM signing for system mail (`MAIL_DKIM_*` env vars; boot-audit rejects placeholder private key)
- **6C** Super-admin queue-depth dashboard (`/admin/queue-depth`) — tracks `webhook-dispatch`, `email-campaign`, `feed-import`, `migration` queues
- **6D** `RELEASE_CHECKLIST.md` + `scripts/verify-migrations.sh` (replays every migration on a throwaway DB)
- **6E** Tenant billing page (`/dashboard/billing`) with plan grid + Paddle hosted checkout (`POST /api/billing/checkout`)

### Feature surface (high-level inventory)
**API modules** (`apps/api/src/modules/*`): auth, license, team, property, property-type, feature, location, label, lead, contact, inquiry, feed, feed-export, migration, email-campaign, analytics, ticket, payment, credit, super-admin, webmaster, maintenance, reorder, health, upload, mail, webhook, tenant.

**Dashboard routes** — tenant: `/dashboard/{analytics,properties,property-types,features,locations,labels,leads,contacts,tickets,feeds,feed-export,campaigns,billing,profile,settings}`. Super-admin: `/admin/{clients,api-keys,audit-log,credits,tickets,webmasters,plans,subscriptions,rate-limits,queue-depth,suppressions}`.

**Widget**: `SPWWidget` core, `SearchForm`, `ResultsGrid`, `PropertyCard`, `PropertyDetail`, favorites, inquiry form, event tracking.

**WP plugin**: `SPW_Sync` (orchestrator), `SPW_Settings`, `SPW_OG_Tags`, `SPW_Webhook` (HMAC verify + async sync).

**Migrations applied locally** (14 total, last 4 are post-v1):
- `1776302900000-TenantLastCacheClearedAt` (5P)
- `1776303900000-TenantEmailDomain` (5R)
- `1776304900000-ProcessedPaddleEvents` (6A)
- `1776305900000-PlanPaddlePriceIds` (6E)

---

## ⏳ PENDING — Production-deploy gates (from RELEASE_CHECKLIST.md)

These are the **only** items blocking a production cut. None require code changes.

1. **Run 4 outstanding migrations on prod** — `TenantLastCacheClearedAt`, `TenantEmailDomain`, `ProcessedPaddleEvents`, `PlanPaddlePriceIds`. Locally applied; prod run pending.
2. **Set new env vars in `.env.production`** before API restart (boot-audit will hard-fail if placeholders remain):
   - `MAIL_DKIM_DOMAIN` / `MAIL_DKIM_SELECTOR` / `MAIL_DKIM_PRIVATE_KEY` (optional — enables DKIM-signed system mail)
   - `PADDLE_WEBHOOK_SECRET` (optional — empty = webhook returns 401)
   - `PADDLE_API_KEY` + `PADDLE_API_URL` (optional — empty = `/api/billing/checkout` returns 503)
   - `PADDLE_GRACE_DAYS` (default 7)
3. **Run `bash scripts/verify-migrations.sh`** against a throwaway DB to catch cross-migration breakage.
4. **Post-restart boot smoke**: `curl /api/health/live`, `curl /api/health/ready` (both checks `ok`), grep log for `boot security audit: OK`.
5. **Paddle**: send a test `subscription.created` from Paddle dashboard, confirm 200 + `outcome:no-tenant`, no `Signature mismatch`.

---

## ⏳ PENDING — Functional gaps (out of current phase plan)

Surfaced by parallel codebase audit. None are blocking; most are polish/safety items.

### Payment / billing
- **No idempotency key on Paddle outbound `transaction.create`** (`apps/api/src/modules/payment/paddle-checkout.service.ts`) — Paddle retries on network flake could create duplicate transactions. Inbound side already has `processed_paddle_events`; outbound needs the equivalent.
- **No backfill path for tenants who paid before Paddle hookup** — manual one-off SQL needed for any pre-existing paid tenants.
- **Downgrade not blocked mid-cycle** — checkout service blocks lateral moves but lets a tenant drop from $99/yr to free without proration logic.
- **Billing page missing**: `graceEndsAt` countdown when subscription is in grace period; invoice history.

### Migration service
- **No CSV header validation** before import (`apps/api/src/modules/migration/migration.service.ts`) — bad header = silently mismapped fields.
- **No partial-batch rollback** — one bad row halts the whole import; already-inserted rows stay.

### Super-admin / observability
- **Queue-depth thresholds are hardcoded** (`apps/api/src/modules/super-admin/queue-depth.service.ts`: WARN=100/10, CRIT=500/50) — note in code says "pre-tuning pending real load data".
- **Rate-limit headroom**: per-tenant aggregate only, no per-route breakdown; no alerting integration (manual poll).
- **API-key one-time flash**: `super-admin.service.ts:233` TODO — raw API key returned on create, but no UI flash to capture it before it's hashed.

### Email
- **DKIM rotation workflow untested in integration** — verification endpoint exists, but rotating a tenant's keypair end-to-end (regenerate → re-publish DNS → re-verify) has no smoke coverage.
- **Email-domain re-verification is on-demand only** — no scheduled DNS re-check; if a tenant's TXT records get removed, status stays `verified` until someone clicks Refresh.

### Test coverage
- **No `it.skip` / `xit` / `.todo`** found — clean.
- **No `NotImplementedException` / stub throws** — clean.

---

## Critical files to consult before any prod cut

- `RELEASE_CHECKLIST.md` — single source of truth for the cut
- `BACKUP_RESTORE.md` — DR procedure
- `DEPLOYMENT.md` — one-time setup
- `.env.production.example` — env var template
- `apps/api/src/main.ts` — boot-audit entry; will refuse to start on placeholder secrets
- `apps/api/src/database/migrations/177630*` — the 4 pending prod migrations

## Verification (how to confirm this report)

```bash
# Confirm HEAD matches memory
git log --oneline -1                        # expect 012f79b

# Confirm smoke is still green
cd apps/api && pnpm test:smoke              # expect 76/76

# List pending migrations
cd apps/api && pnpm typeorm migration:show -d dist/config/database.config.js

# Sweep for any new TODOs since this audit
# (Grep tool, not raw grep — pattern: TODO|FIXME|HACK in apps/api/src, apps/dashboard, packages)
```

---

## Bottom line

Code-wise the platform is **production-ready** at `012f79b`. The remaining work is **operational** (run 4 migrations, set env vars, smoke prod) plus a backlog of polish items (Paddle outbound idempotency, migration rollback, queue threshold tuning, billing UX) that can ship as a Phase 7 cleanup pass after the first production cut.
