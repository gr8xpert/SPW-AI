# SPW v2 — Project Audit & Progress Report

**Updated:** 2026-04-25
**Repository:** https://github.com/gr8xpert/SPW-AI.git
**Branch:** `main` (HEAD: `cf4bb00`)
**Last smoke run:** 76/76 passing
**Dashboard status:** 41/43 pages fully functional (tested locally via Docker)

---

## Architecture Overview

| Component | Tech Stack | Location |
|-----------|-----------|----------|
| API | NestJS 10 + TypeORM + MySQL + Redis + BullMQ | `apps/api/` |
| Dashboard | Next.js 14 + Tailwind + Radix UI + React Query | `apps/dashboard/` |
| Widget | Vite + vanilla TS (zero deps, embeddable UMD/ESM) | `apps/widget/` |
| Shared lib | TypeScript types/utilities | `packages/shared/` |
| WP Plugin | PHP WordPress plugin | `packages/wp-plugin/` |
| Monorepo | pnpm workspaces + Turborepo | root `package.json` |

**Production URLs:** `api.spw-ai.com` / `dashboard.spw-ai.com` / `cdn.spw-ai.com`

---

## What Has Been Done (Phases 1–6E)

### Phase 1 — Security Hardening (`04e0392`)
- [x] Helmet middleware
- [x] CORS lockdown
- [x] Input validation (class-validator DTOs)
- [x] SQL injection protection (TypeORM parameterized queries)

### Phase 2 — Boot End-to-End Locally (`b1efec6`)
- [x] Local dev environment boots cleanly
- [x] Database migrations run in order
- [x] Seed data for development

### Phase 3A — Refresh-Token Rotation (`5e789a4`)
- [x] JWT access + refresh token pair
- [x] Refresh-token rotation (old token invalidated on use)
- [x] `refresh_tokens` table with expiry

### Phase 3B — Secrets at Rest
- [x] AES-256 encryption for sensitive fields (`enc:v1:` prefix)
- [x] `ENCRYPTION_KEY` env var (32 chars)
- [x] `SecretCipherService` with encrypt/decrypt + unit tests

### Phase 3C — Email Verification Enforcement
- [x] `email_verification_tokens` table
- [x] Email verification required before dashboard access
- [x] Verification token generation + validation

### Phase 3D — Per-API-Key Rate Limits
- [x] API key scoped rate limiting
- [x] Tenant-level throttling

### Phase 3E — Outbound Webhooks
- [x] `webhook_deliveries` table
- [x] BullMQ async dispatch
- [x] HMAC signature (`X-SPW-Signature: t=<ts>,v1=<hex>`)
- [x] SSRF guard (`WEBHOOK_ALLOW_LOOPBACK` env toggle)

### Phase 4 — Redis-Backed Throttler (`064abc9`)
- [x] Throttler storage moved from in-memory to Redis
- [x] Shared across replicas
- [x] Nightly cleanup cron for expired keys

### Phase 5A — Widget Cache Clear (`26ee7ff`, `b6ba786`)
- [x] One-click "Clear widget cache" button in dashboard
- [x] `POST /api/dashboard/tenant/cache/clear` bumps `syncVersion`
- [x] Widget polls `/api/v1/sync-meta` with 60s interval

### Phase 5B — WP Plugin Webhook Handling (`44120e2`)
- [x] WP plugin processes `cache.invalidated` webhook
- [x] v2 signature parsing and verification
- [x] Auto-sync on webhook receipt

### Phase 5C — Per-Plan Rate Limits (`f7224f8`)
- [x] `ratePerMinute` column on `plans` table
- [x] Dynamic guard resolution based on tenant's plan

### Phase 5D — System Mailer (`f7224f8`)
- [x] `SystemMailerService` for transactional emails
- [x] Verification email dispatch
- [x] Multi-provider support (SMTP, Mailgun, SendGrid, SES)

### Phase 5E — Tenant Webhook Self-Service (`1c45b76`)
- [x] Dashboard UI for tenants to configure webhook URL
- [x] Test webhook delivery from settings page

### Phase 5F — Encrypt Remaining Secrets (`1c45b76`)
- [x] All sensitive fields encrypted at rest
- [x] Migration to widen encrypted columns

### Phase 5G — Property Write Sync (`d82c7eb`)
- [x] Property writes bump `syncVersion`
- [x] v2 webhook envelope format

