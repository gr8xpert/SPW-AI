# SPW Codebase Review — 2026-09-10

Scope: full monorepo (`apps/api`, `apps/dashboard`, `apps/widget`, `apps/wordpress-plugin`, `packages/*`).
~83k LOC TypeScript + 15 PHP files.

> **Status — items 1, 2, 3, 6 of the suggested order are done** (commit `e43ab83`).
> Fixed: WP plugin now tracked + stray ops scripts deleted (§1, §2), CI added (§3),
> multer 2.3.0 and next 14.2.35 (§10), dashboard auth-token caching (§6).
> Everything else below is still open.

---

## Overall assessment

The API is in noticeably better shape than typical SaaS code of this age. Security hardening is
genuinely good: boot-time secret audit, Redis-backed distributed throttling, per-plan API-key
buckets with anti-rotation anon bucket, two-tier CORS, HMAC Stripe signature verification with
raw-body handling, `synchronize:false` + 44 real migrations, tenant scoping applied consistently
in the services I sampled, loopback bind in prod, `forbidNonWhitelisted` validation. Most of the
comments in `main.ts` and `api-key-throttler.guard.ts` explain *why*, not *what* — that is rare and
worth preserving.

The weaknesses are not in the API's security model. They are in **source control, CI, test
coverage, and the dashboard's data layer.**

---

## P0 — Fix this week

### 1. The shipping WordPress plugin is not in git

`.gitignore` line: `*.php` — a blanket ignore added to stop one-off ops scripts leaking credentials.
It also silently excludes the entire V2 plugin.

```
UNTRACKED: apps/wordpress-plugin/spw/spw.php
UNTRACKED: apps/wordpress-plugin/spw/includes/class-spw-plugin.php
UNTRACKED: apps/wordpress-plugin/spw/includes/class-spw-api-client.php
UNTRACKED: apps/wordpress-plugin/spw/includes/class-spw-rewrite.php
UNTRACKED: apps/wordpress-plugin/spw/includes/class-spw-sitemap.php
… 15 files total
```

Meanwhile the **old V1 plugin** (`packages/wp-plugin/*.php`, 8 files) *is* tracked — so the repo
contains the dead version and not the live one. The V2 plugin currently exists only on this
workstation and on the customer servers it was FTP'd to. A disk failure loses it.

Fix: replace the blanket ignore with targeted rules.

```gitignore
# Ops scripts must never be committed (previously leaked admin credentials)
apps/api/_*.php
**/step*.php
# (drop the bare `*.php` line)
```

Then `git add -f apps/wordpress-plugin/spw` and commit. Consider deleting `packages/wp-plugin/`
once V2 is confirmed as the only deployed plugin.

### 2. Nine stray ops scripts still on disk in `apps/api/`

`_dash_debug.php`, `_deploy_full_batch.php`, `_finish_deploy.php`, … (989 lines total). Two of them
(`_debug_import.php`, `_finish_deploy.php`) still contain credential-shaped strings. They are
unauthenticated PHP designed to run shell commands from the public webroot. Delete them from the
working tree; the `pnpm pm2:*`-over-SSH path in `DEPLOYMENT.md` already replaces them.

### 3. No CI

`.github/workflows/` does not exist. Nothing runs `typecheck`, `lint`, or `test` before a deploy.
Given deploys are manual FTP with no git on the server, a broken build is discovered in production.

Minimum viable pipeline (one file, ~30 lines):

```yaml
# .github/workflows/ci.yml — on: [push, pull_request]
- pnpm install --frozen-lockfile
- pnpm typecheck    # turbo already wires this per-app
- pnpm lint
- pnpm test
```

Turbo's remote-cache-free local cache makes this fast. This is the single highest-leverage change
in the report.

---

## P1 — Structural, worth scheduling

### 4. Test coverage is ~2%

8 `*.spec.ts` files against 369 API source files, plus 2 e2e specs. What *is* tested is the right
stuff (throttler, secret cipher, trust-proxy, boot audit, feed scheduler, webhook targets,
tenant subscription, HTML escaping) — these are the security primitives. But the business logic
has none:

| Untested, high blast radius | Lines |
|---|---|
| `super-admin.service.ts` | 1347 |
| `feed.service.ts` | 1085 |
| `stripe-webhook.service.ts` | 442 |
| `credit.service.ts` | 341 |
| `payment` / plan transitions | — |

