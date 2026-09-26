/*
# Subscriptions: switch billing provider Lemon Squeezy -> Paddle

Reverses 20260923120000_subscriptions_lemonsqueezy.sql. Lemon Squeezy was never taken live (no live
webhook, no customers), so the table has no rows and dropping its provider columns is safe. plan /
status / current_period_end / user_id and the read-your-own RLS are unchanged - those are
provider-agnostic. The paddle-webhook edge function (service role) writes these columns.

## Grace window (unchanged, provider-agnostic)
current_period_end carries the entitlement expiry. On active/trialing it is the current billing
period end; on past_due/paused/canceled the webhook caps it at 3 days out (founder decision).
refreshPlan() grants Pro while status is active/trialing OR current_period_end is still in the future.
*/

alter table public.subscriptions drop column if exists ls_customer_id;
alter table public.subscriptions drop column if exists ls_subscription_id;
alter table public.subscriptions drop column if exists ls_variant_id;
alter table public.subscriptions drop column if exists ls_order_id;

alter table public.subscriptions add column if not exists paddle_customer_id     text;
alter table public.subscriptions add column if not exists paddle_subscription_id text;
