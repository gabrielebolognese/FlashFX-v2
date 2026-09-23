# FlashFX - Lemon Squeezy payment setup + wiring plan

How to switch FlashFX billing from the dormant Paddle integration to **Lemon Squeezy**, and the exact
code plan to build once the LS product exists.

**Decision (2026-09-23):** replace Paddle entirely. Paddle was never activated (no keys, no webhook
secret, zero customers), so there is nothing to migrate. This doc is the setup checklist (Part 1-2, you
do it) plus the implementation plan (Part 3, I build it after you confirm the LS product/variant IDs).

Replace `<PROJECT_REF>` with your Supabase ref (`bmqjuirylayevygjqxxj`) and `<STORE>` with your LS store
subdomain throughout.

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
   - Pricing model: **Subscription**, monthly, your price (the UI currently labels `$12/mo` - keep or
     change, see Part 3 storage note).
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
VITE_LEMON_PRICE_LABEL=$12/mo
# optional, only if we move to API-created checkouts:
# VITE_LEMON_STORE_ID=...
# VITE_LEMON_VARIANT_ID=...
```
`BILLING_ENABLED` becomes `!!VITE_LEMON_CHECKOUT_URL`, so billing stays inert (the "coming soon" state)
until you set this - exactly how Paddle behaves today.

---

## Part 3: Code plan (I build this after you confirm the variant exists)

All env-gated, so it can land before go-live without exposing anything.

### 3a. Migration - make `subscriptions` Lemon-shaped

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

### 3b. New edge function `supabase/functions/lemon-webhook/index.ts`

A rewrite of `paddle-webhook` (reuses its service-role PostgREST upsert; only verify + parse differ).

- **Signature**: LS sends header `X-Signature` = hex HMAC-SHA256 of the **raw request body** using the
  signing secret. Verify with a constant-time compare; reject 401 on mismatch. (Paddle's `ts:body`
  scheme does not apply.)
- **Envelope** (JSON:API): event is `meta.event_name`; the subscription record is `data.attributes`;
  identity is `meta.custom_data.user_id`. If `user_id` is missing, return 200 "no user mapping" (same as
  Paddle - no email fallback exists).
- **Status mapping** (`data.attributes.status` -> our `plan`/`status`):

  | LS status                     | plan   | status   | entitlement |
  |-------------------------------|--------|----------|-------------|
  | `active`, `on_trial`          | `pro`  | active/trialing | Pro |
  | `cancelled` (until `ends_at`) | `pro`  | canceled | Pro until period end |
  | `past_due`, `unpaid`, `paused`| `pro`  | past_due | keep Pro (grace) - or downgrade, your call |
  | `expired`                     | `free` | canceled | Free |

  `refreshPlan()` already grants Pro only when `plan==='pro'` AND `status` is in `{active,trialing}`, so a
  strict reading downgrades `canceled`/`past_due` immediately. Decide whether we honor a grace window
  (recommended: Pro until `current_period_end`) - I will set `current_period_end = ends_at ?? renews_at`
  and adjust `refreshPlan()` to treat `canceled` as Pro while `current_period_end` is in the future.
- **Upsert**: `ls_customer_id = data.attributes.customer_id`, `ls_subscription_id = data.id`,
  `ls_variant_id = data.attributes.variant_id`, `ls_order_id = data.attributes.order_id`, via the
  service role (bypasses RLS), `Prefer: resolution=merge-duplicates`.

### 3c. Rewrite `src/billing/checkout.ts` for Lemon.js

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

### 3d. Remove Paddle

Delete `supabase/functions/paddle-webhook/`, the `VITE_PADDLE_*` lines in `.env`/`.env.example`, and the
Paddle-specific code paths in `checkout.ts`. Grep must return no `paddle` hits outside git history.

### 3e. Funnel fix (small UX gap the audit found)

Today a guest who clicks Upgrade fails with "please sign in first" after the click. Better: if
`user === null` when Upgrade is clicked, open `AuthModal` first, then continue to checkout on success.
I will wire this in `UpgradeModal`.

### 3f. Storage number - resolve before launch (decision needed)

`plans.ts` enforces Pro = **20 GB** cloud media, but the marketing (`SubscriptionSuccess`, the
"100 GB Storage" tour) says **100 GB**. These must agree. Tell me the real number and I align both the
enforced limit and the copy. (Supabase free tier is 1 GB storage total, so 100 GB has a real backend
cost - worth a deliberate choice.)

---

## Part 4: Test plan (before flipping live)

1. LS in **Test mode**; `VITE_LEMON_CHECKOUT_URL` = the test buy link; `.env` set; dev server running.
2. Sign in (real Supabase user). Click Upgrade -> LS overlay opens -> pay with a
   [LS test card](https://docs.lemonsqueezy.com/help/checkout/test-mode).
3. Confirm the webhook fires (LS dashboard -> Webhooks -> recent deliveries = 200) and a `subscriptions`
   row appears with your `user_id`, `plan='pro'`, `status='active'`.
4. Confirm the app flips to Pro (account badge, storage bar to 20/100 GB) after the redirect to
   `/subscription-success` (or a reload - see the "no realtime refresh" note).
5. Cancel in LS -> confirm `subscription_updated`/`cancelled` arrives and entitlement behaves per the
   grace-window decision.
6. Repeat key + secret + webhook setup for **Live mode** at launch.

---

## Open decisions (answer these and I build Part 3)

1. **Storage**: is Pro 20 GB or 100 GB? (aligns `plans.ts` + all copy)
2. **Grace window**: keep Pro until `current_period_end` on cancel/past_due (recommended), or downgrade
   immediately?
3. **Price**: keep `$12/mo`, or change? (must match the LS variant + `VITE_LEMON_PRICE_LABEL`)

Known limitation carried over from Paddle: plan refresh happens on sign-in + a short post-checkout poll,
not via realtime. A webhook-driven upgrade shows up on next reload/re-login. A Supabase Realtime
subscription on the `subscriptions` row is a later polish if instant reflection matters.
