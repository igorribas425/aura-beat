-- Aura Beat production hardening: keep legacy admin helper aligned with aura_admins.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.admin_users legacy
      where legacy.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.aura_admins staff
      where staff.user_id = auth.uid()
        and staff.is_active = true
        and staff.role in ('reviewer','admin','owner')
    );
$$;

revoke execute on function public.is_support_identity_v1() from anon;
grant execute on function public.is_support_identity_v1() to authenticated;

notify pgrst, 'reload schema';
