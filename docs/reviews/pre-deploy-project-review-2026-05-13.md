# SPW Pre-Deploy Project Review

Date: 2026-05-13

This file contains **two distinct snapshots**, kept side-by-side so a reader
can compare before/after without confusion:

1. **Current corrected status (2026-05-13, post-FP)** — what's true today.
2. **Original baseline review (2026-05-13, pre-fix)** — what was true when
   the review was first written, kept verbatim below for reference. Do not
   read it as the current state.

---

## Current Corrected Status (2026-05-13)

### Deploy readiness

**Not yet approved for deploy.** Two items remain open:

- **P0-08 — Dedicated inquiry webhook is unresolved/partial.**
  SSRF hardening is in place (URL validated on save + DNS pre-flight +
  `redirect: 'manual'`) but the dispatch still uses a direct `fetch()`. It
  has **no HMAC signing, no `WebhookDelivery` audit row, no BullMQ retry,
  no central observability**. Treat as a launch exception with an explicit
  owner + due-date, OR wire it through `WebhookService.emit` before deploy.
- **E2E suite has not been run end-to-end** on the author's host (MySQL +
  Redis weren't running there). The `jest-e2e-setup.ts` fail-fast
  diagnostic is verified working. Required before final deploy approval:
  `pnpm docker:up && pnpm --filter api test:e2e && pnpm --filter api test:smoke`,
  both exit 0, output attached to the deploy ticket.

### Verified by automation on the author's host

| Command | Result |
|---|---|
| `pnpm typecheck` | ✅ 4/4 packages |
| `pnpm lint` | ✅ 0 errors |
| `pnpm build` | ✅ 4/4 packages |
| `pnpm --filter api test` | ✅ 82 / 82 across 8 suites |
| `pnpm --filter @spm/widget build` | ✅ |
| `pnpm --filter api test:e2e` | ⚠️ NOT RUN — see above |

### Known remaining gaps

- **P0-08 (above).**
- **E2E suite not executed end-to-end (above).**
- **Test coverage is partial.** API has 82 unit tests covering the security
  helpers, throttler bucket logic, quota service, subscription validity,
  cron, HTML escaping, and webhook-target SSRF. Dashboard has no automated
  tests. Widget is typecheck-only.
- **Encryption-key rotation** procedure is documented in `BACKUP_RESTORE.md`
  but has never been drilled.
- **CI/CD is absent.** Today the deploy is operator-driven via SFTP+PM2
  (`DEPLOYMENT.md`). A GitHub Actions pipeline gating on
  `pnpm typecheck/lint/build/test/test:e2e` is in the "Tech debt" list and
  should land before the team scales the operator headcount.

### How sections below map

The "Must Fix Before Deploy" list in the original baseline review is **9
of 10 ✅ Fixed, 1 🟡 Partial (P0-08)**. Item-by-item statuses live in
`claude-master-fix-list-2026-05-13.md`.

The "Can Wait" list is unchanged in scope, though several items have been
addressed during the P2/P3 rounds — see the master fix list P2/P3 statuses.

---

## Original Baseline Review (2026-05-13, pre-fix)

> ℹ️ Everything below this line is the original assessment, kept verbatim
> as a baseline. **It does not reflect the current state of the codebase.**
> Cross-reference with the "Current Corrected Status" block above and with
> the master fix list to see what's been addressed.

## What This Project Is About

SPW is a multi-tenant real-estate SaaS platform. The repo contains:

- `apps/api`: NestJS API with MySQL, TypeORM, Redis/BullMQ, JWT auth, tenant-scoped property/CRM/feed/email/payment/AI modules.
- `apps/dashboard`: Next.js dashboard for tenant admins and super admins.
- `apps/widget`: embeddable Preact property-search widget intended for tenant websites.
- `packages/wp-plugin`: WordPress integration.
- `packages/shared`: shared roles, tenant types, feature flags, and widget config types.

