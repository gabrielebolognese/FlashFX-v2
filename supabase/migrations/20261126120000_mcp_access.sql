-- FlashFX Link early-access codes (docs/MCP-PRODUCT-ARCHITECTURE.md, "Early-access gate").
-- NOT APPLIED YET: the shim uses the local allowlist (mcp/access/allowlist.json) until this table and the
-- mcp-entitlement edge function are deployed (an owner-approved release action, after the selling freeze).
-- Stores only a SHA-256 of the code ('flashfx-link:v1:' + normalized code, see mcp/lib/entitlement.mjs) and
-- the email the founder issued it to. RLS on with NO policies: no client (anon or authenticated) can read
-- or write; only the edge function (service role) touches these tables.

create table if not exists public.mcp_access (
  code_hash   text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  email       text,
  kind        text not null default 'early' check (kind in ('founding', 'early', 'team')),
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);
alter table public.mcp_access enable row level security;

-- Daily anonymous ping: the north-star metric (weekly active MCP builders). Disclosed in docs/MCP-QUICKSTART.md.
create table if not exists public.mcp_access_pings (
  code_hash  text not null references public.mcp_access(code_hash) on delete cascade,
  day        date not null default (now() at time zone 'utc')::date,
  version    text,
  primary key (code_hash, day)
);
alter table public.mcp_access_pings enable row level security;