### Phase 5H — Push 1–5G Stack (`d82c7eb`)
- [x] All phases 1–5G pushed to origin/main

### Phase 5I — Distributed Cron Lock
- [x] Redis `SET NX PX` + Lua release script
- [x] Prevents duplicate cron runs across replicas

### Phase 5J — Docker Production Setup
- [x] Multi-stage Dockerfiles for API, Dashboard, Widget
- [x] `docker-compose.yml` (dev) + `docker-compose.prod.yml` (production)
- [x] `.env.production.example` template

### Phase 5K — Boot Security Audit
- [x] `runBootSecurityAudit()` runs before `NestFactory.create()`
- [x] Rejects placeholder secrets in production
- [x] Rejects `DATABASE_SYNCHRONIZE=true` in production
- [x] Unit tests for all rejection paths

### Phase 5L — Health Endpoints
- [x] `GET /api/health/live` — process-only liveness probe
- [x] `GET /api/health/ready` — DB + Redis readiness probe
- [x] Next.js dashboard `/api/health` endpoint

### Phase 5M — Structured Logging + Request ID
- [x] `JsonLogger` for production (JSON-lines format)
- [x] `RequestIdMiddleware` validates/generates `X-Request-Id`
- [x] Request ID included in error responses

### Phase 5N — Backup & Restore Runbook
- [x] `BACKUP_RESTORE.md` — nightly mysqldump → S3
- [x] Quarterly restore dry-run procedure
- [x] DR recovery steps

### Phase 5O — WP Plugin Staging Tests
- [x] `docker-compose.yml` for disposable WP + MySQL
- [x] `run.sh` — 8 assertions against real REST endpoints
- [x] Automated teardown

### Phase 5P — Last-Cleared-At Timestamp (`5d84da6`)
- [x] `tenants.lastCacheClearedAt` column
- [x] Persisted and visible in super-admin dashboard
- [x] Migration: `TenantLastCacheClearedAt1776302900000`

### Phase 5Q — Webhook Delivery Drawer (`a536158`)
- [x] Webhook delivery detail dialog/drawer in dashboard
- [x] `POST /webhook/deliveries/:id/redeliver` endpoint
- [x] Re-delivery from UI

### Phase 5R — Sender Domain Verification (`4f4dc54`)
- [x] `tenant_email_domains` table
- [x] RSA-2048 DKIM keypair generation per tenant
- [x] SPF/DKIM/DMARC TXT record generation
- [x] `dns.resolveTxt()` verification
- [x] Dashboard UI with copyable DNS values
- [x] Migration: `TenantEmailDomain1776303900000`

### Phase 5S — Rate-Limit Headroom Dashboard (`4c8e583`)
- [x] `RateLimitHeadroomService` — Redis SCAN over throttler keys
- [x] Status banding: ok (>30%), warning (10–30%), critical (≤10%)
- [x] Super-admin `/admin/rate-limits` page
- [x] Manual refresh (no auto-poll to protect Redis)

### Phase 6A — Paddle Webhook Ingestion (`012f79b`)
- [x] `PaddleWebhookService` — 8 event types
- [x] HMAC signature verification
- [x] `processed_paddle_events` table (idempotency)
- [x] Grace period for failed payments (`PADDLE_GRACE_DAYS`)
- [x] Migration: `ProcessedPaddleEvents1776304900000`

### Phase 6B — DKIM Signing Infrastructure
- [x] `MAIL_DKIM_DOMAIN` / `_SELECTOR` / `_PRIVATE_KEY` env vars
- [x] Boot-audit validates DKIM private key format

### Phase 6C — Super-Admin Queue Depth
- [x] BullMQ job count monitoring
- [x] `/admin/queue-depth` dashboard page
- [x] 4 tracked queues with ok/warning/critical status

### Phase 6D — Release Checklist
- [x] `RELEASE_CHECKLIST.md` — 7-step deploy procedure
- [x] Migration tracking table
- [x] Rollback instructions

### Phase 6E — Paddle Outbound Checkout (`012f79b`)
- [x] `PaddleCheckoutService.createCheckout()` — proxies Paddle transaction API
- [x] `PADDLE_API_KEY` + `PADDLE_API_URL` env vars
- [x] Dashboard billing page with checkout flow
- [x] Plan `paddleMonthlyPriceId` / `paddleYearlyPriceId` columns
- [x] Migration: `PlanPaddlePriceIds1776305900000`

