# WhatsApp send (click-to-chat) — design

2026-10-24. Agents send buyers a custom message + property links on WhatsApp,
from Buyer Match and three other places. Click-to-chat (`https://wa.me/<digits>?text=…`):
the agent's own WhatsApp opens with the text typed; the agent presses Send.
No WhatsApp Business API, no per-client setup.

## Where it shows

| Place | Button | Kind |
|---|---|---|
| Buyer → Matched, Near Miss, Suggested | "WhatsApp" beside Send, on the selected properties | `properties` |
| New Leads (enquiry inbox) | "WhatsApp" beside Reply, when the lead has a phone | `enquiry` |
| Buyer → Trips → a viewing | WhatsApp icon on the viewing row | `viewing` |
| Buyer → Tasks → an open task | WhatsApp icon on the task row | `follow_up` |

The button is disabled (tooltip "No phone number") when the person has no mobile/phone.

## One dialog: `WhatsAppDialog`

Props: `buyer/lead id`, `kind`, plus `propertyIds` | `viewingId` | `taskId`.

- **To:** number picked from mobile, then phone; a select when both exist; an
  editable field. Warning when it has no country code (no leading `+`/`00`).
- **Language:** like the email Send (buyer language first).
- **Message:** editable, pre-filled from the kind's template; AI button (properties
  kind) writes a short WhatsApp-style intro.
- **Already sent** (properties kind): same skipped list + "include anyway" as email.
- **Preview:** WhatsApp-style bubble of the full text (`*bold*` shown bold),
  character count. Links in the preview are the website links.
- **Footer:** Copy text · Open WhatsApp. Tasks: "Mark task done" tick (on by default).

Open WhatsApp opens a blank tab synchronously (popup blockers), asks the API for
the final text, then points the tab at `wa.me`. Failure closes the tab + toast.

## API

`POST /api/dashboard/buyers/:id/whatsapp/preview` and `…/whatsapp/open`, body
`{ kind, propertyIds?, viewingId?, taskId?, lang?, message?, allowResend?, phone?, markTaskDone? }`.

- preview → `{ phones, lang, message (template filled), text, skipped, allSkipped }`. No writes.
- open → `{ url, text }`. Writes:
  - `properties`: a `buyer_sends` row with `channel='whatsapp'`, recipient buyer;
    property links are the signed click links of that send; Suggested markSent;
    timeline `sent` with source `whatsapp`; activity `suggestion_sent`
    with `metadata.channel = 'whatsapp'`.
  - other kinds: activity `whatsapp` (new type) with kind + text excerpt;
    `follow_up` with markTaskDone also completes the task (same path as the Tasks tab).
- Erased buyer → refused (as email). Unsubscribed buyer → allowed (the agent sends
  it by hand), dialog shows a warning.
- Access: same viewer rules as the buyer's other endpoints; New Leads uses the same
  route (they are leads too) — check access for role-less leads.

## Text

Built on the server by a pure `buildWhatsAppText()` (unit-tested):

```
{message}

*{title}* · {price}
{link}
… (one block per property)

{page line: "All your matches: {link}"}  (properties kind, when a buyer page exists)
{agent} · {company}
```

Viewing text fills `{date}`, `{time}`, `{property}`, `{meeting_point}` and adds a
Google Maps search link when there is a meeting point. Enquiry text fills
`{property}` (reference · title) and adds the property's website link when known.

## Templates = labels

New label category `buyer_whatsapp` ("Buyer WhatsApp messages"), editable in
Labels per client; other languages come from translation memory like the buyer
emails. Keys: `buyer_wa_properties`, `buyer_wa_enquiry`, `buyer_wa_viewing`,
`buyer_wa_follow_up`, `buyer_wa_page_line`, `buyer_wa_anon` (greeting without a name).

## Tracking

- `buyer_sends.channel` enum `email|whatsapp` default `email`.
- `lead_suggestion_events.source` gains `whatsapp`.
- Click link: source = the send's channel. No open pixel on WhatsApp.
- "Open WhatsApp" counts as sent (we cannot see the agent pressing Send).

## Migration `WhatsAppSend`

`buyer_sends.channel`; `lead_suggestion_events.source` + `whatsapp`;
`lead_activities.type` + `whatsapp`.

## Testing

Unit: text builder, phone clean/validation, wa.me encoding, click source by channel.
Service: open() writes send/markSent/log; skipped handling; erased refusal.
Local E2E: each of the 4 places opens the dialog and returns a `wa.me` URL; Activity
shows "Sent by WhatsApp"; a tracked link click logs source whatsapp.
