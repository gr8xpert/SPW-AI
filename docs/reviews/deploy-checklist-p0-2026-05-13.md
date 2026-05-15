# P0 Deploy Checklist — 2026-05-13

> ✅ **DEPLOYED 2026-05-13.** All 9 P0 items now ✅ Fixed. The earlier
> "launch exception" on P0-08 was **closed** by the P0-08 Closure Pass:
> the inquiry webhook now dispatches through the full
> `WebhookService.emit` pipeline (signed + audited in
> `webhook_deliveries` + BullMQ-retried, with the same SSRF pre-flight
> as the main webhook). A new migration adds a `channel` discriminator
> column to distinguish main vs. inquiry deliveries.
>
> **One soft item remains:**
>
> 1. **E2E suite has NOT been executed end-to-end** on the dev host the
>    fixes were written on (MySQL + Redis not running there). The
>    `jest-e2e-setup.ts` fail-fast diagnostic is verified working, but a
>    passing run with dependencies up is **required before final deploy
>    approval**. Run from a host (or CI job) with `pnpm docker:up`
>    current:
>
>    ```bash
>    pnpm docker:up
>    pnpm --filter api test:e2e
>    pnpm --filter api test:smoke
>    ```
>
>    Both commands must exit 0. Attach the output to the deploy ticket.
>    Not blocking the live deploy — this is "do once before the next big
>    deploy" hygiene.

## ⚠️ Reverse-proxy trust — must verify before deploy

The `ApiKeyThrottlerGuard` per-IP probe budget keys on `req.ip`. Without
`trust proxy` configured, every request behind nginx appears to come from
`127.0.0.1`, and one attacker exhausts the probe budget for all real
clients. New env var (`apps/api/src/common/security/trust-proxy.ts`):

```bash
# In apps/api/.env on the production server:
TRUST_PROXY=loopback           # nginx on the same host (typical)
# TRUST_PROXY=10.0.0.0/8,172.16.0.0/12   # nginx on a different box
# TRUST_PROXY=2                          # exactly 2 trusted hops (CF→nginx→app)
```

**`TRUST_PROXY=true` is rejected by the boot audit in production** — it
trusts the last X-Forwarded-For entry unconditionally, which a client can
forge if anything in front accepts arbitrary X-Forwarded-For from the
public internet.

**Verification step after deploy** — confirm the API sees the real client IP:

```bash
# From a host with a public IP, hit a public widget endpoint with a
# fake X-Forwarded-For. With nginx-on-same-host + TRUST_PROXY=loopback,
# req.ip should equal the X-Forwarded-For value (nginx is trusted to set it),
# NOT 127.0.0.1.

# Confirm nginx is setting the header (verify nginx config first):
#   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
#   proxy_set_header X-Real-IP       $remote_addr;

# Then on the server, with PM2 logging enabled, send a request from
# another host and tail the JSON logs:
pm2 logs api --lines 50

# Look for an analytics or rate-limit log entry. The `ip` field should be
# the public IP of the originating host, not 127.0.0.1.

# Smoke for the throttler itself — send 35 requests with a bogus API key
# from a single client. The 31st onwards should return 429 from the anon
# bucket (ANON_ABUSE_LIMIT = 30/min). If TRUST_PROXY is misconfigured
# and req.ip collapses to 127.0.0.1, this would show the same behaviour
# even when run from two different client IPs in parallel — so run from
# TWO hosts simultaneously and verify each gets its own 30-request budget:
for i in $(seq 1 35); do
  curl -s -o /dev/null -w "%{http_code} " \
    -H "x-api-key: bogus-test-key-$i" \
    https://api.spw-ai.com/api/v1/locations
done | tr ' ' '\n' | sort | uniq -c
# Expect: ~30x 401 then 5x 429 (anon bucket exhausted)
```

If `TRUST_PROXY=loopback` does not surface the real IP, your nginx config
isn't forwarding it — fix nginx OR set `TRUST_PROXY` to the explicit
CIDR(s) of the upstream proxy.

## Current verification status (last run on author's host)

| Command | Result |
|---|---|
| `pnpm typecheck` | ✅ 4/4 packages |
| `pnpm lint` | ✅ 0 errors |
| `pnpm build` | ✅ 4/4 packages |
| `pnpm --filter api test` | ✅ 82 / 82 across 8 suites |
| `pnpm --filter @spm/widget build` | ✅ |
| `pnpm --filter api test:e2e` | ⚠️ **NOT RUN** — MySQL/Redis unavailable locally. Fail-fast diagnostic confirmed working (<10s). Re-run with deps up before deploy. |

