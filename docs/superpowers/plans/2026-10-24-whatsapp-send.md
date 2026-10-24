# WhatsApp Send Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agents send a custom WhatsApp message (+ property links) from Buyer Match tabs, New Leads, viewings and tasks via click-to-chat.

**Architecture:** A pure text builder + phone helpers (API, unit-tested) feed one `BuyerWhatsAppService` with `preview`/`open`; routes live on the Buyer Match controller (add-on) and the New Leads controller (no add-on). One dashboard `WhatsAppDialog` is reused by every place. Templates are labels (category `buyer_whatsapp`). Property sends reuse `buyer_sends` with `channel='whatsapp'` so tracked clicks credit WhatsApp.

**Tech Stack:** NestJS 10 + TypeORM (MySQL/MariaDB), Jest; Next 14 dashboard (React Query, shadcn/ui).

**Spec:** `docs/superpowers/specs/2026-10-24-whatsapp-send-design.md`

## Global Constraints

- Do NOT build (`next build`, `nest build`, widget build) — user builds after the next feature. Typecheck with `npx tsc --noEmit` only.
- Do NOT commit — the user commits after testing by hand. Never stage `.claude/settings.json` or `docs/locations-rosvan.csv`.
- Migrations: idempotent (`hasColumn` / enum checks), MariaDB-safe SQL.
- Dashboard text in all 7 buyer i18n files (en, es, de, fr, nl, sv, fi); leads i18n has en only.
- No `useCallback` around `api.get` (stale closure gotcha).

---

### Task 1: Pure WhatsApp helpers (API)

**Files:** Create `apps/api/src/modules/lead/buyer/whatsapp/whatsapp-text.ts`, Test `…/whatsapp/whatsapp-text.spec.ts`

**Produces:**
```ts
export type WhatsAppKind = 'properties' | 'enquiry' | 'viewing' | 'follow_up';
export interface WhatsAppPhone { label: 'mobile' | 'phone'; number: string; digits: string; international: boolean }
export function cleanPhone(raw: string | null | undefined): { digits: string; international: boolean } | null;
export function phonesOf(p: { mobile?: string | null; phone?: string | null }): WhatsAppPhone[];
export function waUrl(digits: string, text: string): string; // https://wa.me/<digits>?text=<encoded>
export interface WhatsAppPropertyLine { title: string; price: string; link: string | null }
export function buildWhatsAppText(i: { message: string; properties?: WhatsAppPropertyLine[]; extraLines?: string[]; signature?: string | null }): string;
```
Rules: `cleanPhone` strips all but digits; leading `+` or `00` → international (drop `00`); fewer than 7 digits → null. `phonesOf` dedupes by digits, mobile first. Text = message, blank line, one block per property (`*title* · price` then link), blank line, extra lines, blank line, signature; empty parts dropped, never 3+ newlines. Max 4000 chars (cut message, never links).

- [ ] Write spec (cases: `+34 600 11 22 33` → 34600112233 intl; `0034…` → intl; `600112233` → not intl; `12` → null; dedupe; text layout; wa.me encoding of `&`, newlines, emoji).
- [ ] Run `npx jest src/modules/lead/buyer/whatsapp` → FAIL; implement; → PASS.

### Task 2: Migration + entities + tracking source

**Files:** Create `apps/api/src/database/migrations/1777440000000-WhatsAppSend.ts`; Modify `database/entities/buyer-send.entity.ts`, `lead-suggestion-event.entity.ts`, `lead.entity.ts` (LEAD_ACTIVITY_TYPES + `'whatsapp'`), `modules/lead/buyer/tracking/buyer-tracking.service.ts`.

- `buyer_sends.channel ENUM('email','whatsapp') NOT NULL DEFAULT 'email'`.
- `lead_suggestion_events.source` → add `'whatsapp'`; `SuggestionEventSource` type too.
- `lead_activities.type` → add `'whatsapp'` (read current enum list from LEAD_ACTIVITY_TYPES, MODIFY COLUMN).
- `createSend` accepts `channel?: 'email' | 'whatsapp'`; `click()` records `source: send.channel === 'whatsapp' ? 'whatsapp' : 'email'`.
- [ ] Run migration locally via `npx typeorm-ts-node-commonjs migration:run -d src/config/database.config.ts`; tsc clean; existing tracking specs pass.