Credit accounting and Stripe webhook idempotency are where a silent bug costs real money. Start
there rather than chasing a coverage percentage.

### 5. Dashboard: React Query installed, barely used

`@tanstack/react-query` is a dependency but appears in **2 files**. The other 90+ pages use
`useEffect` + `useState` hand-rolled fetching: **113 `useEffect`s, 66 catch blocks, 23
`setLoading(true)` sites**. Consequences:

- No request dedup or caching — navigating back refetches everything
- Loading/error state re-implemented per page, inconsistently
- Sequential `useEffect` chains create request waterfalls
- Refetch-after-mutation is manual and easy to forget

Migrating the busiest pages (properties list, leads, tickets, contacts) to `useQuery`/`useMutation`
would delete several hundred lines and fix the staleness bugs at the same time.

### 6. `getSession()` on every API request

`apps/dashboard/src/lib/api.ts:20-28` — the axios request interceptor calls `await getSession()`
before *every* outgoing request. `getSession()` performs an HTTP round-trip to
`/api/auth/session`. Every data fetch is therefore two round-trips, and a page issuing 5 parallel
requests makes 5 redundant session calls.

Fix: read the token once from the `SessionProvider` context (or cache it in a module-level ref
invalidated on `signOut`). Keep the existing 401 → `signOut` response interceptor as-is.

Note this is *not* the `useCallback`-around-`api.get` stale-closure trap already recorded in
project memory — it's a separate cost on the same file.

### 7. Dashboard is 100% client-rendered

93 of 96 components carry `'use client'`. Next.js 14 App Router is present but Server Components,
server-side data fetching, and streaming are unused. Every page ships its data-fetching logic to
the browser and renders a spinner first. Not urgent, but it caps how fast the dashboard can ever
feel, and it's why the bundle carries axios + all form logic on every route.

### 8. God files

| File | Lines |
|---|---|
| `dashboard/.../settings/page.tsx` | 2571 |
| `widget/src/components/listing/PropertyCard.tsx` | 1556 |
| `api/.../super-admin.service.ts` | 1347 |
| `dashboard/.../properties/[id]/edit/page.tsx` | 1375 |
| `api/.../feed.service.ts` | 1085 |

`PropertyCard.tsx` is the most actionable. The 12 listing templates are 9-line lazy-loaded
wrappers — correct — but each just calls `RsPropertyGrid template={N}`, and all 12 card designs
live in one component as `if (template === 3) { … }` … `if (template === 12) { … }` blocks. So the
code-splitting is defeated: **every tenant downloads all 12 card designs** in the 81 KB `index`
chunk regardless of which one they use. Splitting `PropertyCard` into 12 lazily-imported card
components would cut the widget's initial payload substantially — and the widget loads on customer
sites, where bytes matter most.

`settings/page.tsx` at 2571 lines should split per settings tab.

### 9. `packages/shared` is empty, so types are duplicated

`packages/shared/src/index.ts` is 6 lines; the package holds only `JwtPayload`, role constants, and
two type files. `Property` is defined independently in three places:

- `dashboard/.../properties/page.tsx:58`
- `dashboard/.../properties/[id]/page.tsx:72`
- `widget/src/types/property.ts:43`

…and none of them are derived from `api/src/database/entities/property.entity.ts`. An API field
rename breaks the widget and dashboard silently at runtime. Moving the public-facing DTO shapes
(`Property`, `Tenant`, `Feature`, `Location`, feed provider enums) into `@spm/shared` would catch
these at compile time — the feed-provider 3-way drift already documented in project memory is
exactly this class of bug.

---

## P2 — Dependencies & config

### 10. Dependency currency

