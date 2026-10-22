# Buyer Match E — Tracking, never send twice, change log

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** every property sent to a buyer has a timeline (Sent → Opened → Clicked → Liked / Rejected → Viewing → Offer); emails carry an open pixel and signed click links with no personal data; properties already sent or rejected drop out of Matched (with a "Show all" toggle) and are skipped on send unless the agent includes them; every change to a buyer is recorded with who, when and field from → to.

**Architecture:**
- API, `apps/api/src/modules/lead/buyer/`:
  - `tracking/link-token.ts` (pure, signed tokens), `tracking/timeline.ts` (pure, transitions)
  - `tracking/buyer-tracking.service.ts`: send rows, events, timestamps, status sync
  - `tracking/buyer-tracking.controller.ts`: public `GET /api/t/o/:token` + `/api/t/c/:token`
  - `change-log.ts` (pure diff) + `buyer-change-log.service.ts` (describe ids → names, write, list)
  - `buyer-send.service.ts`: skip rules, `buyer_sends` rows, tracked buyer copy
  - `buyer-mail.ts`: optional `tracking` input (pixel + link wrapper)
  - `buyer-match.service.ts`: `excludeIds` / `hiddenIds` option
- Migration `1777260000000-BuyerMatchTracking`.
- Dashboard: Matched "Show all", send dialog skip notice, Suggested timeline chips + Viewing/Offer buttons, History tab.

**Spec:** `docs/superpowers/specs/2026-10-22-buyer-match-phase2-design.md` (E rows). The Phase 1 A1 plan's Global Constraints still apply.

## Global Constraints
- Class DTOs; nested arrays `@ValidateNested` + `@Type`. JSON booleans coerced with `!!`.
- Never `save()` a loaded lead to change an `*Id`; `update()` the changed keys only.
- `lead_activities.createdAt` has second precision: order by `id`. New tables use `DATETIME(6)`.
- Public tracking routes: `@Public()`, no add-on check (the email is already out), never 5xx to a mail client, no PII in the URL, `Cache-Control: no-store`.
- The tracking secret: `BUYER_LINK_SECRET`, else derived `HMAC_SHA256(JWT_SECRET, 'spm-buyer-link-v1')`. Never the raw JWT secret.
- Dashboard text in `buyers/_i18n/en.ts`; React Query + plain fetch functions (no `useCallback` around `api.get`).
- No commit.

