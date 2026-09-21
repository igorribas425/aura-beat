drop index if exists public.subscription_payments_active_checkout_uidx;

create unique index subscription_payments_active_checkout_uidx
  on public.subscription_payments(plan_id,user_id,provider)
  where status in ('pending','processing');

notify pgrst,'reload schema';
