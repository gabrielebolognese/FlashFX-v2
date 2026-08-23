import { usePlanStore } from './plans';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../auth/store';

// Billing seam — ALL Paddle wiring lands here, and the UI already calls into it. To go live:
//   1. Flip BILLING_ENABLED to true.
//   2. Fill the TODO(paddle) in startCheckout (open Paddle checkout for the Pro price).
//   3. Fill the TODO(paddle) in refreshPlan (read the webhook-written subscription row).
//   4. Set PRO_PRICE_LABEL to the real price.
// Nothing else in the app needs to change — the upgrade button, pricing modal, plan store, and
// quota enforcement are all already wired to this module.

// Typed as boolean (not the literal `false`) so the not-yet-written branches don't read as
// unreachable code while billing is off.
export const BILLING_ENABLED: boolean = false;

/** Shown on the upgrade CTA. Set to your real Paddle price when ready. */
export const PRO_PRICE_LABEL = '$12/mo';

export type CheckoutError = 'not-configured' | 'not-signed-in' | 'failed';
export interface CheckoutResult { ok: boolean; error?: CheckoutError }

/** Start the Pro upgrade checkout. Stubbed until Paddle is connected. */
export async function startCheckout(): Promise<CheckoutResult> {
  if (!BILLING_ENABLED) return { ok: false, error: 'not-configured' };
  const user = useAuthStore.getState().user;
  if (!user) return { ok: false, error: 'not-signed-in' };
  try {
    // TODO(paddle): open Paddle checkout for the Pro price, passing user.email as the customer and
    // user.id as customData so the webhook can map the payment back to this account, e.g.
    //   Paddle.Checkout.open({
    //     items: [{ priceId: PADDLE_PRO_PRICE_ID, quantity: 1 }],
    //     customer: { email: user.email ?? undefined },
    //     customData: { userId: user.id },
    //   });
    return { ok: false, error: 'failed' };
  } catch {
    return { ok: false, error: 'failed' };
  }
}

/** Read the account's plan from the webhook-written `subscriptions` row into the plan store.
 *  Called on sign-in. Decoupled from BILLING_ENABLED (which only gates buying): the moment the
 *  webhook writes an active Pro subscription, the user gets Pro. Missing table / no row → 'free'. */
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
