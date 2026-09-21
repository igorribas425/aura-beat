revoke execute on function public.get_public_plan_levels_v1(uuid[], uuid[]) from anon;
grant execute on function public.get_public_plan_levels_v1(uuid[], uuid[]) to authenticated, service_role;
