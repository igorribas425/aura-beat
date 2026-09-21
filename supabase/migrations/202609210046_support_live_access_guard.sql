-- Keep suspended support identities isolated from the normal Aura Beat navigation.
create or replace function public.is_support_identity_v1()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.aura_admins aa
    where aa.user_id = auth.uid()
      and aa.role = 'support'
  );
$$;

revoke all on function public.is_support_identity_v1() from public;
grant execute on function public.is_support_identity_v1() to authenticated;
