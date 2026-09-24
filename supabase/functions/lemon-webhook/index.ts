import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Lemon Squeezy webhook -> maintains the `subscriptions` table. Deploy WITHOUT JWT verification
// (Lemon Squeezy can't send a Supabase JWT):
//   supabase functions deploy lemon-webhook --no-verify-jwt
// Secrets it needs (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected automatically):
//   supabase secrets set LEMON_SQUEEZY_SIGNING_SECRET=<the webhook signing secret>
// Point the Lemon Squeezy webhook (Settings -> Webhooks) at:
//   https://<project-ref>.supabase.co/functions/v1/lemon-webhook
//
// Identity: the checkout passes the signed-in user's Supabase UUID as custom data, which arrives here at
// meta.custom_data.user_id (see src/billing/checkout.ts). No email fallback exists.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SIGNING_SECRET = Deno.env.get("LEMON_SQUEEZY_SIGNING_SECRET") ?? "";

const GRACE_MS = 3 * 24 * 60 * 60 * 1000; // 3-day-max grace after a sub leaves active/on_trial

/** Verify Lemon Squeezy's `X-Signature` header: hex HMAC-SHA256 of the RAW body with the signing secret. */
async function verifySignature(rawBody: string, header: string, secret: string): Promise<boolean> {
  if (!secret || !header) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");

  // Constant-time compare (lower-cased; the header is a hex digest).
  const given = header.trim().toLowerCase();
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
 *  the write succeeded so the handler can reply non-2xx and let Lemon Squeezy RETRY - a swallowed write
 *  failure would permanently lose an upgrade (paid, never granted) or a downgrade (cancelled, still Pro). */
async function upsertSubscription(row: Record<string, unknown>): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions`, {
    method: "POST",
    headers: { ...SERVICE_HEADERS, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(row),
  });
  if (!res.ok) { console.error("[lemon-webhook] upsert failed", res.status, await res.text()); return false; }
  return true;
}

/** Fallback identity: find the account by the stored Lemon Squeezy subscription id. Portal/admin
 *  initiated lifecycle events (cancel, expire) may not carry meta.custom_data, so without this a cancel
 *  could be dropped and the user would stay Pro forever. The row was created with custom_data on the
 *  first (checkout) event, so it already has ls_subscription_id to match on. */
async function findUserBySubscriptionId(subscriptionId: string): Promise<string | undefined> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?ls_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=user_id`,
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

// Subscription lifecycle events carry the subscription object in `data.attributes` (with `status`).
// Payment events (subscription_payment_*) carry an INVOICE object instead, so we ignore them here -
// the accompanying subscription_updated event carries the authoritative status.
const LIFECYCLE = new Set([
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_expired",
  "subscription_paused",
  "subscription_unpaused",
  "subscription_resumed",
]);

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const rawBody = await req.text();
  const signature = req.headers.get("X-Signature") ?? "";
  if (!(await verifySignature(rawBody, signature, SIGNING_SECRET))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event: {
    meta?: { event_name?: string; custom_data?: Record<string, unknown> };
    data?: { id?: string; attributes?: Record<string, unknown> };
  };
  try { event = JSON.parse(rawBody); } catch { return new Response("Bad JSON", { status: 400 }); }

  const eventName = event.meta?.event_name ?? "";
  // Only lifecycle events tell us the subscription status; ack everything else so LS doesn't retry.
  if (!LIFECYCLE.has(eventName)) return new Response("ignored", { status: 200 });

  const customData = event.meta?.custom_data ?? {};
  const subscriptionId = event.data?.id;
  let userId = typeof customData["user_id"] === "string" ? customData["user_id"] : undefined;
  // Custom-data-less event (e.g. a portal-initiated cancel) -> map back to the account by subscription id.
  if (!userId && subscriptionId) userId = await findUserBySubscriptionId(subscriptionId);
  if (!userId) return new Response("no user mapping", { status: 200 });

  const attrs = event.data?.attributes ?? {};
  const lsStatus = typeof attrs["status"] === "string" ? (attrs["status"] as string) : "";
  const endsAt = typeof attrs["ends_at"] === "string" ? (attrs["ends_at"] as string) : null;
  const renewsAt = typeof attrs["renews_at"] === "string" ? (attrs["renews_at"] as string) : null;
  const now = Date.now();

  // Map the LS status -> our (plan, status, current_period_end). current_period_end is the entitlement
  // expiry; refreshPlan() grants Pro while it is in the future (or status is active/trialing).
  let plan = "free";
  let status = "inactive";
  let currentPeriodEnd: string | null = null;
  if (lsStatus === "active") { plan = "pro"; status = "active"; currentPeriodEnd = renewsAt; }
  else if (lsStatus === "on_trial") { plan = "pro"; status = "trialing"; currentPeriodEnd = renewsAt; }
  else if (lsStatus === "cancelled") { plan = "pro"; status = "canceled"; currentPeriodEnd = graceEnd(endsAt, now); }
  else if (lsStatus === "past_due" || lsStatus === "paused") { plan = "pro"; status = "past_due"; currentPeriodEnd = graceEnd(endsAt, now); }
  else { plan = "free"; status = "canceled"; currentPeriodEnd = new Date(now).toISOString(); } // unpaid / expired / unknown

  const ok = await upsertSubscription({
    user_id: userId,
    plan,
    status,
    current_period_end: currentPeriodEnd,
    ls_customer_id: attrs["customer_id"] != null ? String(attrs["customer_id"]) : null,
    ls_subscription_id: subscriptionId ?? null,
    ls_variant_id: attrs["variant_id"] != null ? String(attrs["variant_id"]) : null,
    ls_order_id: attrs["order_id"] != null ? String(attrs["order_id"]) : null,
    updated_at: new Date(now).toISOString(),
  });

  // Reply non-2xx on a write failure so Lemon Squeezy retries the delivery (never silently drop a
  // paid upgrade or a cancellation).
  return ok ? new Response("ok", { status: 200 }) : new Response("upsert failed", { status: 500 });
});
