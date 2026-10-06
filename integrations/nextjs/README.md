# SPM on a Next.js website (App Router)

Everything the WordPress plugin does, for a Next.js 14/15 site:

- Properties, search, maps, wishlist and carousels: the same blocks as any site, following **Website Design** in the SPM dashboard.
- Page changes through `<Link>` / `router.push`: blocks on the new page draw at once, without reloading the widget. Cards, "Back to results" and Search use the Next.js router too.
- **SEO** on every property page, in the HTML from the server:
  - the agent's Meta Title / Description, or the title and description;
  - canonical address;
  - Google and social preview tags (Open Graph, Twitter);
  - schema.org structured data.
- **Sitemap**: every published property in `/sitemap.xml`.
- A sold or removed property returns a real 404.

Tested with Next.js 14.2: building, server-rendered meta tags, the sitemap, and `<Link>` navigation with back/forward.

## 1. Copy the files

```
spm/config.ts       settings from environment variables
spm/SpmWidget.tsx   loads the widget once and follows the router (client component)
spm/SpmBlock.tsx    one SPM block
spm/server.ts       SEO, sitemap and widget-version helpers (server only)
```

Put the `spm` folder at the project root, so that the `@/spm/...` imports work (the default `@/*` path alias). The `example/app` folder shows each page.

## 2. Settings: `.env.local`, and the same in your host's environment

```
NEXT_PUBLIC_SPM_KEY=spm_...                  # SPM dashboard → Settings → API Keys
NEXT_PUBLIC_SITE_URL=https://www.example.com # for canonical addresses and the sitemap
# Optional:
NEXT_PUBLIC_SPM_PROPERTY_SLUG=property       # the folder property pages live in
```

The key is the site's public widget key, which every page with the widget shows anyway.

## 3. Root layout: once, at the end of `<body>`

```tsx
// app/layout.tsx
import { SpmWidget } from '@/spm/SpmWidget';
import { spmWidgetVersion } from '@/spm/server';
import { SPM } from '@/spm/config';

export const metadata = { metadataBase: SPM.siteUrl ? new URL(SPM.siteUrl) : undefined };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <SpmWidget version={await spmWidgetVersion()} resultsPage="/properties" />
      </body>
    </html>
  );
}
```

`SpmWidget` takes these options:

| Option | What it does |
|---|---|
| `resultsPage` | Where Search sends visitors from pages without a listing. |
| `language` | e.g. `"es"`, for a Spanish site or section. |
| `currency` | Display currency. |

## 4. Blocks wherever properties should appear

```tsx
import { SpmBlock } from '@/spm/SpmBlock';

<SpmBlock widget="site-search" />
<SpmBlock widget="site-listing" />
<SpmBlock widget="site-carousel" />
<SpmBlock widget="site-listing" options={{ location: 'Marbella', limit: 6, 'own-search': true }} />
```

Block names and options are the same as on **Add to Website** in the dashboard.

## 5. Property page: `app/property/[slug]/page.tsx`

See `example/app/property/[slug]/page.tsx`. It uses `generateMetadata` → `spmPropertyMetadata(slug, { siteName })`, the JSON-LD script, `notFound()` for an unknown property, and `<SpmBlock widget="site-detail" />`.

If property pages live under another folder (e.g. `/propiedad/[slug]`), set `NEXT_PUBLIC_SPM_PROPERTY_SLUG` to that name.

## 6. Sitemap: `app/sitemap.ts`

See `example/app/sitemap.ts`. Add your own pages to the list.

## Notes

- **Static export** (`output: 'export'`) works for the blocks, but property pages then can't be rendered per property on the server. Keep the property route dynamic (the default) for SEO.
- **Multi-language sites:**
  - Pass `language` to `SpmWidget` (from the route).
  - Pass `lang` to `spmPropertyMetadata`, `spmGetProperty` and `spmSitemap`.
  - Property addresses get a `/<lang>` prefix outside the default language.
- **Analytics:** Analytics, Website Health and the Monday email work as on WordPress. Views, searches, card clicks, wishlist adds, PDF downloads and inquiries are all recorded.
