/*
# Subscriptions: switch billing provider Paddle -> Lemon Squeezy

Paddle was never activated (no keys, no customers), so the table has no rows and dropping its provider
columns is safe. plan / status / current_period_end / user_id and the read-your-own RLS are unchanged -
those are provider-agnostic. The lemon-webhook edge function (service role) writes these new columns.

## Grace window
current_period_end carries the entitlement expiry. On active/on_trial it is the next renewal; on
cancelled/past_due/paused the webhook caps it at 3 days out (founder decision). refreshPlan() grants Pro
while status is active/trialing OR current_period_end is still in the future.
*/

alter table public.subscriptions drop column if exists paddle_customer_id;
alter table public.subscriptions drop column if exists paddle_subscription_id;

alter table public.subscriptions add column if not exists ls_customer_id     text;
alter table public.subscriptions add column if not exists ls_subscription_id text;
alter table public.subscriptions add column if not exists ls_variant_id      text;
alter table public.subscriptions add column if not exists ls_order_id        text;
