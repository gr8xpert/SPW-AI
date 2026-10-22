# Buyer Match J — Reports, housekeeping, GDPR, CSV export, two-factor login

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** managers see how the agency is doing (new buyers by source, funnel, agents, expected revenue); duplicates can be merged; buyers can unsubscribe and be erased; the list exports to CSV; every user can turn on two-factor login and an agency can require it.

**Architecture:**
- API `apps/api/src/modules/lead/buyer/`:
  - `reports/reports.ts` (pure: monthly buckets, funnel, median, expected revenue) + `reports/buyer-reports.service.ts`
  - `housekeeping/duplicates.ts`, `housekeeping/merge-plan.ts`, `housekeeping/csv.ts` (pure) + `housekeeping/buyer-housekeeping.service.ts` (duplicates, merge, export) + `housekeeping/buyer-gdpr.service.ts` (consent, unsubscribe, erase)
  - `housekeeping/buyer-housekeeping.controller.ts` (dashboard routes) and the public unsubscribe page `GET /api/t/u/:token` in `tracking/buyer-tracking.controller.ts`
- API `apps/api/src/modules/auth/two-factor/`: `totp.ts` (pure), `two-factor.service.ts`, `two-factor.controller.ts`; `AuthService.login` takes `code`; access tokens carry `mfaSetup` when the agency requires 2FA and the user has none; `JwtAuthGuard` lets such tokens reach only `/api/auth/2fa/*`, `/api/auth/me`, `/api/auth/logout`.
- Migration `1777300000000-BuyerMatchHousekeeping`.
- Dashboard: Buyers → Reports page (recharts), Stages probability, Settings → Housekeeping tab (duplicates + merge, CSV export), record header menu (consent, unsubscribe, erase), Account → Security page, login code step, Super Admin client edit "Require two-factor login".

**Spec:** `docs/superpowers/specs/2026-10-22-buyer-match-phase2b-design.md` (J). E plan's Global Constraints apply.

## Decisions
- **2FA secret encryption reuses `common/crypto/secret-cipher.ts` (`encryptedColumn`, AES-256-GCM, already used for tenant secrets)** instead of a new `secret-box.ts`: one cipher and one key policy for the whole API.
- **`require2fa` is a tenant column (`tenants.require2fa`)**, not a Buyer Match setting: it guards every dashboard login, also for agencies without the add-on. Super Admin sets it on the client edit page; the agency's own admin can switch it on under Security.
- After a user enables 2FA while their token says `mfaSetup`, the dashboard signs them out and they log in again with a code (a fresh token without the flag). No token upgrade route — nothing to get wrong.
- Wrong codes: 5 in a row → `twoFactorLockedUntil` = now + 15 min (login answers 429 `TWO_FACTOR_LOCKED`). A right code resets the count. Recovery codes: 8 × 10 chars, shown once, bcrypt-hashed, each works once.
- Unsubscribe token = the E link token with purpose `u` and the buyer id. The page is plain HTML in the buyer's language ("You won't get property emails from <agency> any more") with a "Subscribe again" button (POST, same token).
- Unsubscribed buyer: selection send → 400 `UNSUBSCRIBED` when the buyer is the only recipient (other recipients still get it); alerts skip them; their page still works.
- Erase: managers, body `{ confirm: "ERASE" }`. Clears names, email, phone(s), address, ID/passport, notes, answers, wishlist free text, files (deleted from storage), page code; contact the same unless other buyers use it; activity descriptions → null; metadata of form activities → null. Keeps stage, source, dates, suggestions/timeline counts. `erasedAt` set; activity `erase`. Erased buyers are read-only (403 `ERASED` on edits) and listed as "Erased buyer #id".
- Merge: `POST buyers/:id/merge { sourceId }` keeps `:id`. Moves suggestions (collision → keep the one further on the timeline, copy the other's events), tasks, files, related agents (union), trips, viewings, sends, alerts, activities, changes. Source gets `mergedIntoId`; both log a `merge` change. Agents can't merge; managers only.
- Duplicates: same phone digits (last 9 digits, ≥ 7 digits) or same email-less normalised first+last name; open buyers only (not merged, not erased); groups of 2+.
- Reports: months = 12 (max 24) in the agency time zone. Funnel counts buyers created in the window who reached each open stage (current stage order ≥ stage order, or a stage change to it in `lead_changes`); won/lost separate. Agent results per assigned agent: buyers, won, won value (`dealValue` of won buyers), conversion = won / (won + lost), median first response = median of (first agent activity − createdAt) over buyers with one. Expected revenue = Σ open buyers' `dealValue` × stage probability (default by stage order: evenly from 10% to 90%).
- CSV: same filters as the list; columns id, first name, last name, email, phone, mobile, role, stage, agent, source, priority, budget min/max, locations, types, bedrooms min, created, last activity, consent, unsubscribed, answers (one column per active question). Formula guard: a cell starting with `= + - @` (or tab/CR) gets a leading `'`. UTF-8 BOM, CRLF.

## Tasks
### Task 1: Pure parts (TDD) — `reports.spec.ts`, `duplicates.spec.ts`, `merge-plan.spec.ts`, `csv.spec.ts`, `totp.spec.ts` (RFC 6238 SHA-1 vectors 59 s → 94287082 etc., base32 RFC 4648 vectors).
### Task 2: Migration + entities (stage probability, lead GDPR columns, user 2FA columns, tenant require2fa, activity types `erase`/`unsubscribe`/`merge`).
### Task 3: Reports service + route; stage probability in stage DTO/service.
### Task 4: Housekeeping service (duplicates, merge, export) + routes.
### Task 5: GDPR service (consent, unsubscribe/resubscribe, erase), unsubscribe link in buyer emails, public page, send/alert guards.
### Task 6: Two-factor (service, controller, login `code`, token flag, guard, refresh keeps flag, super admin tenant toggle).
### Task 7: Dashboard (Reports, probability, Housekeeping tab, record menu, Security page, login code step, admin toggle).
### Task 8: E2E `j-api.js`, `j-2fa.js`; puppeteer; builds.
