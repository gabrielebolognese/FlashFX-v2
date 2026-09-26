# FlashFX - Paddle billing setup + go-live

How FlashFX billing works on **Paddle** (Paddle Billing v2), and the exact account/dashboard steps to
take it from sandbox-tested to live.

**Decision (2026-09-26):** switch billing from Lemon Squeezy to Paddle. Lemon Squeezy was never taken
live (no live webhook, no customers), so there was nothing to migrate - the switch is code-side only.

**STATUS (2026-09-26): the code switch is DONE and env-gated.** `git grep -i lemon` returns nothing but
git history. What remains is account-side (Paddle dashboard) + secrets + deploy - see the checklists
below. Billing stays inert ("coming soon" state) until the env vars are set, so this can ship safely.

---

## What the code does (so you know what is NOT changing)

The pipeline is provider-agnostic except for the checkout call, the webhook, and the provider-id columns.

- **`public.subscriptions`** table: PK `user_id uuid -> auth.users(id)`, columns `plan` (`free|pro`),
  `status`, `current_period_end`, `paddle_customer_id`, `paddle_subscription_id`. Read-your-own RLS;
  only the service role (webhook) writes. Migration: `20260926120000_subscriptions_paddle.sql`.
- **`src/billing/checkout.ts`** - loads Paddle.js v2, `Paddle.Initialize({ token })` (sandbox selected
  before Initialize when `VITE_PADDLE_ENV !== 'production'`), `Paddle.Checkout.open({ items:[{priceId}],
  customer:{email}, customData:{ userId } })`. `BILLING_ENABLED = !!(token && priceId)`. `refreshPlan()`
  reads the webhook-written row into `usePlanStore`; it grants Pro while `status` is active/trialing OR
  `current_period_end` is in the future, and it does NOT downgrade on a transient read error.
- **`supabase/functions/paddle-webhook/index.ts`** - verifies the `Paddle-Signature` header
  (HMAC-SHA256 over `ts:body`), maps `data.status` -> `(plan, status, current_period_end)` with a
  **3-day-max grace** on past_due/paused/canceled, upserts via the service role, replies non-2xx on a
  write failure so Paddle retries, and falls back to `paddle_subscription_id` when a portal-initiated
  event carries no `custom_data`.
- **Identity** travels as the Supabase UUID in `customData.userId` -> arrives at
  `data.custom_data.userId`. No email fallback.

## Locked decisions (carried over, still true)

1. **Storage**: Pro = 20 GB everywhere (`plans.ts`).
2. **Grace window**: 3 days max after a sub leaves active/trialing, then Free (in the webhook).
3. **Price**: €29.99/mo. The Paddle price must be created at this amount **in EUR** (set the price's
   currency to EUR in the Paddle catalog); set `VITE_PADDLE_PRICE_LABEL=€29.99/mo`.

---

## Part 1: Paddle dashboard - sandbox first (you do this)

Do it all in a **sandbox** account first (sandbox.paddle.com), then repeat the token/price/destination
steps in the **live** account (paddle.com) at go-live. Sandbox and live are fully separate: separate
catalog ids, separate client tokens, separate notification-destination secrets.

1. **Create the Pro product + price.** Catalog > Products > New: name `FlashFX Pro`. Add a **recurring
   price**, monthly, **€29.99 (currency: EUR)**. Save and copy the price id (`pri_...`) - this is
   `VITE_PADDLE_PRICE_ID`. All FlashFX pricing is in EUR; create every price with EUR as its currency.
2. **Create a client-side token.** Developer tools > Authentication > Client-side tokens. Sandbox tokens
   start `test_`, live tokens `live_`. This is `VITE_PADDLE_CLIENT_TOKEN` (public; safe in the bundle).
