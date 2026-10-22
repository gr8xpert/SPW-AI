# Buyer Match M — personal email text, buyer summary, learns from feedback

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** a short personal intro in the buyer's language for every selection email (agent edits before sending); three lines at the top of each record so anyone can pick up a buyer in seconds; likes, rejects and viewing feedback turned into one-click wishlist/rule suggestions.

**Architecture:**
- API `apps/api/src/modules/lead/buyer/ai/`: pure `summary-input.ts`, `feedback-patterns.ts`, `email-intro.ts` (+ specs); `buyer-ai-summary.service.ts` (summary cache), `buyer-ai-feedback.service.ts` (patterns + comment read), intro in `buyer-ai.service.ts`; routes on `BuyerAiController`.
- Migration `1777330000000-BuyerMatchAiSummary`: `leads.aiSummary`, `aiSummaryHash`, `aiSummaryAt`, `aiDismissed`.
- Dashboard: `summary-card.tsx` (record top), `feedback-card.tsx` (Suggested tab), Write with AI in `send-dialog.tsx`.

**Spec:** `docs/superpowers/specs/2026-10-22-buyer-match-phase3-design.md` (M). L plan's decisions apply.

## Decisions
- Spec decisions apply. Made while building, on top of them:
- **One summary route, `POST buyers/:id/ai/summary {force?}`** (no GET): the server decides — same input hash → cached, no AI call; changed and the last one over 2 minutes old → rewritten; changed within 2 minutes → the old one with `stale: true`; no key → `{lines: null, hasKey: false}` (no error, the card explains); `force` = Refresh. The record asks again after any buyer write (React Query invalidation), so the server-side hash is the only cache rule.
- **"Today" is in the system prompt, not in the hashed input**, so the cache doesn't expire every midnight.
- **Summary input:** first name only; stage, agent, source, wishlist in words, rule texts, last 15 activities (not assignments/imports), sent/liked/rejected with reasons, viewings, open tasks, then the notes in whatever room is left (≤ 6 000 chars total). Writing it keeps `updatedAt` / `lastActivityAt`.
- **Feedback verdicts:** like/reject (newest wins) → agent status → a viewing's interest; a viewed property never suggested counts too. Floors read like rules (floor text, type name, feature names); places counted by town (`townOf`). Never suggests avoiding the only wished place.
- **Accepting a pattern:** a feature goes into the wishlist; a rule is saved **soft** (learned from behaviour, not stated) with the counted sentence as its words ("Rejected 4 ground floors, liked none."). Dismiss = `leads.aiDismissed` (last 100 keys).
- **Comments read by AI** = reject reasons, viewing feedback and buyer-page notes; no comments → 400 `NO_COMMENTS` (the button only shows when there are some). The result is reviewed like a paste.
- **Email intro:** language = the dialog's language (else the buyer's), property titles/places in that language, wished features each property has as "meets", hard rules as "insists on"; ≤ 90 words; HTML and links stripped; it fills the existing Personal message box (replacing what was typed — the button then reads "Write again").
- **Phone width:** the dashboard shell keeps the sidebar open on phones (already reported For Designer); the new cards were checked with the sidebar collapsed and fit.

## Verified (2026-10-22)
- jest 907/907 (73 in buyer/ai); `m-api.js` all pass on the fake OpenRouter; migration run/revert/run; puppeteer `m-ui` 11/11 (summary, feedback accept/dismiss/comments, intro in Spanish, 390 px, no key).

## Tasks
### Task 1: Pure modules (TDD) — `summary-input`, `feedback-patterns`, `email-intro` specs first.
### Task 2: Migration + entity columns; erase/merge clear/keep.
### Task 3: Services + routes (email-intro, summary get/post with hash cache + 2-minute guard, feedback get/post, dismiss).
### Task 4: Dashboard — summary card, send dialog Write with AI, feedback card; i18n.
### Task 5: E2E `m-api.js` on the fake OpenRouter (cache hit = no request, stale after a note, guard, intro language + no PII, feedback counts + accept/dismiss, AI comment read); puppeteer `m-ui` incl. 390 px; regression E–L; jest + builds; deploy package.
