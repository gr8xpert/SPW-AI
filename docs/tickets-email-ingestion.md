# Ticket ↔ Email round-trip

How email replies from clients, admins, and webmasters become messages on
their originating ticket without anyone having to log into the dashboard.

## The flow

```
┌───────────────┐   ticket created / assigned / replied
│  SPW API      │─────────────────────────────────┐
│               │                                  ▼
│ Ticket-       │                        ┌───────────────────┐
│ Notification  │  outbound mail via     │   Recipient       │
│ Service       │  SystemMailerService   │  (client / admin  │
│               │                        │  / webmaster)     │
│  Reply-To:    │                        └────────┬──────────┘
│  ticket+42.   │                                 │  reply hits
│  a1b2c3@…     │                                 │  Reply-To
└───────────────┘                                 ▼
        ▲                             ┌───────────────────────┐
        │                             │  Inbox at             │
        │                             │  ticket+*@replies.    │
        │                             │  spw-ai.com           │
        │                             └──────────┬────────────┘
        │                                        │  IMAP poll
        │                                        ▼
        │                             ┌───────────────────────┐
        │                             │  n8n                  │
        │                             │  1. IMAP Trigger      │
        │                             │  2. Parse to-address  │
        │                             │  3. HTTP → API        │
        │                             └──────────┬────────────┘
        │                                        │  POST /api/internal/
        │                                        │  tickets/inbound
        │                                        │  Authorization: Bearer <SECRET>
        │  createInboundMessage(id, sender)      ▼
        └──────────────────────────────  InboundEmailController
                                           - verify bearer
                                           - verify HMAC on to-address
                                           - match sender email → user
                                           - strip quoted history
                                           - insert TicketMessage
                                             (isStaff auto from role)
```

## API endpoint

`POST /api/internal/tickets/inbound`

Headers:
```
Authorization: Bearer <INBOUND_EMAIL_SECRET>
Content-Type: application/json
```

Body (all fields optional except `to` + `from` + one of `text`/`html`):
```json
{
  "to":   "ticket+42.a1b2c3d4e5f6@replies.spw-ai.com",
  "from": "client@example.com",
  "subject": "Re: [TKT-000042] Widget layout broken",
  "text": "Thanks, that fixed it.\n\nOn Wed, Jul 30, 2026 at 10:15 AM, Support <support@spw-ai.com> wrote:\n> Please try clearing your cache…",
  "html": "<p>Thanks, that fixed it.</p>",
  "messageId": "<CADh…@mail.gmail.com>",
  "inReplyTo": "<abc…@spw-ai.com>"
}
```

Response `200 OK`:
```json
{ "ok": true, "ticketId": 42, "messageId": 189 }
```

Rejection modes (all still return 200 so retries don't loop):
- `invalid-token` — the HMAC on the to-address doesn't verify. Address was
  forged, corrupted, or the HMAC secret was rotated.
- `sender-unknown` — sender email doesn't map to a user. Auto-forwarded
  replies from someone who isn't in `users`. Ops decides whether to invite.
- `ticket-not-found` — token verified but the ticket was deleted.
- `empty-body` — after quote-stripping the reply is empty (autoresponder /
  "OK" bounces).

## Roles → `isStaff`

Sender matched to `users.email`. Role determines message classification:

| Role         | `isStaff` | Notification sent to |
|--------------|-----------|----------------------|
| `super_admin`| true      | Ticket creator (client) |
| `webmaster`  | true      | Ticket creator (client) |
| `admin` on same tenant as ticket | true | Ticket creator (client) |
| `user`       | false     | Assigned webmaster (or super_admins if unassigned) |

An `admin` on a *different* tenant is treated as customer — prevents a
cross-tenant admin from spoofing staff status.

## Reply-To address format

`ticket+<ticketId>.<hmac>@<INBOUND_EMAIL_DOMAIN>`

- `ticketId` — plain integer, so ops can eyeball which ticket a reply
  belongs to.
- `hmac` — first 12 hex chars of `HMAC-SHA256(INBOUND_EMAIL_HMAC_SECRET,
  ticketId)`. Prevents someone guessing `ticket+9999@…` and injecting into
  an arbitrary ticket.

The address is stable per-ticket for the lifetime of the HMAC secret.
Rotating `INBOUND_EMAIL_HMAC_SECRET` invalidates all existing addresses —
users' existing threads still work in their mail client, but replies stop
threading. Do it only when you suspect compromise.

## n8n workflow

Import this as JSON in n8n (Settings → Import from URL / File):

```json
{
  "name": "SPW Ticket Email Ingestion",
  "nodes": [
    {
      "name": "IMAP: ticket replies",
      "type": "n8n-nodes-base.emailReadImap",
      "position": [240, 300],
      "parameters": {
        "mailbox": "INBOX",
        "postProcessAction": "read",
        "options": {
          "customEmailConfig": "[\"UNSEEN\"]"
        }
      },
      "credentials": {
        "imap": { "name": "replies.spw-ai.com" }
      }
    },
    {
      "name": "Extract fields",
      "type": "n8n-nodes-base.function",
      "position": [520, 300],
      "parameters": {
        "functionCode": "const m = $input.item.json;\nreturn [{ json: {\n  to: (Array.isArray(m.to) ? m.to[0]?.address : m.to?.value?.[0]?.address) || m.to,\n  from: (Array.isArray(m.from) ? m.from[0]?.address : m.from?.value?.[0]?.address) || m.from,\n  subject: m.subject,\n  text: m.text,\n  html: m.html,\n  messageId: m.messageId,\n  inReplyTo: m.inReplyTo\n} }];"
      }
    },
    {
      "name": "POST to API",
      "type": "n8n-nodes-base.httpRequest",
      "position": [800, 300],
      "parameters": {
        "url": "https://api.spw-ai.com/api/internal/tickets/inbound",
        "method": "POST",
        "sendBody": true,
        "bodyContentType": "json",
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify($json) }}",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Authorization", "value": "=Bearer {{ $env.SPW_INBOUND_SECRET }}" },
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "options": { "retry": { "maxRetries": 3 } }
      }
    }
  ],
  "connections": {
    "IMAP: ticket replies": { "main": [[{ "node": "Extract fields", "type": "main", "index": 0 }]] },
    "Extract fields":       { "main": [[{ "node": "POST to API",   "type": "main", "index": 0 }]] }
  }
}
```

n8n environment variable: `SPW_INBOUND_SECRET` = the same value as
`INBOUND_EMAIL_SECRET` in the API's env.

## Mail server / DNS setup

Two options for hosting `replies.spw-ai.com`:

**A) Reuse existing Plesk mail on 194.164.166.170**
1. Add subdomain `replies.spw-ai.com` in Plesk with mail enabled.
2. Create a catch-all mailbox `replies@replies.spw-ai.com`.
3. Point n8n's IMAP node at `replies.spw-ai.com:993` (SSL).
4. MX record: `replies.spw-ai.com. IN MX 10 mail.spw-ai.com.`

