-- 2026-09-21
-- Owner-only access helper for the private Aura Beat admin area.

create or replace function public.owner_access_v1()
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select exists (
    select 1
    from public.aura_admins aa
    where aa.user_id = auth.uid()
      and aa.is_active = true
      and aa.role = 'owner'
  );
$function$;

revoke all on function public.owner_access_v1()
from public,anon;

grant execute on function public.owner_access_v1()
to authenticated;

notify pgrst,'reload schema';