## Decisions
- **Token format:** `base64url("<sendId>" | "<sendId>.<propertyId>")` + `.` + `base64url(HMAC-SHA256(key, purpose + ':' + payload))[0..22)` (128 bits). Purpose `o` (open) or `c` (click) is part of the MAC, so an open token can't be replayed as a click. Ids must be positive integers ≤ 2³¹.
- **Open:** `openedAt` on the send row (first time), and on every suggestion of that send whose `sentAt` is at or before the send (an `opened` event per property, first open only). Always answer with the 43-byte transparent GIF, even for a bad token.
- **Click:** marks the send clicked (and opened), the property `clickedAt` (+ `openedAt` if empty), one `clicked` event per click (repeat clicks within 60 s are not logged again). Redirect target: the property's page from `propertyUrlPatterns` (the buyer's send language) → the agency `website` → a small "link expired" HTML page (404). Never an open redirect: the target is built server-side, never read from the URL.
- **Timeline transitions** (`applyEvent`):
  - `sent`: sets `sentAt` (latest), clears nothing.
  - `opened`: sets `openedAt` once.
  - `clicked`: sets `clickedAt` once, and `openedAt` if empty.
  - `liked`: sets `likedAt`, clears `rejectedAt` + `rejectReason`.
  - `rejected`: sets `rejectedAt` + reason, clears `likedAt`.
  - `cleared`: clears `likedAt`, `rejectedAt`, `rejectReason`.
  - `viewing`: sets `viewingAt`, clears `rejectedAt` (someone who asks to view isn't rejecting).
  - `offer`: sets `offerAt`, clears `rejectedAt`.
  - Stage (furthest point): offer > viewing > liked / rejected > clicked > opened > sent > suggested.
  - Status sync (`statusAfter`): liked / viewing / offer → `interested` (unless already `visited`, which stays), rejected → `not_interested`, cleared → `sent` when it was `interested`/`not_interested`. Agent-set statuses are otherwise left alone.
- **Agent marks** on the Suggested tab: Viewing and Offer toggles (`POST /buyers/:id/suggestions/:sid/events {event: viewing|offer|liked|rejected|cleared, note?}`); source `agent`, userId = agent.
- **Hidden from matches:** a suggestion with `sentAt IS NOT NULL` or `rejectedAt IS NOT NULL` or `status = 'not_interested'`. `GET matches` excludes them in SQL (`p.id NOT IN (:...hidden)`) and returns `hiddenCount`; `?all=1` keeps them and marks each with `hiddenReason: 'sent' | 'rejected'`. `total` counts what is shown.
- **Send skip:** `POST send` drops properties that are hidden (same rule) unless `allowResend: true`; they come back in `skipped: [{propertyId, reference, reason}]`. All skipped → 400 `ALL_ALREADY_SENT` with `details.skipped`. Preview applies the same rule and returns `skipped` too, so the dialog can say it before sending.
- **Send rows:** one `buyer_sends` row per delivered email (buyer and agent separately) written before the email is built (the id is in the tokens); a failed delivery deletes its row. Only the buyer's copy is tracked.
- **Events on send:** a `sent` event per property (source `email`, sendId), plus the existing `markSent`.
- **Change log:**
  - One `lead_changes` row per save that changed something: `changes: [{field, from, to}]`, values as display text (`null` = empty).
  - Recorded fields: every PLAIN_FIELD, `email`, `assignedTo` (agent name), `agentIds` (related agent names), `stageId` (stage name, field `stage`), each wishlist key (`wishlist.budgetMax`, `wishlist.locationIds` → place names…), each answer (`answers.<qkey>` → option labels).
  - Sources: dashboard (`update`, `setStage`, `setWishlist`, `setAnswers`), website (intake fills, wishlist form), import (Odoo apply on an existing buyer; a new buyer gets one `{field:'created'}` row).
  - `notes` and `relatedContacts` values are long: stored cut to 500 characters.
  - `GET /buyers/:id/changes?page` (newest first by id, 50 per page, includes merged rows).
- **No PII in tracking URLs; no buyer name in tokens; agent copies untracked.** Apple Mail Privacy Protection pre-fetches images, so "Opened" can show without a real open; the UI calls it "Opened (may be automatic)" in the tooltip.

## Tasks

### Task 1: Pure token + timeline + diff (TDD)
- [ ] `tracking/link-token.spec.ts`: round-trip open/click; tampered payload, tampered mac, wrong purpose, wrong secret, garbage, empty, non-integer ids → null.
- [ ] `tracking/link-token.ts`: `linkSecret(env)`, `signLinkToken(secret, purpose, sendId, propertyId?)`, `verifyLinkToken(secret, purpose, token) → {sendId, propertyId?} | null` (timingSafeEqual on equal-length buffers).
- [ ] `tracking/timeline.spec.ts`: every transition above, stageOf order, statusAfter (visited kept, cleared back to sent).
- [ ] `tracking/timeline.ts`: `TimelineState`, `TimelineEvent`, `applyEvent`, `stageOf`, `statusAfter`.
- [ ] `change-log.spec.ts`: plain string/number/decimal-string equality (`'400000.00'` = `400000`), dates (`Date` vs `'2026-10-01'`), arrays as sets, null/''/undefined equal, only changed keys out, nested wishlist keys.
- [ ] `change-log.ts`: `diffFields(before, after, fields) → {field, from, to}[]` (raw values), `sameValue`.
- [ ] Run `pnpm --filter api test -- link-token timeline change-log` → pass.

### Task 2: Migration + entities
- [ ] `1777260000000-BuyerMatchTracking.ts`: the columns/tables in the spec (guards with `hasColumn`/`hasTable`; `down()` drops them).
- [ ] Entities `buyer-send.entity.ts`, `lead-suggestion-event.entity.ts`, `lead-change.entity.ts`; new columns on `LeadSuggestion`; export from `entities/index.ts`; register in `LeadModule` `forFeature`.
- [ ] Run the migration locally, revert, run again.

### Task 3: Tracking service + public routes
- [ ] `BuyerTrackingService`: `createSend`, `dropSend`, `recordSent(tenantId, leadId, sendId, propertyIds)`, `open(token)`, `click(token) → url | null`, `agentEvent(...)`, `timeline(tenantId, viewer, leadId, sid)`. Writes through `applyEvent` / `statusAfter`, updates only changed columns.
- [ ] `BuyerTrackingController` (`api/t`): `GET o/:token` (gif, `@Res`), `GET c/:token` (302 / 404 page). `@Public()`, `@SkipThrottle()` on default but a `@Throttle` of 120/min per IP.
- [ ] Suggestion event route + timeline route in `BuyerMatchController` (before `:id` routes).

### Task 4: Send flow
- [ ] `BuyerMailInput.tracking?: { pixelUrl: string; link: (propertyId: number) => string }` → pixel before `</body>` content end, property/image links through `link()`.
- [ ] `BuyerSendService.prepare`: hidden set (`BuyerSuggestionService.hiddenIds`), `allowResend`, `skipped`; `send`: per recipient a send row, tracked buyer copy, `recordSent`; preview returns `skipped`.
- [ ] `SendPropertiesDto.allowResend?: boolean`.
- [ ] `BuyerMailService.send` takes a per-recipient `tracking` callback.
- [ ] Jest: `buyer-mail.spec.ts` gains a tracked-email case (pixel present, links wrapped, agent copy untouched).

### Task 5: Matches hide sent/rejected
- [ ] `BuyerSuggestionService.hiddenIds(tenantId, leadId) → Map<propertyId, 'sent'|'rejected'>`.
- [ ] `BuyerMatchService.match(…, { hidden?: Map, showAll?: boolean })`: excludes in SQL unless showAll; `hiddenCount`; marks `hiddenReason`.
- [ ] `MatchQueryDto.all?: boolean` (`'1'|'true'` → true).

### Task 6: Change log
- [ ] `BuyerChangeLogService`: `record(tenantId, leadId, userId, source, before, after)` (diff + describe), `recordRaw(…, changes)`, `list(tenantId, viewer, leadId, page)`.
- [ ] Describe: agent ids → user names, stage id → stage name (en), location / type / feature ids → names (en), answers → option labels.
- [ ] Hook into `BuyerService.update/setStage/setWishlist/setAnswers`, `BuyerIntakeService` (fill + wishlist form), `BuyerImportService.apply`.
- [ ] `GET buyers/:id/changes`.

### Task 7: Dashboard
- [ ] `use-buyer-match.ts`: `matches(id, page, all)`, `suggestionEvent`, `timeline`, `changes`; send result `skipped`.
- [ ] Matched tab: "Show all (N hidden)" toggle; hidden rows greyed with "Sent" / "Rejected" badge.
- [ ] Send dialog: skipped notice + "Include them" checkbox (`allowResend`), from the preview.
- [ ] Suggested tab: `timeline-chips.tsx` (6 steps, reached ones coloured with date tooltip, rejected red + reason), click → events popover; Viewing / Offer / Liked / Rejected menu.
- [ ] `history-tab.tsx` + tab "History".
- [ ] i18n keys in `en.ts`.

### Task 8: Verify
- [ ] `pnpm --filter api test` all pass; `pnpm --filter api build`; restart the API child.
- [ ] `e-api.js` (scratchpad): creates its own buyer + 3 listings; send → send rows + events; open token → gif + openedAt; click → 302 to the pattern URL + clickedAt; tampered token → gif / 404, no change; matches hidden + `all=1`; resend skipped / `ALL_ALREADY_SENT` / allowResend; agent events + status sync; change log rows for update/stage/wishlist/answers with names; agent 404 on another's buyer; cleanup.
- [ ] Puppeteer (apps/api tmp script): Matched toggle, send dialog notice, timeline chips, History tab; admin + agent; screenshots checked.
- [ ] Dashboard `next build` (stop dev first, delete `.next`, restart dev).