**B) SES / Postmark / Mailgun inbound (no IMAP polling)**
Cleaner but paid. Postmark inbound webhook posts a JSON body already in
the shape the API expects (minus the auth header, which you configure in
the Postmark UI). Skips the n8n step entirely — set the webhook URL to
`https://api.spw-ai.com/api/internal/tickets/inbound` and add the header
`Authorization: Bearer <INBOUND_EMAIL_SECRET>` under Postmark's server
webhook settings.

**C) SMTP2GO inbound (recommended if you're already using SMTP2GO for outbound)**
SMTP2GO ships an inbound-parse feature that maps incoming mail on a
subdomain to an HTTPS webhook — same shape as Postmark. Setup steps:

1. In SMTP2GO dashboard → **Inbound** → **Add Inbound Address**. Set the
   local-part to `ticket-*` (wildcard) so all `ticket+<id>.<hmac>@…`
   addresses route to the same webhook.
2. Set the webhook URL to
   `https://api.spw-ai.com/api/internal/tickets/inbound`.
3. Under **Custom Headers** add
   `Authorization: Bearer <INBOUND_EMAIL_SECRET>` so the request passes
   `InboundAuthGuard`.
4. Add MX record for the inbound subdomain per SMTP2GO's instructions
   (usually `MX 10 in.smtp2go.com`).

SMTP2GO's payload schema is compatible: it posts fields
`to`, `from`, `subject`, `text`, `html`, `message_id`, `headers`. The
API's controller reads only the fields it needs and ignores the rest. If
SMTP2GO uses camelCased or under_scored fields that differ from the
n8n-produced shape, use n8n's HTTP node as a thin translator (many
operators keep a separate "SPW SMTP2GO Inbound → API" workflow just for
this remap) or add a small `mapPayload()` step in the API controller —
neither is strictly needed for a first launch since the parser reads
`to`, `from`, `text`, `html`, `subject` verbatim from the request body
(controller code: `apps/api/src/modules/ticket/inbound-email.controller.ts`).

## Enabling in production

1. Generate secrets:
   ```
   openssl rand -hex 32   # INBOUND_EMAIL_SECRET
   openssl rand -hex 32   # INBOUND_EMAIL_HMAC_SECRET
   ```
2. Set on the API server (`apps/api/.env.production` or `docker-compose.prod.yml` env):
   ```
   INBOUND_EMAIL_ENABLED=true
   INBOUND_EMAIL_SECRET=<hex>
   INBOUND_EMAIL_HMAC_SECRET=<hex>
   INBOUND_EMAIL_DOMAIN=replies.spw-ai.com
   ```
3. Restart the API (`pm2 restart spm-api`).
4. Set MX + create mailbox (see above).
5. Import the n8n workflow, set `SPW_INBOUND_SECRET`, and activate it.
6. Manual smoke: create a ticket, reply from the notification email using
   Gmail. Watch the API logs — you should see
   `Inbound message stored: ticket=<id> sender=<email> messageId=<n>` and
   the reply appear in the ticket detail page within a few seconds of n8n
   polling.

## Common failures

- **Reply arrives, nothing happens.** Check n8n execution log first — IMAP
  poll may be off. Then check API logs for `Inbound rejected —`.
- **`invalid-token`** — the customer's mail client dropped the `+<hmac>`
  suffix (some corporate gateways strip plus-addressing). Workaround: use
  `-` in the token: `ticket-<id>-<hmac>@…` — requires updating both
  `buildReplyToAddress` and `parseTicketToken`.
- **`sender-unknown`** — customer replied from a different mail alias.
  Either invite that email as a user, or (future) accept aliases via a
  `user_aliases` table.
- **Reply comes in classified as customer when it should be staff.**
  Sender's `users.role` is wrong, or an admin replied from a personal
  address not in `users`.
