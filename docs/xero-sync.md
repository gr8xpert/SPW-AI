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

## n8n workflow (client to build)

Node graph:

1. **Webhook** (HTTP trigger) — path `xero-invoice`, method POST, response
   mode `Last Node`, authentication set to `Header Auth` with header name
   `Authorization` and value `Bearer <XERO_N8N_SECRET>`.
2. **IF** — split on `{{ !!$json.xeroContactId }}`:
   - true branch → **Xero Contact GET** by id
   - false branch → **Xero Contact SEARCH** by email → if none, **Xero
     Contact CREATE** with name + email, then remember `contactId`
3. **Xero Invoice CREATE** (Type: ACCREC, LineItems: 1 row with
   `Description = SPM: {hours} support-hour credits`, `Quantity = hours`,
   `UnitAmount = amountEur / hours`, `AccountCode` = whichever account you
   use for support revenue, `TaxType` = your standard-rated code). Status
   AUTHORISED so it's an actual sale, not a draft.
4. **HTTP Request** back to SPM:
   - URL: `https://api.spw-ai.com/api/internal/xero/invoice-created`
   - Method: POST
   - Header: `Authorization: Bearer <XERO_N8N_SECRET>`
   - Body:
     ```json
     {
       "stripeSessionId": "={{ $node['Webhook'].json.stripeSessionId }}",
       "xeroInvoiceId": "={{ $node['Xero Invoice CREATE'].json.InvoiceID }}",
       "invoiceUrl": "https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID={{ $node['Xero Invoice CREATE'].json.InvoiceID }}"
     }
     ```
5. **Respond to Webhook** with `{ ok: true }` so SPM's original POST doesn't
   time out.

## VAT + multi-currency

Both live in the n8n workflow. Two common paths:

- **Single VAT rate (UK 20 %)**: set `TaxType: OUTPUT2` on the line item.
- **Reverse-charge for EU B2B**: add an IF node before Xero Invoice CREATE
  that checks the tenant's country (SPM's tenant payload does not include
  country today — add it to the payload if needed) and switches TaxType to
  `ZERORATEDEUSERVICES` (or your equivalent).

Multi-currency: Xero must have the target currency enabled on the org.
Set `CurrencyCode` on the invoice from the `currency` field in the SPM
payload. If a currency is not enabled, Xero returns 400 — the log row
lands in `failed` and n8n will keep retrying. Enable the currency
manually and hit Retry.

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
