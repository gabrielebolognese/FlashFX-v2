/*
# Subscriptions (billing)

Per-user subscription state, written ONLY by the Paddle webhook (which uses the service role and
bypasses RLS). Clients may READ their own row so the app knows their plan; they cannot write it.
The app's refreshPlan() reads this on sign-in and flips the account to Pro when status is active.

## Design
- user_id is the PK (one subscription per user) → the webhook upserts on it.
- No client write policies → only the service role writes. This is the secure pattern for
  server-authoritative state.
*/

create table if not exists public.subscriptions (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  plan                   text not null default 'free',      -- 'free' | 'pro'
  status                 text not null default 'inactive',  -- active | trialing | past_due | canceled | inactive
  paddle_customer_id     text,
  paddle_subscription_id text,
  current_period_end     timestamptz,
  updated_at             timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- Read-your-own only. No insert/update/delete policies → clients can't write; the webhook (service
-- role) bypasses RLS to maintain the row.
drop policy if exists "own_subscription_select" on public.subscriptions;
create policy "own_subscription_select" on public.subscriptions
  for select to authenticated using (auth.uid() = user_id);
