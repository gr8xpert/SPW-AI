# Deploy Brochure Batch — SFTP Upload Manifest

Upload the following files/folders via SFTP, **preserving the relative paths under** `/var/www/vhosts/spw-ai.com/httpdocs/spw/`.

Then SSH as **root** and run:
```
bash /var/www/vhosts/spw-ai.com/httpdocs/spw/scripts/deploy/deploy-brochure-batch.sh
```

The script writes a full log to `/var/www/vhosts/spw-ai.com/httpdocs/deploy-brochure-output.txt` (SFTP-fetchable from `https://spw-ai.com/deploy-brochure-output.txt` after run).

---

## Upload list (12 paths)

### Top-level
- `ecosystem.config.js` — PM2 `max_memory_restart` bumped 1G → 1.5G for spm-api (Puppeteer browser pool needs the headroom).
- `pnpm-lock.yaml` — locks new deps (puppeteer, lru-cache, qrcode).
- `scripts/deploy/deploy-brochure-batch.sh` — the run-once deploy script.
- `scripts/deploy/deploy-brochure-batch.MANIFEST.md` — this file (informational).

### Shared types
- `packages/shared/src/types/tenant.types.ts` — `TenantSettings` gains `contactEmail`, `contactPhone`, `defaultBrochureVariant`.

### API
- `apps/api/package.json` — new deps: `puppeteer`, `lru-cache`, `qrcode`, `@types/qrcode`.
- `apps/api/src/app.module.ts` — registers `BrochureModule`.
- `apps/api/src/database/entities/property.entity.ts` — adds `brochureVariant` column.
- `apps/api/src/database/migrations/1776328000000-PropertyBrochureVariant.ts` — new migration (also re-confirms `1776327000000-PropertyEnergyRating` from prior batch still applies).
- `apps/api/src/modules/property/dto/create-property.dto.ts` — `brochureVariant?` DTO field.
- `apps/api/src/modules/brochure/**` — **whole new directory** (7 files):
  - `brochure.module.ts`
  - `brochure.service.ts`
  - `brochure.controller.ts`
  - `brochure-cache.service.ts`
  - `puppeteer-pool.service.ts`
  - `templates/template-context.ts`
  - `templates/layout-v1.ts`

### Dashboard
- `apps/dashboard/src/app/(dashboard)/dashboard/settings/page.tsx` — new "Brochure / PDF" card under General tab.
- `apps/dashboard/src/app/(dashboard)/dashboard/properties/[id]/page.tsx` — type field added.
- `apps/dashboard/src/app/(dashboard)/dashboard/properties/[id]/edit/page.tsx` — variant dropdown in Settings tab.
- `apps/dashboard/src/app/(dashboard)/dashboard/properties/create/page.tsx` — variant dropdown in Settings tab.

### Widget
- `apps/widget/src/components/detail/RsDetailDownloadPdf.tsx` — new component.
- `apps/widget/src/templates/detail/DetailTemplate01.tsx` — slot inside `rs-detail__sidebar-actions`.
- `apps/widget/src/styles/components.css` — `button.rs-detail-download-pdf` rule.

---

## Items 1-6 from prior batch (carry-overs from earlier sessions — re-upload defensively)

If these files weren't shipped in a separate deploy already, upload them too:

- `apps/api/src/modules/property/property-search.service.ts` — `/similar` 500 fix
- `apps/api/src/modules/tenant/tenant.service.ts` — `featureFlags` in `getPublicWidgetConfig`
- `apps/api/src/modules/feed/adapters/base.adapter.ts` — `energyRating` field on FeedProperty
- `apps/api/src/modules/feed/adapters/resales.adapter.ts` — energyRating mapping
- `apps/api/src/modules/feed/adapters/kyero.adapter.ts` — energyRating mapping
- `apps/api/src/modules/feed/feed.service.ts` — writes `energyRating` on create/update
- `apps/api/src/database/migrations/1776327000000-PropertyEnergyRating.ts` — runs in step 9
- `apps/widget/src/core/data-loader.ts` — memoized 404 probe
- `apps/widget/src/components/detail/RsDetailEnergyRating.tsx` — new component
- `apps/widget/src/components/detail/RsDetailSpecs.tsx` — removed inline energy row
- `apps/widget/src/styles/components.css` — energy CSS + `button.rs-sidebar-mortgage-btn` / `button.rs-sidebar-features__btn` specificity bumps (covered by the same file above)

---

## Why we build on the server (not upload locally-built artifacts)

- **Dashboard**: `NEXT_PUBLIC_API_URL` is baked at build time. Local `.env.local` sets it to `http://localhost:3001` — uploading a local `.next/` would break every API call on prod. Server's `.env` sets the prod URL.
- **API**: New native deps (puppeteer pulls Chromium ~280MB). `pnpm install` on server downloads the right Chromium for the server's Linux arch.
- **Widget**: Build is portable (config is runtime via embed `data-*` attrs), but rebuilding for consistency keeps everything in sync.

---

## Prod paths to verify after deploy

```
# Brochure for a known property + tenant (replace KEY + REF)
curl -I 'https://api.spw-ai.com/api/v1/properties/<REF>/brochure.pdf?lang=en&apiKey=<KEY>'

# Should respond 200, Content-Type: application/pdf, Content-Disposition: attachment.
```

Visit a real tenant's widget detail page → click **Download PDF** → confirm browser downloads `Brochure-<REF>-en.pdf` with logo + QR + contact in header/footer (assuming branded variant).
