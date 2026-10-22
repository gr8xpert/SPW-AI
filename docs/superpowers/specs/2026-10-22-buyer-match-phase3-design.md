# Buyer Match — Phase 3 technical design (AI assistance)

2026-10-22 · Client plan: https://claude.ai/code/artifact/6d33412a-752e-4673-ac7f-c5ae0ea0fa61 ("Phase 3 – AI assistance").
Builds on Phase 1 (A–D), Phase 2 (E–H) and Phase 2b (I–K). The plan's seventh row, "Hot buyer flag", was built in I.

Two milestones, one plan each:
- **L** — paste to wishlist (+ website enquiry messages), notes become rules, voice note after a call.
- **M** — personal email text, buyer summary, learns from feedback.

Client rules this design keeps:
- AI runs on the OpenRouter key saved in the agency's Settings → AI (`keySource: 'client'`, the property-AI policy). No key = AI buttons explain that and link to `/dashboard/settings?tab=ai`.
- Every AI suggestion is shown to the agent to accept. Nothing reaches a buyer without the agent pressing Send.
- Matching stays a normal search (SQL + `scoreProperty`). Rules are checked by plain code, not by AI.
- No AI chat with buyers.

## Decisions (made on my own, 2026-10-22, while the user was away)

- **One AI entry point per buyer: `BuyerAiService`.** It checks the key, loads only the lists a task needs, calls `AiService.chatCompletion` with `keySource: 'client'` and the tenant's saved model, and validates the reply. A missing key → 400 `{code: 'NO_AI_KEY'}` before any work. A reply that isn't usable JSON → 422 `AI_UNREADABLE`. An OpenRouter failure keeps AiService's message ("Your OpenRouter API key (Settings → AI) was rejected…").
- **The model never sees an id it could invent for places.** Locations can be thousands of rows (Resales clients), so the model returns place **names** and the server resolves them against the tenant's locations (exact name/alias key, then a unique "contains" match, then an edit distance ≤ 2 for names of 6+ letters). Unresolved names are shown to the agent as "not found". Property types and features are short lists, so they go to the model as `id: name` lines and only known ids survive.
- **Proposals are diffs.** The API returns `changes` (field, from, to) computed against the saved wishlist: list fields are **added to** what is there (a `guessed` wishlist from a website enquiry is replaced instead), numbers replace. The agent ticks the changes to keep; the dashboard writes the result through the existing `PUT buyers/:id/wishlist` (same DTO, same validation, change log as an agent edit). Nothing is written by the AI call itself.
- **Paste dialog saves directly** (it doesn't fill the unsaved wishlist form). On the Wishlist tab the Paste button is disabled while the form has unsaved edits.
- **Website enquiries:** each `enquiry` / `wishlist_form` / `viewing_request` activity with a message gets "Read with AI" in the Activity tab; it opens the same paste dialog with the message filled in. Enquiries are **not** read automatically on arrival: that would spend the agency's credit on spam and the result needs an agent anyway.
- **Rules are a closed, typed set** (`note-rules.ts`), checked by plain code against listing data:
  - `floor` avoid/require `ground` | `top`
  - `feature` avoid/require `<featureId>`
  - `type` avoid `<propertyTypeId>`; `place` avoid `<locationId>` (with everything under it)
  - `max` / `min` on `price`, `bedrooms`, `bathrooms`, `buildSize`, `plotSize`, `terraceSize`, `gardenSize`, `builtYear`, `distanceToBeach`, `communityFees`
  - Each rule keeps the words it came from (`text`, ≤ 200 chars) and a `strength`: `hard` ("does NOT want", "never", "must") or `soft` ("prefers", "ideally").
- **Floor is read from three places**, because `properties.floor` is almost always empty (feeds don't fill it): the floor text ("0", "bajo", "PB", "ground", "1st", "ático"…), then the property type name ("Ground Floor Apartment", "Penthouse"), then the property's feature names ("Ground floor", "Top floor"). No signal = **unknown**: not flagged, not lowered, shown as "? floor not known" only when the rule is hard.
- **What a broken rule does:** the match stays in the list (matching is still the search) but gets a red "Breaks: <rule words>" line and its score is lowered — hard −40, soft −15, floor 0 — so breakers sink below clean matches. Matched and Near misses tabs both apply it. Reverse match and alerts don't (they rank many buyers at once; later if wanted).
- **Rules live on the lead** (`leads.noteRules` JSON, at most 20) with `leads.noteRulesHash` = sha256 of the notes they were read from. When the notes change the Rules card says "Notes changed since the rules were read" with a Read again button; AI is never run on save. Rules from a paste or a voice note are added to the same list (they don't set the hash). The agent can delete a rule or switch hard/soft; there is no hand-made rule editor (write it in the notes and read again).
- **Voice note:** up to 30 s (hard stop at 35 s), recorded in the browser as 16 kHz mono WAV (the widget's recorder logic, copied into the dashboard — the two apps don't share browser code), uploaded once (1.2 MB cap), checked by the existing `readWav`, sent to the first available audio model (`VOICE_MODELS`, same as voice search), never stored. The reply gives the transcript, a tidy note and wishlist changes + rules; the agent edits the note and saves it as a normal `note` activity (metadata `{via:'voice'}`), and ticks the changes like a paste.
- **Cost limits:** pasted text ≤ 6 000 chars accepted, 4 000 sent; notes 4 000 sent; feedback comments 3 000; summary input ≤ 6 000; replies capped by `maxTokens` per task (600–900); temperature 0.1–0.4. Feature lists are sent in English only. The AI routes are throttled per user (20/min).
- **Summary (M):** three lines written in English (the dashboard's language), cached on the lead (`aiSummary`, `aiSummaryHash`, `aiSummaryAt`). The hash is taken over exactly the input the model would get (stage, wishlist, rules, notes, the last 15 meaningful activities — not opens or clicks — suggestion feedback, viewings, open tasks), so "cache until the buyer changes" is literal: the same input never costs twice. Opening a record with a missing or stale summary generates it once (at most one regeneration per buyer per 2 minutes); "Refresh" forces it. Writing the cache keeps `updatedAt` and `lastActivityAt` as they were.
- **Personal email text (M):** "Write with AI" in the send dialog fills the existing message box with ≤ 90 words in the buyer's language (the dialog's language), from the buyer's first name, the wishlist in words, hard rules, and the chosen properties (title, town, type, price, beds, which wishes they meet). The agent edits it and presses Send as before. No last name, email or phone goes to the model.
- **Learns from feedback (M) is counted, not guessed.** Liked = liked on the buyer page, status `interested`, or a viewing with interest ≥ 4; rejected = rejected, `not_interested`, or interest ≤ 2. A plain-code pass (`feedback-patterns.ts`) finds: a feature in ≥ 2 liked and ≥ 60 % of liked, not in the wishlist → "Add <feature> to the wishlist?"; ground/top floor, a property type or a town in ≥ 2 rejected and none liked → "Add rule: avoid …?". The sentence reads like the plan ("Rejected 4 ground floors, liked 3 with Sea Views"). It costs nothing, so it shows without a key. **"Read the buyer's comments with AI"** (key needed) sends the reject reasons and viewing feedback texts and returns more changes/rules in the paste format. Accept = one click (wishlist PUT or rules PUT); Dismiss is remembered (`leads.aiDismissed`, keys like `feature:12`, `rule:floor:ground`).
- **GDPR / merge:** erase clears `noteRules`, `noteRulesHash`, `aiSummary*`, `aiDismissed`. Merge keeps the kept buyer's rules and adds the merged buyer's rules that aren't already there; the summary is recomputed.
- **Testing never calls OpenRouter.** `OPENROUTER_BASE_URL` (default `https://openrouter.ai/api/v1`) feeds both the chat URL and the model catalog, so E2E points the API at a local fake server that answers per task and logs every request (key, model, prompt length).

### Decisions made while building (2026-10-22, see plans l / m for all)
- The dashboard sent `Permissions-Policy: microphone=()`, which blocks recording; now `microphone=(self)` (next.config). Prod Nginx must not override it.
- `OPENROUTER_BASE_URL` also covers AI enrichment, so one .env line moves every OpenRouter call.
- One summary route (POST); "today" sits outside the hashed input so the cache survives midnight.
- Rules learned from feedback are saved **soft**, worded by the counted sentence.
- Reading notes that hold no rules marks them read (no stale banner).

## Data model

### L — `1777320000000-BuyerMatchAiRules`
- `leads.noteRules JSON NULL`, `leads.noteRulesHash CHAR(64) NULL`.

### M — `1777330000000-BuyerMatchAiSummary`
- `leads.aiSummary TEXT NULL`, `leads.aiSummaryHash CHAR(64) NULL`, `leads.aiSummaryAt DATETIME NULL`, `leads.aiDismissed JSON NULL`.

No new activity type: a voice note is a `note` with `metadata.via = 'voice'`.

## Pure modules (TDD, `apps/api/src/modules/lead/buyer/ai/`)

| File | What |
|---|---|
| `ai-json.ts` | `extractJson(reply)` (fences, prose around it, first object), `clip(text, max)` |
| `place-names.ts` | `resolvePlaces(names, locations)` — key, alias, unique contains, edit distance |
| `note-rules.ts` | `NoteRule` types, `cleanRules(raw, lists)`, `floorFacts(...)`, `checkRules(rules, facts)`, `rulePenalty(score, broken)`, `rulesHash(notes)` |
| `ai-proposal.ts` | `cleanProposal(raw, lists)` → wishlist part + places + rules + note; `proposalChanges(current, proposal)` |
| `buyer-ai-prompts.ts` | one system prompt per task (`wishlist`, `voice`, `rules`, `summary`, `intro`, `feedback`); each starts with `TASK: <name>` |
| `summary-input.ts` (M) | the summary's input text + its hash; `cleanSummary(reply)` (3 lines, ≤ 160 chars each) |
| `feedback-patterns.ts` (M) | liked/rejected classification, the patterns, keys, sentences |
| `email-intro.ts` (M) | the intro input; `cleanIntro(reply)` (plain text, ≤ 900 chars, no links/HTML) |

## API (`api/dashboard/buyers`, add-on `buyerMatch` + A1 visibility; controller `BuyerAiController`, registered before `BuyerController`)

| Milestone | Route | What |
|---|---|---|
| L | `GET buyers/ai/status` | `{hasKey}` |
| L | `POST buyers/:id/ai/paste {text}` | `{proposal, changes, places, rules}` |
| L | `POST buyers/:id/ai/rules` | rules read from the saved notes `{rules, notesHash}` |
| L | `PUT buyers/:id/rules {rules, notesHash?}` | save accepted rules (validated again) |
| L | `POST buyers/:id/ai/voice` (multipart `audio`) | `{transcript, note, changes, places, rules}` |
| L | `POST buyers/:id/activities` | existing; `metadata.via='voice'` through a new optional `via` field |
| L | `GET buyers/:id/matches`, `…/near-misses` | items gain `ruleBreaks[]`, `ruleUnknown[]`; score lowered |
| M | `POST buyers/:id/ai/email-intro {propertyIds, lang}` | `{text}` |
| M | `POST buyers/:id/ai/summary {force?}` | `{lines, at, stale, hasKey}` (cached unless the input changed) |
| M | `GET buyers/:id/ai/feedback` | counted patterns + counts (no key needed) |
| M | `POST buyers/:id/ai/feedback` | + AI read of comment texts |
| M | `POST buyers/:id/ai/dismiss {key}` | remember a dismissed suggestion |

The buyer record (`GET buyers/:id`) also returns `noteRules`, `rulesStale`.

## Dashboard
- `use-buyer-ai.ts` (React Query, tenant-scoped keys, `api.*` inline — never in a `useCallback`).
- `AiGate`: wraps every AI button; without a key the click opens a short note "AI uses your agency's OpenRouter key. Add it in Settings → AI." with the link (agents are told to ask their admin).
- Wishlist tab: **Paste a message** button + dialog; **Rules from notes** card under the form.
- Activity tab: **Read with AI** on enquiry-like activities; **Voice note** button next to adding a note.
- Matched / Near misses: "Breaks: …" lines, lowered score.
- M: **Summary** card at the top of the record; send dialog **Write with AI**; **What the feedback says** card on the Suggested tab.

## Testing
Jest for every pure module; API E2E per milestone against a fake OpenRouter (`OPENROUTER_BASE_URL`), incl. invented ids dropped, no-key 400, key/model used, prompt sizes, throttling of the summary cache; puppeteer for each new screen incl. 390 px; E–K regression scripts; API + dashboard builds; one deploy package for L + M.
