import { usePlanStore } from './plans';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../auth/store';

// Billing seam - the whole Paddle (Paddle Billing v2) integration lives here. To GO LIVE you only set
// env vars (no code changes):
//   VITE_PADDLE_CLIENT_TOKEN  - Paddle client-side token (public; safe in the bundle, like a Stripe
//                               publishable key). Sandbox tokens start `test_`, live tokens `live_`.
//                               Presence of this + the price id turns billing ON.
//   VITE_PADDLE_PRICE_ID      - the "FlashFX Pro" recurring price id (pri_...). Sandbox and live differ.
//   VITE_PADDLE_ENV           - 'sandbox' (default) or 'production'. Set 'production' for the live token.
//   VITE_PADDLE_PRICE_LABEL   - optional display price on the CTA, e.g. '€29.99/mo'. The Paddle price
//                               itself must be created in EUR (currency is set in the Paddle catalog).
// The webhook (supabase/functions/paddle-webhook) writes the subscription; refreshPlan() reads it. We
// pass the signed-in user's UUID as customData.userId so the webhook can map the payment back to the account.

const PADDLE_TOKEN = import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string | undefined;
const PADDLE_PRICE_ID = import.meta.env.VITE_PADDLE_PRICE_ID as string | undefined;
const PADDLE_ENV = (import.meta.env.VITE_PADDLE_ENV as string | undefined) ?? 'sandbox';

/** Billing is enabled exactly when the Paddle token + price id are configured. */
export const BILLING_ENABLED: boolean = !!(PADDLE_TOKEN && PADDLE_PRICE_ID);

/** Shown on the upgrade CTA. */
export const PRO_PRICE_LABEL = (import.meta.env.VITE_PADDLE_PRICE_LABEL as string | undefined) ?? '€29.99/mo';

export type CheckoutError = 'not-configured' | 'not-signed-in' | 'failed';
export interface CheckoutResult { ok: boolean; error?: CheckoutError }

// -- minimal Paddle.js v2 typings (only what we call) --
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
      // Sandbox must be selected BEFORE Initialize; live is the default so we set nothing for production.
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

/** After a completed checkout the webhook writes the subscription asynchronously - poll a few times. */
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

/** Open the Pro upgrade checkout (Paddle overlay). */
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
 *  Called on sign-in and after checkout. Missing table / no row -> 'free'.
 *  Grace: Pro holds while status is active/trialing OR current_period_end is still in the future
 *  (the webhook caps that at 3 days after a sub leaves active/trialing). */
export async function refreshPlan(): Promise<void> {
  const setPlan = usePlanStore.getState().setPlan;
  const userId = useAuthStore.getState().user?.id;
  if (!supabase || !userId) { setPlan('free'); return; }
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('plan, status, current_period_end')
      .eq('user_id', userId)
      .maybeSingle();
    // A transient read failure (network blip / RLS hiccup) must NOT downgrade a paying customer - keep
    // the current (cached) plan and let the next refresh correct it. Only a SUCCESSFUL read with no row
    // means the user genuinely has no subscription -> free.
    if (error) return;
    if (!data) { setPlan('free'); return; }
    const active = data.status === 'active' || data.status === 'trialing';
    const graceValid = data.current_period_end ? Date.parse(data.current_period_end) > Date.now() : false;
    setPlan(data.plan === 'pro' && (active || graceValid) ? 'pro' : 'free');
  } catch {
    /* transient failure: keep the current plan, don't downgrade on a blip */
  }
}