### Phase 7 — Dashboard Pages Upgrade (`2868081`)
- [x] Upgrade all admin and dashboard pages with full CRUD functionality
- [x] Property detail view page (`/dashboard/properties/[id]`)
- [x] Property edit page (`/dashboard/properties/[id]/edit`)
- [x] Reorder endpoints for features, locations, property-types
- [x] Enhanced super-admin controller and service
- [x] Local Docker test compose and seed script

### Phase 8 — Extended Property Fields & UX (`4764365`)
- [x] 35 new property entity columns (address, financial, SEO, agent FKs, flags)
- [x] Team member agent/sales agent dropdowns on property create/edit pages
- [x] Slug format settings (5 variations) in tenant settings
- [x] Fix `useApi` session race condition — `isReady` flag, deferred fetches
- [x] Search filters: maxBathrooms, plot/terrace/solarium size ranges
- [x] Migration: `PropertyExtendedFields1776306900000`
- [x] Migration: `ListingTypeHolidayRent1776307900000`
- [x] Migration: `PropertyRangeFields1776308900000`

### Phase 9A — AI Translation (`b1b34eb`)
- [x] AI translation system via OpenRouter API
- [x] Translation settings page configuration
- [x] `translation` API module with BullMQ processor

### Phase 9B — Centralized Language Management (`d71a06e`, `b4a275c`)
- [x] Languages configured once in Settings → General, shared across pages
- [x] Translation columns replaced with count badges + dialog editing
- [x] Removed per-page language management (locations, features, labels, property-types)

### Phase 10A — AI Chat Module (`ed5dd71`)
- [x] Full backend `ai-chat` module: SSE streaming, tool-based LLM, conversation persistence
- [x] `ChatConversation` + `ChatMessage` entities
- [x] Email transcript support
- [x] AI chat analytics dashboard page (`/dashboard/ai-chat`)
- [x] Migration: `AiChatEntities1776309900000`

### Phase 10B — Marketing Features (`ed5dd71`)
- [x] Wishlist share-favorites endpoint with lead capture
- [x] Contact CSV import/export with column mapping UI
- [x] Campaign template edit/delete
- [x] `getRaw()` method on `useApi` hook for raw response downloads

### Phase 10C — Widget Chat & Favorites (`ed5dd71`)
- [x] Chat bubble UI component with message history
- [x] Favorites panel with share/email functionality
- [x] Chat property cards
- [x] SSE chat client

### Phase 11A — Ticket Notifications & Cleanup (`8900fd3`)
- [x] Email notifications on ticket create/reply
- [x] Attachment support in ticket DTOs
- [x] Scheduled attachment cleanup: purge resolved/closed tickets > 90 days
- [x] Analytics PDF download tracking
- [x] Migration: `AnalyticsPdfDownload1776310900000`
- [x] Settings page: wire SMTP config to backend, fix API Keys tab, Send Test Email

### Phase 11B — Feed Fixes (`a4cea85`)
- [x] Fix Resales Online API auth: `p_apikey` query param instead of Bearer header
- [x] Auto-invalidate cache (bump `syncVersion` + webhook) after feed imports

### Phase 11C — Webmaster Management & UI Polish (`cf4bb00`)
- [x] Create/update webmaster endpoints (`POST`/`PUT /api/super-admin/webmasters`)
- [x] "Add Webmaster" dialog + activate/deactivate toggle
- [x] Seed demo webmasters with time entries
- [x] Rename all user-visible "tenant" → "client" across admin pages
- [x] Remove unused API Keys placeholder page from sidebar
- [x] Lock down webmaster dashboard: only Time Tracking + Assigned Tickets
- [x] Webmaster login redirects to `/dashboard/time-tracking`
- [x] Time-tracking page (`/dashboard/time-tracking`)
- [x] Color-coded credit balance styling

---

## Infrastructure & DevOps Status

