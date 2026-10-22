# Buyer Match A2 — Pipeline, follow-up, files, questions

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** a drag-and-drop pipeline board, a per-client stage editor, tasks with deadlines plus a "To do today" page, a Files tab, and Buyer questions. The questions are tenant-managed, translatable lists with answers on the buyer, and the buyer list can be filtered by answer.

**Architecture:** three new tables (`buyer_tasks`, `lead_files`, `buyer_questions`) in migration `1777240000000-BuyerMatchFollowUp`. API code goes in `apps/api/src/modules/lead/buyer/` (task, file and question services plus controllers, all on the same guards as A1). The dashboard adds `/dashboard/buyers/board` and `/dashboard/buyers/today`, Settings tabs (General / Stages / Questions), and record tabs (Tasks, Files, plus a Buyer questions card under Details). A shared sub-nav links the Buyers pages.

**Spec:** `docs/superpowers/specs/2026-10-21-buyer-match-phase1-design.md`. The A1 constraints apply here too (`2026-10-21-buyer-match-a1.md` → Global Constraints).

## Decisions taken while planning
- Timeframe becomes a seeded Buyer question (single choice). The free-text `leads.timeframe` column added in A1 is removed. A1 is not deployed, so `1777230000000` is edited; locally the column is dropped by hand.
- Files reuse `UploadService.uploadFile` (R2 or disk, images optimised to WebP, PDF kept as-is, size cap per tenant). Allowed types: images and PDF. Videos are refused for buyer files.
- "Today" follows the browser's clock: the dashboard sends `before` = the end of the local day. The API returns open tasks due before it, oldest first, and the page splits them into overdue and today.
- Deleting a stage that still holds buyers needs a `moveTo` stage. A client always keeps at least one open stage. Won and lost stages are optional.
- The shared `LockedRouteGuard` renders nothing until it has mounted. The add-on answer could arrive mid-hydration and cause hydration errors on every locked page (Team and Feed Export too).
- A question key is a slug of its first English label and never changes, so old answers keep working. Deleting a question removes its answers from every buyer.
- The stage of a buyer only changes through `PUT /buyers/:id/stage`. The board uses that route, with an optimistic update.

## Tasks

### 1. Migration + entities
- `buyer_tasks(id, tenantId FK, leadId FK CASCADE, title varchar(255), notes text null, assignedTo FK users SET NULL, dueAt datetime null, doneAt datetime null, createdBy FK users SET NULL, createdAt, updatedAt)`, indexes `(tenantId, assignedTo, doneAt, dueAt)` and `(leadId)`.
- `lead_files(id, tenantId FK, leadId FK CASCADE, mediaFileId int null, name varchar(255), mimeType varchar(100), size int, url varchar(1000), uploadedBy FK users SET NULL, createdAt)`.
- `buyer_questions(id, tenantId FK, qkey varchar(60), label JSON, options JSON, multiple bool, showOnForm bool default 1, isActive bool default 1, sortOrder int, createdAt)`, unique `(tenantId, qkey)`.
- Entities `BuyerTask`, `LeadFile`, `BuyerQuestion`. Remove `timeframe` from Lead and from the A1 migration's column list.
- [ ] Run the migration locally. Run `revert` + `run` and confirm the data survives.

### 2. Questions (TDD for the pure parts)
- `buyer-question-defaults.ts` holds the 8 seeded questions (en + es): purpose, financial, location_setting (multiple), distance_airport, distance_beach, distance_shops, timeframe, found_us. Also `questionKey(label)` and `cleanAnswers(questions, raw)`. `cleanAnswers` drops unknown keys and options, keeps one option for single-choice questions, and leaves out empty lists.
- `BuyerQuestionService`: `list(tenantId)` (seeds when empty), `create`, `update`, `reorder`, `remove` (also strips the key from `leads.answers`).
- `PUT /buyers/:id/answers {answers}` → `cleanAnswers` → saved.
- `GET /buyers?answer=key:option` filters with `JSON_CONTAINS(JSON_EXTRACT(lead.answers, '$."key"'), '"option"')`. The key and option must match `^[a-z0-9_]+$`.
- Spec covers `questionKey`, `cleanAnswers`, and the seed shape.

### 3. Stage editor
- `POST /buyers/stages {name, color, kind}`, `PUT /buyers/stages/:id`, `PUT /buyers/stages/order {ids}`, `DELETE /buyers/stages/:id?moveTo=`. All admin-only.
- Moving buyers on delete also updates their status through `stageKindToStatus`.
- Spec covers: delete with buyers and no moveTo → 400; deleting the last open stage → 400; reorder rejects ids that aren't the tenant's.

### 4. Board API
- `GET /buyers/board?…same filters as the list` → `{ stages, columns: { [stageId]: { total, data } } }`. Uses the visibility rule, at most 100 cards per column, newest activity first. Buyers with no stage go to the first stage.

### 5. Tasks
- `GET /buyers/:id/tasks`, `POST /buyers/:id/tasks {title, notes?, dueAt?, assignedTo?}` (assignee defaults to the buyer's agent, then the current user), `PUT /buyers/tasks/:taskId {title?, notes?, dueAt?, assignedTo?, done?}`, `DELETE /buyers/tasks/:taskId`.
- `GET /buyers/tasks/due?before=ISO&agentId?`. An agent sees their own tasks; admins may pass agentId (default: themselves). Results only include buyers the viewer can see.
- Done → `doneAt` and a `task_done` activity; undo clears `doneAt`.
- Spec covers: done logs activity; another tenant's task → 404; an agent can't read or change a task on a buyer they can't see.

### 6. Files
- `GET /buyers/:id/files`, `POST /buyers/:id/files` (multipart `file`, images and PDF only), `DELETE /buyers/files/:fileId`. Delete also calls `UploadService.deleteFile`. Each upload or delete logs nothing; files are not activity.

### 7. Dashboard
- `buyers/_components/buyers-nav.tsx` sub-nav: Buyers · Board · To do today · Settings.
- `board/page.tsx` uses dnd-kit `DndContext` + `useDraggable`/`useDroppable`: columns in stage colours with a count, compact cards, drag to change stage (optimistic, rolled back with a toast on error), and the same filters as the list.
- `today/page.tsx`: overdue (red), today, then "No recent activity" (my stale buyers from `?stale=true&agentId=me`). Ticking a task done works inline. Admins get an agent picker.
- Record: a **Tasks** tab (open/done list, add form with title, due date and time, assignee, tick to finish, edit or delete), a **Files** tab (upload, list, open, delete), and a **Buyer questions** card in Details (single → select, multiple → chips).
- `settings/page.tsx` gets tabs: General | Stages (rename per language, colour, kind, reorder ↑↓, delete with move-to) | Questions (label per tenant language, options with per-language labels, multiple / show on website form / active, reorder, delete with a confirm).
- Buyers list: a "Question" filter (`answer=key:option`). The Pipeline card loses the Timeframe field.
- Wording goes in `_i18n/en.ts`.

### 8. Verify
- API jest + an E2E script (`a2-api.js`) for stages, board, tasks, files, questions and answers filter, as admin and as agent.
- Puppeteer: drag a card to another column and confirm it persists after reload; a task due today shows on To do today and can be ticked; a file uploads and opens; an answer saves and the filter finds the buyer; stage rename/reorder/delete-with-move; adding a question with a Spanish label.
- `next build` and API build pass. Update the handoff and memory. No commit.
