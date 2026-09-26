# FlashFX - production deployment

How to put FlashFX on a public URL. The app is a **static single-page app** (Vite build to `dist/`);
the only backend is Supabase (Postgres + Auth + Storage + the edge functions, already deployed to
Supabase). So "deploying" = hosting the static build + pointing the production env at your Supabase and
Paddle. No server to run.

Replace `<PROD_ORIGIN>` with your real URL (e.g. `https://editor.flashfx.app`) throughout.

---

## 0. Prerequisites (already done, confirm)

- Supabase edge functions deployed (`paddle-webhook`, and `drive-assets` if used) and secrets set
  (`PADDLE_WEBHOOK_SECRET`). See [`PADDLE-SETUP.md`](./PADDLE-SETUP.md).
- The `subscriptions` migration is applied (`supabase db push`).
- **Supabase project is on a paid tier so it does NOT auto-pause.** The free tier pauses after ~a week
  idle; a paused project breaks sign-in, the Pro check and cloud sync for everyone. This is the one
  hard prerequisite for a real launch.

---

## 1. Pick a static host

Any host that serves a static build over HTTPS with SPA fallback works. HTTPS is REQUIRED (WebGPU only
runs in a secure context). Good options (all have a free tier, HTTPS, custom domains, env vars):

- **Cloudflare Pages**, **Netlify**, or **Vercel**.

Settings are the same everywhere:
- **Build command**: `npm run build`
- **Output directory**: `dist`
- **Node version**: 18+ (match your local).

Connect the GitHub repo (`FlashFX-v2`, branch `main`) so every push deploys, or deploy the `dist/`
folder manually.

---

## 2. Two config items that WILL break the app if skipped

### a) SPA fallback (serve index.html for every route)

The app reads the path at boot for `/subscription-success` and `?auth_confirm=1`. Without a catch-all
rewrite, hitting `<PROD_ORIGIN>/subscription-success` returns the host's 404 instead of the app.

- **Netlify** - add `public/_redirects` (copied into `dist/` by the build):
  ```
  /*  /index.html  200
  ```
- **Cloudflare Pages** - add `public/_redirects` with the same line (Pages honors it), or a
  `public/_routes.json`.
- **Vercel** - add `vercel.json` at the repo root:
  ```json
  { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
  ```

### b) Production env vars (set in the host dashboard - they are inlined at BUILD time)

Vite bakes `VITE_*` into the bundle when it builds, so these must be set in the host's build
environment (not just your local `.env`). Set:

```
VITE_SUPABASE_URL=https://bmqjuirylayevygjqxxj.supabase.co
VITE_SUPABASE_ANON_KEY=<the anon public key>
VITE_PADDLE_CLIENT_TOKEN=<live_ client-side token>
VITE_PADDLE_PRICE_ID=<the live pri_... for FlashFX Pro>
VITE_PADDLE_ENV=production
VITE_PADDLE_PRICE_LABEL=$29.99/mo
VITE_OAUTH_GOOGLE=true
# optional observability (see MONITORING below):
# VITE_SENTRY_DSN=...
# VITE_POSTHOG_KEY=...
```
The anon key is public/publishable (safe in the bundle). NEVER put the Supabase service-role key or the
Paddle webhook secret in a `VITE_` var - those live only in Supabase edge-function secrets. (The Paddle
CLIENT token IS public/publishable, like a Stripe publishable key, so it is fine in a `VITE_` var.)

---

## 3. Custom domain

Point `<PROD_ORIGIN>` at the host (a CNAME record the host tells you to add). The host issues the HTTPS
cert automatically. `index.html` already declares `editor.flashfx.app` as canonical - update that if you
use a different domain.

---

## 4. Post-deploy wiring (do these once the URL is live)

1. **Supabase Auth redirect allow-list** (Authentication -> URL Configuration):
   - **Site URL** = `<PROD_ORIGIN>`
   - **Redirect URLs**: add `<PROD_ORIGIN>` (and keep `http://localhost:5173` for dev). The app signs in
     with `redirectTo: window.location.origin`, so the prod origin MUST be allow-listed or Google
     sign-in, email confirmation, and password reset all fail on prod.
2. **Google OAuth**: no change needed on Google's side - the provider callback is Supabase's URL
   (`https://<ref>.supabase.co/auth/v1/callback`), already configured. Step 1 is what makes prod work.
3. **Paddle**: submit `<PROD_ORIGIN>` for **domain approval** (Checkout > Website approval) - live checkout
   will not run on an unapproved domain. Set the checkout **success URL** / default payment link to
   `<PROD_ORIGIN>/subscription-success` so the celebration page shows post-payment. The Paddle
   notification destination already targets the Supabase `paddle-webhook` - unchanged. See PADDLE-SETUP.md.

---

## 5. Prod smoke test (do this before announcing)

On `<PROD_ORIGIN>` in a Chromium browser:
1. App loads into the editor (not stuck on the loading gate).
2. Sign in with Google, then email/password - both land back signed in.
3. Create a project, add a layer, **export** an MP4 - it downloads and plays.
4. Click a Pro feature (AI panel / expressions / 3D toggle) as a free user -> the upgrade modal opens.
5. Complete a **real live-mode purchase** (or a test-mode one first) -> after the redirect / reload the
   account shows Pro and the gated feature unlocks.
6. Reload - you're still signed in and still Pro.

---

## Monitoring (Sentry + PostHog)

Error monitoring and product analytics are wired to the telemetry seam and activate ONLY when their env
keys are set (no dependency is bundled; the vendor scripts load lazily from their CDN when configured).
Until then, telemetry is console-only. To turn them on:

1. **Sentry (crashes)** - create a project at sentry.io, copy the **DSN** (Project Settings -> Client
   Keys), set `VITE_SENTRY_DSN` in the host build env. `captureError` (and the global window.onerror /
   unhandledrejection handlers) then report to Sentry. The loader is version-managed from Sentry's
   dashboard, so there's nothing to pin or upgrade in the repo.
2. **PostHog (analytics)** - create a project at posthog.com, copy the **Project API key**, set
   `VITE_POSTHOG_KEY` (+ `VITE_POSTHOG_HOST` if EU). `trackEvent` calls (export_started, auth_sign_in,
   the upgrade funnel, ...) forward to PostHog. Analytics events are **consent-gated**: nothing is sent
   until the user accepts analytics in the consent banner (handled in `telemetry.ts`), so this is
   GDPR-safe by default.

Both are wired in `src/lib/telemetrySinks.ts` (installed once from `main.tsx`); every call is guarded so
a provider outage can never break the app. Rebuild/redeploy after setting the keys.

## Notes

- **No WebM/other formats**: export is MP4 (H.264/AAC) only.
- **SharedArrayBuffer / COOP-COEP**: not required (Rapier uses the non-threaded `-compat` build). Only add
  cross-origin-isolation headers if you later hit a `SharedArrayBuffer is not defined` error.
- Rollback: hosts keep every deploy; roll back to a previous build from the host dashboard if a release
  regresses.