### Task 3: Labels (templates)

**Files:** Modify `modules/label/default-labels.ts` (category `{ id: 'buyer_whatsapp', name: 'Buyer WhatsApp Messages' }` + keys), dashboard `labels/page.tsx` category list.

Keys (en / es / nl):
- `buyer_wa_properties`: "Hi {name}, here are {count} properties I selected for you:"
- `buyer_wa_enquiry`: "Hi {name}, thank you for your enquiry about {property}. When would suit you for a call or a viewing?"
- `buyer_wa_viewing`: "Hi {name}, this is to confirm your viewing of {property} on {date} at {time}."
- `buyer_wa_meeting_point`: "Meeting point: {place}"
- `buyer_wa_follow_up`: "Hi {name}, just checking in — have you had a chance to think about the properties? Happy to help with anything."
- `buyer_wa_page_line`: "All your selected properties: {link}"
- `buyer_wa_anon`: "there" (used for {name} when unknown)
Keys start with `buyer_` so translation memory fills other languages.

### Task 4: `BuyerWhatsAppService` + routes

**Files:** Create `modules/lead/buyer/whatsapp/buyer-whatsapp.service.ts`, `…/whatsapp/buyer-whatsapp.service.spec.ts`, DTO in `dto/buyer-whatsapp.dto.ts`; Modify `buyer-match.controller.ts`, `new-lead.controller.ts`, `new-lead.service.ts` (`findForWhatsApp`), buyer module providers, `buyer-send.service.ts` (export `buyerName`, `langOf` reuse), `viewings/itinerary.ts` (export `dayLabel`).

DTO `WhatsAppDto`: `kind` (IsIn 4 kinds), `propertyIds?` (1–30 ints), `viewingId?`, `taskId?`, `lang?` (`^[a-z]{2}$`), `message?` (≤3000), `allowResend?`, `phone?` (≤40), `markTaskDone?`, `markHandled?`.

Service:
```ts
preview(tenantId, viewer, leadId, dto, scope: 'buyer' | 'newLead'): Promise<{ phones: WhatsAppPhone[]; lang: string; message: string; text: string; skipped: SkippedProperty[]; allSkipped: boolean; unsubscribed: boolean }>
open(tenantId, viewer, leadId, dto, scope): Promise<{ url: string; text: string }>
```
- Lead lookup: scope buyer → `BuyerService.get` (viewer rules); newLead → `NewLeadService.findNew` (exposed). `assertNotErased`.
- `message`: dto.message ?? template from labels (`BuyerMailService.labels`) filled with `{name}` (first name or `buyer_wa_anon`), `{count}`, `{property}`, `{date}`, `{time}`.
- properties kind: same live/hidden/skipped logic as `BuyerSendService.prepare` (reuse: extract `selectProperties(tenantId, lead, ids, allowResend, strict)` into BuyerSendService public). Preview links = `propertyLink(...)` website links; open → `tracking.createSend({..., channel:'whatsapp', recipient:'buyer', kind:'selection'})`, links = `trackingFor(send.id).link(id)`, page line via `pages.linkFor`, then `suggestions.markSent`, `tracking.record(event 'sent', source 'whatsapp')`, `buyers.log(lead.id, viewer.id, 'suggestion_sent', refs, { propertyIds, references, recipients:['buyer'], lang, sendId, channel:'whatsapp' }, true)`.
- enquiry: property = latest enquiry activity metadata (reference · title), link = metadata.pageUrl (http(s) only). open → log `'whatsapp'` `{ kind:'enquiry' }`; `markHandled` → `newLeads.setHandled`.
- viewing: `BuyerViewingService.items(tenantId,[viewingId])`, must belong to lead; `{date}` = `dayLabel(localDay)`, `{time}`; meeting point line + `mapLink(null,null,meetingPoint)`; property website link. open → log `'whatsapp'` `{ kind:'viewing', viewingId }`.
- follow_up: open → log `'whatsapp'` `{ kind:'follow_up', taskId }`; `markTaskDone` → `BuyerTaskService.update(..., { done: true })`.
- Phone: dto.phone (cleaned) else first of `phonesOf(lead)`; none → 400 `NO_PHONE`.
- Signature: `{agent name} · {company}` (FormMailService.sender(tenant).name).

