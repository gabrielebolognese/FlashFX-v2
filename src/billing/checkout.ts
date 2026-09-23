import { usePlanStore } from './plans';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../auth/store';

// Billing seam - the whole Lemon Squeezy integration lives here. To GO LIVE you only set env vars (no
// code changes):
//   VITE_LEMON_CHECKOUT_URL   - the variant's hosted checkout link, e.g.
//                               'https://<store>.lemonsqueezy.com/checkout/buy/<variant-uuid>'.
//                               Its presence turns billing ON.
//   VITE_LEMON_PRICE_LABEL    - optional display price on the CTA, e.g. '$29.99/mo'.
//   VITE_LEMON_VARIANT_ID     - optional; not needed for the hosted-checkout overlay, kept for future
//                               API-created checkouts.
// The webhook (supabase/functions/lemon-webhook) writes the subscription; refreshPlan() reads it. We
// pass the signed-in user's UUID as custom data so the webhook can map the payment back to the account.

const LEMON_CHECKOUT_URL = import.meta.env.VITE_LEMON_CHECKOUT_URL as string | undefined;

/** Billing is enabled exactly when the Lemon Squeezy checkout link is configured. */
export const BILLING_ENABLED: boolean = !!LEMON_CHECKOUT_URL;

/** Shown on the upgrade CTA. */
export const PRO_PRICE_LABEL = (import.meta.env.VITE_LEMON_PRICE_LABEL as string | undefined) ?? '$29.99/mo';

export type CheckoutError = 'not-configured' | 'not-signed-in' | 'failed';
export interface CheckoutResult { ok: boolean; error?: CheckoutError }

// -- minimal Lemon.js typings (only what we call) --
interface LemonSqueezyInstance {
  Setup: (opts: { eventHandler?: (e: { event?: string }) => void }) => void;
  Url: { Open: (url: string) => void; Close: () => void };
  Refresh: () => void;
}
declare global {
  interface Window {
    createLemonSqueezy?: () => void;
    LemonSqueezy?: LemonSqueezyInstance;
  }
}

let lemonReady: Promise<LemonSqueezyInstance> | null = null;

/** Load + initialize Lemon.js once (idempotent). */
function loadLemon(): Promise<LemonSqueezyInstance> {
  if (lemonReady) return lemonReady;
  lemonReady = new Promise<LemonSqueezyInstance>((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') { reject(new Error('no window')); return; }
    const init = () => {
      if (typeof window.createLemonSqueezy !== 'function') { reject(new Error('Lemon.js unavailable')); return; }
      window.createLemonSqueezy();
      const LS = window.LemonSqueezy;
      if (!LS) { reject(new Error('LemonSqueezy unavailable')); return; }
      LS.Setup({ eventHandler: onLemonEvent });
      resolve(LS);
    };
    if (window.LemonSqueezy) { init(); return; }
    const s = document.createElement('script');
    s.src = 'https://assets.lemonsqueezy.com/lemon.js';
    s.defer = true;
    s.onload = init;
    s.onerror = () => reject(new Error('Lemon.js failed to load'));
    document.head.appendChild(s);
  });
  return lemonReady;
}

/** After a completed checkout the webhook writes the subscription asynchronously - poll a few times. */
function onLemonEvent(e: { event?: string }): void {
  if (e?.event !== 'Checkout.Success') return;
  let tries = 0;
  const poll = (): void => {
    void refreshPlan().then(() => {
      tries += 1;
      if (usePlanStore.getState().plan !== 'pro' && tries < 6) window.setTimeout(poll, 2000);
    });
  };
  window.setTimeout(poll, 2000);
}

/** Build the hosted-checkout URL with the user's email prefilled and their UUID as custom data.
 *  Brackets are kept literal (Lemon Squeezy's documented format); only values are encoded. */
function buildCheckoutUrl(userId: string, email: string | null): string {
  const base = LEMON_CHECKOUT_URL as string;
  const q = [
    'embed=1',
    email ? `checkout[email]=${encodeURIComponent(email)}` : '',
    `checkout[custom][user_id]=${encodeURIComponent(userId)}`,
  ].filter(Boolean).join('&');
  return `${base}${base.includes('?') ? '&' : '?'}${q}`;
}

/** Open the Pro upgrade checkout (Lemon Squeezy overlay). */
export async function startCheckout(): Promise<CheckoutResult> {
  if (!BILLING_ENABLED) return { ok: false, error: 'not-configured' };
  const user = useAuthStore.getState().user;
  if (!user) return { ok: false, error: 'not-signed-in' };
  try {
    const LS = await loadLemon();
    LS.Url.Open(buildCheckoutUrl(user.id, user.email));
    return { ok: true };
  } catch {
    return { ok: false, error: 'failed' };
  }
}

/** Read the account's plan from the webhook-written `subscriptions` row into the plan store.
 *  Called on sign-in and after checkout. Missing table / no row -> 'free'.
 *  Grace: Pro holds while status is active/trialing OR current_period_end is still in the future
 *  (the webhook caps that at 3 days after a sub leaves active/on_trial). */
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
    if (error || !data) { setPlan('free'); return; }
    const active = data.status === 'active' || data.status === 'trialing';
    const graceValid = data.current_period_end ? Date.parse(data.current_period_end) > Date.now() : false;
    setPlan(data.plan === 'pro' && (active || graceValid) ? 'pro' : 'free');
  } catch {
    setPlan('free');
  }
}
