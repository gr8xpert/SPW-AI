# Buyer Match K — Facebook & Instagram lead forms

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** people who fill in a lead form of the agency's Facebook or Instagram ads become buyers in SPM within 15 minutes, with every answer, through the same intake as website enquiries.

**Architecture:**
- API `apps/api/src/modules/lead/meta/`: `meta-lead.ts` (pure: Graph lead → intake fields, Page id check), `meta-lead.service.ts` (settings, Graph calls, import), `meta-lead.controller.ts` (`GET/PUT buyers/meta`, `POST buyers/meta/test`, `POST buyers/meta/import`, managers).
- Job `meta-leads` every 15 minutes on the Buyer Match queue (`buyer-alert.scheduler.ts` TIMERS + processor).
- Migration `1777310000000-BuyerMatchMetaLeads`: `leads.source` + `facebook`, `instagram`; `meta_lead_sources` (one per agency, token encrypted); `meta_leads` (lead ids already imported).
- Dashboard: Buyers → Settings → **Facebook & Instagram** tab; sources Facebook/Instagram in filters and reports.

**Spec:** `docs/superpowers/specs/2026-10-22-buyer-match-phase2b-design.md` (K). E plan's Global Constraints apply.

## Decisions
- **Polling, not webhooks** (spec): a webhook needs a Meta app review per client; the Page token is enough to read leads.
- **Graph host only from the server's `.env`** (`META_GRAPH_URL`, default `https://graph.facebook.com/v21.0`). The client gives a Page id (digits only, checked) and a token; nothing else reaches the URL.
- **Token in the `Authorization: Bearer` header**, never in the query string, so it never lands in an access log; encrypted at rest with the existing `encryptedColumn`, `select: false`, write-only in the API (`hasToken` only).
- **Paging by our own `after` cursor**, never by the `next` URL Meta sends back.
- **First run reads the last 30 days**; later runs ask for leads created after the newest one seen, minus 2 minutes overlap. `meta_leads` (`INSERT IGNORE` on the lead id) makes every lead count once, also when two pm2 processes or a manual "Import now" overlap.
- A lead without a valid email is claimed and counted as skipped (a buyer is one per email). The same email from two forms = one buyer with two enquiry activities.
- Every imported buyer gets `consentAt` (lead time) / `consentSource = 'form'` when empty: Meta lead forms always show the advertiser's privacy policy.
- Activity text: "Facebook lead form: <form>", campaign, ad, then "Question: answer" for each custom question. Source `instagram` when the lead's `platform` is `ig`, else `facebook`.
- Errors from Meta are stored (`lastError`, token-free) and shown on the tab; the timer logs and moves on to the next agency.

## Tasks
### Task 1: Pure mapper (TDD) — `meta-lead.spec.ts`.
### Task 2: Migration + entities (`MetaLeadSource`, `MetaLead`, lead source enum in entity, DTO, dashboard type).
### Task 3: Service + controller + 15-minute job.
### Task 4: Dashboard tab (Page id, token, Save, Test connection, Import now, on/off, status, how-to).
### Task 5: E2E `k-api.js` against a fake Graph server on :4599 (paging, bad token, header-only token, next URL ignored, dedupe, overlap window, timer); puppeteer for the tab.
