# Milestone N — Agents page + buyer photo upload (2026-10-22)

Spec: `docs/superpowers/specs/2026-10-22-agents-page-design.md` (decisions 1–19).

## Tasks

1. Migration `1777340000000-AgentsPage`: users.title/phone/whatsapp/publicEmail,
   showOnWebsite (0), worksBuyers (1), canLogin (1); tick showOnWebsite for current
   listing agents; typed Settings website agent → no-login person + `siteAgent.userId`.
2. Pure `team/agent-profile.ts` (+ spec, test first): `agentCard`, placeholder
   emails, `accessOf`, `planAccess`. `publicSiteAgent` moved to `tenant/site-agent.ts`.
3. `AgentsService` (list/options/create/update/websiteChanged), `AgentDto`;
   `/api/dashboard/team` GET/POST/PUT use it; `/invite` kept; new ungated
   `GET /api/dashboard/agents`. TeamService: remove guard (history), stats count
   logins, reset refused without a login, website sync on remove.
4. Auth: login, forgot/reset, refresh, JWT validate, resend verification require
   `canLogin`.
5. Buyers: agent list + round-robin require `canLogin && worksBuyers`; digest and
   Odoo agent matching require `canLogin`.
6. Property public answer: `agentCard` (website people only, with contact details).
7. Tenant settings: `siteAgent.userId` → card copied from the person server-side.
8. Dashboard: `components/photo-upload.tsx`; Agents page (`team/page.tsx`,
   `team/_components/agent-dialog.tsx`, `hooks/use-agents.ts`); sidebar + Super
   Admin label; Settings website agent picker; property Agent / Sales agent lists;
   buyer Details photo upload; languages re-read on open.

## Decisions

See the spec (1–12 up front, 13–19 while building).

## Verified (2026-10-22, localhost, tenant 2)

- jest 915/915 (agent-profile 7 new, property-url updated).
- API E2E `n-api.js` (scratchpad): 38/38.
- Puppeteer `n-ui`: 16/17 — the one failure is the dashboard top bar overflowing at
  390 px on every page (Buyers and Properties too; pre-existing, For Designer). The
  Agents page content fits with the menu collapsed. Screenshots reviewed.
- Regression: e 44, f 49, g 28, h 26, i 35, j 50, j-2fa 33, k 24 (k with the fake Graph server in .env, then .env restored). L/M not re-run (AI untouched).
