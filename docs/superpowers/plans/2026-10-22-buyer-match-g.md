# Buyer Match G — Near misses + reverse match

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** a buyer's record lists, separately from Matched, the listings that only just miss one must-have, each with the reason ("€15k over budget", "next town over: Benahavís (6 km)"), with thresholds per agency. Matched and near misses both say which wishes are missed in words ("1 bedroom short", "no Pool"). A property's edit page says "N buyers match this property" and sends it to all of them in one go through the normal send flow.

**Architecture:**
- API `apps/api/src/modules/lead/buyer/`:
  - `near-miss.ts` (pure): `nearMissOf`, `wishReasons`, `townOf`, `nearbyTowns`, `distanceKm`
  - `reverse-match.ts` (pure): `wishlistAccepts` (the SQL must-haves, in code)
  - `buyer-near-miss.service.ts`: `GET buyers/:id/near-misses`
  - `buyer-reverse.service.ts` + routes in `buyer-match.controller.ts`: `GET buyers/reverse/:propertyId`, `POST buyers/reverse/:propertyId/send`
  - `buyer-match.service.ts`: match items gain `reasons`
- Settings `nearMiss {enabled, budgetPercent, nearbyKm}` (shared type, normalize, DTO). No migration.
- Dashboard: Near misses tab, reasons under Matched rows, `buyer-reasons.ts` (words), property edit page card + dialog, settings tab "Alerts & near misses" (near-miss part; H adds alerts).

**Spec:** `docs/superpowers/specs/2026-10-22-buyer-match-phase2-design.md` (G rows). E plan's Global Constraints apply.

## Decisions
- **Near miss = exactly one must-have missed, by a little:**
  - budget over: the listing's price is above `budgetMax` by at most `budgetPercent` % of `budgetMax` → `{code:'over_budget', amount}`
  - budget under: the listing's top price is below `budgetMin` by at most `budgetPercent` % → `{code:'under_budget', amount}`
  - place: the listing's town is not in the wishlist's places but is "nearby" → `{code:'nearby', place, km}`
  - listing type and property type are never relaxed (a flat is not a near-miss villa).
  - Two misses (over budget AND next town) → not a near miss.
- **Nearby:** the listing's town (walked up to level `town`) is within `nearbyKm` of the town of a wished place, by town coordinates (haversine). When either town has no coordinates: a sibling town under the same parent counts as nearby (km = null, "next town over"). A wished place above town level (area, province) has every town inside it already, so it adds no nearby towns.
- **Threshold 0** turns that kind off; `nearMiss.enabled=false` hides the tab's results (the tab says it is off in settings).
- **Same pool rules as Matched:** active, published, the site's listing types and price floors, newest 500 candidates, sorted by the miss size (smallest first) then score. Sent/rejected hidden with the same "Show all" toggle.
- **Wish reasons** (both lists): `bedrooms_short {n}`, `bathrooms_short {n}`, `build_size`, `plot_size`, `feature {id}`. They replace the plain "x Bedrooms" strike-through words in the UI.
- **Reverse match:** every visible, unmerged buyer with a non-empty wishlist whose stage is open (or none), evaluated with `wishlistAccepts` (listing type ∩ site types, places with descendants, property types with descendants, budget overlap, price floor), then scored. Not-live properties → `live:false`, no buyers. Already sent / rejected buyers are listed but marked and skipped by Send to all.
- **Send to all:** `POST …/send {leadIds?}` (default: every matching buyer not yet sent it). Per buyer: recipients from `sendMatchesTo` (buyer default; a buyer without email → agent if wanted, else skipped), the buyer's language, the normal tracked email. Max 200 buyers per call; results per buyer (`sent | skipped | failed` + reason). Agents only reach their own buyers (visibility).

## Tasks
### Task 1: Pure (TDD)
- [ ] `near-miss.spec.ts`: over/under budget within/over threshold, threshold 0, nearby by km, by sibling without coords, both misses → null, full match → null, wish reasons, distance.
- [ ] `reverse-match.spec.ts`: each must-have yes/no, descendants, site types, POA with budget, price floor.
### Task 2: Settings `nearMiss` (shared, normalize, DTO) + jest.
### Task 3: Near-miss service + route; reasons on matches.
### Task 4: Reverse service + routes.
### Task 5: Dashboard: Near misses tab, reasons, property edit card + dialog, settings card.
### Task 6: Verify: jest, `g-api.js` (near misses incl. reasons + thresholds + hidden; reverse list/visibility/send to all/skip/agent), forward/reverse agreement on the same data, puppeteer (tab, property card + dialog + send), builds.
