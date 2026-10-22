# Agents page + buyer photo upload — design (2026-10-22)

Asked by the user after Buyer Match Phase 3: turn **Team** into one **Agents** page
that manages both the people shown on the website and the people who work buyers,
and replace the buyer's "Photo URL" field with an upload to R2.

## What the client gets

- Dashboard menu **Agents** (was Team), same place, same add-on (`team`).
- One list of people. Each person has a photo (uploaded to R2), name, job title,
  phone, WhatsApp, email shown on the website, and:
  - **Works with buyers** (default on): offered in the buyer Agent / Related agent
    pickers and the website round-robin. Needs a dashboard login.
  - **Show on website** (default off): offered in the property's Agent dropdown and
    shown on the property page card.
  - **Dashboard access**: Manager (admin), Agent (user) or **No login**. No-login
    people are website faces only; they don't count toward the user limit.
- Settings → Widget → Website agent becomes a picker: **None (each listing's own
  agent)** or one of the "Show on website" people. Its details are edited on the
  Agents page.
- Buyer record → Details → **Photo**: Upload / Change / Remove (R2, via the existing
  `/api/dashboard/upload`), replacing the typed Photo URL.

## Decisions

1. **Two tick-boxes, not a 3-way role.** "Role" already means Manager/Agent login
   rights; Website/Buyers are independent switches (both, either, none).
2. **People stay rows in `users`.** Buyers, properties (`agentId`, `salesAgentId`),
   tasks, viewings and lead_agents all point at users; a second table would split
   every picker. New columns on `users`: `title`, `phone`, `whatsapp`,
   `publicEmail`, `showOnWebsite` (default 0), `worksBuyers` (default 1),
   `canLogin` (default 1). Photo stays `avatarUrl`.
3. **No-login people** get a placeholder login email
   `agent-<tenant>-<random>@no-login.invalid` and an unusable password hash. Login,
   forgot/reset password and JWT validation all require `canLogin = 1`, and the login
   lookup filters on it, so a placeholder can never shadow a real login.
   Switching a person to No login ends their sessions (JWT validate re-checks).
   Giving a no-login person a login needs a real email + password.
4. **Works with buyers needs a login.** With No login the API forces
   `worksBuyers = 0`. Unticking keeps existing buyers assigned (nothing is moved);
   the person is just no longer offered or used by round-robin.
5. **Website email is `publicEmail`**, never the login email by default (login emails
   are private). Empty = no email on the card.
6. **The property page keeps today's order** (widget unchanged, no CF purge): the
   Website agent from Settings wins when set; otherwise the listing's own agent.
   The listing's agent is now public only when `showOnWebsite` is on, and then with
   title/phone/WhatsApp/email too (the widget already renders those fields).
7. **Settings stores the website agent as a snapshot + `userId`.** The server fills
   the snapshot from the person on save, and refreshes it (and bumps
   `syncVersion`) whenever that person is edited. `publicSiteAgent` and the widget
   stay as they are. Removing the person or untick "Show on website" clears it.
8. **Migration** (one, `1777340000000-AgentsPage`): adds the columns; ticks
   `showOnWebsite` for everyone who is a property's agent today (so the website shows
   exactly what it did); turns a typed Settings website agent into a No-login person
   with those details and links it by `userId`.
9. **Any website-visible change bumps `syncVersion`** (person saved while it is or was
   on the website, or removed) so the WP plugin and widget caches refresh.
10. **Property dropdowns** read a new ungated `GET /api/dashboard/agents` (the old
    `/team` call failed without the Team add-on). Agent = website people (plus the
    current one); Sales agent = everyone with a login.
11. **User limit** counts login people only.
12. **Buyer photo**: the upload accepts JPG/PNG/WebP like the agent photo; the URL
    column and avatar rendering are unchanged.

## Decisions made while building

13. **Logins made on the Agents page are verified at once** (`emailVerifiedAt = now`).
    Login refuses unverified emails and Team never sent a verify link, so people
    invited on the old Team page could never log in. Old invite route kept, same fix.
14. **Removing someone with buyer history or support tickets is refused** (the
    database deletes `lead_activities` and `tickets` with the user). The answer
    says to switch them to Inactive instead. No-login website people have no
    history, so they can always be removed.
15. **Photo address check is "http(s)://…"**, not `IsUrl`: a local API without R2
    stores uploads on the API host (`localhost`), which `IsUrl` refuses.
16. **The agents hook lives in `src/hooks/use-agents.ts`**: the Agents page,
    Settings and both property forms use it.
17. **Buyer languages are re-read each time a screen opens** (was kept 10 min):
    the only way found for the buyer Language dropdown to show more languages than
    Settings → General has (user report, 2 vs 4) is a list remembered from before
    languages were removed in the same session. Not reproduced; asked for a
    screenshot.
18. **People without a login get no daily email and never match an Odoo import
    agent** (both now require `canLogin`).
19. Super Admin add-on label "Team Management" → "Agents" (key stays `team`).

## Out of scope

- Per-listing choice between Settings agent and listing agent (decision 6).
- Self-service profile editing of the new fields (managers edit on Agents).
