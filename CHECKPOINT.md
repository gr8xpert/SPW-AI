# SPW — Claude Session Checkpoint

**Snapshot taken:** 2026-04-16, mid-Phase-2 (pre-Windows-restart for Docker install).

Read this when resuming the Claude session after Windows restart.

---

## Where we are

### Phase 1 — Stabilize & secure — ✅ COMPLETE

17 files changed. Security audit covered all 6 target areas (root PHP scripts, auth & tenant isolation, uploads, webhook HMAC, SuperAdmin, dashboard API client). See chat history for the full report.

**Urgent server-side action items (still must be done by you):**
1. Rotate on live server: admin password, MySQL `spw_user` password, JWT_SECRET, JWT_REFRESH_SECRET.
2. `rm *.php` from live webroot (9 root-level PHP scripts were publicly leaking the admin JWT).
3. Treat the current repo as credential-leaked — rotate anything ever pasted into `DEPLOYMENT.md`.

### Phase 2 — Make it run end-to-end — ⏸ IN PROGRESS

**Done so far:**
- [x] `pnpm install` ran clean (new deps: `@nestjs/throttler`, `helmet`)
- [x] Local `.env` files bootstrapped (`apps/api/.env`, `apps/dashboard/.env.local`) — dev-only secrets, gitignored
- [x] API build clean (`pnpm build:api`)
- [x] Dashboard build clean (`pnpm build:dashboard`) — all 36 routes incl. `/dashboard/properties`. The "page missing" prod memory was stale `.next/` cache, not a code bug.
- [x] Widget build clean (`pnpm build:widget`)
- [x] New: `apps/api/src/database/seed.ts` + `pnpm --filter api seed` script (idempotent)
- [x] New: `/api/health` endpoint at `apps/api/src/modules/health/` — checks MySQL + Redis with latency
- [x] New: `docker-compose.yml` at repo root — MySQL 8 + Redis 7 (DEPLOYMENT.md referenced one that didn't exist)
- [x] New: `apps/api/test/smoke.e2e-spec.ts` + `pnpm --filter api test:smoke` — exercises register→login→property CRUD→tenant isolation→rate limit

**Blocked on:**
- [ ] Docker Desktop installation + Windows restart (user action)

---

## Resume plan (run these in order after Windows restart)

```bash
# 1. Verify Docker works
docker --version
docker compose version

# 2. Start MySQL + Redis
cd E:/Repos/SPW-AI/spw
pnpm docker:up
docker compose ps            # both services should show (healthy)

# 3. Run migrations (5 migration files expected)
pnpm db:migrate

# 4. Seed baseline data (plans + super-admin)
SEED_SUPER_ADMIN_EMAIL=admin@localhost SEED_SUPER_ADMIN_PASSWORD=dev-admin-password-12 pnpm db:seed

# 5. Boot API in one terminal
pnpm dev:api
# Expected: "API listening on http://0.0.0.0:3001 (NODE_ENV=development)"

# 6. In a second terminal — health check
curl http://localhost:3001/api/health

# 7. Run smoke test (proves golden path + security)
cd apps/api && pnpm test:smoke

# 8. If smoke test green — boot dashboard
cd ../.. && pnpm dev:dashboard
# Then open http://localhost:3000 and log in as admin@localhost
```

**Report any failure verbatim** — paste the full error and stop at that step.

---

## Known environment quirks

- **Node 24** installed locally; project expects 20.x LTS. Usually fine, noteworthy if something surprising happens.
- **Docker NOT installed yet** — the whole Phase 2 boot flow is blocked on this.
- **No prior git commits** — `master` has zero commits. All Phase 1 work is uncommitted. Consider making an initial commit before the Windows restart so work persists regardless of tooling hiccups.

---

## Files changed in this session (relative to repo root)

### New
- `docker-compose.yml`
- `CHECKPOINT.md` (this file)
- `apps/api/.env` (dev only, gitignored)
- `apps/api/src/database/seed.ts`
- `apps/api/src/modules/health/health.controller.ts`
- `apps/api/src/modules/health/health.module.ts`
- `apps/api/test/smoke.e2e-spec.ts`
- `apps/dashboard/.env.local` (dev only, gitignored)

### Edited
- `.gitignore` — blocks `/*.php`
- `DEPLOYMENT.md` — removed leaked credentials
- `package.json` — docker compose scripts point at the new compose file
- `apps/api/.env.example` — JWT secrets required, generation instructions
- `apps/api/package.json` — added `@nestjs/throttler`, `helmet`, `seed` + `test:smoke` scripts
- `apps/api/src/app.module.ts` — ThrottlerModule + HealthModule + BullQueue for health probe
- `apps/api/src/config/database.config.ts` — force `synchronize: false` in prod
- `apps/api/src/config/jwt.config.ts` — boot-time fail-fast if secrets missing/<32 chars
- `apps/api/src/main.ts` — helmet + 127.0.0.1 bind in prod + tight CORS
- `apps/api/src/common/decorators/tenant.decorator.ts` — reads from `user.tenantId`, throws if missing
- `apps/api/src/modules/auth/auth.controller.ts` — per-endpoint throttle limits
- `apps/api/src/modules/super-admin/super-admin.service.ts` — soft delete, no secrets in audit metadata
- `apps/api/src/modules/super-admin/dto/query-clients.dto.ts` — sortBy whitelisted
- `apps/api/src/modules/upload/upload.controller.ts` — guards + role + DTOs added
- `apps/api/src/modules/upload/upload.service.ts` — stored-XSS fix, async I/O, path traversal defense
- `packages/wp-plugin/includes/class-spw-webhook.php` — fail-closed + replay protection

### Deleted
- `check_version.php`, `clear_cache.php`, `rebuild.php`, `restart_api.php`, `restart_spw.php`, `restart_and_test.php`, `test_properties.php`, `fix_port_and_restart.php`, `version_check.php`

---

## Phase 3 queued (not yet started)

High-priority items deferred from Phase 1:
- Refresh token rotation + reuse detection
- API key hashing in tenant table (currently plaintext)
- Encrypt S3 credentials at rest in `tenant_storage_configs` (entity says "// Encrypted" but code never encrypts)
- Email verification enforcement at login
- Per-API-key rate limits on public property endpoint
- Dashboard refresh-token flow (user currently logs out mid-session on 7-day token expiry)
- Outbound webhook dispatcher in NestJS (half-implemented — `webhookUrl`/`webhookSecret` columns exist, nothing sends)

---

## Task status (from TaskList)

```
#1. [completed] Audit root PHP diagnostic scripts
#2. [completed] Audit auth & tenant isolation
#3. [completed] Audit file upload pipeline
#4. [completed] Audit webhook HMAC verification
#5. [completed] Audit SuperAdmin surface
#6. [completed] Audit dashboard API client & token handling
#7. [completed] Bootstrap local .env files for API + dashboard
#8. [completed] Typecheck + build API
#9. [completed] Typecheck + build dashboard
#10. [completed] Build widget
#11. [pending]   Boot API locally and verify health        ← next up
#12. [pending]   Diagnose server crash from logs           ← deferred (user chose local-first)
```