| Item | Status | Notes |
|------|--------|-------|
| Dockerfiles | Done | API, Dashboard, Widget — multi-stage builds |
| docker-compose (dev) | Done | `docker-compose.yml` with MySQL + Redis |
| docker-compose (prod) | Done | `docker-compose.prod.yml` |
| `.env.production.example` | Done | All env vars documented |
| PM2 ecosystem config | Done | `ecosystem.config.js` |
| Health probes (K8s-ready) | Done | `/live` + `/ready` |
| Structured logging | Done | JSON-lines in production |
| Backup runbook | Done | S3 nightly + quarterly restore dry-run |
| Deployment guide | Done | `DEPLOYMENT.md` |
| Release checklist | Done | `RELEASE_CHECKLIST.md` |
| Migration verification | Done | `scripts/verify-migrations.sh` |
| CI/CD (GitHub Actions) | **Not done** | No `.github/workflows/` files |
| Automated test pipeline | **Not done** | No CI runner configured |
| S3 lifecycle rules (IaC) | **Not done** | Currently AWS console only |

---

## Test Coverage

| Type | Count | Location |
|------|-------|----------|
| Smoke/E2E tests | 76 tests | `apps/api/test/smoke.e2e-spec.ts` |
| Unit tests (SecretCipher) | spec file | `apps/api/src/common/crypto/secret-cipher.spec.ts` |
| Unit tests (Boot Audit) | spec file | `apps/api/src/common/security/boot-audit.spec.ts` |
| WP Plugin integration | 8 assertions | `packages/wp-plugin/test/staging/run.sh` |
| Dashboard tests | **None** | No test files in `apps/dashboard/` |
| Widget tests | **None** | No test files in `apps/widget/` |
| AI Chat tests | **None** | No test files for ai/ai-chat modules |

---

## Database

**19 migrations** (all applied locally, 9 pending on production):

| # | Migration | Phase | Prod? |
|---|-----------|-------|-------|
| 1 | `InitialSchema` | Initial | Yes |
| 2 | `CoreFeatures` | Initial | Yes |
| 3 | `Phase2Features` | 2 | Yes |
| 4 | `FeedImport` | 2 | Yes |
| 5 | `RoleBasedFeatures` | 2 | Yes |
| 6 | `RefreshTokens` | 3A | Yes |
| 7 | `EmailVerificationTokens` | 3C | Yes |
| 8 | `WebhookDeliveries` | 3E | Yes |
| 9 | `PlanRatePerMinute` | 5C | Yes |
| 10 | `SecretEncryptionWidening` | 5F | Yes |
| 11 | `TenantLastCacheClearedAt` | 5P | **Pending** |
| 12 | `TenantEmailDomain` | 5R | **Pending** |
| 13 | `ProcessedPaddleEvents` | 6A | **Pending** |
| 14 | `PlanPaddlePriceIds` | 6E | **Pending** |
| 15 | `PropertyExtendedFields` | 8 | **Pending** |
| 16 | `ListingTypeHolidayRent` | 8 | **Pending** |
| 17 | `PropertyRangeFields` | 8 | **Pending** |
| 18 | `AiChatEntities` | 10A | **Pending** |
| 19 | `AnalyticsPdfDownload` | 11A | **Pending** |

**36 entities** across tenants, users, properties, leads, contacts, analytics, feeds, campaigns, tickets, credits, subscriptions, webhooks, AI chat, and more.

---

## API Modules (30 total)

| Module | Description |
|--------|-------------|
| `ai` | AI core service (OpenRouter integration) |
| `ai-chat` | AI chat conversations, SSE streaming, tool-based LLM, analytics |
| `analytics` | Dashboard analytics, public tracking ingestion, favorites CRUD, PDF downloads |
| `auth` | JWT login, refresh-token rotation, email verification, logout |
| `contact` | Contact CRUD with CSV import/export |
| `credit` | Credit management (tenant, super-admin, webmaster controllers) |
| `email-campaign` | SMTP config, templates (mustache), campaign send/cancel/stats |
| `feature` | Property feature taxonomy CRUD |
| `feed` | Feed adapters (Resales, Inmoba), scheduler, BullMQ processor |
| `feed-export` | Outbound feed export configuration |
| `health` | Liveness + readiness probes |
| `label` | Label taxonomy CRUD |
| `lead` | Lead tracking with scoring service |
| `license` | License key validation (`/api/v1/license/config`) |
| `location` | Location hierarchy CRUD |
| `mail` | SystemMailerService for transactional emails |
| `maintenance` | Cleanup cron (incl. ticket attachment purge), distributed lock |
| `migration` | CSV/JSON import with conflict resolution |
| `payment` | Paddle webhook + checkout proxy |
| `property` | Property CRUD with sync versioning, 35+ extended fields |
| `property-type` | Property type taxonomy CRUD |
| `reorder` | Drag-and-drop ordering |
| `super-admin` | Multi-tenant lifecycle (6,400+ line service) |
| `team` | Team member management |
| `tenant` | Tenant settings, cache invalidation, email domain, language management |
| `ticket` | Support ticket system with threading, email notifications, attachments |
| `translation` | AI-powered property translation via OpenRouter + BullMQ |
| `upload` | File upload (S3 / local), image processing (Sharp) |
| `webhook` | Webhook delivery management + redeliver |
| `webmaster` | Webmaster account management, time tracking, CRUD endpoints |

