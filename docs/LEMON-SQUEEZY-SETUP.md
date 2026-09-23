# FlashFX - Lemon Squeezy payment setup + wiring plan

How to switch FlashFX billing from the dormant Paddle integration to **Lemon Squeezy**, and the exact
code plan to build once the LS product exists.

**Decision (2026-09-23):** replace Paddle entirely. Paddle was never activated (no keys, no webhook
secret, zero customers), so there is nothing to migrate.

**STATUS (2026-09-23): Part 3 code is BUILT and env-gated (Paddle removed).** The LS product exists:
- Store: `flashfx.lemonsqueezy.com` - Product/Store ID `1382876` - Variant ID `2160425`
- Checkout URL: `https://flashfx.lemonsqueezy.com/checkout/buy/a6be9a6a-56df-4756-91b7-9250c79a819d`
- `VITE_LEMON_CHECKOUT_URL` is set in local `.env` (billing ON in dev). What remains for go-live is
  server-side only: **deploy the function, set the signing secret, create the LS webhook** (the
  "Go-live checklist" at the very bottom).

Replace `<PROJECT_REF>` with your Supabase ref (`bmqjuirylayevygjqxxj`) throughout.

---

## What already exists (so you know what is NOT changing)

The whole pipeline is built and proven against Paddle; only the provider-specific pieces change.

- **`public.subscriptions`** table: PK `user_id uuid -> auth.users(id)`, columns `plan` (`free|pro`),
  `status`, `current_period_end`, plus provider IDs. Read-your-own RLS; only the service role (webhook)
  writes. `plan` / `status` / `current_period_end` / `user_id` are provider-agnostic and stay as-is.
- **Supabase Auth** is live (Google + email). Every payer has a durable **UUID + email**.
- **Identity plumbing** is proven: checkout passes the signed-in user's UUID as custom data; the webhook
  resolves the payment back to `subscriptions.user_id`. LS supports the same trick, so this is reused
  unchanged. There is no email column and no profiles table: identity travels only as the UUID.
- **Client**: `refreshPlan()` reads the `subscriptions` row into `usePlanStore` on sign-in and flips the
  account to Pro when `status` is active/trialing and `plan === 'pro'`. `UpgradeModal`, the plan/quota
  model in `plans.ts`, and the hidden `/subscription-success` page all stay.

What changes: the checkout call, the webhook, the provider-ID columns, and the env vars.

---

## Part 1: Lemon Squeezy dashboard (you do this, once)

Do it all in **Test mode** first (toggle top-right in the LS dashboard). Test and live have separate
API keys and separate webhook signing secrets; wire test first, then repeat the key/secret/webhook steps
for live at launch.

1. **Create a Store.** Settings -> Stores. Note the store subdomain `<STORE>.lemonsqueezy.com` and the
   numeric **Store ID**.
2. **Create the Pro product + subscription variant.** Products -> New Product:
   - Name: `FlashFX Pro` (or similar).
   - Pricing model: **Subscription**, monthly, **$29.99/mo** (locked - must match `VITE_LEMON_PRICE_LABEL`).
   - Save, then open the product's **variant** and note the numeric **Variant ID**.
3. **Get the checkout link.** On the variant, "Share" gives a hosted checkout URL:
   ```
   https://<STORE>.lemonsqueezy.com/buy/<variant-uuid>
   ```
   This is `VITE_LEMON_CHECKOUT_URL`. (We open it as a Lemon.js overlay and append the user's UUID at
   click time, so it does not need to be per-user.)
4. **Set the post-purchase redirect** (this is what finally makes `/subscription-success` reachable -
   Paddle never redirected there). On the product: "After purchase" / "Redirect to URL":
   ```
   https://<your-production-origin>/subscription-success
   ```
   Use `http://localhost:5173/subscription-success` while testing.
5. **Create an API key.** Settings -> API -> create a key. Only needed if we create checkouts via the API
   later (for a plain buy-link + overlay it is optional). If you make one, it is a server secret: never
   `VITE_` it, never commit it.
6. **Create the webhook.** Settings -> Webhooks -> Add:
   - **Callback URL**:
     ```
     https://<PROJECT_REF>.supabase.co/functions/v1/lemon-webhook
     ```
   - **Signing secret**: set a strong random string. This is `LEMON_SQUEEZY_SIGNING_SECRET` (Part 2).
   - **Events** to subscribe: `subscription_created`, `subscription_updated`, `subscription_cancelled`,
     `subscription_expired`, `subscription_paused`, `subscription_unpaused`,
     `subscription_payment_success`, `subscription_payment_failed`.

---

## Part 2: Secrets + env

