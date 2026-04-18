# Release Checklist

Pre-flight and post-deploy verification for every SPW v2 release.
Complements [`DEPLOYMENT.md`](./DEPLOYMENT.md) (one-time setup) and
[`BACKUP_RESTORE.md`](./BACKUP_RESTORE.md) (DR runbook).

Use this as a literal checklist: tick each box on the PR or deploy
ticket. If a box can't be ticked, the release isn't ready.

---

## 1. Pre-deploy on operator machine

- [ ] `git pull` and confirm `git status` is clean.
- [ ] `pnpm install --frozen-lockfile` (lockfile drift = fail).
- [ ] `pnpm --filter api build` + `pnpm --filter @spw/shared build` clean.
- [ ] `pnpm test:smoke` green (expected count in the release's phase memory).
- [ ] `bash scripts/verify-migrations.sh` against a throwaway DB passes
      (spins up a fresh MySQL container, replays every migration in
      order, asserts no errors). Catches cross-migration dependency
      breakage that the idempotent `pnpm db:migrate` hides.

## 2. Environment delta review

For every env var the release introduces or tightens, `.env.production`
must be updated BEFORE the API restarts. Boot-audit refuses to start
with placeholder values — a missed update will crash the container on
first boot, not silently run.

Current env deltas since v1:

| Var | First required in | Notes |
|-----|-------------------|-------|
| `ENCRYPTION_KEY` | 3B | AES-256 at-rest key, 32 chars. Rotating requires re-encrypting all `enc:v1:` rows. |
| `JWT_SECRET` + `JWT_REFRESH_SECRET` | 3A | ≥ 32 chars. |
| `DASHBOARD_URL` | 5K | Required in prod (CORS + verification links). |
| `REDIS_*` | 4 | Throttler + queues. |
| `WEBHOOK_ALLOW_LOOPBACK` | 3E | MUST be unset/false in prod (SSRF). |
| `SMTP_*` | 5D | Verification emails. Leave `SMTP_HOST` empty for log-only. |
| `MAIL_DKIM_DOMAIN` / `_SELECTOR` / `_PRIVATE_KEY` | 6B | **Optional.** If all three are set, system mail is DKIM-signed. Boot-audit rejects placeholder private keys. |
| `PADDLE_WEBHOOK_SECRET` | 6A | **Optional** (empty = webhook rejects with 401). Boot-audit rejects placeholder. |
| `PADDLE_GRACE_DAYS` | 6A | Default 7. Days a tenant stays in `grace` after a failed Paddle payment. |
| `PADDLE_API_KEY` | 6E | **Optional** (empty = `/api/billing/checkout` returns 503). Boot-audit rejects placeholder. |
| `PADDLE_API_URL` | 6E | Default `https://api.paddle.com`. Use `https://sandbox-api.paddle.com` for sandbox accounts. |

## 3. Database migrations

Every deploy runs `pnpm db:migrate`. Confirm the new migration
names appear in the list before running:

```bash
cd apps/api && pnpm typeorm migration:show -d dist/config/database.config.js
```

Pending migrations as of HEAD:

<!-- Update this table when you land a new migration. Check off as each
     is applied to prod. -->

| Timestamp | Name | Phase | Applied? |
|-----------|------|-------|----------|
| 1776302900000 | TenantLastCacheClearedAt | 5P | [ ] |
| 1776303900000 | TenantEmailDomain | 5R | [ ] |
| 1776304900000 | ProcessedPaddleEvents | 6A | [ ] |
| 1776305900000 | PlanPaddlePriceIds | 6E | [ ] |

## 4. Boot verification

Immediately after `pm2 restart all` (or `docker compose up -d`):

- [ ] **Liveness:** `curl -fsS https://api.example.com/api/health/live`
      returns 200 within ~1s (no DB/Redis checks).
- [ ] **Readiness:** `curl -fsS https://api.example.com/api/health/ready`
      returns 200 with `checks.database.status=ok` AND `checks.redis.status=ok`.
      A non-ok readiness means **don't route traffic yet** — fix DB/Redis
      before continuing.
- [ ] **Boot audit log line:** grep the API's log for
      `boot security audit: OK`. Absence means the audit rejected the
      env — the process will have exited with a stack trace.

## 5. Smoke in production

- [ ] Log into the dashboard; a known-good tenant loads.
- [ ] Place a test property write; verify the webhook fires
      (check "Webhook deliveries" in the dashboard; delivery count goes
      up within 30s).
- [ ] Super-admin → Rate Limits page loads a row per active tenant.
- [ ] Super-admin → Queue Depth page shows the 4 tracked queues,
      all `ok`.

## 6. Paddle webhook (if enabled this release)

- [ ] `PADDLE_WEBHOOK_SECRET` matches the value in Paddle's notification
      settings (Developer tools → Notifications → your endpoint → Secret key).
- [ ] In Paddle's dashboard, send a **test** `subscription.created`
      event. Expected response: HTTP 200 with
      `{"data":{"received":true,"outcome":"no-tenant",...}}`
      (`no-tenant` is normal for a test event — there's no real tenant
      behind it — we want to confirm signature verification worked).
- [ ] Tail the API log: one line per test event, `event_id=evt_...`.
      No `Signature mismatch` / `Signature expired` errors.

## 7. Rollback

If `/api/health/ready` stays non-ok for more than ~2 minutes, or the
boot audit fails:

```bash
cd /var/www/spw
git log --oneline -5     # Note the previous known-good commit
git checkout <prev-sha>
pnpm install --frozen-lockfile
pnpm --filter api build
pm2 restart api
```

Migrations: TypeORM migrations are **not auto-reverted**. Each has a
working `down()` — run manually only if the schema change is the cause:

```bash
cd apps/api && pnpm typeorm migration:revert -d dist/config/database.config.js
```

Do not `migration:revert` casually — it drops or alters tables, and
data written against the newer schema will be lost.
