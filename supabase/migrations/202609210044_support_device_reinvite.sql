-- 2026-09-21
-- Permite ao owner transferir um atendente para um novo dispositivo com novo convite.

create or replace function public.owner_support_device_reinvite_v1(
  p_user_id uuid
)
returns text
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_email text;
  v_invite_id uuid;
begin
  if auth.uid() is null or not public.owner_access_v1() then
    raise exception 'Acesso restrito ao proprietário Aura';
  end if;

  select lower(u.email)
  into v_email
  from public.aura_admins aa
  join auth.users u on u.id=aa.user_id
  where aa.user_id=p_user_id
    and aa.role='support'
    and aa.is_active=true;

  if v_email is null then
    raise exception 'Atendente ativo não encontrado';
  end if;

  update public.support_agent_devices
  set revoked_at=coalesce(revoked_at,now())
  where user_id=p_user_id;

  update public.support_team_invites
  set status='cancelled'
  where lower(email)=v_email
    and status='pending';

  insert into public.support_team_invites(
    email,invited_by,status,created_at,expires_at
  )
  values(
    v_email,auth.uid(),'pending',now(),now() + interval '7 days'
  )
  returning id into v_invite_id;

  return v_email;
end;
$function$;

revoke all on function public.owner_support_device_reinvite_v1(uuid)
from public,anon;
grant execute on function public.owner_support_device_reinvite_v1(uuid)
to authenticated;

notify pgrst,'reload schema';