**Server secret** (Supabase, never in the repo). After the edge function is deployed:
```
supabase secrets set LEMON_SQUEEZY_SIGNING_SECRET=<the signing secret from step 6>
```
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected into edge functions - do not set them.

Deploy the function with JWT verification off (LS is not a Supabase user; there is no `config.toml` in
this repo, so this is a deploy-time flag):
```
supabase functions deploy lemon-webhook --no-verify-jwt
```

**Client env** (`.env`, safe to commit only the `.env.example` template):
```
VITE_LEMON_CHECKOUT_URL=https://<STORE>.lemonsqueezy.com/buy/<variant-uuid>
VITE_LEMON_PRICE_LABEL=$29.99/mo
# optional, only if we move to API-created checkouts:
# VITE_LEMON_STORE_ID=...
# VITE_LEMON_VARIANT_ID=...
```
`BILLING_ENABLED` becomes `!!VITE_LEMON_CHECKOUT_URL`, so billing stays inert (the "coming soon" state)
until you set this - exactly how Paddle behaves today.

---

## Part 3: Code plan (I build this after you confirm the variant exists)

All env-gated, so it can land before go-live without exposing anything.

### 3a. Migration - make `subscriptions` Lemon-shaped (BUILT: `20260923120000_subscriptions_lemonsqueezy.sql`)

New migration (timestamp later than `20260823100000_subscriptions.sql`), safe because the table has no
rows yet:
```sql
alter table public.subscriptions drop column if exists paddle_customer_id;
alter table public.subscriptions drop column if exists paddle_subscription_id;
alter table public.subscriptions add column if not exists ls_customer_id     text;
alter table public.subscriptions add column if not exists ls_subscription_id text;
alter table public.subscriptions add column if not exists ls_variant_id      text;
alter table public.subscriptions add column if not exists ls_order_id        text;
```
`user_id` / `plan` / `status` / `current_period_end` / RLS are unchanged.

### 3b. New edge function `supabase/functions/lemon-webhook/index.ts` (BUILT)

A rewrite of `paddle-webhook` (reuses its service-role PostgREST upsert; only verify + parse differ).

- **Signature**: LS sends header `X-Signature` = hex HMAC-SHA256 of the **raw request body** using the
  signing secret. Verify with a constant-time compare; reject 401 on mismatch. (Paddle's `ts:body`
  scheme does not apply.)
- **Envelope** (JSON:API): event is `meta.event_name`; the subscription record is `data.attributes`;
  identity is `meta.custom_data.user_id`. If `user_id` is missing, return 200 "no user mapping" (same as
  Paddle - no email fallback exists).
- **Status mapping** (`data.attributes.status` -> our `plan`/`status`), with a **3-day-max grace window** (LOCKED):

  | LS status                       | plan   | status   | entitlement |
  |---------------------------------|--------|----------|-------------|
  | `active`, `on_trial`            | `pro`  | active/trialing | Pro |
  | `cancelled`, `past_due`, `unpaid`, `paused` | `pro` | canceled/past_due | Pro for up to 3 more days, then Free |
  | `expired`                       | `free` | canceled | Free immediately |

  **Grace = 3 days MAX** (founder decision). When a sub leaves active/on_trial, set
  `current_period_end = min(ends_at ?? (now + 3 days), now + 3 days)` - i.e. capped at 3 days even if the
  paid period runs longer. `refreshPlan()` is adjusted to grant Pro when `plan==='pro'` AND (`status` is
  active/trialing OR `current_period_end` is in the future). `expired` sets `plan='free'` at once.
- **Upsert**: `ls_customer_id = data.attributes.customer_id`, `ls_subscription_id = data.id`,
  `ls_variant_id = data.attributes.variant_id`, `ls_order_id = data.attributes.order_id`, via the
  service role (bypasses RLS), `Prefer: resolution=merge-duplicates`.

### 3c. Rewrite `src/billing/checkout.ts` for Lemon.js (BUILT)

- Load `https://assets.lemonsqueezy.com/lemon.js` (idempotent), call `createLemonSqueezy()`.
- `startCheckout()`: require a signed-in user (unchanged guard -> `not-signed-in`). Build the URL:
  ```
  ${VITE_LEMON_CHECKOUT_URL}?embed=1&checkout[email]=${email}&checkout[custom][user_id]=${user.id}
  ```
  then `window.LemonSqueezy.Url.Open(url)` for the overlay. Custom data arrives at the webhook as
  `meta.custom_data.user_id`.
- Keep `onCheckoutSuccess` -> poll `refreshPlan()` (LS fires `Checkout.Success` via `lemon.js` event
  config); the webhook is the authoritative plan flip, the poll is just for snappy UI.
