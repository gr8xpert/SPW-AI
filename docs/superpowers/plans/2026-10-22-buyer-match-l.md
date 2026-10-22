# Buyer Match L — paste to wishlist, notes become rules, voice note

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** an agent pastes an email/WhatsApp (or a website enquiry message) and gets wishlist changes to tick; AI reads the Internal Notes into rules that flag and lower breaking matches; a 30-second voice note after a call becomes a note plus wishlist changes. All on the agency's own OpenRouter key, all reviewed by the agent.

**Architecture:**
- API `apps/api/src/modules/lead/buyer/ai/`: pure `ai-json.ts`, `place-names.ts`, `note-rules.ts`, `ai-proposal.ts`, `buyer-ai-prompts.ts` (+ specs); `buyer-ai.service.ts` (key check, lists, model call, validation); `buyer-ai.controller.ts`; `dto/buyer-ai.dto.ts`.
- `AiService`: `OPENROUTER_BASE_URL` (chat + catalog) so tests use a fake server.
- Rules in matching: `BuyerMatchService.match()` and `BuyerNearMissService` take `rules` and add `ruleBreaks` / `ruleUnknown`, lowering the score.
- Migration `1777320000000-BuyerMatchAiRules`: `leads.noteRules`, `leads.noteRulesHash`.
- Dashboard: `use-buyer-ai.ts`, `_components/ai/` (`ai-gate.tsx`, `paste-dialog.tsx`, `proposal-review.tsx`, `rules-card.tsx`, `voice-note-dialog.tsx`), `src/lib/voice-recorder.ts`; Wishlist tab, Activity tab, Matched / Near misses tabs.

**Spec:** `docs/superpowers/specs/2026-10-22-buyer-match-phase3-design.md` (L). E plan's Global Constraints apply.

## Decisions
- Spec decisions apply. Made while building, on top of them:
- **`OPENROUTER_BASE_URL`** (`ai-models.ts openRouterBase()`) feeds AiService, the model catalog and AiEnrichmentService, so one .env line points every AI call at a test server. Default unchanged.
- **The dashboard blocked the microphone**: next.config sent `Permissions-Policy: microphone=()`. Now `microphone=(self)`. If Nginx on prod adds its own Permissions-Policy it must allow the mic too (For DevOps).
- **Rule checking is its own service** (`BuyerRuleCheckService`): loads type/feature names only when a floor rule exists, expands avoided places/types once per request. Matched + Near misses pass `lead.noteRules`; alerts and reverse match don't (spec).
- **Reading notes that hold no rules** stamps the notes hash anyway (nothing to accept, so the card stops saying "notes changed").
- **Already-saved rules are never proposed again** by paste / voice / read (filtered by rule id).
- **History** shows a rules change as the rule texts (field `noteRules`).
- **All AI routes share one limit**: 20 calls / minute / user (`@Throttle` on BuyerAiController), status included; the dashboard caches the status 5 min.
- **Read with AI** appears on activities the buyer wrote (`enquiry`, `wishlist_form`, `viewing_request`, `buyer_feedback`) with text. A voice note shows a "Voice" badge in the timeline.
- **No AI on an erased buyer** (`ERASED`); the record hides its AI buttons.

## Verified (2026-10-22)
- jest 879/879 (45 new); `l-api.js` 56/56 on the fake OpenRouter (no request without a key, client key + model, invented ids dropped, place typo resolved, rules flag/lower/unknown, stale notes, voice WAV limits, merge/erase, throttle); migration run/revert/run; puppeteer `l-ui` 13/13 incl. fake-mic recording and 390 px.

## Tasks
### Task 1: Pure modules (TDD) — `ai-json`, `place-names`, `note-rules`, `ai-proposal`, `buyer-ai-prompts` specs first, then code.
### Task 2: `OPENROUTER_BASE_URL` in AiService + catalog; migration + entity columns; Buyer type in shared/dashboard.
### Task 3: `BuyerAiService` + controller (status, paste, rules read, rules save, voice); voice-note activity `via`; GDPR erase + merge.
### Task 4: Rules in Matched + Near misses (facts: floor text, type names, feature names; descendants of avoided places).
### Task 5: Dashboard — AiGate, paste dialog + proposal review, Rules card, Read with AI on enquiries, Voice note dialog + recorder, rule lines on matches; i18n.
### Task 6: Fake OpenRouter (`scratchpad/fake-openrouter.js`) + E2E `l-api.js` (no key, key + model used, invented ids dropped, place resolution, rules break/lower, stale notes, voice WAV checks, throttle) ; puppeteer `l-ui` incl. 390 px; jest + builds.