---

## Dashboard Pages (43 total — 41 working, 1 auth, 1 placeholder)

### Tenant Self-Service (23 pages — 22 working, 1 placeholder)
| Route | Status |
|-------|--------|
| `/dashboard` | **Working** — Overview |
| `/dashboard/properties` | **Working** — Property list with dropdown/toggle filters |
| `/dashboard/properties/create` | **Working** — Property create form with agent dropdowns |
| `/dashboard/properties/[id]` | **Working** — Property detail view |
| `/dashboard/properties/[id]/edit` | **Working** — Property edit form |
| `/dashboard/analytics` | **Working** — Analytics charts with PDF download tracking |
| `/dashboard/leads` | **Working** — Lead list |
| `/dashboard/leads/[id]` | **Working** — Lead detail |
| `/dashboard/contacts` | **Working** — Contact list with CSV import/export |
| `/dashboard/campaigns` | **Working** — Campaign list with template edit/delete |
| `/dashboard/campaigns/[id]` | **Working** — Campaign detail |
| `/dashboard/locations` | **Working** — Location editor (languages from tenant settings) |
| `/dashboard/property-types` | **Working** — Property type editor with translation badges |
| `/dashboard/features` | **Working** — Feature editor with translation badges |
| `/dashboard/labels` | **Working** — Label editor with translation badges |
| `/dashboard/feeds` | **Working** — Feed import config |
| `/dashboard/feed-export` | **Working** — Feed export config |
| `/dashboard/tickets` | **Working** — Ticket list + create with attachments |
| `/dashboard/tickets/[id]` | **Working** — Ticket conversation |
| `/dashboard/billing` | **Working** — Paddle checkout |
| `/dashboard/settings` | **Working** — Tenant settings (SMTP, webhook, domain, languages, slug format, AI translation) |
| `/dashboard/ai-chat` | **Working** — AI chat analytics, conversation list, message history |
| `/dashboard/team` | **Working** — Team member management |
| `/dashboard/time-tracking` | **Working** — Webmaster time-tracking page |
| `/dashboard/profile` | **Coming Soon** — Placeholder page |

### Super-Admin (18 pages)
| Route | Status |
|-------|--------|
| `/admin` | **Working** — Admin overview |
| `/admin/clients` | **Working** — Client list with search/filter |
| `/admin/clients/create` | **Working** — Create client + admin user |
| `/admin/clients/[id]` | **Working** — Client detail with time spent summary |
| `/admin/clients/[id]/edit` | **Working** — Edit client |
| `/admin/plans` | **Working** — Plan CRUD with Paddle price IDs |
| `/admin/rate-limits` | **Working** — Rate-limit headroom (5S), migrated to useApi |
| `/admin/queue-depth` | **Working** — BullMQ queue monitoring (6C), migrated to useApi |
| `/admin/clients/[id]/license-keys` | **Working** — Generate, revoke, regenerate, copy-to-clipboard |
| `/admin/tickets` | **Working** — Stats cards, status filter, priority badges, pagination |
| `/admin/webmasters` | **Working** — CRUD, unpaid hours, time entry dialog, mark-as-paid, activate/deactivate |
| `/admin/credits` | **Working** — Balance overview, history dialog, adjust credits, color-coded balances |
| `/admin/subscriptions` | **Working** — Status cards filter, billing/source/expiry columns |
| `/admin/audit-log` | **Working** — Action/entity filters, changes diff dialog, pagination |
| `/admin/suppressions` | **Working** — Email search, delete with confirmation, pagination |

### Auth (2 pages)
| Route | Status |
|-------|--------|
| `/login` | **Working** |
| `/` | **Working** — Root redirect |

---

## What Remains To Be Done

### Critical — Must do before production deploy