The product is already more than a prototype: it has migrations, Docker/PM2 deployment files, production boot audits, encrypted columns for some secrets, Redis-backed throttling, payment webhook idempotency, and meaningful module boundaries. It is also broad enough that production readiness depends less on whether it compiles and more on whether tenant isolation, public API contracts, secret handling, entitlement enforcement, and operational processes are watertight.

## Current Readiness Level

Readiness: **not ready for production with real users/data yet**.

I would call this **late alpha / pre-beta** for a controlled pilot, assuming trusted tenants and close operator supervision. It is not ready for an open production launch because several high-risk issues affect secrets, public/widget routes, entitlement enforcement, queue scheduling, and deployment reliability.

The codebase does build when explicit package commands are run:

- `pnpm --filter api build`: passed.
- `pnpm --filter @spm/dashboard build`: passed with lint warnings.
- `pnpm --filter @spm/widget build`: passed with Vite export warnings.
- `pnpm --filter api exec tsc --noEmit -p tsconfig.json`: passed.
- `pnpm --filter @spm/dashboard type-check`: passed.
- `pnpm --filter @spm/widget typecheck`: passed.
- `pnpm --filter api exec jest --runInBand`: passed, 2 suites / 23 tests.

But the repo-level quality gates are misleading or incomplete:

- `pnpm typecheck` only ran the widget because `turbo.json` expects a `typecheck` script, while dashboard has `type-check` and API has none.
- API ESLint without `--fix` failed heavily, mostly Prettier/style and unused imports.
- API e2e timed out after roughly 3 minutes and did not produce a pass.
- There are no visible frontend/widget tests beyond builds/type checks.

## Architecture Assessment

The architecture is coherent: a NestJS modular monolith, Next.js dashboard, Preact widget, shared types, MySQL row-level tenancy, Redis-backed jobs/rate limiting/locks, and static widget delivery. Graphify identifies the main communities as API gateway/middleware, app bootstrap/security, tenant/maintenance, feed/upload, dashboard API layer, widget components, AI chat, email campaigns, super admin, CRM, and WordPress settings. That matches the source layout.

The strongest parts are the consistent service/controller/module pattern, TypeORM tenant IDs on most tenant-owned entities, public API key hashing, Redis throttler storage, Stripe webhook signature verification, encrypted column support, and boot-time checks for dangerous production config.

The weak parts are cross-cutting governance and enforcement. A lot of security-sensitive behavior depends on each module remembering to do the right thing. There is no single entitlement guard for subscription status/widget enabled/dashboard add-ons, no single sanitized tenant-settings DTO, no tenant-scoped repository abstraction, and public widget endpoints are inconsistent about API-key throttling and route support.

## Security Assessment

There are strong security intentions in the code, but several concrete gaps are deploy blockers:

- Tenant settings can store sensitive values such as `recaptchaSecretKey`, `openRouterApiKey`, and `inquiryWebhookUrl` in a broad JSON settings object, and `toPublic()` returns most settings back to the dashboard. Only `openRouterApiKey` is masked. See `packages/shared/src/types/tenant.types.ts:78`, `packages/shared/src/types/tenant.types.ts:108`, `packages/shared/src/types/tenant.types.ts:121`, `apps/api/src/modules/tenant/tenant.service.ts:325`.
- `getApiCredentials()` returns the full decrypted `webhookSecret`, despite comments elsewhere saying the full secret is not returned except on rotation. See `apps/api/src/modules/tenant/tenant.service.ts:178`.
- Feed credentials are stored as plaintext JSON, including API keys/passwords. See `apps/api/src/database/entities/feed-config.entity.ts:16` and `apps/api/src/database/entities/feed-config.entity.ts:51`.
- Inquiry notification HTML interpolates user-supplied name/email/message/phone into HTML without escaping. See `apps/api/src/modules/lead/lead.controller.ts:183` and `apps/api/src/modules/lead/lead.controller.ts:211`.
- `settings.inquiryWebhookUrl` posts directly with `fetch()` and does not use the SSRF validator used by the main webhook system. See `apps/api/src/modules/lead/lead.controller.ts:253`.
- Public widget endpoints are not all protected by the API-key throttler. Properties and sync-meta use `ApiKeyThrottlerGuard`, but labels, inquiry, share-favorites, track, and favorites do not. See `apps/api/src/modules/property/public-property.controller.ts:18`, `apps/api/src/modules/label/public-label.controller.ts:9`, `apps/api/src/modules/lead/lead.controller.ts:101`, `apps/api/src/modules/analytics/analytics.controller.ts:105`.

