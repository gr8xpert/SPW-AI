# Buyer Match H — New-listing alerts

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** when a new listing that matches a buyer appears (feed import or manual create), or a listing drops its price by at least the agency's threshold, an alert is queued for that buyer. Nothing goes out by itself: the agent approves or rejects each alert on an approval screen. Approved alerts go out in one daily digest per buyer at the agency's digest time, or at once ("Send now", or delivery = instant). Never send twice applies.

**Architecture:**
- API `apps/api/src/modules/lead/buyer/alerts/`:
  - `alert-rules.ts` (pure): `priceDropOf`, `alertDedupeKey`, `alertAllowed`, `localDayTime`, `digestDue`
  - `buyer-alert.service.ts`: `scanTenant`, `scanAll`, `digestTenant`, `digestAll`, `list`, `decide`, `sendApproved`
  - `buyer-alert.scheduler.ts`: `onModuleInit` → `upsertJobScheduler('buyer-alert-scan', {every: 10 min})` and `('buyer-alert-digest', {every: 15 min})` (idempotent; `BUYER_ALERTS_SCHEDULER=off` skips)
  - `buyer-alert.controller.ts`: `GET buyers/alerts`, `POST buyers/alerts/decide`, `POST buyers/alerts/scan` (admin: run the scan for this agency now), `POST buyers/alerts/digest` (admin: run the digest if due)
  - processor: jobs `alert-scan` / `alert-digest` added to `BuyerMatchProcessor`
- `BuyerSendService.sendAlert` (no viewer: the agent approved it) + `buyer-mail.ts` alert wording (`buyer_alert_*` labels) and "Price reduced from X to Y".
- Migration `1777280000000-BuyerMatchAlerts`.
- Dashboard: `/dashboard/buyers/alerts` approval screen + sub-nav tab with the pending count; alert settings card in "Alerts & near misses".

**Spec:** `docs/superpowers/specs/2026-10-22-buyer-match-phase2-design.md` (H rows). E plan's Global Constraints apply.

## Decisions
- **Detection by scan** (spec): every 10 minutes, per tenant with the Buyer Match add-on and alerts switched on, live listings are compared with `buyer_alert_prices`:
  - not in the table → `new_listing`
  - price lower by ≥ `priceDropPercent` % → `price_drop` (old → new)
  - any other change → the table just takes the new price (a rise resets the base, so a later drop is measured from the higher price)
  - the first scan for a tenant only fills the table (no alerts), so switching alerts on never floods the queue.
  - Up to 2 000 changed listings per scan; the rest wait for the next one.
- **Who gets an alert:** the reverse match (G) for that listing over all open buyers (no viewer limit). `new_listing` skips buyers who were sent it or rejected it; `price_drop` skips only those who rejected it. `dedupeKey = lead:property:kind[:newPrice]` with `INSERT IGNORE`, so a listing never alerts the same buyer twice for the same event, even with two processes.
- **Approval screen:** pending alerts, grouped by buyer (newest first), visible buyers only. Actions per alert or in bulk: Approve, Reject, Send now. Approve with delivery `instant` = Send now.
- **Sending:** one email per buyer with all of that buyer's approved alerts, the normal branded/tracked email with alert wording and, for price drops, "Price reduced from X to Y". Recipients from `sendMatchesTo` (default buyer). At send time each alert is checked again: listing still live, not rejected meanwhile → else `skipped`. Sent alerts get `sentAt` + `sendId`; the suggestions are marked sent (never send twice) and an `alert_sent` activity is logged.
- **Digest:** every 15 minutes the digest job looks for tenants whose local time (`settings.timezone`, default UTC) is at or past `digestTime` and that have not had today's digest: `INSERT IGNORE buyer_alert_runs (tenantId, 'digest', day)`; only the process whose insert landed sends. Approved alerts left after it wait for the next day (or Send now).
- **Agent notice:** none in H (the approval screen and its count in the nav are the notice); the agent daily email is milestone I.

## Tasks
### Task 1: Pure rules (TDD) — `alert-rules.spec.ts`: price drop threshold/edges, dedupe key, allowed per kind and suggestion state, local day/time in a time zone (incl. date change), digest due before/after time.
### Task 2: Migration + entities (`BuyerAlert`, `BuyerAlertPrice`, `BuyerAlertRun`).
### Task 3: Service (scan, list, decide, send, digest) + `sendAlert` + email wording + labels.
### Task 4: Controller, processor jobs, scheduler.
### Task 5: Dashboard: alerts page, nav count, settings card.
### Task 6: Verify: jest; `h-api.js` (seed → no alerts; new listing → pending for matching buyers only; sent/rejected rules; price drop threshold; dedupe; approve/reject/send now; instant; digest due + once per day; visibility; scheduler registered in Redis); puppeteer (approval screen, settings); builds.