| Package | Current | Note |
|---|---|---|
| `multer` | `^1.4.5-lts.1` | 1.x is **deprecated and unmaintained**; known DoS advisories. Upgrade to `2.x` — mostly drop-in, check `limits` config. Highest-priority dep bump. |
| `next` | `14.1.4` (pinned) | 14.1.x carries many published advisories. **Correction (later same day):** I first framed 14.2.35 as the fix — it isn't. Most of these advisories are only patched in `15.5.x`; 14.2.35 closes some (Server Components DoS, cache poisoning, middleware bypass) and leaves the rest open. The whole 14.x line is behind. See the exposure triage below before treating this as urgent. |
| `next-auth` | `4.24.13` installed | **Higher priority than the Next bump.** 4.24.15 patches a *critical* (email normalizer validates before Unicode normalization → homoglyph `@` bypass), a *high* (`getToken()` throws on malformed Bearer headers), and a moderate (OAuth state/nonce/PKCE cookies not bound to the issuing provider). Semver-compatible with the existing `^4.24.7` range — a patch bump, not a migration. |
| `@nestjs/*` | `^10.3` | Nest 11 available; not urgent, plan it. |
| `turbo` | `^1.13` | Turbo 2 renamed `pipeline` → `tasks`; `turbo.json` still uses `pipeline`. |
| `eslint` | `^8.56` | ESLint 8 is EOL. |
| `next-auth` | `^4.24` | v5 available; migration is non-trivial, defer. |
| `uuid` | `^9` | Node 20 has `crypto.randomUUID()` built in — could drop the dep. |

Run `pnpm audit` as part of the CI job in item 3.

**Exposure triage for the three Next criticals, against *this* deployment** (done 2026-09-10, after
`pnpm audit --json`; severity alone is misleading here):

| Critical | Applies? |
|---|---|
| Authorization Bypass in Middleware (`<14.2.25`) | **No** — there is no `middleware.ts` anywhere in the app, so there is no middleware chain to bypass. |
| Unauthenticated RCE on Windows-hosted servers (`<15.5.24`) | **No** — production is Linux (Plesk/nginx under `/var/www/vhosts`). |
| Unauthenticated RCE in Image Optimization API via AVIF (`<15.5.24`) | **Uncertain, and the one that matters.** `next/image` is imported in 0 source files, but `/_next/image` is served by default regardless. Not fixed by 14.2.35 either — patched only in 15.5.24. If this endpoint isn't needed, blocking `/_next/image` at nginx/Cloudflare closes it without any dependency change. |

So reverting to 14.1.4 (commit `530838c`) reintroduced advisories, but not the ones that would be
alarming for this particular deployment. The genuinely actionable item is the `next-auth` patch bump
above — and note it is a runtime dependency resolved from the server's `node_modules`, so like the
Next bump it cannot ship as a `.next`-only upload. Both belong in the same deploy window that runs
`pnpm install --frozen-lockfile` on the server.

### 11. AI model defaults are a generation behind

`apps/api/src/modules/ai/ai.service.ts:16,22`:

```ts
const FALLBACK_DEFAULT_MODEL    = 'anthropic/claude-sonnet-4-20250514';
const FALLBACK_ENRICHMENT_MODEL = 'anthropic/claude-haiku-4-5';
```

These route through OpenRouter and are the fallbacks when a tenant hasn't set
`settings.openRouterModel`. `claude-sonnet-4-20250514` is two generations old. Current Anthropic
line-up (first-party IDs; OpenRouter prefixes with `anthropic/`):

| Model | ID | Input $/1M | Output $/1M |
|---|---|---|---|
| Claude Opus 5 | `claude-opus-5` | $5.00 | $25.00 |
| Claude Sonnet 5 | `claude-sonnet-5` | $2.00 | $10.00 |
| Claude Haiku 4.5 | `claude-haiku-4-5` | $1.00 | $5.00 |

Sonnet 5 is both **cheaper and stronger** than Sonnet 4 — moving `FALLBACK_DEFAULT_MODEL` to
`anthropic/claude-sonnet-5` is a straight win for description generation and translation. Keep
Haiku 4.5 for the bulk enrichment path. Verify the exact OpenRouter slugs before changing, since
OpenRouter naming lags first-party.

Also worth noting: the API's AI calls are plain HTTP to OpenRouter. If any route ever moves to
first-party Anthropic, `output_config.effort` and adaptive thinking become available and are the
main cost levers there.

### 12. API `tsconfig` is not fully strict

`apps/api/tsconfig.json` sets only `strictNullChecks` + `noImplicitAny`. Dashboard, widget, and
shared all use full `strict`. The API — the part handling money and tenant isolation — has the
loosest type checking. Missing: `strictFunctionTypes`, `strictBindCallApply`, `noImplicitThis`,
`useUnknownInCatchVariables`. There are **129 `: any` annotations** in the API source.