| # | Item | Priority | Effort |
|---|------|----------|--------|
| 1 | **Run 9 pending migrations on production** (`TenantLastCacheClearedAt`, `TenantEmailDomain`, `ProcessedPaddleEvents`, `PlanPaddlePriceIds`, `PropertyExtendedFields`, `ListingTypeHolidayRent`, `PropertyRangeFields`, `AiChatEntities`, `AnalyticsPdfDownload`) | P0 | 15 min |
| 2 | **Set production env vars** — `PADDLE_WEBHOOK_SECRET`, `PADDLE_API_KEY`, `PADDLE_API_URL`, `MAIL_DKIM_*` (if using DKIM), `OPENROUTER_API_KEY` (for AI chat/translation) | P0 | 15 min |
| 3 | **Configure Paddle webhook endpoint** in Paddle dashboard pointing to `api.spw-ai.com/api/payment/paddle/webhook` | P0 | 10 min |

### High — Should do before or shortly after launch

| # | Item | Priority | Effort |
|---|------|----------|--------|
| 4 | **CI/CD pipeline** — No GitHub Actions workflows exist. Need lint + typecheck + smoke test pipeline | P1 | 2–4 hrs |
| 5 | **DKIM signing of outbound mail** — 5R stores the private key but the actual signer is not hooked into the email sending path yet. Mail goes out unsigned. | P1 | 2–3 hrs |
| 6 | **Dashboard "Coming Soon" page (1 remaining)** — `/dashboard/profile` (user profile editing — backend exists) | P1 | 4–6 hrs |
| 7 | **Dashboard test suite** — Zero test files in `apps/dashboard/`. Need at least component tests for critical flows. | P1 | 2–3 days |
| 8 | **Widget test suite** — Zero test files in `apps/widget/`. | P1 | 1–2 days |

### Medium — Post-launch improvements

| # | Item | Priority | Effort |
|---|------|----------|--------|
| 9 | **Webhook backpressure alerting** — BullMQ queue depth metric not wired to alerting (Slack/PagerDuty/email) | P2 | 4–6 hrs |
| 10 | **S3 lifecycle rules as IaC** — Currently configured via AWS console, should be in `ops/s3-lifecycle.json` | P2 | 1–2 hrs |
| 11 | **Unit test coverage expansion** — Only 2 spec files (`secret-cipher.spec.ts`, `boot-audit.spec.ts`). Service-level unit tests missing for all 30 modules. | P2 | 1–2 weeks |
| 12 | **API documentation** — No OpenAPI/Swagger spec generated. NestJS supports `@nestjs/swagger` out of the box. | P2 | 1–2 days |
| 13 | **Super-admin service refactor** — 6,400+ line monolith (`super-admin.service.ts`). Consider splitting into domain-specific services. | P2 | 2–3 days |
| 14 | **TODO: expose raw API key on client creation** — Only TODO in codebase (`super-admin.service.ts:233`). Currently requires a separate `rotateApiKey` call. | P3 | 2 hrs |
| 15 | **Map integration** — Property create page has a "Map placeholder" comment but no actual map component (Leaflet/Google Maps). | P3 | 4–6 hrs |
| 16 | **Internationalization (i18n)** — Dashboard is English-only. Property data supports en/es/de but the UI chrome is not translated. | P3 | 1–2 weeks |
| 17 | **Error monitoring** — No Sentry/Datadog/Bugsnag integration. Structured logging exists but no centralized error tracking. | P2 | 2–4 hrs |
| 18 | **Performance monitoring** — No APM integration. Health probes exist but no latency/throughput metrics. | P3 | 4–8 hrs |

---

## Codebase Statistics

| Metric | Count |
|--------|-------|
| API modules | 30 |
| Database entities | 36 |
| Database migrations | 19 |
| Dashboard pages | 43 |
| Smoke/E2E tests | 76 |
| Unit spec files | 2 |
| WP plugin integration tests | 8 assertions |
| Source files (non-node_modules) | ~350+ |

---

## Technical Debt Summary

- **Low debt overall.** Only 1 TODO in production code.
- **No FIXMEs, HACKs, or WIPs** found anywhere.
- **1 "Coming Soon" placeholder page** — `/dashboard/profile`.
- **Super-admin service is a god object** (6,400+ lines) — functional but hard to maintain.
- **No CI/CD** — all testing and deployment is manual.
- **Test coverage is E2E-heavy, unit-light** — 76 smoke tests but only 2 unit spec files.
- **9 pending production migrations** — up from 4, need to be run before deploy.

