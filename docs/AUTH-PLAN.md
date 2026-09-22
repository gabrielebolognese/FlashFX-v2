# FlashFX Auth & Accounts - status & plan

**This is the canonical auth doc.** The `docs/AUTHENTICATION_*.md` / `AUTH_DATABASE_ANALYSIS.md` files
describe a system (`AuthContext`, `profiles`/`projects` tables, username login, guest mode) that does
**not** exist in `src/` - ignore them. `docs/PRODUCT-ROADMAP.md` and the `CLAUDE.md` "no user accounts"
line predate the real auth layer and are stale.

## What actually exists (verified 2026-09-22)

Real Supabase-Auth identity, **null-guarded and dormant until Supabase env vars are set**
(`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`). With them set, `supabase` is non-null -> `enabled`
flips true, the app requires sign-in (`App.tsx` gate), and the account UI appears. Without them the app
is 100% local-first with no accounts.

- **Auth store** `src/auth/store.ts` (`useAuthStore`): email sign-in/up, password reset, email confirm,
  sign-out, session hydration, `updateDisplayName`, `updatePassword`, and `signInWithOAuth(provider)`.
- **UI**: `AuthGate` (full-screen gate), `AuthModal` (dashboard sign-in), `AccountMenu` (dashboard
  sidebar), `AccountSettingsModal` (account panel), `AuthConfirm` (email-confirm landing).
- **Billing** (`src/billing/`): Paddle checkout, a per-user `subscriptions` table + webhook,
  `refreshPlan()` on sign-in -> `usePlanStore`. Keyed on the auth `user_id`.
- **Per-user RLS** already correct on `cloud_projects`, `subscriptions`, and the `project-assets`
  bucket. Legacy tables (folders, caption transcripts, text-explode groups, recovery logs) are still on
  the shared `x-app-key` RLS. Identity is Supabase-managed `auth.users` (no `profiles` table).

## Phase A - social sign-in + account UX (SHIPPED 2026-09-22, dormant-safe)

- **Google / Microsoft / Apple sign-in**: `signInWithOAuth` broadened to `'google' | 'azure' | 'apple'`
  (`auth/types.ts`); `auth/oauthProviders.ts` (pure, `verify:oauth-providers`) resolves which providers
  to show; `auth/OAuthButtons.tsx` renders a branded button per enabled provider in `AuthModal` +
  `AuthGate`. Each provider shows unless `VITE_OAUTH_GOOGLE|MICROSOFT|APPLE` is set to `"false"`.
- **Display-name edit** in `AccountSettingsModal` (`EditNameModal` -> `updateDisplayName`).
- **Editor account menu** (`EditorAccountMenu` in `App.tsx`): avatar -> Account settings / Preferences /
  Sign out, next to the Panels menu. Shows only when accounts are enabled. (The dashboard already had
  the avatar + `AccountSettingsModal`.)
- Removed the stale bottom-left "Tutorial" replay button.

**Dropped:** phone/SMS recovery (adds an SMS-provider cost/dependency).

## What YOU configure (infra - not code)

The client is built; a provider button only *works* once configured server-side:
1. Set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (turns the whole auth layer on).
2. Register OAuth apps and enable each provider in the Supabase Auth dashboard:
   - **Google** - Google Cloud OAuth client.
   - **Microsoft** - Azure AD app (Supabase provider id `azure`).
   - **Apple** - Apple Services ID + Sign in with Apple key.
   Hide any not-yet-configured provider with `VITE_OAUTH_<NAME>=false` until it is ready.
3. Set the Auth redirect / site URLs and the confirm-email template pointing at
   `{{ .SiteURL }}/?auth_confirm=1&...` (consumed by `AuthConfirm.tsx`).

## Next (not yet built)

- **Entitlement gate** - `usePlanStore.plan` currently gates only cloud-media quota; wire a
  `useEntitlements` check at export (resolution + watermark) and AI to turn the existing billing
  plumbing into real monetization (`PRODUCT-ROADMAP.md` Phase 3).
- **RLS migration** - add `user_id` / `auth.uid()` to the still-shared legacy tables (folders, caption
  transcripts, text-explode groups) and retire `app_key_valid()`.
- **Doc cleanup** - delete the phantom `AUTHENTICATION_*.md`; fix the stale `CLAUDE.md` line.

## Verification
- Pure/provable here: `verify:oauth-providers` (provider catalog + env resolution). Gates: `tsc` 0,
  `lint` 125 baseline, `build`, `npm test`.
- Live OAuth / sessions / billing are browser + Supabase-config, not testable in CI.