Routes: `POST api/dashboard/buyers/:id/whatsapp/preview|open` (BuyerMatchController) and `POST api/dashboard/new-leads/:id/whatsapp/preview|open` (NewLeadController, kind forced to `enquiry`). `@HttpCode(200)`.

- [ ] Spec with mocked repos/services: open(properties) creates whatsapp send + markSent + log channel; all skipped → 400; erased → 403; no phone → 400; follow_up markTaskDone calls task update.
- [ ] tsc + jest pass.

### Task 5: AI intro for WhatsApp

**Files:** Modify `ai/email-intro.ts` (`introPrompt(lang, channel='email')` — whatsapp: ≤60 words, chat tone, may use the first name, no formal greeting/sign-off), `ai/buyer-ai.service.ts` (`emailIntro(..., channel?)`), `dto/buyer-ai.dto.ts` (`channel?: 'email'|'whatsapp'`), controller pass-through; extend `email-intro.spec.ts`.

### Task 6: Dashboard `WhatsAppDialog` + hooks

**Files:** Create `buyers/_components/whatsapp-dialog.tsx`, `buyers/use-whatsapp.ts`; Modify buyers `_i18n/*.ts` (`whatsapp` block), `use-buyer-ai.ts` (`channel` arg).

Hook: `useWhatsAppPreview(base)` / `useWhatsAppOpen(base)` where `base = '/api/dashboard/buyers/1'` or `'/api/dashboard/new-leads/1'`.
Dialog props: `{ base, kind, propertyIds?, viewingId?, taskId?, open, onOpenChange, onDone?, showAi?, showLanguage? }`.
UI: phone select/input + country-code warning, language (FilterSelect), message Textarea (+ AI button for properties), skipped box (same as SendDialog), unsubscribed note, bubble preview (`*x*` → bold, links as text, green bubble), char count, checkboxes (Mark task done / Mark as handled), footer Copy text · Open WhatsApp.
Open: `const w = window.open('', '_blank')`; await open mutation; `w.location.href = url` (if `w` null → `window.location.href = url`); toast; invalidate buyer activity/suggestions/new-leads queries; close.

### Task 7: Wire the four places

- `matched-tab.tsx`, `near-misses-tab.tsx`, `suggested-tab.tsx`: outline "WhatsApp" button (MessageCircle icon) beside Send; disabled without selection or without phone (tooltip).
- `leads/page.tsx`: "WhatsApp" button beside Reply when `lead.phone`; base new-leads; markHandled default on in waiting view.
- `trips-tab.tsx`: WhatsApp icon button per viewing (planned status).
- `tasks-tab.tsx`: WhatsApp icon button per open task.
- `activity-tab.tsx`: icon for `whatsapp`; `suggestion_sent` with `metadata.channel==='whatsapp'` reads "Sent by WhatsApp"; i18n for `whatsapp` activity type.
- Tracking timeline `events.sent` source whatsapp label "Sent by WhatsApp"; clicked from whatsapp.

### Task 8: Verify

- [ ] `npx tsc --noEmit` in api + dashboard; jest buyer suite.
- [ ] Local E2E (API on 3001): preview/open each kind via curl with a JWT; check `buyer_sends.channel`, activity rows, `wa.me` URL decodes to expected text; GET a tracked link → event source `whatsapp`.
- [ ] Puppeteer: open dialog from Matched, see bubble, Open → new tab URL starts with `https://api.whatsapp.com/` or `https://wa.me/`.
- [ ] graphify rebuild; memory + handoff.