## What changed

### P0-01 — Tenant settings / secret split
- Removed `recaptchaSecretKey`, `openRouterApiKey`, `inquiryWebhookUrl` from
  the public `tenants.settings` JSON payload.
- Added encrypted columns on `tenants`: `recaptchaSecretKey`,
  `inquiryWebhookUrl` (plus existing `openrouterApiKey`).
- `TenantPublic` now exposes `*Configured` booleans instead of raw secrets.
- Dashboard reads the booleans and shows masked placeholders.

### P0-02 — Webhook secret no longer returned
- `GET /api/dashboard/tenant/api-credentials` now returns
  `webhookSecretLast4` instead of the full `webhookSecret`. Rotate endpoint is
  unchanged.

### P0-03 — FeedConfig credentials encrypted
- `feed_configs.credentials` migrated from JSON → encrypted TEXT.
- New `encryptedJsonColumn` transformer in `secret-cipher.ts`.
- API responses (`findAllConfigs`, `findConfigById`, `createConfig`,
  `updateConfig`) mask `apiKey`/`password`; the import worker uses an internal
  accessor that returns decrypted credentials.

### P0-04 — Widget public API contract aligned
- New public controllers: `/api/v1/locations`, `/api/v1/property-types`,
  `/api/v1/features`.
- New endpoint: `GET /api/v1/properties/:reference/similar`.
- `SearchPropertyDto` accepts `query`, `reference`, `locationIds` (CSV/array),
  `lat`, `lng`, `radius`, `bounds`. Search service expands `locationIds` and
  filters by bounds / haversine radius.

### P0-05 — API-key throttler on all public widget endpoints
- Applied `ApiKeyThrottlerGuard` + `SkipThrottle` to: labels, inquiry,
  share-favorites, tracking, favorites, plus the three new public lookup
  controllers.
- Endpoint-specific caps: inquiry 30/min, share-favorites 30/min,
  tracking 300/min, favorites 120/min.

### P0-06 — Subscription + widgetEnabled enforced at API key resolution
- New `TenantService.findActiveWidgetTenantByApiKey()` checks `isActive`,
  subscription validity (grace-aware), and `widgetEnabled`. All public
  controllers now use it. Returns 401 on any failure so probes can't
  distinguish "wrong key" from "expired subscription".

### P0-07 — Inquiry HTML escaping
- New `apps/api/src/common/security/escape-html.ts`.
- All user-controlled fields (`name`, `email`, `phone`, `message`,
  `propertyId`, `companyName`, `primaryColor`) escaped in both inquiry
  notification + auto-reply HTML.

### P0-08 — Inquiry webhook SSRF
- URL stored on the dedicated `tenants.inquiryWebhookUrl` column;
  `validateWebhookTarget()` runs on save (rejects loopback / private IPs /
  non-http schemes) and again pre-flight on each send.
- Outbound fetch now uses `redirect: 'manual'` so a hostile receiver can't
  bounce us to a private host.

### P0-09 — Feed scheduler locks
- `FeedSchedulerService.checkScheduledImports()` wrapped in
  `RedisLockService.withLock('feed-scheduler:hourly-scan', ...)`.
- Scheduler passes a `scheduledWindow` (hour bucket) to `triggerSync` which
  becomes part of a deterministic BullMQ `jobId` (`feed-import:{cfg}:{window}`).
