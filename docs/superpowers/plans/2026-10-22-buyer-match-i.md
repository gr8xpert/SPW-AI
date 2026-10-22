# Buyer Match I — Viewings & trips, hot buyers, agent daily email, My day

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** a buyer's visiting period becomes a trip with a list of viewings (date/time, property, agent, meeting point, status, feedback, interest). Agents get a reminder before each viewing and one daily email (tasks, viewings today, buyers waiting for a reply, hot buyers, alerts to approve); the buyer gets an itinerary PDF in their language. Hot buyers are flagged by simple rules. Agents open Buyers on "My day".

**Architecture:**
- API `apps/api/src/modules/lead/buyer/`:
  - `viewings/itinerary.ts` (pure: `groupByDay`, `itineraryHtml`), `viewings/buyer-viewing.service.ts`, `viewings/buyer-viewing.controller.ts`
  - `hot.ts` (pure) + `BuyerHotService` (one SQL aggregate for a set of buyers, or the tenant's hot ones)
  - `digest/agent-digest.ts` (pure: `waitingForReply`, `buildAgentDigest`) + `digest/buyer-digest.service.ts` (data, claim, send) + `BuyerHomeService` (the same data for the page)
  - processor jobs `viewing-reminders` (every 5 min) and `agent-digest` (every 15 min), registered by the existing scheduler
  - `SystemMailerService.send` gains `attachments`
- Migration `1777290000000-BuyerMatchViewings`.
- Dashboard: record tab "Trips & viewings" (replaces "Visiting period"), hot badge + filter, "My day" page + nav, settings (reminder minutes, agent email time, hot threshold), a "Daily email" switch on the user's own profile.

**Spec:** `docs/superpowers/specs/2026-10-22-buyer-match-phase2b-design.md` (I). E plan's Global Constraints apply.

## Decisions
- One buyer can have several trips; a viewing may belong to no trip (a one-off). `leads.visitStart/visitEnd` follow the next trip that has not ended, else the latest one (kept in step on every trip write).
- Viewing statuses: planned → done | cancelled | no_show. Done: timeline `viewing` (source agent), suggestion → `visited` (created if missing, `sentAt` untouched), activity `viewing_done` with feedback + interest. Planning one logs `viewing_planned`.
- Agent of a viewing defaults to the buyer's agent. Agents see/edit viewings of buyers they can see.
- Reminder email to the viewing's agent (else the buyer's agent, else none): buyer name + phone, property, time, meeting point, dashboard link. `viewingReminderMinutes` 0 turns reminders off; viewings created inside the window still get one on the next run unless they already started.
- Hot: last 14 days; `lead_suggestion_events` (opened ×0.5 capped 2, clicked 1, liked 3, viewing 5 when source page) + `lead_activities` (enquiry 3, wishlist_form 3, viewing_request — already counted via events, so not again). Threshold `hotScore` default 6. Won/lost buyers are never hot.
- Digest per agent (role admin or user, active, `buyerDigest` on): their buyers (assigned or related). Sent only when at least one section has something. English (dashboard language), agency branding, dashboard links.
- Itinerary: viewings of the trip that are not cancelled, by local day (agency `settings.timezone`), labels `buyer_trip_*` (en/es/nl + memory fill), Google Maps link from the property's coordinates or its place name. Email: branded, short text, PDF attached.

## Tasks
### Task 1: Pure parts (TDD) — `hot.spec.ts`, `agent-digest.spec.ts`, `itinerary.spec.ts`.
### Task 2: Migration + entities (`BuyerTrip`, `BuyerViewing`, `User.buyerDigest`, activity types).
### Task 3: Viewing/trip service + routes + visit mirror + done → timeline/suggestion; reminders job.
### Task 4: Itinerary PDF + email (mailer attachments, labels).
### Task 5: Hot service (list badge + filter), home service + route, digest service + job, settings, user switch.
### Task 6: Dashboard: Trips & viewings tab, hot badge/filter, My day page + nav + sidebar landing for agents, settings fields, profile switch.
### Task 7: Verify: jest, `i-api.js`, puppeteer (tab, PDF, My day, settings), builds.
