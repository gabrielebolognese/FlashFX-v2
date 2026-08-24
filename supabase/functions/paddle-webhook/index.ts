import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Paddle Billing webhook → maintains the `subscriptions` table. Deploy WITHOUT JWT verification
// (Paddle can't send a Supabase JWT):
//   supabase functions deploy paddle-webhook --no-verify-jwt
// Secrets it needs (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected automatically):
//   supabase secrets set PADDLE_WEBHOOK_SECRET=whsec_...
// Point Paddle's webhook destination at:
//   https://<project-ref>.supabase.co/functions/v1/paddle-webhook
//
// TODO(paddle): the field paths below (data.custom_data.userId, data.status, data.customer_id,
// data.id) follow Paddle Billing v2 subscription events — confirm against a real event in the
// Paddle dashboard's webhook simulator before going live.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PADDLE_WEBHOOK_SECRET = Deno.env.get("PADDLE_WEBHOOK_SECRET") ?? "";

/** Verify Paddle Billing's `Paddle-Signature` header ("ts=<unix>;h1=<hex hmac-sha256>"). */
async function verifyPaddleSignature(rawBody: string, header: string, secret: string): Promise<boolean> {
  if (!secret || !header) return false;
  const parts: Record<string, string> = {};
  for (const kv of header.split(";")) {
    const idx = kv.indexOf("=");
    if (idx > 0) parts[kv.slice(0, idx).trim()] = kv.slice(idx + 1).trim();
  }
  const ts = parts["ts"];
  const h1 = parts["h1"];
  if (!ts || !h1) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}:${rawBody}`));
  const computed = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");

  // Constant-time compare.
  if (computed.length !== h1.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ h1.charCodeAt(i);
  return diff === 0;
}

/** Upsert a subscription row via the REST API using the service role (bypasses RLS). */
async function upsertSubscription(row: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) console.error("[paddle-webhook] upsert failed", res.status, await res.text());
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const rawBody = await req.text();
  const signature = req.headers.get("Paddle-Signature") ?? "";
  if (!(await verifyPaddleSignature(rawBody, signature, PADDLE_WEBHOOK_SECRET))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event: { event_type?: string; data?: Record<string, unknown> };
  try { event = JSON.parse(rawBody); } catch { return new Response("Bad JSON", { status: 400 }); }

  const type = event.event_type ?? "";
  const data = event.data ?? {};
  const customData = (data["custom_data"] ?? {}) as Record<string, unknown>;
  const userId = typeof customData["userId"] === "string" ? customData["userId"] : undefined;
  // No mapping → nothing to do (respond 200 so Paddle doesn't retry a benign event).
  if (!userId) return new Response("no user mapping", { status: 200 });

  const status = typeof data["status"] === "string" ? (data["status"] as string) : "inactive";
  const isActive = status === "active" || status === "trialing";

  if (type === "subscription.created" || type === "subscription.updated") {
    await upsertSubscription({
      user_id: userId,
      plan: isActive ? "pro" : "free",
      status,
      paddle_customer_id: data["customer_id"] ?? null,
      paddle_subscription_id: data["id"] ?? null,
      current_period_end: (data["current_billing_period"] as Record<string, unknown> | undefined)?.["ends_at"] ?? null,
      updated_at: new Date().toISOString(),
    });
  } else if (type === "subscription.canceled") {
    await upsertSubscription({
      user_id: userId,
      plan: "free",
      status: "canceled",
      paddle_subscription_id: data["id"] ?? null,
      updated_at: new Date().toISOString(),
    });
  }

  return new Response("ok", { status: 200 });
});