Enabling `strict` will surface errors; `strictPropertyInitialization: false` is the usual carve-out
for TypeORM entities. Do it behind a branch, not before a deploy.

### 13. No ESLint config for the widget

`apps/widget` has no `.eslintrc*` and no `lint` script, yet `turbo run lint` reports success — the
task is simply absent. The widget is the code that runs on customer sites.

---

## P3 — Performance opportunities

### 14. No HTTP caching on public widget endpoints

`public-property.controller.ts` (`GET /api/v1/properties`, `/:reference`, `/:reference/similar`)
sets no `Cache-Control` and no `ETag`. Every widget visitor on every tenant site hits MySQL. Only
the brochure endpoint sets caching headers (`private, max-age=300`).

The widget does layer IndexedDB + in-memory caching client-side (`core/data-loader.ts`), which
helps repeat visitors on the same device — but does nothing for first views or for the CDN. Adding
`Cache-Control: public, max-age=60, stale-while-revalidate=300` plus an ETag derived from the
tenant's `syncVersion` (which the data-loader already tracks) would let Cloudflare absorb most of
this traffic. Note the existing `/widget/*` CF-caching gotcha in project memory — this is the
complementary API-side fix.

### 15. Loop-with-await patterns

109 `for (const …)` blocks in API modules, many containing `await`. Not all are N+1 — several are
deliberately sequential for rate-limit reasons in the feed adapters — but `feed.service.ts` and
`migration.service.ts` are worth profiling against a large tenant. The feed import already uses
transactions (58 transaction/queryRunner sites), so the structure is there.

### 16. No automated tenant-scoping enforcement

Tenant isolation is currently a discipline: every service remembers to pass `tenantId` in its
`where` clause. The samples I checked were all correct (`ai-chat.service.ts:180` verifies
conversation ownership before loading messages by `conversationId` — exactly right). But nothing
*enforces* it. A TypeORM global scope, a `TenantScopedRepository` wrapper, or even a lint rule
requiring `tenantId` in `where` clauses on tenant-owned entities would turn a review problem into a
compile/CI problem. Worth considering before the next 5 modules land.

---

## Repo hygiene (quick wins)

- 10 build tarballs in the repo root (~11 MB): `spw-api-2026-08-*.tar.gz`, `spw-dashboard-*.tar.gz`,
  `api-full-deploy.tar.gz`, `upload.tar.gz`. Gitignored, but clutter — move to a `dist/` or delete.
- `api-e2e.log` (217 KB), `.graphify_uncached.txt` (39 KB), and an empty `nul` file (Windows
  redirect accident) in the root.
- `DEPLOYED.txt` **is tracked** and holds deploy state — that belongs in the ops runbook, not git.
- Two uncommitted dashboard edits (`features/page.tsx`, `property-types/page.tsx`) and an untracked
  `docs/n8n-workflows/spw-xero-invoice-sync.json` from the previous session.
- 6 markdown files in the root (`PLAN.md`, `PROJECT_OVERVIEW.md` at 37 KB, `DEPLOYMENT.md`,
  `BACKUP_RESTORE.md`, `AGENTS.md`, `CLAUDE.md`). Consider moving all but `CLAUDE.md` and
  `AGENTS.md` under `docs/`.

---

## Suggested order

1. Untangle the `*.php` gitignore, commit the WP plugin, delete `apps/api/_*.php` — **one afternoon**
2. Add `.github/workflows/ci.yml` running typecheck + lint + test + `pnpm audit` — **one afternoon**
3. Bump `multer` to 2.x and `next` to latest 14.2.x — **one afternoon, needs local verification**
4. Tests for `credit.service` and `stripe-webhook.service` — **a few days, highest bug-cost area**
5. Split `PropertyCard.tsx` into 12 lazy chunks — **measurable widget win on customer sites**
6. Fix the `getSession()` per-request round-trip — **small diff, immediate dashboard latency win**
7. Move public DTO types into `@spm/shared` — **incremental, start with `Property`**
8. React Query migration, page by page — **ongoing**
9. API `strict: true` behind a branch — **when there's a quiet week**

Items 1-3 and 6 are each roughly a single sitting and remove the sharpest risks. Everything below
that is genuine improvement rather than risk reduction.