- Swap env reads `VITE_PADDLE_*` -> `VITE_LEMON_*`; `BILLING_ENABLED = !!VITE_LEMON_CHECKOUT_URL`.

### 3d. Remove Paddle (BUILT)

Delete `supabase/functions/paddle-webhook/`, the `VITE_PADDLE_*` lines in `.env`/`.env.example`, and the
Paddle-specific code paths in `checkout.ts`. Grep must return no `paddle` hits outside git history.

### 3e. Funnel fix (small UX gap the audit found) (BUILT)

Today a guest who clicks Upgrade fails with "please sign in first" after the click. Better: if
`user === null` when Upgrade is clicked, open `AuthModal` first, then continue to checkout on success.
I will wire this in `UpgradeModal`.

### 3f. Storage number - RESOLVED (20 GB, done Sep 23 2026)

Pro = **20 GB** everywhere. `plans.ts` already enforced 20 GB; the marketing copy that said "100 GB"
(`SubscriptionSuccess` feature list, the `storage-reveal` tutorial: project name, counter target 0->20,
group/template name + description, and the `App.tsx` tour project name) is now aligned to 20 GB. The
`$29.99/mo` price label default is set in `checkout.ts` (`PRO_PRICE_LABEL`). This part shipped ahead of
the rest of the LS build.

---

## Part 4: Test plan (before flipping live)

1. LS in **Test mode**; `VITE_LEMON_CHECKOUT_URL` = the test buy link; `.env` set; dev server running.
2. Sign in (real Supabase user). Click Upgrade -> LS overlay opens -> pay with a
   [LS test card](https://docs.lemonsqueezy.com/help/checkout/test-mode).
3. Confirm the webhook fires (LS dashboard -> Webhooks -> recent deliveries = 200) and a `subscriptions`
   row appears with your `user_id`, `plan='pro'`, `status='active'`.
4. Confirm the app flips to Pro (account badge, storage bar to 20 GB) after the redirect to
   `/subscription-success` (or a reload - see the "no realtime refresh" note).
5. Cancel in LS -> confirm `subscription_updated`/`cancelled` arrives and entitlement behaves per the
   grace-window decision.
6. Repeat key + secret + webhook setup for **Live mode** at launch.

---

## Locked decisions (Sep 23 2026)

1. **Storage**: Pro = **20 GB** everywhere. DONE in code (see 3f).
2. **Grace window**: **3 days max** after a sub leaves active/on_trial, then Free. Spec in 3b - built
   with the rest of Part 3.
3. **Price**: **$29.99/mo**. Label default DONE in `checkout.ts`; the LS variant must be created at this
   price and `VITE_LEMON_PRICE_LABEL=$29.99/mo`.

All three are DONE in code (commit lands with this doc). The LS product/variant now exist (see STATUS
at top), so Part 3a-3e are built and env-gated.

Known limitation carried over from Paddle: plan refresh happens on sign-in + a short post-checkout poll,
not via realtime. A webhook-driven upgrade shows up on next reload/re-login. A Supabase Realtime
subscription on the `subscriptions` row is a later polish if instant reflection matters.

---

## Go-live checklist (what remains - all server-side, no code)

The client + webhook code is built and the checkout link is wired in `.env`. To make a real payment flip
an account to Pro:

1. **Push the migration** so `subscriptions` has the `ls_*` columns:
   `supabase db push` (or apply `20260923120000_subscriptions_lemonsqueezy.sql` in the SQL editor).
2. **Deploy the webhook** (no JWT - LS is not a Supabase user):
   `supabase functions deploy lemon-webhook --no-verify-jwt`
3. **Set the signing secret** (from LS Settings -> Webhooks; test and live differ):
   `supabase secrets set LEMON_SQUEEZY_SIGNING_SECRET=<secret>`
4. **Create the LS webhook** (Settings -> Webhooks -> Add):
   - URL: `https://bmqjuirylayevygjqxxj.supabase.co/functions/v1/lemon-webhook`
   - Signing secret: the same value as step 3.
   - Events: `subscription_created`, `subscription_updated`, `subscription_cancelled`,
     `subscription_expired`, `subscription_paused`, `subscription_unpaused`. (Payment events are ignored
     by the function; the accompanying `subscription_updated` carries the authoritative status.)
5. **Set the product's after-purchase redirect** to `.../subscription-success` (makes the celebration
   page reachable; the overlay's `Checkout.Success` already polls the plan without it).
6. **Test in LS test mode** with a test card, then repeat steps 3-4 for **live mode** (different secret).

Until steps 1-4 are done, checkout opens and charges, but the app won't flip to Pro (no webhook writing
the row). That is the expected env-gated state.
