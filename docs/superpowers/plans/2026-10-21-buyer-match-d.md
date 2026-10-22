# Buyer Match D — Odoo import

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** a client admin uploads the Odoo Buyers export (.xlsx), sees what will be created or updated and every Odoo value SPM could not match, maps or skips each one, and imports. Re-importing the same file changes nothing new (idempotent on the Odoo ID).

**Architecture** (`apps/api/src/modules/lead/buyer/odoo/`):
- `odoo-columns.ts`: the only place that knows Odoo's header labels (field → accepted headers).
- `odoo-parse.ts`: pure. Sheet rows → `OdooBuyer[]` (a row with an empty ID is a sub-row of the buyer above: a further suggested property, plus any extra multi-values). `readOdooSheet(buffer)` wraps exceljs.
- `odoo-match.ts`: pure. Lookup lists → matchers (agents by name/email, towns by `locationKey` on every name + aliases, types/features by name in any language, question options by label, role/priority/status/etc. by fixed maps) and `mapBuyer(odoo, matchers, mapping)` → the lead patch, answers, agent ids, suggestion refs, unmatched values.
- `buyer-import.service.ts`: preview + apply against the tenant's data.
- `buyer-import.controller.ts`: `POST buyers/import/odoo/preview|apply` (multipart `file`, apply also `mapping` JSON), admin only, behind the add-on, registered before BuyerController.
- Dashboard `/dashboard/buyers/import` + an "Import" sub-nav item for admins.
- Fixture `apps/api/test/fixtures/make-odoo-sample.ts` writes a realistic sample.

**Spec:** `docs/superpowers/specs/2026-10-21-buyer-match-phase1-design.md` (Odoo import). Columns from the client doc's "Exporting buyers from Odoo". The A1 plan's Global Constraints apply.

## Decisions
- **Header row:** the first row (of the first 10) holding an `ID` or `Email` header. Headers are compared lower-cased with spaces collapsed. Unknown headers are listed in the preview (not an error). Without an ID column → 400 `ODOO_NO_ID`.
- **Cells:** exceljs values become text (rich text joined, hyperlink text, formula result, dates as `YYYY-MM-DD`). Multi-value cells (Towns, Property Type, Listing Type, Condition, Views, Swimming Pool, Settings, Related Sale Agents, questions) split on `,` / `;` / new line.
- **Sub-rows:** ID empty → its suggestion columns become another suggestion of the buyer above, and its multi-value cells add to that buyer's lists (in case Odoo puts x2many values on their own rows).
- **New vs update:** by contact email (lower-cased), then by `leads.importRef` = Odoo ID. A buyer with no email gets the placeholder `odoo-<ID>@no-email.invalid` (contact `subscribed=false`, so newsletters never use it) and a note; the preview counts them.
- **Field mapping:**
  - main agent = Sales Agent, else Salesperson; Related Sale Agents → related agents (main excluded)
  - Contact type → role (fixed map, mappable when unknown)
  - Priority: 0–3 or Normal/Low/High/Very High (0/1/2/3)
  - Status Buyer → stage by stage name in any language, else a fixed map (new, contacted, …, won, lost); unknown → mappable to a stage, else the default stage
  - Sub-status, ID Type, I prefer contact by, Send Matched Properties to: fixed maps; unknown → notes
  - Language: code or name ("Dutch / Nederlands", "en_US") → 2-letter; Country: ISO2 or English name (via `Intl.DisplayNames`)
  - Listing Type: sale/resale/new development/rent/long term/holiday… → listing types; unknown → mappable
  - Towns → `locationIds` (a town-level match preferred when a name exists at several levels); Property Type → `propertyTypeIds`; Condition, Views, Swimming Pool, Settings → `featureIds`
  - Bedrooms, Bathrooms ("3+" ok), Budget from/to, Build/Plot Size → wishlist numbers; the wishlist is stored with `guessed:false` when any wishlist value came from Odoo
  - Purpose, Financial Situation, Location, the three distances → buyer question answers (by option label in any language); unknown option → mappable
  - Internal Notes → notes; Visiting Period start/end, Waiting for Reply Date → dates; Referred By, Referral %, Buyer's Lawyer, ID Number, address fields copied; Created on → `createdAt` for new buyers
- **Unmatched values:** grouped by kind + value with a count. The dashboard maps each to an SPM item or leaves it. On apply, a mapped value becomes that item; an unmapped (or skipped) value is written into the buyer's notes under "Not matched in SPM (Odoo import):", so nothing is lost.
- **Notes:** Odoo's notes, a "No email in Odoo." line when needed, and the not-matched block sit between `[From Odoo]` … `[/From Odoo]` marker lines. A re-import replaces only that part, so whatever an agent wrote in SPM (above or below) is kept. (First built as "Odoo replaces the notes": the E2E showed a re-import wiping the agent's own note, so it changed.)
- **Dashboard at phone width:** the dashboard shell (fixed sidebar) isn't built for 390 px on any page, so the import page was checked at 1400 and 1024 px.
- **Suggestions:** only for references (or agent references) that exist in the tenant; upserted on (lead, property) with Odoo status (suggested/sent/visited/interested/not interested), visit date and note. Missing references are listed in the preview and the summary.
- **Activities:** one `import` activity per buyer per apply (`{source:'odoo', importRef, created}`).
- **Limits:** 10 MB file, 5,000 buyers; only `.xlsx`.
- **Admin only** (`@Roles('admin')`), add-on `buyerMatch`, Super Admin bypass as everywhere.
- No migration (importRef exists since A1).

## Tasks
1. Column map + parser (TDD on the fixture): header aliases, sub-rows, multi-values, cell types, no-ID error.
2. Matchers (TDD): town key + aliases + level preference, type/feature any language, agent name/email, option labels, role/priority/status/listing type maps, mapping overrides, unmatched collection.
3. Service + controller: preview (counts new/update/no-email, unmatched with choices, missing refs, unknown headers) and apply (idempotent, summary).
4. Fixture `make-odoo-sample.ts` (writes `test/fixtures/odoo-buyers-sample.xlsx`).
5. Dashboard import page + sub-nav (admins only) + i18n.
6. Verify: jest; E2E `d-api.js` (preview counts, unmatched, mapping applied, notes block, suggestions + missing refs, update by email, re-apply idempotent, agent 403, no add-on 403); puppeteer import flow; builds.
