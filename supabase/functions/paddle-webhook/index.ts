import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Paddle Billing (v2) webhook -> maintains the `subscriptions` table. Deploy WITHOUT JWT verification
// (Paddle can't send a Supabase JWT):
//   supabase functions deploy paddle-webhook --no-verify-jwt
// Secrets it needs (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected automatically):
//   supabase secrets set PADDLE_WEBHOOK_SECRET=pdl_ntfset_...   (the notification destination's secret)
// Point the Paddle notification destination (Developer tools -> Notifications) at:
//   https://<project-ref>.supabase.co/functions/v1/paddle-webhook
// Sandbox and live have SEPARATE destinations with SEPARATE signing secrets.
//
// Identity: the checkout passes the signed-in user's Supabase UUID as customData.userId, which arrives
// here at data.custom_data.userId (see src/billing/checkout.ts). Paddle preserves custom_data on the
// subscription across events; a portal/admin-initiated event that lacks it is mapped back by
// paddle_subscription_id (findUserBySubscriptionId), so a cancel is never dropped.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PADDLE_WEBHOOK_SECRET = Deno.env.get("PADDLE_WEBHOOK_SECRET") ?? "";

const GRACE_MS = 3 * 24 * 60 * 60 * 1000; // 3-day-max grace after a sub leaves active/trialing

/** Verify Paddle's `Paddle-Signature` header ("ts=<unix>;h1=<hex hmac-sha256>"): the HMAC is computed
 *  over `${ts}:${rawBody}` with the destination signing secret. */
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

  // Constant-time compare (lower-cased; h1 is a hex digest).
  const given = h1.trim().toLowerCase();
  if (computed.length !== given.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

const SERVICE_HEADERS = {
  "Content-Type": "application/json",
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
};

/** Upsert a subscription row via the REST API using the service role (bypasses RLS). Returns whether
 *  the write succeeded so the handler can reply non-2xx and let Paddle RETRY - a swallowed write failure
 *  would permanently lose an upgrade (paid, never granted) or a downgrade (cancelled, still Pro). */
async function upsertSubscription(row: Record<string, unknown>): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions`, {
    method: "POST",
    headers: { ...SERVICE_HEADERS, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(row),
  });
  if (!res.ok) { console.error("[paddle-webhook] upsert failed", res.status, await res.text()); return false; }
  return true;
}

/** Fallback identity: find the account by the stored Paddle subscription id. Portal/admin-initiated
 *  lifecycle events may not carry custom_data, so without this a cancel could be dropped and the user
 *  would stay Pro forever. The row was created with custom_data on the first event, so it already has
 *  paddle_subscription_id to match on. */
async function findUserBySubscriptionId(subscriptionId: string): Promise<string | undefined> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?paddle_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=user_id`,
      { headers: SERVICE_HEADERS },
    );
    if (!res.ok) return undefined;
    const rows = await res.json();
    const uid = Array.isArray(rows) && rows[0] ? rows[0]["user_id"] : undefined;
    return typeof uid === "string" ? uid : undefined;
  } catch {
    return undefined;
  }
}

/** Cap the entitlement expiry at 3 days from now (or the paid period end, whichever is sooner). */
function graceEnd(endsAt: string | null, now: number): string {
  const cap = now + GRACE_MS;
  if (!endsAt) return new Date(cap).toISOString();
  const parsed = Date.parse(endsAt);
  return new Date(Number.isNaN(parsed) ? cap : Math.min(parsed, cap)).toISOString();
}

// Subscription lifecycle events carry the subscription object in `data` (with `data.status`). We derive
// entitlement from the status, so a single set of events is enough; ack everything else so Paddle
// doesn't retry. Transaction/payment events are ignored (the subscription.* event carries the truth).
const LIFECYCLE = new Set([
  "subscription.created",
  "subscription.updated",
  "subscription.activated",
  "subscription.trialing",
  "subscription.canceled",
  "subscription.past_due",
  "subscription.paused",
  "subscription.resumed",
]);

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const rawBody = await req.text();
  const signature = req.headers.get("Paddle-Signature") ?? "";
  if (!(await verifyPaddleSignature(rawBody, signature, PADDLE_WEBHOOK_SECRET))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event: { event_type?: string; data?: Record<string, unknown> };
  try { event = JSON.parse(rawBody); } catch { return new Response("Bad JSON", { status: 400 }); }

  const eventType = event.event_type ?? "";
  // Only lifecycle events tell us the subscription status; ack everything else so Paddle doesn't retry.
  if (!LIFECYCLE.has(eventType)) return new Response("ignored", { status: 200 });

  const data = event.data ?? {};
  const subscriptionId = typeof data["id"] === "string" ? (data["id"] as string) : undefined;
  const customData = (data["custom_data"] ?? {}) as Record<string, unknown>;
  let userId = typeof customData["userId"] === "string" ? (customData["userId"] as string) : undefined;
  // Custom-data-less event (e.g. a portal-initiated cancel) -> map back to the account by subscription id.
  if (!userId && subscriptionId) userId = await findUserBySubscriptionId(subscriptionId);
  if (!userId) return new Response("no user mapping", { status: 200 });

  const paddleStatus = typeof data["status"] === "string" ? (data["status"] as string) : "";
  const billingPeriod = (data["current_billing_period"] ?? {}) as Record<string, unknown>;
  const periodEndsAt = typeof billingPeriod["ends_at"] === "string" ? (billingPeriod["ends_at"] as string)
    : (typeof data["next_billed_at"] === "string" ? (data["next_billed_at"] as string) : null);
  const now = Date.now();

  // Map the Paddle status -> our (plan, status, current_period_end). current_period_end is the
  // entitlement expiry; refreshPlan() grants Pro while it is in the future (or status is active/trialing).
  let plan = "free";
  let status = "inactive";
  let currentPeriodEnd: string | null = null;
  if (paddleStatus === "active") { plan = "pro"; status = "active"; currentPeriodEnd = periodEndsAt; }
  else if (paddleStatus === "trialing") { plan = "pro"; status = "trialing"; currentPeriodEnd = periodEndsAt; }
  else if (paddleStatus === "past_due" || paddleStatus === "paused") { plan = "pro"; status = "past_due"; currentPeriodEnd = graceEnd(periodEndsAt, now); }
  else if (paddleStatus === "canceled") { plan = "pro"; status = "canceled"; currentPeriodEnd = graceEnd(periodEndsAt, now); }
  else { plan = "free"; status = "canceled"; currentPeriodEnd = new Date(now).toISOString(); } // unknown

  const customerId = data["customer_id"];
  const ok = await upsertSubscription({
    user_id: userId,
    plan,
    status,
    current_period_end: currentPeriodEnd,
    paddle_customer_id: customerId != null ? String(customerId) : null,
    paddle_subscription_id: subscriptionId ?? null,
    updated_at: new Date(now).toISOString(),
  });

  // Reply non-2xx on a write failure so Paddle retries the delivery (never silently drop a paid upgrade
  // or a cancellation).
  return ok ? new Response("ok", { status: 200 }) : new Response("upsert failed", { status: 500 });
});