## Multi-Tenancy Assessment

Most tenant-owned reads/writes include `tenantId`, which is good. Examples include properties, leads, uploads, labels, feed configs, campaigns, analytics, and team members.

However, tenancy is implemented by convention. There is no global tenant-scoped repository or query guard to prevent accidental cross-tenant queries. Some cleanup and support flows operate by URL or global row ID after joining to other entities. That may be acceptable for internal-only jobs, but it needs tests around isolation boundaries.

The public API uses tenant API keys, but API-key validity currently only checks `Tenant.isActive`. Subscription status and `widgetEnabled` are enforced in the license service, not consistently at public API endpoints. A tenant with an expired subscription but a known API key may still be able to query public properties or submit widget events through `/api/v1/*`. See `apps/api/src/modules/tenant/tenant.service.ts:53` and `apps/api/src/modules/license/license.service.ts:258`.

## API And Widget Boundary Assessment

This is one of the biggest functional risks. The widget calls endpoints and query parameters that the API does not visibly support:

- Widget fallback loads `/api/v1/locations`, `/api/v1/property-types`, and `/api/v1/features`, but the repo search found no matching public controllers. See `apps/widget/src/core/data-loader.ts:105`.
- Widget requests `/api/v1/properties/:reference/similar`, but the public property controller only defines `GET /api/v1/properties` and `GET /api/v1/properties/:reference`. Because `:reference` will match `REF/similar` only as a route mismatch, this appears unsupported. See `apps/widget/src/core/data-loader.ts:248` and `apps/api/src/modules/property/public-property.controller.ts:45`.
- Widget sends `locationIds`, `reference`, `bounds`, `lat`, `lng`, and `radius`, but `SearchPropertyDto` does not define them and global validation has `forbidNonWhitelisted: true`. These requests will be rejected. See `apps/widget/src/core/data-loader.ts:189`, `apps/widget/src/core/data-loader.ts:203`, `apps/widget/src/core/data-loader.ts:208`, and `apps/api/src/modules/property/dto/search-property.dto.ts:5`.

The result is that the dashboard can build and the API can build while the embedded widget still fails in real tenant pages.

## Database And Schema Assessment

The entity model is rich and mostly indexed by tenant where needed. The project has migrations rather than relying on synchronize, and production config disables synchronize.

Risks:

- Several migration timestamps are far-future-looking relative to normal TypeORM generation, such as `1776323000000-*`. That may be intentional, but it makes ordering and maintenance harder.
- Some sensitive fields have encrypted transformers (`webhookSecret`, S3 credentials, SMTP/API keys), but other sensitive JSON blobs are plaintext (`FeedConfig.credentials`, tenant `settings`).
- There is no verified migration dry-run in the captured checks because no database was available.
- The deployment docs reference `BACKUP_RESTORE.md` and `.env.production.example`, but those were not present in the file list I inspected. That should be confirmed and fixed.

## Workers And Jobs Assessment

BullMQ is used for feed imports, email campaigns, translation, migrations, and webhooks. Webhook processing is reasonably careful: signed payloads, no redirects, timeout, retries, and delivery records.

The most important worker risk is scheduled feed imports. `FeedSchedulerService` runs `@Cron(EVERY_HOUR)` in every API process and directly calls `triggerSync()` for due configs. There is a Redis lock for maintenance cleanup, but no equivalent lock or job uniqueness for feed scheduling. With PM2 cluster mode (`instances: 2`), the same feed can be enqueued twice. See `apps/api/src/modules/feed/feed-scheduler.service.ts:27`, `apps/api/src/modules/feed/feed-scheduler.service.ts:41`, and `ecosystem.config.js:13`.

