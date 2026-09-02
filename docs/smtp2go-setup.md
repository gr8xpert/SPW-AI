# SMTP2GO — outbound mail provider

How to point the SPM API's SystemMailerService at SMTP2GO so all outbound
mail (verification, ticket notifications, credit purchase receipts, etc.)
delivers through them.

## Why SMTP2GO

- Nodemailer-compatible SMTP endpoint — zero code changes on our side.
- Built-in inbound-parse feature (can replace the n8n IMAP hop for
  ticket email replies; see `tickets-email-ingestion.md`).
- Straightforward DNS setup, generous free tier for onboarding tests.

## The switch is env-only

Because `SystemMailerService` uses generic nodemailer SMTP transport, the
migration is a config change on the production box — no rebuild, no deploy.

### 1. Provision an SMTP2GO SMTP user

In the SMTP2GO dashboard:

1. **Settings → SMTP Users → Add SMTP User**
2. Note the auto-generated username (typically `spw-ai-prod`) and copy
   the password. It is shown once.

### 2. Verify your sender domain

Under **Settings → Sender Domains → Add Domain** enter the domain you
send from (e.g. `spw-ai.com`). SMTP2GO shows you three DNS records to add:

```
# SPF (or add smtp2go include to an existing SPF)
spw-ai.com.  IN  TXT  "v=spf1 include:spf.smtp2go.com ~all"

# DKIM (SMTP2GO shows the exact selector + key value)
s1._domainkey.spw-ai.com.  IN  CNAME  s1.domainkey.smtp2go.com.
s2._domainkey.spw-ai.com.  IN  CNAME  s2.domainkey.smtp2go.com.

# Optional but recommended: DMARC
_dmarc.spw-ai.com.  IN  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@spw-ai.com"
```

Wait for verification in the SMTP2GO dashboard (usually < 15 minutes). Do
NOT switch the env until the sender domain reads "Verified" — mail sent
via an unverified domain either bounces or lands in spam.

### 3. Update the API .env on prod

```
SMTP_HOST=mail.smtp2go.com
SMTP_PORT=587
SMTP_USER=<smtp2go username>
SMTP_PASSWORD=<smtp2go password>
SMTP_SECURE=false        # 587 uses STARTTLS, not implicit TLS
SMTP_FROM=support@spw-ai.com
SMTP_FROM_NAME=SPW Support
```

If we were using our own DKIM signing before, either:
- Remove the `MAIL_DKIM_*` variables — SMTP2GO signs on its own with the
  CNAME'd selector — OR
- Keep our DKIM alongside SMTP2GO's (double-signing is legal and increases
  deliverability slightly).

```
# If keeping our DKIM in addition to SMTP2GO's:
MAIL_DKIM_DOMAIN=spw-ai.com
MAIL_DKIM_SELECTOR=spw
MAIL_DKIM_PRIVATE_KEY=<PEM>
```

### 4. Restart + verify

```
pm2 restart spm-api
```

Send a test:

- Create a ticket via the dashboard OR
- Trigger a password-reset for a test user OR
- Impersonate a client and post a message reply

Then confirm on the SMTP2GO Activity dashboard that the send is listed
with status `delivered`. Check the received mail's headers for:

```
Authentication-Results: mx.google.com;
       dkim=pass header.d=spw-ai.com
       spf=pass smtp.mailfrom=…smtp2go.com
       dmarc=pass
```

All three must be `pass`. If SPF is `neutral`, your existing SPF record
already had another `include:` and needs SMTP2GO's include added — you
can only have one `v=spf1` record per domain.

## Rollback

Point the env vars back at the previous SMTP provider and `pm2 restart
spm-api`. Existing sender-domain DNS records don't need to be removed —
they're inert without the SMTP endpoint pointing at SMTP2GO.

## Suppression + bounces

SMTP2GO tracks bounces + complaints in its own dashboard. Our internal
`email_suppressions` table is separate — it holds hard bounces we
observed via prior providers plus any manual super-admin blocks. There is
currently no automated sync between SMTP2GO's suppression list and our
table; do it manually if a burst of bounces hits after go-live (grep the
SMTP2GO dashboard for `hard_bounce` and add to `email_suppressions` via
the admin UI).

## Cost sanity check (2026 pricing snapshot)

- Free: 1,000 emails/mo — enough for the first week of dev + smoke tests
- Starter (~$10/mo): 40,000 emails/mo — comfortably covers 840 clients
  at expected ticket volume (~30 emails/client/mo worst-case)
- Above Starter, per-1k pricing drops rapidly

Set a soft alert in the SMTP2GO dashboard at 80 % of your monthly plan so
a runaway loop can't silently drain the quota.