- `triggerSync()` refuses to start a second import while one is already
  running for the same tenant/config (stale runs >2h get superseded so a
  dead worker can't block the queue permanently).

## Files changed

Modified (23):
- `apps/api/src/common/crypto/secret-cipher.ts`
- `apps/api/src/database/entities/feed-config.entity.ts`
- `apps/api/src/database/entities/tenant.entity.ts`
- `apps/api/src/modules/ai/ai.service.ts`
- `apps/api/src/modules/analytics/analytics.controller.ts`
- `apps/api/src/modules/analytics/analytics.module.ts`
- `apps/api/src/modules/feature/feature.module.ts`
- `apps/api/src/modules/feed/feed-scheduler.service.ts`
- `apps/api/src/modules/feed/feed.service.ts`
- `apps/api/src/modules/label/label.module.ts`
- `apps/api/src/modules/label/public-label.controller.ts`
- `apps/api/src/modules/lead/lead.controller.ts`
- `apps/api/src/modules/lead/lead.module.ts`
- `apps/api/src/modules/location/location.module.ts`
- `apps/api/src/modules/property-type/property-type.module.ts`
- `apps/api/src/modules/property/dto/search-property.dto.ts`
- `apps/api/src/modules/property/property-search.service.ts`
- `apps/api/src/modules/property/public-property.controller.ts`
- `apps/api/src/modules/super-admin/super-admin.service.ts`
- `apps/api/src/modules/tenant/public-sync-meta.controller.ts`
- `apps/api/src/modules/tenant/tenant.service.ts`
- `apps/dashboard/src/app/(dashboard)/dashboard/settings/page.tsx`
- `packages/shared/src/types/tenant.types.ts`

New (6):
- `apps/api/src/common/security/escape-html.ts`
- `apps/api/src/database/migrations/1776324000000-TenantSecretColumns.ts`
- `apps/api/src/database/migrations/1776325000000-EncryptFeedCredentials.ts`
- `apps/api/src/modules/feature/public-feature.controller.ts`
- `apps/api/src/modules/location/public-location.controller.ts`
- `apps/api/src/modules/property-type/public-property-type.controller.ts`

## Deploy — what to upload (FTP/SFTP)

Server has no git. Build artifacts only — upload the contents of:

1. **API build output** → server `apps/api/dist/`
   Local source: `apps/api/dist/` (produced by `pnpm --filter api build`).

2. **Dashboard build output** → server `apps/dashboard/.next/`
   Local source: `apps/dashboard/.next/` (produced by
   `pnpm --filter @spm/dashboard build`).

3. **Widget build output** → server `apps/widget/dist/` (and your CDN if
   widget is served from one)
   Local source: `apps/widget/dist/` (produced by
   `pnpm --filter @spm/widget build`).

4. **Shared package** → server `packages/shared/dist/`
   Local source: `packages/shared/dist/` (produced by
   `pnpm --filter @spm/shared build`).

5. **Source files for the two new migrations** must exist on the server
   under the API source tree so `pnpm migration:run` picks them up:
   - `apps/api/src/database/migrations/1776324000000-TenantSecretColumns.ts`
   - `apps/api/src/database/migrations/1776325000000-EncryptFeedCredentials.ts`
   If your build emits `dist/migrations/*.js`, upload the compiled .js
   migration files instead.

## Deploy steps (on the server)

```bash
# 1. Stop API processes
pm2 stop api

# 2. Backup database FIRST. Both migrations are destructive on rollback:
#    - TenantSecretColumns moves data out of tenants.settings JSON
#    - EncryptFeedCredentials rewrites feed_configs.credentials column
mysqldump -u root -p spw > /backups/pre-p0-$(date +%Y%m%d-%H%M).sql

# 3. Upload new files via FTP/SFTP (see "what to upload" above).

# 4. Ensure ENCRYPTION_KEY env var is set in the API .env (>=16 chars).
#    Both new migrations call encryptSecret() which requires it.
grep ENCRYPTION_KEY apps/api/.env

# 5. Run migrations
cd apps/api
pnpm migration:run

# 6. Restart API + worker
pm2 restart api
pm2 logs api --lines 100   # confirm boot audit passes, no migration retries
```

## Post-deploy smoke tests

- `GET /api/dashboard/tenant` (with a tenant JWT) — verify settings JSON
  no longer contains `recaptchaSecretKey`, `openRouterApiKey`,
  `inquiryWebhookUrl`; the response includes `recaptchaSecretKeyConfigured`,
  `openRouterApiKeyConfigured`, `inquiryWebhookUrlConfigured` booleans.
- `GET /api/dashboard/tenant/api-credentials` — returns `apiKeyLast4` +
  `webhookSecretLast4`, no full secret.
- `GET /api/v1/properties?locationIds=1,2,3` — accepts the param without
  400.
- `GET /api/v1/properties/REF1234/similar?limit=6` — returns up to 6.
- `GET /api/v1/locations`, `/api/v1/property-types`, `/api/v1/features` with
  a widget `x-api-key` header — all return tenant data.
- Submit an inquiry via the widget — confirm email arrives with HTML escaped
  (try a name like `<script>alert(1)</script>`); confirm webhook fires.
- An expired tenant key returns 401 from `/api/v1/properties` and friends.
- Open `/dashboard/feeds` — credentials show as `••••xxxx`; save without
  retyping leaves credentials intact (verify next scheduled import still
  succeeds).

## Rollback note

Both new migrations refuse to decrypt back into plaintext on `down`. If a
rollback is genuinely required, restore the pre-deploy `mysqldump` from
step 2 — do not rely on `migration:revert` to bring secrets back.
