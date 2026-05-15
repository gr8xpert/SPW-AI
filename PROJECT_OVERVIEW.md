# SPW (Smart Property Widget) — Project Overview

> A multi-tenant real estate SaaS platform that provides property management, CRM, AI-powered chat, email campaigns, and an embeddable property search widget for real estate agencies.

**Production URL:** spw-ai.com
**License:** Proprietary

---

## Table of Contents

1. [What Is SPW?](#what-is-spw)
2. [Architecture Overview](#architecture-overview)
3. [Tech Stack](#tech-stack)
4. [Monorepo Structure](#monorepo-structure)
5. [Apps & Packages](#apps--packages)
6. [Database Schema](#database-schema)
7. [Authentication & Authorization](#authentication--authorization)
8. [Multi-Tenancy Model](#multi-tenancy-model)
9. [API Endpoints](#api-endpoints)
10. [Widget System](#widget-system)
11. [Dashboard Features](#dashboard-features)
12. [Payment & Billing](#payment--billing)
13. [AI Features](#ai-features)
14. [Email System](#email-system)
15. [Image Storage](#image-storage)
16. [Deployment & Infrastructure](#deployment--infrastructure)
17. [Environment Variables](#environment-variables)
18. [Security](#security)
19. [Monitoring & Observability](#monitoring--observability)
20. [Pros & Cons](#pros--cons)
21. [Development Setup](#development-setup)
22. [Useful Commands](#useful-commands)

---

## What Is SPW?

SPW is a **B2B SaaS platform for real estate agencies**. Each agency (tenant) gets:

- A **dashboard** to manage properties, leads, contacts, and campaigns
- An **embeddable widget** they paste onto their website — visitors can search/filter properties, save favorites, and chat with an AI assistant
- **CRM tools** for tracking leads through a sales pipeline
- **Email campaign** capabilities with custom SMTP and DKIM
- **Subscription billing** (Paddle for widget plans, Stripe for credit hours)

The platform is designed for **500+ concurrent tenants**, each fully isolated at the data level.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        Client Websites                           │
│   <script src="spw-widget.umd.js"></script>                     │
│   Widget renders property search, filters, AI chat              │
└────────────────────────┬─────────────────────────────────────────┘
                         │ API Key auth
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Nginx Reverse Proxy                           │
│              TLS termination, routing, static files              │
├──────────────┬───────────────────────────────┬───────────────────┤
│              │                               │                   │
│   :3000      ▼                    :3001      ▼                   │
│ ┌─────────────────┐          ┌─────────────────────┐             │
│ │   Dashboard     │          │      API Server     │             │
│ │   (Next.js 14)  │◄────────►│     (NestJS 10)     │             │
│ │   App Router    │  fetch   │  TypeORM + MySQL     │             │
│ │   TailwindCSS   │          │  BullMQ + Redis      │             │
│ └─────────────────┘          └──────┬──────────────┘             │
│                                     │                            │
│                          ┌──────────┼──────────┐                 │
│                          ▼          ▼          ▼                  │
│                     ┌────────┐ ┌────────┐ ┌──────────┐           │
│                     │ MySQL  │ │ Redis  │ │ R2 (S3)  │           │
│                     │  8.0   │ │  7+    │ │  Images  │           │
│                     └────────┘ └────────┘ └──────────┘           │
└──────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Backend (API)

| Technology | Version | Purpose |
|---|---|---|
| **NestJS** | 10.3 | REST API framework with modules, guards, interceptors |
| **TypeORM** | 0.3.x | MySQL ORM with migrations, relations, decorators |
| **MySQL** | 8.0 | Primary relational database |
| **Redis** | 7+ | Caching, session store, rate limiter backend, BullMQ broker |
| **BullMQ** | 5.73 | Job queues for async tasks (email sends, feed imports) |
| **Passport + JWT** | — | Authentication with access/refresh token pattern |
| **@aws-sdk/client-s3** | — | Cloudflare R2 / S3-compatible image storage |
| **class-validator** | — | DTO validation decorators |
| **class-transformer** | — | Serialization/exclusion of sensitive fields |
| **Helmet** | — | HTTP security headers |
| **@nestjs/throttler** | — | Rate limiting backed by Redis |

### Frontend (Dashboard)

| Technology | Version | Purpose |
|---|---|---|
| **Next.js** | 14.1.4 | React framework with App Router, SSR, API routes |
| **React** | 18.2 | UI rendering |
| **NextAuth** | 4.24.7 | Session management (wraps JWT from API) |
| **TailwindCSS** | 3.4.1 | Utility-first CSS |
| **Radix UI** | — | Accessible, unstyled component primitives |
| **React Hook Form** | — | Form state management |
| **Zod** | — | Schema validation (forms + API responses) |
| **React Query** | — | Server state management, caching, mutations |
| **Zustand** | — | Client state management |
| **Recharts** | — | Dashboard analytics charts |
| **Framer Motion** | — | Page/component animations |

### Widget

| Technology | Version | Purpose |
|---|---|---|
| **Preact** | 10.25 | Lightweight React alternative (3KB gzip) for embed |
| **Vite** | 5.1.4 | Build tool — outputs UMD + ES bundles |
| **Zustand** | — | Widget state management |
| **IndexedDB** | — | Offline-capable favorites/cache |

### DevOps & Tooling

| Technology | Purpose |
|---|---|
| **pnpm** 8.15 | Package manager (workspace support) |
| **Turborepo** | Monorepo build orchestration with caching |
| **TypeScript** 5.x | Type safety across all apps |
| **PM2** | Process manager (cluster mode for API) |
| **Docker + Compose** | Containerized dev/prod environments |
| **Nginx** | Reverse proxy, TLS, static file serving |
| **ESLint + Prettier** | Linting and formatting |

---

## Monorepo Structure

```
spw/
├── apps/
│   ├── api/                    # NestJS REST API
│   │   ├── src/
│   │   │   ├── modules/        # Feature modules (auth, properties, leads, etc.)
│   │   │   ├── common/         # Guards, filters, interceptors, decorators
│   │   │   ├── config/         # App configuration
│   │   │   └── main.ts         # Bootstrap
│   │   ├── .env.example
│   │   └── package.json
│   │
│   ├── dashboard/              # Next.js 14 admin panel
│   │   ├── src/
│   │   │   ├── app/            # App Router pages
│   │   │   │   ├── (auth)/     # Login, register, verify
│   │   │   │   ├── (dashboard)/ # Tenant dashboard routes
│   │   │   │   └── (admin)/    # Super admin routes
│   │   │   ├── components/     # Shared UI components
│   │   │   ├── lib/            # API client, hooks, utilities
│   │   │   └── stores/         # Zustand stores
│   │   └── package.json
│   │
│   └── widget/                 # Preact embeddable widget
│       ├── src/
│       │   ├── components/     # Search, listing, detail, chat views
│       │   ├── store.ts        # Zustand state
│       │   ├── api-client.ts   # API communication
│       │   ├── dom-scanner.ts  # Detects widget placeholders in host page
│       │   └── data-loader.ts  # Async data fetching with cache
│       └── package.json
│
├── packages/
│   ├── shared/                 # Shared TypeScript types and utilities
│   │   ├── src/
│   │   │   ├── types/          # JwtPayload, UserRole, TenantSettings, etc.
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── wp-plugin/              # WordPress integration plugin
│
├── turbo.json                  # Turborepo pipeline config
├── pnpm-workspace.yaml         # Workspace definition
├── docker-compose.yml          # Dev services (MySQL, Redis)
├── docker-compose.prod.yml     # Production services
├── ecosystem.config.js         # PM2 process config
└── package.json                # Root scripts
```

---

## Apps & Packages

### `apps/api` — NestJS REST API

The core backend. Handles all business logic, data access, authentication, billing webhooks, and AI chat streaming.

**Key modules:**
- `auth` — JWT login/register, email verification, refresh tokens
- `properties` — CRUD with audit logging, field locking, sold/rented status
- `leads` — CRM pipeline (new → contacted → qualified → viewing → offer → won/lost)
- `contacts` — Inquiry management
- `tenants` — Multi-tenant isolation, feature flags, settings
- `billing` — Paddle + Stripe checkout, webhook processing
- `credits` — Credit hour balance, packages, transactions
- `email-campaigns` — Bulk email with custom SMTP, DKIM, suppression
- `feeds` — XML property feed import/export
- `ai-chat` — LLM-powered property assistant with streaming (SSE)
- `uploads` — File management with R2/S3
- `analytics` — Event tracking, search metrics
- `health` — Liveness + readiness probes
- `admin` — Super admin endpoints (clients, plans, audit log, queue depth)

### `apps/dashboard` — Next.js 14 Dashboard

The web application tenants and admins use to manage everything.

**Route groups:**
- `(auth)` — Login, registration, email verification
- `(dashboard)` — Tenant-facing: properties, leads, contacts, feeds, campaigns, billing, analytics, AI chat, settings
- `(admin)` — Super admin: client management, plans, credits, subscriptions, audit logs, tickets, rate limits, queue monitoring

### `apps/widget` — Embeddable Property Search Widget

A Preact-based widget that real estate agencies embed on their websites via a `<script>` tag.

**Capabilities:**
- Property search with advanced filters (price, bedrooms, type, location)
- Grid/list/map view modes
- Property detail pages with image gallery
- Favorites/wishlist (persisted in IndexedDB)
- AI chat assistant for property questions
- Multi-language support
- Theme customization (light/dark/auto)
- 60-second auto-sync for new listings
- 40+ configuration options

### `packages/shared` — Shared Types

Shared TypeScript types consumed by all apps:
- `JwtPayload`, `UserRole`, `UserRoleType`
- `TenantSettings`, `TenantFeatureFlags`
- `SubscriptionStatus`, `BillingCycle`, `BillingSource`
- Widget configuration interfaces

### `packages/wp-plugin` — WordPress Plugin

A WordPress plugin that simplifies widget installation for agencies using WordPress.

---

## Database Schema

**38 entities** organized into domains:

### Core

| Entity | Purpose |
|---|---|
| `Tenant` | Multi-tenant root. Has apiKeyHash, slug, domain, subscriptionStatus, featureFlags, settings, webhookUrl |
| `User` | Auth users. Roles: SUPER_ADMIN, WEBMASTER, ADMIN, USER. Unique on (tenantId, email) |
| `RefreshToken` | JWT refresh token storage with tenant isolation |
| `EmailVerificationToken` | Email verification flow tokens |

### Properties

| Entity | Purpose |
|---|---|
| `Property` | Real estate listings. Status: draft/published/sold/rented. Has images, price, bedrooms, bathrooms, area, description, coordinates |
| `PropertyType` | Classification (apartment, villa, townhouse, etc.) |
| `PropertyTypeGroup` | Grouping of property types |
| `Location` | Geographic hierarchy (country → region → city → area) |
| `LocationGroup` | Location grouping for filters |
| `Label` | Custom tags on properties |

### CRM

| Entity | Purpose |
|---|---|
| `Lead` | Sales pipeline. Source: widget_inquiry/phone/email/walkin/referral. Status: new → contacted → qualified → viewing_scheduled → offer_made → negotiating → won/lost |
| `LeadActivity` | Activity log: note/call/email/sms/viewing/offer/meeting/status_change |
| `Contact` | Contact info from inquiries |
| `Ticket` | Support tickets |

### Billing

| Entity | Purpose |
|---|---|
| `Plan` | Subscription tiers with feature limits |
| `SubscriptionPayment` | Payment records (Paddle/Stripe) |
| `CreditBalance` | Credit hour balance per tenant |
| `CreditPackage` | Purchasable credit packs |
| `CreditTransaction` | Credit consumption log |
| `ProcessedPaddleEvent` | Webhook idempotency for Paddle |
| `ProcessedStripeEvent` | Webhook idempotency for Stripe |

### Content & Feeds

| Entity | Purpose |
|---|---|
| `Feed` | Property feed source (XML/API import) |
| `FeedConfig` | Per-tenant feed configuration |
| `FeedExport` | Export queue |
| `FeedImportLog` | Import history with error tracking |
| `EmailCampaign` | Email marketing campaigns |

### AI & Chat

| Entity | Purpose |
|---|---|
| `ChatConversation` | AI chat sessions |
| `ChatMessage` | Individual messages in conversations |

### System

| Entity | Purpose |
|---|---|
| `Analytics` | Event tracking (searches, clicks, views) |
| `AuditLog` | Compliance audit trail |
| `MigrationJob` | Data import jobs |
| `LicenseKey` | Widget license keys per tenant |
| `TenantEmailDomain` | Custom email domain verification |
| `Upload` | File/image upload records |
| `WebhookDelivery` | Outbound webhook audit trail |

---

## Authentication & Authorization

### Flow

```
1. POST /api/auth/login  →  { accessToken (7d), refreshToken (30d), user }
2. Client stores tokens, sends Authorization: Bearer <accessToken>
3. When access token expires → POST /api/auth/refresh with refreshToken
4. POST /api/auth/logout  →  invalidates refresh token
```

### Guards

| Guard | Purpose |
|---|---|
| `JwtAuthGuard` | Validates JWT on protected routes |
| `TenantGuard` | Ensures user can only access their own tenant's data |
| `RolesGuard` | Checks user role against required roles on the route |
| `ApiKeyGuard` | Validates tenant API key for public/widget endpoints |

### Roles

| Role | Access Level |
|---|---|
| `SUPER_ADMIN` | Full platform access, can manage all tenants |
| `WEBMASTER` | Manages multiple tenant accounts |
| `ADMIN` | Full access within their tenant |
| `USER` | Limited access within their tenant |

### Email Verification

New accounts must verify email before login. Resend throttled to 3 requests per 5 minutes.

---

## Multi-Tenancy Model

**Isolation:** Single database, row-level isolation via `tenantId` foreign key on all tenant-scoped entities.

```
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│   Tenant A    │     │   Tenant B    │     │   Tenant C    │
│ (Agency X)    │     │ (Agency Y)    │     │ (Agency Z)    │
├───────────────┤     ├───────────────┤     ├───────────────┤
│ Properties    │     │ Properties    │     │ Properties    │
│ Leads         │     │ Leads         │     │ Leads         │
│ Users         │     │ Users         │     │ Users         │
│ Campaigns     │     │ Campaigns     │     │ Campaigns     │
│ Settings      │     │ Settings      │     │ Settings      │
└───────────────┘     └───────────────┘     └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
                    ┌──────────────────┐
                    │   Shared MySQL   │
                    │   Database       │
                    │  (tenantId FK)   │
                    └──────────────────┘
```

**Tenant identification:**
- Dashboard: JWT contains `tenantId`, enforced by `TenantGuard`
- Widget: API key in request header → looked up via SHA256 hash → resolves `tenantId`

**Tenant features:**
- `subscriptionStatus`: active | grace (7-day buffer) | expired | manual | internal
- `featureFlags`: JSON object toggling features per tenant
- `widgetFeatures`: array of enabled widget capabilities
- `settings`: JSON object for tenant-specific configuration

---

## API Endpoints

### Authentication

```
POST   /api/auth/login                  Rate: 5/min
POST   /api/auth/register               Rate: 10/min
POST   /api/auth/refresh
POST   /api/auth/logout
POST   /api/auth/verify-email
POST   /api/auth/resend-verification    Rate: 3/5min
GET    /api/auth/me                     JWT protected
```

### Properties (Dashboard)

```
GET    /api/dashboard/properties         Paginated list
GET    /api/dashboard/properties/search  Advanced search
GET    /api/dashboard/properties/:id
POST   /api/dashboard/properties         Create
PUT    /api/dashboard/properties/:id     Update + audit log
DELETE /api/dashboard/properties/:id
POST   /api/dashboard/properties/:id/lock
POST   /api/dashboard/properties/:id/unlock
POST   /api/dashboard/properties/:id/sold
```

### Leads (CRM)

```
GET    /api/dashboard/leads
GET    /api/dashboard/leads/:id
POST   /api/dashboard/leads
PUT    /api/dashboard/leads/:id
DELETE /api/dashboard/leads/:id
POST   /api/dashboard/leads/:id/activities
```

### AI Chat (Widget — API Key auth)

```
POST   /api/v1/chat                     Streaming SSE, Rate: 10/min
GET    /api/v1/chat/:id                 Get conversation
POST   /api/v1/chat/:id/email           Email transcript, Rate: 3/hr
```

### Billing

```
POST   /api/billing/checkout            Initiate Paddle/Stripe checkout
POST   /api/payment/paddle-webhook      Paddle webhook receiver
POST   /api/payment/stripe-webhook      Stripe webhook receiver
```

### Email Campaigns

```
GET    /api/dashboard/email-config
PUT    /api/dashboard/email-config
POST   /api/dashboard/email-config/test
GET    /api/dashboard/email-templates
POST   /api/dashboard/email-templates
GET    /api/dashboard/email-campaigns
POST   /api/dashboard/email-campaigns
POST   /api/dashboard/email-campaigns/:id/send
POST   /api/dashboard/email-campaigns/:id/cancel
```

### Admin (Super Admin only)

```
/api/admin/clients              Tenant CRUD
/api/admin/plans                Plan management
/api/admin/credits              Credit administration
/api/admin/subscriptions        Subscription oversight
/api/admin/audit-log            Audit trail
/api/admin/queue-depth          BullMQ monitoring
/api/admin/rate-limits          Throttler stats
```

### Health

```
GET    /api/health/live     Process alive (no dependency checks)
GET    /api/health/ready    Ready to serve (checks DB, Redis, BullMQ)
GET    /api/health          Alias for /ready
```

---

## Widget System

### How It Works

1. Agency pastes a script tag on their website
2. Widget loads as a UMD bundle (~50KB gzipped)
3. DOM scanner finds placeholder elements
4. Preact renders search UI, filters, listings, detail views, chat
5. All data fetched from SPW API using the agency's API key

### Integration Example

```html
<!-- Paste in website HTML -->
<div id="spw-widget"></div>
<script src="https://cdn.spw-ai.com/spw-widget.umd.js"></script>
<script>
  window.RealtySoftConfig = {
    apiUrl: "https://api.spw-ai.com",
    apiKey: "tenant-api-key-here",
    currency: "EUR",
    resultsPerPage: 12,
    enableFavorites: true,
    enableChat: true,
    theme: "light",
    language: "en",
    // 40+ more options...
  };
</script>
```

### Widget Features

- **Property search** — filters by price range, bedrooms, bathrooms, property type, location
- **View modes** — grid, list, map (Google Maps / Nominatim)
- **Property details** — image gallery, description, specs, location map, inquiry form
- **Favorites** — persisted in IndexedDB, works offline
- **AI chat** — streaming responses via SSE, property-aware
- **Auto-sync** — polls every 60 seconds for new listings
- **Theming** — light, dark, auto (follows OS preference)
- **Multi-language** — configurable per tenant
- **SEO-friendly URLs** — `/property/luxury-villa-marbella-12345`
- **Responsive** — mobile-first design

---

## Dashboard Features

### Tenant Dashboard

| Feature | Description |
|---|---|
| **Properties** | Full CRUD with image upload, field locking, audit trail, bulk actions |
| **Leads** | CRM pipeline with stages, activity log, assignment, lead scoring |
| **Contacts** | Contact management from widget inquiries |
| **Locations** | Geographic hierarchy (country/region/city/area) management |
| **Labels** | Custom property tags for filtering |
| **Feeds** | XML property feed import/export configuration |
| **Campaigns** | Email marketing with templates, scheduling, analytics |
| **AI Chat** | View chat transcripts, analytics, conversation history |
| **Analytics** | Search metrics, click tracking, conversion funnels |
| **Billing** | Subscription management, credit purchases, payment history |
| **Settings** | Widget config, API keys, email domains, feature toggles |
| **Profile** | User settings, password change, 2FA setup |

### Super Admin Panel

| Feature | Description |
|---|---|
| **Clients** | Create/edit/delete tenants, manage API keys, license keys |
| **Plans** | Define subscription tiers with feature limits |
| **Credits** | Manage credit packages and balances |
| **Subscriptions** | Monitor all active subscriptions |
| **Webmasters** | External account management |
| **Audit Log** | Full platform audit trail |
| **Tickets** | Support ticket queue |
| **Rate Limits** | View/manage API throttling |
| **Queue Depth** | Monitor BullMQ job queues |
| **Suppressions** | Email bounce/unsubscribe management |

---

## Payment & Billing

### Dual Payment Provider

| Provider | Purpose | Model |
|---|---|---|
| **Paddle** | Widget subscriptions | Monthly/yearly recurring |
| **Stripe** | Credit hour purchases | One-time payments |

### Paddle (Subscriptions)

- Handles checkout, subscription lifecycle, upgrades, cancellations
- Webhook events: `subscription_created`, `subscription_updated`, `transaction_completed`
- 7-day grace period when subscription lapses
- Idempotent processing via `ProcessedPaddleEvent` table

### Stripe (Credits)

- Credit hour system for metered features (AI chat, email campaigns)
- Checkout session creation → payment → credit balance update
- Webhook events: `payment_intent.succeeded`, `charge.refunded`
- Idempotent processing via `ProcessedStripeEvent` table

### Credit System

- `CreditBalance` — current hours per tenant
- `CreditPackage` — purchasable packs (e.g., 10 hours for $29)
- `CreditTransaction` — consumption log (deducted per AI chat message, per email sent)

---

## AI Features

### AI Chat Assistant

An LLM-powered chat widget embedded in the property search widget. Visitors can ask questions about properties, get recommendations, and receive contextual answers.

- **Streaming:** Server-Sent Events (SSE) for real-time token delivery
- **Context-aware:** Has access to the tenant's property data
- **Persistent:** Conversations saved in `ChatConversation` + `ChatMessage` entities
- **Email transcript:** Users can email themselves the conversation
- **Analytics:** Chat engagement metrics tracked

### Rate Limits

- 10 messages per minute per session
- 3 email transcript requests per hour

---

## Email System

### System Emails (Platform)

- Email verification on registration
- Password reset
- Sent via configured SMTP (falls back to console logging if SMTP not configured)

### Tenant Email Campaigns

- **Custom SMTP:** Each tenant configures their own mail server
- **DKIM support:** Signed emails for deliverability
- **Templates:** HTML email templates with variable substitution
- **Bulk send:** Via BullMQ job queue for async processing
- **Suppression list:** Automatic bounce/unsubscribe handling
- **Domain verification:** `TenantEmailDomain` entity for sender authentication
- **Scheduling:** Campaign scheduling with send/cancel controls
- **Segmentation:** Target contacts by labels

---

## Image Storage

### Cloudflare R2 (S3-compatible)

- Images uploaded to R2 via `@aws-sdk/client-s3`
- Served through CDN URL for fast global delivery
- Supports WebP conversion for optimization
- `Upload` entity tracks file metadata
- Property images referenced in `PropertyImage` relation

### Configuration

```env
DEFAULT_S3_BUCKET=images
DEFAULT_S3_REGION=auto
DEFAULT_S3_ACCESS_KEY=<key>
DEFAULT_S3_SECRET_KEY=<secret>
DEFAULT_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
DEFAULT_CDN_URL=https://images.spw-ai.com
```

---

## Deployment & Infrastructure

### Production Architecture

```
Server: Ubuntu 22.04+ / VPS (24-core, 128GB RAM target for 500+ tenants)

┌─────────────────────────────────────────────┐
│                 Nginx                        │
│   TLS termination, reverse proxy            │
│   :443 → :3000 (dashboard)                  │
│   :443 → :3001 (API)                        │
│   Static: widget UMD bundle                 │
├─────────────────────────────────────────────┤
│        PM2 Process Manager                   │
│   ┌──────────────┐  ┌──────────────────┐    │
│   │ spm-api (x2) │  │ spm-dashboard    │    │
│   │ cluster mode │  │ fork mode        │    │
│   │ max 1GB each │  │ max 1GB          │    │
│   └──────────────┘  └──────────────────┘    │
├─────────────────────────────────────────────┤
│   MySQL 8.0  │  Redis 7+  │  R2 (images)   │
└─────────────────────────────────────────────┘
```

### PM2 Ecosystem

```javascript
// ecosystem.config.js
{
  apps: [
    {
      name: 'spm-api',
      instances: 2,         // Cluster mode for load balancing
      exec_mode: 'cluster',
      max_memory_restart: '1G'
    },
    {
      name: 'spm-dashboard',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '1G'
    }
  ]
}
```

### Deploy Process

> **Important:** There is no git on the production server. Code is uploaded via FTP/SFTP.
> See `DEPLOYMENT.md` for the full pre/post-deploy checklist and rollback.

1. Build locally: `pnpm deploy:build`
2. Upload built artifacts (`apps/api/dist/`, `apps/dashboard/.next/`,
   `apps/widget/dist/`, `packages/shared/dist/`) via FTP/SFTP. Upload
   new migration source files too (`apps/api/src/database/migrations/*.ts`).
3. SSH into server.
4. `pnpm install --frozen-lockfile` (only if lockfile changed).
5. `pnpm db:migrate` (only if migrations changed). Equivalent to
   `pnpm --filter api migration:run`.
6. `pm2 restart api dashboard` (omit `dashboard` if its build didn't change).
7. `pm2 logs api --lines 100` — confirm boot audit passes.

### Docker Alternative

```bash
# Development
docker-compose up -d          # MySQL + Redis

# Production
docker-compose -f docker-compose.prod.yml up -d
# Brings up MySQL, Redis, API, Dashboard, Widget static server
```

---

## Environment Variables

### Required (Production)

```env
# ── Application ──
NODE_ENV=production
API_URL=https://api.spw-ai.com
DASHBOARD_URL=https://dashboard.spw-ai.com

# ── Database ──
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_NAME=spm_v2
DATABASE_USER=spw_user
DATABASE_PASSWORD=<strong-password>
DATABASE_POOL_SIZE=20

# ── Redis ──
REDIS_HOST=localhost
REDIS_PORT=6379

# ── JWT (generate: openssl rand -base64 48) ──
JWT_SECRET=<32+ characters>
JWT_REFRESH_SECRET=<32+ characters>
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# ── Encryption (exactly 32 chars: openssl rand -base64 24 | head -c 32) ──
ENCRYPTION_KEY=<exactly 32 characters>

# ── SMTP (System emails) ──
SMTP_HOST=mail.server.com
SMTP_PORT=587
SMTP_USER=noreply@spw-ai.com
SMTP_PASSWORD=<password>
SMTP_SECURE=false
SMTP_FROM=noreply@spw-ai.com
SMTP_FROM_NAME=Smart Property Manager

# ── Paddle (Widget subscriptions) ──
PADDLE_API_KEY=pdl_live_...
PADDLE_WEBHOOK_SECRET=pdl_ntfset_...
PADDLE_API_URL=https://api.paddle.com

# ── Stripe (Credit purchases) ──
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# ── Cloudflare R2 (Image storage) ──
DEFAULT_S3_BUCKET=images
DEFAULT_S3_REGION=auto
DEFAULT_S3_ACCESS_KEY=<key>
DEFAULT_S3_SECRET_KEY=<secret>
DEFAULT_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
DEFAULT_CDN_URL=https://images.spw-ai.com
```

---

## Security

### Authentication

- JWT with separate access (7d) and refresh (30d) tokens
- Refresh token rotation on use
- Email verification required before account activation
- Two-factor authentication support (TOTP)

### API Protection

- Rate limiting via Redis-backed throttler (per IP and API key)
- API keys stored as SHA256 hashes (never plaintext)
- CORS configuration
- Helmet.js for security headers (X-Frame-Options, CSP, HSTS, etc.)
- Request ID middleware for trace correlation

### Data Protection

- AES-256-GCM encryption for sensitive fields (webhook secrets, API keys)
- `@Exclude()` decorator on sensitive fields prevents serialization leaks
- Database charset: utf8mb4, timezone: UTC
- Parameterized queries via TypeORM (SQL injection prevention)

### Webhook Security

- HMAC signature validation for Paddle and Stripe webhooks
- Idempotency via event deduplication tables
- Webhook delivery audit trail for outbound webhooks

---

## Monitoring & Observability

### Health Checks

```
GET /api/health/live   →  Process alive, no dependency check
GET /api/health/ready  →  DB + Redis + BullMQ all healthy
```

### Logging

- Request ID middleware for distributed tracing
- Standardized error response format via exception filters
- PM2 manages log rotation for stdout/stderr
- Optional database query logging for debugging

### Queue Monitoring

- BullMQ dashboard via `/api/admin/queue-depth`
- Tracks: email sends, feed imports/exports, migration jobs

---

## Pros & Cons

### Pros

| Area | Advantage |
|---|---|
| **Full-stack TypeScript** | Single language across API, dashboard, widget, and shared types. Reduces context switching and enables type sharing |
| **Multi-tenancy** | Row-level isolation is simple, cost-effective, and scales well up to hundreds of tenants without per-tenant infrastructure |
| **Monorepo** | Turborepo + pnpm workspaces enables atomic changes across API/dashboard/widget with shared types |
| **Widget architecture** | Preact keeps bundle tiny (~50KB). UMD format works on any website. No framework dependency for the host page |
| **Dual payment** | Paddle for subscriptions (handles tax/invoicing), Stripe for one-time credits — best of both worlds |
| **Job queues** | BullMQ + Redis for async work (email, imports) prevents API blocking and enables retry/failure handling |
| **Webhook idempotency** | Deduplication tables prevent double-processing of payment events — critical for billing integrity |
| **AI chat** | SSE streaming gives real-time feel. Conversation persistence enables analytics and email transcripts |
| **Comprehensive CRM** | Full lead pipeline with activity tracking — agencies don't need a separate CRM tool |
| **Email campaigns** | Per-tenant SMTP + DKIM means emails come from the agency's domain, not ours — better deliverability |
| **Security** | JWT rotation, encrypted secrets, rate limiting, audit logging — production-grade from day one |
| **Docker + PM2** | Flexible deployment: containerized or bare-metal with PM2 cluster mode |

### Cons

| Area | Limitation |
|---|---|
| **Single database** | All tenants share one MySQL instance. A noisy tenant can impact others. No per-tenant database isolation |
| **No git on server** | FTP/SFTP deployment is manual and error-prone. No CI/CD pipeline for automated deploys |
| **MySQL over PostgreSQL** | MySQL lacks JSONB indexing, CTEs are slower, no native array types. TypeORM mitigates some gaps but PostgreSQL would be more feature-rich |
| **TypeORM** | TypeORM has known maintenance concerns and quirks. Prisma or Drizzle would offer better DX and type safety |
| **No test suite** | No visible test infrastructure (unit, integration, or E2E). This is a significant risk for a multi-tenant SaaS |
| **Monolith API** | All modules in one NestJS app. As tenant count grows, may need to split into microservices (billing, email, feeds) |
| **Widget bundle** | Single UMD bundle means all features load even if tenant only uses search. Tree-shaking limited |
| **No WebSocket** | Real-time features rely on polling (60s widget sync). WebSocket would reduce latency for live updates |
| **Redis single instance** | No Redis Sentinel/Cluster. Redis failure takes down rate limiting, caching, and job queues simultaneously |
| **Manual migrations** | TypeORM migrations must be run manually during deploy. No automated migration pipeline |
| **No CDN for dashboard** | Dashboard is server-rendered but could benefit from edge caching (Vercel, Cloudflare Pages) |
| **Feed imports synchronous risk** | Large XML feed imports could block BullMQ workers if not properly chunked |

### Technical Debt & Improvement Opportunities

| Area | Suggestion |
|---|---|
| Testing | API has a Jest unit suite (~56 tests covering security/crypto/quota/SSRF/subscription/cron) and an e2e Jest suite (`apps/api/test/`) that requires MySQL + Redis. Coverage is partial — dashboard has no automated tests, widget has typecheck-only. Add Playwright E2E for dashboard and Vitest for widget. |
| CI/CD | GitHub Actions pipeline: lint → test → build → deploy (SFTP or Docker push). Today the deploy is operator-driven via SFTP+PM2 — see `DEPLOYMENT.md`. |
| Database | Add read replicas for query-heavy tenants. Consider tenant-aware connection pooling |
| Caching | Add Redis caching layer for property listings (cache invalidation on update) |
| WebSocket | Replace polling with WebSocket for real-time property updates and chat |
| Widget code splitting | Lazy-load chat, map, and detail components to reduce initial bundle |
| Monitoring | Add Sentry for error tracking, Prometheus + Grafana for metrics |
| Rate limiting | ~~Per-tenant rate limits (not just per-IP)~~ — done via `ApiKeyThrottlerGuard` on every `/api/v1/*` widget endpoint plus per-endpoint @Throttle ceilings on write paths. |

---

## Development Setup

### Prerequisites

- Node.js 20+
- pnpm 8.15+
- MySQL 8.0 (or Docker)
- Redis 7+ (or Docker)

### Quick Start

```bash
# 1. Clone and install
git clone <repo-url>
cd spw
pnpm install

# 2. Start infrastructure (Docker)
docker-compose up -d    # MySQL + Redis

# 3. Configure environment
cp apps/api/.env.example apps/api/.env
# Edit .env with your database/Redis credentials

# 4. Run database migrations
cd apps/api && pnpm migration:run

# 5. Start all apps (dev mode)
pnpm dev                # Turbo runs all apps in parallel

# API:       http://localhost:3001
# Dashboard: http://localhost:3000
# Widget:    http://localhost:5173 (Vite dev server)
```

---

## Useful Commands

```bash
# Development
pnpm dev                    # Start all apps in dev mode
pnpm build                  # Build all apps
pnpm lint                   # Lint all packages
pnpm typecheck              # TypeScript check all packages

# API specific
cd apps/api
pnpm migration:generate     # Generate new migration
pnpm migration:run          # Run pending migrations
pnpm migration:revert       # Revert last migration

# Production
pnpm deploy:build           # Production build (all apps)
pm2 start ecosystem.config.js --env production
pm2 restart all
pm2 logs spm-api
pm2 monit

# Docker
docker-compose up -d                          # Dev infra
docker-compose -f docker-compose.prod.yml up -d  # Full prod
```

---

## Contact

- **Platform Owner:** webmaster@realtysoft.eu
- **Project:** SPW (Smart Property Widget) by RealtySoft

---

*Last updated: 2026-05-09*
