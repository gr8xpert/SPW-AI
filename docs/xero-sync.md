# Xero invoice sync (SPM → n8n → Xero)

How credit-hour purchases flow into Xero as one-off invoices. SPM never
touches the Xero API directly — n8n owns OAuth, contact matching, VAT
rate selection, and multi-currency handling. This side only handles
idempotency + a durable retry log.

## The flow

```
┌─────────────┐  checkout.session.completed
│   Stripe    │─────────────────────────────┐
└─────────────┘                              ▼
                                   ┌──────────────────────┐
                                   │  StripeWebhookService │
                                   │  1. credit balance   │
                                   │  2. credit ledger    │
                                   │  3. enqueue Xero →   │──────────┐
                                   └──────────────────────┘          │
                                                                      │  POST { tenantId, tenantName,
                                                                      │         contactEmail, xeroContactId,
                                                                      │         hours, amountEur, currency,
                                                                      │         stripeSessionId }
                                                                      ▼
                                                       ┌──────────────────────────┐
                                                       │  n8n workflow            │
                                                       │  1. HTTP inbound trigger │
                                                       │  2. Xero Contact lookup  │
                                                       │     (by xeroContactId or │
                                                       │      email; auto-create) │
                                                       │  3. Xero Invoice create  │
                                                       │  4. HTTP callback →      │
                                                       └───────────┬──────────────┘
                                                                   │  POST /api/internal/xero/invoice-created
                                                                   │  Authorization: Bearer <XERO_N8N_SECRET>
                                                                   │  { stripeSessionId, xeroInvoiceId }
                                                                   ▼
                                                        ┌────────────────────────┐
                                                        │  XeroInternalController │
                                                        │  status = 'confirmed'   │
                                                        └────────────────────────┘
```

## SPM endpoints

### Fire-and-forget enqueue (internal, called from StripeWebhookService)

Not an HTTP endpoint — `XeroSyncService.enqueueCreditPurchaseInvoice()`
writes a row into `xero_invoice_log` (status='pending') and POSTs to
`XERO_N8N_WEBHOOK_URL`. Failures set status='failed' + error. Never blocks
the Stripe webhook response.

### Callback from n8n

`POST /api/internal/xero/invoice-created`

Headers:
```
Authorization: Bearer <XERO_N8N_SECRET>
Content-Type: application/json
```

Body:
```json
{
  "stripeSessionId": "cs_live_a1b2c3...",
  "xeroInvoiceId": "4d1f18a7-...-...-...",
  "invoiceUrl": "https://go.xero.com/AccountsReceivable/View.aspx?..."
}
```

Response:
```json
{ "ok": true, "logId": 42 }
```

The `xeroInvoiceId` is stored on the log row and displayed in the super-admin
Xero Sync page (`/admin/xero-sync`). Rows with no matching
`stripeSessionId` are dropped (returned `{ ok: false }`) — indicates the
callback fired for a session we never enqueued (test data, wrong env).

### Super-admin log viewer

`GET /api/super-admin/xero-sync` — paginated list of sync rows.
`POST /api/super-admin/xero-sync/:id/retry` — manual retry of a failed
row without waiting for the cron.

## Retry cron

`XeroSyncCron` runs every 10 minutes and re-POSTs any row where:
- status='pending' AND created > 5 min ago (initial POST likely dropped), OR
- status='failed' AND attempts < `XERO_SYNC_MAX_RETRIES` (default 5)

Batch size capped at 25 per pass so a persistently down n8n doesn't hammer
this side. After max retries the row stays 'failed' — operator sees it in
`/admin/xero-sync` and can either fix the underlying issue and click Retry,
or accept the sync will be reconciled manually.

## Env vars

```
XERO_N8N_WEBHOOK_URL=https://n8n.spw-ai.com/webhook/xero-invoice
XERO_N8N_SECRET=<32-byte hex>
XERO_SYNC_MAX_RETRIES=5     # optional, default 5
```

Missing `XERO_N8N_WEBHOOK_URL` puts new rows into `pending` and logs a
warning per attempt. Safe to run in that state; cron won't retry rows
that have `attempts=0` and no URL configured (they stay pending forever).
Set the env var and manually retry the first row to unblock the queue.

## n8n workflow

Import `docs/n8n-workflows/spw-xero-invoice-sync.json`. Node graph:

```
Webhook: SPM Enqueue → Verify Bearer → Get Xero Tenant
  → Build Invoice → Create Xero Invoice → Callback: SPM Confirmed → Respond OK
```

### Why HTTP Request nodes and not the Xero node

n8n's built-in **Xero OAuth2 API** credential requests a hardcoded scope
list that still contains `accounting.transactions`. Xero retired that
scope when it moved to granular scopes alongside the usage-based pricing
tiers — apps created now can only request `accounting.invoices`,
`accounting.payments`, `accounting.banktransactions` and
`accounting.manualjournals`. Xero rejects the whole authorization request
if any single scope is unrecognised, so the built-in credential fails with
`invalid_scope` and there is no way to fix it from the n8n UI (the scope
field is `type: hidden`).

The workflow therefore uses a **generic OAuth2 API credential** — created
from inside an HTTP Request node via *Authentication → Generic Credential
Type → OAuth2 API*, since the generic credential doesn't appear in the
standalone credential picker — plus plain HTTP Request nodes against the
Xero REST API. Revisit this only if n8n ships a corrected Xero credential.