---

## Security Posture

| Control | Status |
|---------|--------|
| Helmet headers | Done |
| CORS lockdown | Done |
| Input validation (DTOs) | Done |
| SQL injection protection | Done (TypeORM) |
| Secrets encrypted at rest | Done (AES-256) |
| JWT refresh-token rotation | Done |
| Boot-time secret audit | Done |
| SSRF guard on webhooks | Done |
| Rate limiting (Redis-backed) | Done |
| AI chat data isolation (per-tenant) | Done |
| DKIM signing on outbound mail | **Partial** (keys stored, signer not wired) |
| Email verification enforcement | Done |
| Distributed cron locking | Done |

---

---

## Session Log

### 2026-04-21 — Admin Dashboard Wiring Sprint

**Completed:**
- Wired 7 admin pages from "Coming Soon" placeholders to fully functional:
  - `/admin/tickets` — stats cards, status/priority filters, pagination
  - `/admin/webmasters` — unpaid hours summary, time entry detail dialog, mark-as-paid batch action
  - `/admin/credits` — balance overview, credit history dialog, adjust credits dialog (add/deduct)
  - `/admin/subscriptions` — clickable status cards, billing/source/expiry columns
  - `/admin/audit-log` — action/entity type filters, changes before/after diff dialog
  - `/admin/suppressions` — email search, delete with confirmation dialog
  - `/admin/clients/[id]/license-keys` — generate, revoke, regenerate, copy-to-clipboard
- Migrated 2 pages from old `apiGet` (axios) to `useApi` (fetch) pattern:
  - `/admin/rate-limits`
  - `/admin/queue-depth`
- Added 2 new backend endpoints:
  - `GET /api/super-admin/audit-logs` — multi-filter (action, entityType, tenantId, userId) + pagination
  - `GET /api/super-admin/suppressions` + `DELETE /api/super-admin/suppressions/:id`
- Fixed Set iteration type error in audit-log page (spread → `Array.from()`)
- Built and deployed updated Docker images

**Remaining placeholders:** `/dashboard/profile`, `/admin/api-keys`

### 2026-04-22–25 — Phases 7–11C (9 commits)

**Phase 7 — Dashboard Upgrade (`2868081`)**
- Upgraded all admin and dashboard pages with full CRUD functionality
- Added property detail view and edit pages
- Added reorder endpoints for features, locations, property-types
- Local Docker test compose and seed script

**Phase 8 — Extended Properties & UX (`4764365`)**
- 35 new property entity columns (address, financial, SEO, agent FKs, flags)
- Team member agent/sales agent dropdowns
- Slug format settings (5 variations)
- Fixed `useApi` session race condition
- 3 new migrations

**Phase 9 — AI Translation & Language Management (`b1b34eb`, `d71a06e`, `b4a275c`)**
- AI translation system via OpenRouter API with `translation` module
- Centralized language management in tenant settings
- Translation badges replacing inline columns across taxonomy pages

**Phase 10 — AI Chat & Marketing (`ed5dd71`)**
- Full AI chat backend: SSE streaming, tool-based LLM, conversation persistence
- Widget: chat bubble, favorites panel, chat property cards, SSE client
- Marketing: wishlist email with lead capture, contact CSV import/export, campaign template editing
- 1 new migration (`AiChatEntities`)

**Phase 11 — Ticket Notifications, Feed Fixes, Webmaster CRUD (`8900fd3`, `a4cea85`, `cf4bb00`)**
- Ticket email notifications on create/reply with attachment support
- Scheduled attachment cleanup for resolved tickets > 90 days
- Resales Online API auth fix (query param vs Bearer header)
- Auto-cache invalidation after feed imports
- Full webmaster CRUD with activate/deactivate
- "Tenant" → "Client" renaming across admin UI
- Removed unused API Keys placeholder
- Webmaster dashboard lockdown (Time Tracking + Assigned Tickets only)
- 1 new migration (`AnalyticsPdfDownload`)

**Items completed from previous "Remaining" list:**
- ~~Property edit page~~ → Done (Phase 7)
- ~~`/admin/api-keys` placeholder~~ → Removed (no longer needed as placeholder)

**Remaining placeholder:** `/dashboard/profile`

---

*This file is a point-in-time snapshot. Re-run the audit periodically as development continues.*
