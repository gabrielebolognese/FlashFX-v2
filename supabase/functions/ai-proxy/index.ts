import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// FlashFX MANAGED AI proxy. Holds the Anthropic key server-side so Pro users generate WITHOUT bringing
// their own key, and meters every call's real token usage against a per-account monthly budget. The
// browser's wire client (src/ai/director/client.ts) points its baseUrl here and sends the user's
// Supabase access token as `Authorization: Bearer <jwt>`; this function identifies the user, checks
// their plan + budget, forwards the Anthropic Messages request with the secret key, then records usage.
//
// Deploy (founder):
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy ai-proxy
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY are injected automatically.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, anthropic-version, anthropic-beta, x-api-key",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_BETA = "prompt-caching-2024-07-31";

// KEEP IN SYNC with src/billing/aiCredits.ts (AI_MONTHLY_TOKENS.pro). Deno can't import from src/.
const PRO_MONTHLY_TOKENS = 6_000_000;
// Defense: bound a single call so a crafted request can't run up an unbounded bill. The app's own
// requests ask for a few thousand output tokens; this ceiling is generous headroom.
const MAX_TOKENS_CEILING = 16_000;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** The 'YYYY-MM' UTC month bucket (matches aiCredits.usagePeriod). */
function usagePeriod(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Resolve the caller's user id from their Supabase access token, or null if invalid. */
async function getUserId(jwt: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${jwt}`, apikey: ANON_KEY },
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return user?.id ?? null;
}

/** True when the account is entitled to AI (Pro, active or within the webhook's grace period). Mirrors
 *  the client's refreshPlan() grace rule. */
async function isProUser(userId: string): Promise<boolean> {
  const url = `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&select=plan,status,current_period_end`;
  const res = await fetch(url, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) return false;
  const rows = await res.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || row.plan !== "pro") return false;
  const active = row.status === "active" || row.status === "trialing";
  const graceValid = row.current_period_end ? Date.parse(row.current_period_end) > Date.now() : false;
  return active || graceValid;
}

/** Total tokens the account has already spent this period. */
async function tokensUsedThisPeriod(userId: string, period: string): Promise<number> {
  const url =
    `${SUPABASE_URL}/rest/v1/ai_usage?user_id=eq.${userId}&period=eq.${period}` +
    `&select=input_tokens,output_tokens,cache_read_tokens,cache_write_tokens`;
  const res = await fetch(url, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) return 0;
  const rows = await res.json().catch(() => []);
  const r = Array.isArray(rows) ? rows[0] : null;
  if (!r) return 0;
  return (
    Number(r.input_tokens ?? 0) +
    Number(r.output_tokens ?? 0) +
    Number(r.cache_read_tokens ?? 0) +
    Number(r.cache_write_tokens ?? 0)
  );
}

/** Atomically record one call's usage via the add_ai_usage RPC. Best-effort: a metering failure must
 *  not fail a generation the user already paid tokens for, but is logged. */
async function recordUsage(
  userId: string,
  period: string,
  u: { input: number; output: number; cacheRead: number; cacheWrite: number },
): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/add_ai_usage`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_user: userId,
      p_period: period,
      p_in: u.input,
      p_out: u.output,
      p_cr: u.cacheRead,
      p_cw: u.cacheWrite,
    }),
  });
  if (!res.ok) {
    console.error(`[ai-proxy] usage record failed (${res.status}): ${await res.text().catch(() => "")}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method-not-allowed" });

  if (!ANTHROPIC_API_KEY) return json(500, { error: "server-misconfigured", detail: "ANTHROPIC_API_KEY not set" });

  // 1) Identify the caller.
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json(401, { error: "not-signed-in" });
  const userId = await getUserId(jwt);
  if (!userId) return json(401, { error: "invalid-session" });

  // 2) Entitlement: AI is a Pro perk.
  if (!(await isProUser(userId))) return json(403, { error: "not-pro" });

  // 3) Budget: refuse when the monthly token budget is already spent.
  const period = usagePeriod();
  const used = await tokensUsedThisPeriod(userId, period);
  if (used >= PRO_MONTHLY_TOKENS) {
    return json(429, { error: "quota-exceeded", used, budget: PRO_MONTHLY_TOKENS });
  }

  // 4) Parse + sanity-check the Anthropic request.
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "bad-request", detail: "body is not JSON" });
  }
  if (!body || typeof body !== "object" || !Array.isArray(body.messages) || !body.model) {
    return json(400, { error: "bad-request", detail: "not an Anthropic Messages request" });
  }
  if (typeof body.model !== "string" || !body.model.startsWith("claude-")) {
    return json(400, { error: "bad-request", detail: "unsupported model" });
  }
  // Clamp the output ceiling so one call can't run up an unbounded bill.
  if (typeof body.max_tokens !== "number" || body.max_tokens > MAX_TOKENS_CEILING) {
    body.max_tokens = MAX_TOKENS_CEILING;
  }

  // 5) Forward to Anthropic with the SERVER key (never exposed to the browser).
  let upstream: Response;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-beta": ANTHROPIC_BETA,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return json(502, { error: "upstream-unreachable", detail: (e as Error).message });
  }

  const text = await upstream.text();
  if (!upstream.ok) {
    // Pass Anthropic's status through so the client's error handling still works.
    return new Response(text, {
      status: upstream.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 6) Meter the real usage, then return the response verbatim.
  try {
    const parsed = JSON.parse(text) as {
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      };
    };
    const u = parsed.usage ?? {};
    await recordUsage(userId, period, {
      input: u.input_tokens ?? 0,
      output: u.output_tokens ?? 0,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
    });
  } catch (e) {
    console.error(`[ai-proxy] could not parse usage: ${(e as Error).message}`);
  }

  return new Response(text, {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
