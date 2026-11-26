import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// FlashFX Link entitlement check (docs/MCP-PRODUCT-ARCHITECTURE.md, "Early-access gate"). NOT DEPLOYED YET:
// until it is, the shim checks the local allowlist (mcp/access/allowlist.json). Deploying it is an
// owner-approved release action (after the selling freeze):
//   supabase db push   (applies 20261126120000_mcp_access.sql)
//   supabase functions deploy mcp-entitlement --no-verify-jwt
// then ship FlashFX Link with FLASHFX_ENTITLEMENT_URL=https://<project-ref>.supabase.co/functions/v1/mcp-entitlement
//
// POST { code, client: 'link', version } -> { ok, kind, features, minVersion, checkedAt } | { ok: false, reason }
// No billing, no payment provider, no Anthropic key: it only answers "is this access code live".

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MIN_VERSION = Deno.env.get("FLASHFX_LINK_MIN_VERSION") ?? "0.1.0";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const rest = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, reason: "POST only" }, 405);
  let body: { code?: unknown; client?: unknown; version?: unknown };
  try { body = await req.json(); } catch { return json({ ok: false, reason: "bad json" }, 400); }
  const code = String(body.code ?? "").toUpperCase().replace(/[\s-]/g, "");
  if (code.length < 16 || code.length > 64) return json({ ok: false, reason: "access code not recognised" });
  const hash = await sha256Hex(`flashfx-link:v1:${code}`);

  const r = await rest(`mcp_access?code_hash=eq.${hash}&select=kind,revoked_at`);
  if (!r.ok) return json({ ok: false, reason: "access server error" }, 502);
  const rows = (await r.json()) as { kind: string; revoked_at: string | null }[];
  const row = rows[0];
  if (!row) return json({ ok: false, reason: "access code not recognised" });
  if (row.revoked_at) return json({ ok: false, reason: "this access code was revoked" });

  // One anonymous ping per code per day (upsert ignores duplicates).
  await rest("mcp_access_pings", {
    method: "POST",
    headers: { prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify({ code_hash: hash, version: String(body.version ?? "").slice(0, 20) }),
  }).catch(() => {});

  return json({ ok: true, kind: row.kind, features: ["core", "recipes", "commercial"], minVersion: MIN_VERSION, checkedAt: new Date().toISOString() });
});
