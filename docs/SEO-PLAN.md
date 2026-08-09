# FlashFX — SEO Plan

Status: **v1 implemented for the editor app** (this repo, `editor.flashfx.app`). Marketing-site
(`flashfx.app`) recommendations are listed for the separate landing-page project.

---

## 0. Context & the two-domain model

FlashFX lives on two domains that must be treated as **one brand, two SEO roles**:

| Domain | What it is | SEO role |
|---|---|---|
| **flashfx.app** | Marketing / landing site (a **separate** codebase) | The **content hub** — ranks for feature/use-case/keyword queries. Owns the blog, feature pages, pricing, docs. Rich sitemap. |
| **editor.flashfx.app** | The app in **this** repo (a client-rendered WebGPU SPA) | The **product surface** — one indexable page. Self-canonical, brand-consistent, links back to flashfx.app, and declares (via structured data) that it's part of the same site/organization. |

"Same as flashfx.app" is expressed structurally, not by copying content:
- `Organization` + `WebSite` JSON-LD point at `https://flashfx.app` (`url`, `sameAs`, `publisher`).
- The `WebApplication` node is `isPartOf` the flashfx.app `WebSite`.
- The header logo links to `https://flashfx.app`.
- Shared brand: name **FlashFX**, wordmark, amber `#f7b500`, dark `#0a0f16`.

The editor is a **single-page app** — there is no SSR, so all meta is **static in `index.html`**.
Deep-link states (`/?template=particles`, …) render the same document and canonicalize to `/`, so
they are deliberately not separate indexable URLs.

---

## 1. What was broken (before)

- `<title>` was a dev placeholder: *"FlashFX WebGPU Editor Core"*.
- **No** meta description, canonical, `og:title/description/url`, theme-color, robots, or structured data.
- `og:image` / `twitter:image` still pointed at **`bolt.new/static/og_default.png`** (leftover scaffold).
- Favicon `<link>` pointed at `/vite.svg`, which **doesn't exist** (only `favicon.ico` did).
- **No** `robots.txt`, `sitemap.xml`, or web manifest.
- **No logo anywhere** — not in `index.html`, not in either app header.

## 2. What v1 ships (this repo)

**`index.html` `<head>` (fully rewritten):**
- Real title + 150-char meta description; keywords, author, application-name, theme-color `#0a0f16`.
- `robots: index, follow, max-image-preview:large`.
- `<link rel="canonical" href="https://editor.flashfx.app/">`.
- Full **Open Graph** + **Twitter** `summary_large_image` (title/description/url/image + dims + alt).
- **JSON-LD `@graph`**: `WebSite` (flashfx.app) + `Organization` (sameAs flashfx.app) + `WebApplication`
  (free `Offer`, `MultimediaApplication`, WebGPU requirement) `isPartOf` the WebSite.
- Icons: `flashfx-mark.svg` (svg favicon + apple-touch) with `favicon.ico` fallback; `site.webmanifest`.

**New brand assets (`public/`):**
- `flashfx-mark.svg` — amber rounded square + lightning bolt (favicon / mark).
- `flashfx-logo.svg` — horizontal lockup (mark + "FlashFX" wordmark).
- `og-image.svg` — 1200×630 branded social card.

**New site files (`public/`):** `robots.txt`, `sitemap.xml`, `site.webmanifest`.

**Logo in the headers:**
- `src/ui/components/FlashFXLogo.tsx` — inline SVG lockup (crisp, no request, no flash).
- Editor top bar (`App.tsx`) — brand at the far left, links to flashfx.app.
- Project dashboard (`DashboardHeader.tsx`) — brand before the "Recents" title.

## 3. Raster OG image — ✅ done

Twitter/X, Facebook and LinkedIn don't render SVG Open Graph images, so the SVGs were
rasterized with `sharp` (installed locally):

- **`public/og-image.png`** (1200×630) — `og:image` / `twitter:image` / JSON-LD `image` now
  point at it; `og:image:type` is `image/png`.
- **`public/apple-touch-icon.png`** (180×180, dark background) — `apple-touch-icon` link.

To regenerate after editing the SVGs (needs `sharp`):

```js
// node from the repo root
import sharp from 'sharp'; import { readFileSync } from 'node:fs';
await sharp(readFileSync('public/og-image.svg'), { density: 200 })
  .resize(1200, 630, { fit: 'fill' }).png({ compressionLevel: 9 }).toFile('public/og-image.png');
await sharp(readFileSync('public/flashfx-mark.svg'), { density: 400 })
  .resize(180, 180, { fit: 'contain', background: { r: 10, g: 15, b: 22, alpha: 1 } })
  .png({ compressionLevel: 9 }).toFile('public/apple-touch-icon.png');
```

Note: `sharp`/librsvg is strict XML — escape `&` as `&amp;` in the SVGs (the browser is lenient,
the rasterizer is not).

## 4. Verification checklist (after deploy)

- **Google Search Console**: add `editor.flashfx.app`, submit `sitemap.xml`, request indexing.
- **Rich Results Test** (search.google.com/test/rich-results): validate the JSON-LD.
- **Social debuggers**: X Card Validator, Facebook Sharing Debugger, LinkedIn Post Inspector —
  confirm the card image (after the PNG swap) and title/description.
- Confirm `https://editor.flashfx.app/robots.txt` and `/sitemap.xml` return 200.
- Lighthouse SEO audit → expect 95–100 once the PNG OG lands.

## 5. Recommendations for flashfx.app (the marketing site — separate project)

The **content SEO** (what actually ranks) belongs on flashfx.app. Hand these to that codebase:

- **Per-page `<title>`/description/canonical** (unique per route) + OG/Twitter + the same
  `Organization`/`WebSite` JSON-LD (single source of brand truth).
- **Content pages that target intent**: `/features/*` (particles, 2.5D, expressions, cloner,
  captions…), `/use-cases/*` (short-form/TikTok, explainers, title sequences), `/pricing`,
  `/vs/*` comparisons, and a **/blog** for long-tail queries ("how to animate text in the browser").
- **Internal linking**: every feature page CTA → `editor.flashfx.app/?template=<id>` (the deep-link
  templates already built), and the editor brand → flashfx.app. Bidirectional.
- **`sitemap.xml`** listing all content routes; reference it in flashfx.app's `robots.txt`.
- **Core Web Vitals**: SSR/SSG the marketing pages (Next/Astro), optimize LCP image, defer JS.
- **`SoftwareApplication` + `FAQPage` + `BreadcrumbList`** structured data on relevant pages;
  `AggregateRating`/reviews once available.
- **Backlinks**: Product Hunt, directories (WebGPU showcases, "browser video editor" lists),
  tutorials/YouTube with links.
- One **canonical host**: 301 `www`→apex (or vice-versa), enforce HTTPS.

## 6. Maintenance

- Bump `<lastmod>` in `sitemap.xml` each release.
- Keep the OG PNG in sync when the brand card changes.
- Keep title/description ≤ ~60 / ~155 chars; keep the brand name in the title.
- If the app ever gains real routes (SSR), give each its own canonical + meta and expand the sitemap.
