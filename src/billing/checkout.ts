import { usePlanStore } from './plans';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../auth/store';

// Billing seam — the whole Paddle integration lives here and is fully wired. To GO LIVE you only set
// env vars (no code changes):
//   VITE_PADDLE_CLIENT_TOKEN  — Paddle client-side token (public; safe in the bundle, like a Stripe
//                               publishable key). Presence of this + the price id turns billing ON.
//   VITE_PADDLE_PRICE_ID      — the "FlashFX Pro" recurring price id (pri_…).
//   VITE_PADDLE_ENV           — 'sandbox' (default) or 'production'.
//   VITE_PADDLE_PRICE_LABEL   — optional display price, e.g. '$12/mo'.
// The webhook (supabase/functions/paddle-webhook) writes the subscription; refreshPlan() reads it.

const PADDLE_TOKEN = import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string | undefined;
const PADDLE_PRICE_ID = import.meta.env.VITE_PADDLE_PRICE_ID as string | undefined;
const PADDLE_ENV = (import.meta.env.VITE_PADDLE_ENV as string | undefined) ?? 'sandbox';

/** Billing is enabled exactly when the Paddle token + price id are configured. */
export const BILLING_ENABLED: boolean = !!(PADDLE_TOKEN && PADDLE_PRICE_ID);

/** Shown on the upgrade CTA. */
export const PRO_PRICE_LABEL = (import.meta.env.VITE_PADDLE_PRICE_LABEL as string | undefined) ?? '$12/mo';

export type CheckoutError = 'not-configured' | 'not-signed-in' | 'failed';
export interface CheckoutResult { ok: boolean; error?: CheckoutError }

// ── minimal Paddle.js v2 typings (only what we call) ──
interface PaddleCheckoutArgs {
  items: { priceId: string; quantity: number }[];
  customer?: { email?: string };
  customData?: Record<string, unknown>;
}
interface PaddleInstance {
  Environment: { set: (env: string) => void };
  Initialize: (opts: { token: string; eventCallback?: (e: { name?: string }) => void }) => void;
  Checkout: { open: (args: PaddleCheckoutArgs) => void };
}
declare global {
  interface Window { Paddle?: PaddleInstance }
}

let paddleReady: Promise<PaddleInstance> | null = null;

/** Load + initialize Paddle.js once (idempotent). */
function loadPaddle(): Promise<PaddleInstance> {
  if (paddleReady) return paddleReady;
  paddleReady = new Promise<PaddleInstance>((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') { reject(new Error('no window')); return; }
    const init = () => {
      const P = window.Paddle;
      if (!P) { reject(new Error('Paddle unavailable')); return; }
      if (PADDLE_ENV !== 'production') P.Environment.set('sandbox');
      P.Initialize({ token: PADDLE_TOKEN as string, eventCallback: onPaddleEvent });
      resolve(P);
    };
    if (window.Paddle) { init(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    s.async = true;
    s.onload = init;
    s.onerror = () => reject(new Error('Paddle script failed to load'));
    document.head.appendChild(s);
  });
  return paddleReady;
}

/** After a completed checkout the webhook writes the subscription asynchronously — poll a few times. */
function onPaddleEvent(e: { name?: string }): void {
  if (e?.name !== 'checkout.completed') return;
  let tries = 0;
  const poll = (): void => {
    void refreshPlan().then(() => {
      tries += 1;
      if (usePlanStore.getState().plan !== 'pro' && tries < 6) window.setTimeout(poll, 2000);
    });
  };
  window.setTimeout(poll, 2000);
}

/** Open the Pro upgrade checkout. */
export async function startCheckout(): Promise<CheckoutResult> {
  if (!BILLING_ENABLED) return { ok: false, error: 'not-configured' };
  const user = useAuthStore.getState().user;
  if (!user) return { ok: false, error: 'not-signed-in' };
  try {
    const paddle = await loadPaddle();
    paddle.Checkout.open({
      items: [{ priceId: PADDLE_PRICE_ID as string, quantity: 1 }],
      customer: user.email ? { email: user.email } : undefined,
      // The webhook maps the payment back to this account via custom_data.userId.
      customData: { userId: user.id },
    });
    return { ok: true };
  } catch {
    return { ok: false, error: 'failed' };
  }
}

/** Read the account's plan from the webhook-written `subscriptions` row into the plan store.
 *  Called on sign-in and after checkout. Missing table / no row → 'free'. */
export async function refreshPlan(): Promise<void> {
  const setPlan = usePlanStore.getState().setPlan;
  const userId = useAuthStore.getState().user?.id;
  if (!supabase || !userId) { setPlan('free'); return; }
  try {
    const { data, error } = await supabase.from('subscriptions').select('plan, status').eq('user_id', userId).maybeSingle();
    if (error || !data) { setPlan('free'); return; }
    const active = data.status === 'active' || data.status === 'trialing';
    setPlan(active && data.plan === 'pro' ? 'pro' : 'free');
  } catch {
    setPlan('free');
  }
}