Credential settings:

| Field | Value |
| --- | --- |
| Grant Type | Authorization Code |
| Authorization URL | `https://login.xero.com/identity/connect/authorize` |
| Access Token URL | `https://identity.xero.com/connect/token` |
| Scope | `openid profile email offline_access accounting.contacts accounting.invoices accounting.payments accounting.settings.read` |
| Authentication | Header |

The matching Xero app is a **Web app** at developer.xero.com (its name must
not contain `n8n` — Xero rejects those), with the redirect URI set to
`https://<n8n-host>/rest/oauth2-credential/callback`.

### What each node does

1. **Webhook: SPM Enqueue** — POST `/webhook/xero-invoice`, respond-node mode.
2. **Verify Bearer** — constant Bearer check against `XERO_N8N_SECRET`, then
   unwraps `body` so downstream nodes see the SPM payload as `$json`.
   Done in code rather than n8n Header Auth so the workflow imports without
   needing a second credential.
3. **Get Xero Tenant** — `GET /connections`. Every Xero API call needs the
   org's `tenantId` as an `Xero-tenant-Id` header.
4. **Build Invoice** — the only node with anything to configure:
   `ACCOUNT_CODE`, `TAX_TYPE`, `LINE_AMOUNTS`, `ORG_NAME`. Divides
   `amountEur` back out into a unit price, and picks `ContactID` when SPM
   supplied one, else falls back to `Name` (+ email) and lets Xero match or
   auto-create the contact.
5. **Create Xero Invoice** — `POST /api.xro/2.0/Invoices`, `ACCREC`,
   `AUTHORISED` so it's a real sale rather than a draft.
6. **Callback: SPM Confirmed** — posts the invoice id back to us.
7. **Respond OK** — closes out the original webhook so SPM's POST doesn't
   time out.

### Invoices are never marked paid

The workflow creates the invoice but records no payment against it, so
every one sits in Xero as outstanding even though Stripe already collected
the money. Either add a `POST /api.xro/2.0/Payments` node after invoice
creation, or clear them by bank-reconciling against the Stripe payout —
the latter is usually cleaner, since the payout is net of Stripe fees.

## VAT

**Current state (2026-09): SPW-AI LTD is not VAT registered.** `TAX_TYPE`
in the Build Invoice node is `'NONE'` and invoices post as "No VAT". That
is correct until registration.

### What has to change once VAT is charged

The plan is to enable tax collection in Stripe. When that happens, three
things need doing together — changing only the first produces books that
look right and aren't:

1. **`TAX_TYPE`** in Build Invoice → the matching rate from Xero
   (Accounting → Advanced → Tax Rates).
2. **Check `LINE_AMOUNTS`.** SPM sends `amountEur = session.amount_total`,
   which *includes* whatever tax Stripe added. `'Inclusive'` is therefore
   correct: Xero backs the VAT out of the gross rather than adding it on
   top. Leaving it `'Inclusive'` while assuming Stripe sent a net figure
   would under-declare the sale.
3. **Per-country rates break the single constant.** Stripe Tax applies a
   different rate per customer country, but `TAX_TYPE` is one hardcoded
   value for every invoice. The moment rates vary, the tax amount Stripe
   charged and the one Xero derives will diverge. Fix by extending the SPM
   payload (`XeroSyncService.buildPayload`) with the tax amount and rate
   from the Stripe session, and driving `TaxType`/`TaxAmount` off those
   instead of the constant.

Reverse charge for EU B2B is the other likely path — that needs the
tenant's country in the payload too, which SPM does not send today.

## Multi-currency

The Xero org's base currency is **GBP**; SPM invoices in EUR. The target
currency must be enabled on the org (it is). Xero books each invoice at
XE's rate for that day and records a currency gain/loss on settlement, so
the Xero figure will not match the Stripe payout to the penny — one more
reason to reconcile against the payout rather than record payments via the
API.

If a currency is not enabled, Xero returns 400, the log row lands in
`failed`, and the cron keeps retrying. Enable the currency, then hit Retry
in `/admin/xero-sync`.

## Testing on Xero sandbox

1. Register a Xero demo org (`https://developer.xero.com`).
2. Set up an n8n Xero credential against the demo org.
3. Duplicate the production workflow, point at the demo credential.
4. In SPM, buy a test credit package via Stripe test card (`4242 ...`).
5. Watch:
   - `/admin/xero-sync` → row appears with status='sent'
   - Xero demo org → invoice appears under the target contact
   - `/admin/xero-sync` refresh → status flips to 'confirmed' with an
     `xeroInvoiceId` link

## Common failures

- **Log stays `sent` forever.** n8n received the POST but never called
  back. Check n8n execution log — the workflow probably errored on Xero
  Contact CREATE or Invoice CREATE. Fix the workflow; run manual Retry
  from `/admin/xero-sync` to re-fire.
- **`n8n POST 401`.** `XERO_N8N_SECRET` on our side doesn't match the
  Header Auth value in n8n. They must be identical.
- **`n8n POST 500`.** Usually a Xero-side error (rate limit, invalid
  contact). Xero rate limit is 60/min per org — 25-per-cron cap on our
  side keeps us well under.
- **Callback `{ ok: false }`.** Log row for that stripeSessionId doesn't
  exist. Either a test-mode session (not enqueued in prod DB) or n8n is
  calling back for a session that predates the sync feature. Ignore.
