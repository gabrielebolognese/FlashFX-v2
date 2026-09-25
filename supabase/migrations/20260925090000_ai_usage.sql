/*
# AI token metering (per-user, per-month)

Server-authoritative usage counters for the MANAGED AI feature. The `ai-proxy` edge function holds the
Anthropic key, and after every model call it records the real token usage here (via the service role,
which bypasses RLS). Clients may READ their own current-period row to show "X / budget used"; they can
NEVER write it - only the proxy does. This is the same server-authoritative pattern as `subscriptions`.

## Design
- Primary key (user_id, period) where period is the 'YYYY-MM' UTC month bucket → one row per user per
  month, and a new month starts a fresh row (the budget "resets" by moving to a new bucket).
- Four token fields are kept separately (input / output / cache read / cache write) so cost can be
  reconstructed later even though the enforced budget is their sum.
- `add_ai_usage(...)` is an atomic upsert-and-increment (SECURITY DEFINER) so concurrent generations
  can't lose an update via read-modify-write. The proxy calls it once per model call.
*/

-- ============================================================
-- ai_usage
-- ============================================================
create table if not exists public.ai_usage (
  user_id             uuid not null references auth.users(id) on delete cascade,
  period              text not null,                    -- 'YYYY-MM' (UTC)
  input_tokens        bigint not null default 0,
  output_tokens       bigint not null default 0,
  cache_read_tokens   bigint not null default 0,
  cache_write_tokens  bigint not null default 0,
  request_count       integer not null default 0,
  updated_at          timestamptz not null default now(),
  primary key (user_id, period)
);

alter table public.ai_usage enable row level security;

-- Read-your-own only. No insert/update/delete policies → clients can't write; the proxy (service role)
-- bypasses RLS to maintain the rows.
drop policy if exists "own_ai_usage_select" on public.ai_usage;
create policy "own_ai_usage_select" on public.ai_usage
  for select to authenticated using (auth.uid() = user_id);

-- ============================================================
-- add_ai_usage: atomic upsert-and-increment for one model call
-- ============================================================
create or replace function public.add_ai_usage(
  p_user  uuid,
  p_period text,
  p_in    bigint,
  p_out   bigint,
  p_cr    bigint,
  p_cw    bigint
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ai_usage as u
    (user_id, period, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, request_count, updated_at)
  values
    (p_user, p_period, p_in, p_out, p_cr, p_cw, 1, now())
  on conflict (user_id, period) do update set
    input_tokens       = u.input_tokens       + excluded.input_tokens,
    output_tokens      = u.output_tokens      + excluded.output_tokens,
    cache_read_tokens  = u.cache_read_tokens  + excluded.cache_read_tokens,
    cache_write_tokens = u.cache_write_tokens + excluded.cache_write_tokens,
    request_count      = u.request_count      + 1,
    updated_at         = now();
$$;

-- Only the service role (the edge function) may call the incrementer; never the client.
revoke all on function public.add_ai_usage(uuid, text, bigint, bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.add_ai_usage(uuid, text, bigint, bigint, bigint, bigint) to service_role;
