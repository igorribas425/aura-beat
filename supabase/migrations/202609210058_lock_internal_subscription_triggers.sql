-- Trigger functions must not be callable as public RPC endpoints.
-- Existing database triggers continue to execute them internally.

revoke execute on function public.activate_subscription_from_payment_v1() from public, anon, authenticated;
revoke execute on function public.notify_subscription_payment_change_v1() from public, anon, authenticated;

notify pgrst, 'reload schema';