Also, `triggerSync()` creates a new running import log and queue job every time it is called. It does not check for an existing running import for the same tenant/config or provide a deterministic BullMQ `jobId`. See `apps/api/src/modules/feed/feed.service.ts:126`.

## Frontend And Dashboard Assessment

The dashboard is broad and builds successfully. Server layouts protect dashboard/admin route groups using `getServerSession`, which is good. The API client consistently attaches bearer tokens on the client side.

Risks:

- Add-on gates appear mostly UI-side. API endpoints for team, campaigns, feed export, AI chat pages, and create property should enforce purchased dashboard add-ons server-side, not just grey out routes.
- Dashboard `useApi()` had a lint warning for a missing `update` dependency in token refresh retry logic. This could become a stale-session edge case. See lint output for `apps/dashboard/src/hooks/use-api.ts:102`.
- Many pages use raw `<img>` tags. That is not a deploy blocker, but it affects performance and image policy.

## Deployment And Operations Assessment

There are useful deployment assets: Docker Compose for dev/prod, PM2 ecosystem config, Nginx guidance, scripts, and env examples.

The docs are inconsistent:

- `PROJECT_OVERVIEW.md` says there is no visible test infrastructure, but API Jest tests exist.
- `DEPLOYMENT.md` says the production server has no git and code is uploaded via FTP/SFTP, but later the update instructions use `git pull`.
- `DEPLOYMENT.md` points to `BACKUP_RESTORE.md`, which was not visible in the repo file list.
- `docker-compose.prod.yml` says copy from `.env.production.example`, which was not visible in the repo file list.
- Widget deployment docs mention `spw-widget.*`, while Vite/package output names are `spm-widget.*`. See `DEPLOYMENT.md:202` and `apps/widget/vite.config.ts:25`.

Operationally, the biggest gaps are no CI/CD, incomplete e2e verification, unclear migration/backup runbook, and deployment docs that disagree about the real process.

## What Is Solid

- Clear monorepo layout and modular NestJS architecture.
- Production boot audit exists and fails fast on missing/placeholder secrets.
- Database synchronize is hard-disabled in production.
- JWT and refresh-token rotation are implemented, with refresh token persistence.
- Public API keys are hashed, not stored raw.
- Redis-backed throttler avoids per-replica rate-limit bypass for routes using it.
- Stripe webhook signature verification and idempotency are implemented.
- Outbound webhook delivery has signing, timeout, no redirects, retries, and audit rows.
- Upload paths have path traversal checks and image re-encoding.
- Dashboard/API/widget all build when explicit commands are run.
- API unit tests exist for boot audit and secret encryption.

## What Is Risky

- Tenant settings mix public configuration with secrets.
- Feed credentials are plaintext JSON.
- Widget/API contract is not aligned.
- Public endpoint throttling is inconsistent.
- Subscription and widget entitlement enforcement is incomplete outside license config.
- Scheduled feed imports can duplicate under PM2 cluster/multiple replicas.
- E2E tests did not complete.
- Repo-level typecheck gives a false positive.
- Deployment docs are stale/inconsistent.
- There is limited test coverage for tenant isolation, billing idempotency, public API behavior, and destructive flows.

## Must Fix Before Deploy

1. Sanitize and split tenant settings/secrets.
2. Stop returning full webhook secrets from normal credential endpoints.
3. Encrypt or otherwise protect feed credentials.
4. Align widget public API routes and DTOs with actual widget requests.
5. Apply API-key throttling consistently to all public widget endpoints.
6. Enforce subscription/widget/add-on entitlements server-side.
7. Add scheduler locks/job uniqueness for feed imports.
8. Fix repo-level verification scripts so typecheck/lint/test actually cover API/dashboard/widget.
9. Get e2e tests to run reliably, or document why they require external DB/Redis and provide a working command.
10. Clean up deployment docs and provide the missing production env/backup references.

## Can Wait

- Replacing TypeORM or changing the database engine.
- Microservice split.
- Full observability stack.
- Image optimization refactors in dashboard.
- Widget bundle-size optimization.
- Full UI polish.
- Larger frontend e2e suite, after the public API contract is fixed.