3. **Create a notification destination (webhook).** Developer tools > Notifications > New destination:
   - **URL**: `https://bmqjuirylayevygjqxxj.supabase.co/functions/v1/paddle-webhook`
   - **Events**: `subscription.created`, `subscription.updated`, `subscription.activated`,
     `subscription.trialing`, `subscription.canceled`, `subscription.past_due`, `subscription.paused`,
     `subscription.resumed`.
   - After saving, copy the destination's **secret key** (`pdl_ntfset_...`). It is shown once. This is
     `PADDLE_WEBHOOK_SECRET`.
4. **(Live only, later) API key** - only needed if we ever create checkouts/customers server-side. Not
   used by the current overlay-checkout flow. If you make one, it is a server secret: never `VITE_` it.

## Part 2: secrets + env

**Server secret** (Supabase, never in the repo):
```
supabase secrets set PADDLE_WEBHOOK_SECRET=<the destination secret from step 3>
supabase functions deploy paddle-webhook --no-verify-jwt
```
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are auto-injected - do not set them.

**Client env** (`.env`; commit only the `.env.example` template):
```
VITE_PADDLE_CLIENT_TOKEN=test_...   # live_... in production
VITE_PADDLE_PRICE_ID=pri_...
VITE_PADDLE_ENV=sandbox             # production at go-live
VITE_PADDLE_PRICE_LABEL=€29.99/mo
```

## Part 3: push the migration + sandbox test

1. `supabase db push` (or run `20260926120000_subscriptions_paddle.sql` in the SQL editor) so the table
   has `paddle_customer_id` / `paddle_subscription_id`.
2. `.env` set to sandbox values; dev server running. Sign in (real Supabase user). Click Upgrade ->
   Paddle overlay opens -> pay with a Paddle sandbox test card.
3. Confirm the notification destination delivered (Paddle > Notifications > logs = 200) and a
   `subscriptions` row appears with your `user_id`, `plan='pro'`, `status='active'`.
4. Confirm the app flips to Pro after the `checkout.completed` poll (or a reload).
5. Cancel in the Paddle customer portal -> confirm `subscription.canceled`/`updated` arrives and
   entitlement follows the 3-day grace.

## Part 4: go-live (after sandbox passes)

Repeat Part 1 steps 1-3 in the **live** account, then set the live env + secret. Additionally, in the
live account (dashboard only):

- **Payment methods**: Checkout > Checkout settings > Payment methods - enable the ones you want.
- **Domain approval**: Checkout > Website approval - submit your production origin. Live checkout will
  NOT run on an unapproved domain (sandbox auto-approves; live does not). Submit early so it processes
  while you verify. Must be a real approved domain, not localhost.
- **Default payment link / checkout success URL**: set to `<PROD_ORIGIN>/subscription-success`.
- **Payouts**: Business account > add your bank details so payouts can be sent.
- **Webhook IP allowlist** (optional hardening): Paddle publishes its notification source IPs; if you
  put a proxy/WAF in front of the function, allowlist them. The signature check is the real guard.

---

## What is NOT done here (needs you / tools this session lacks)

- **Paddle credentials** (client token, price id, webhook secret, API key) - only obtainable in your
  Paddle dashboard. The code reads them from env; nothing is hard-coded.
- **Creating the Paddle catalog / reading a live account** - the `paddle-sandbox` / `paddle-live` MCP
  servers referenced in the migration request are NOT connected to this session, so the catalog and
  notification destinations must be created in the dashboard (or with those MCP servers once connected).
- **Deploying the function / setting secrets / pushing the migration** - run the `supabase` CLI commands
  above yourself (they need your Supabase auth).
- **Business verification, domain approval, go-live** - Paddle dashboard, and gated on Paddle's review.

## Guardrails (from the migration request - still apply)

The live Paddle account is real. Migration is additive and code-side. Do NOT delete/recreate a live
notification destination (that rotates its secret and breaks verification), and do NOT edit/delete live
prices that have subscriptions (Paddle prices are immutable once used - create a NEW price and point
`VITE_PADDLE_PRICE_ID` at it). Reuse an existing live destination; only create one if none exists.
