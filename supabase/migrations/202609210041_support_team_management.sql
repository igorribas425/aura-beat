-- 2026-09-21
-- Gestão da Equipe Aura pelo owner sem conceder acesso administrativo completo.

create or replace function public.owner_support_team_list_v1()
returns table(
  user_id uuid,
  full_name text,
  email text,
  avatar_url text,
  role text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $function$
begin
  if auth.uid() is null or not public.owner_access_v1() then
    raise exception 'Acesso restrito ao proprietário Aura';
  end if;

  return query
  select
    aa.user_id,
    p.full_name,
    u.email::text,
    p.avatar_url,
    aa.role,
    aa.is_active,
    aa.created_at,
    aa.updated_at
  from public.aura_admins aa
  join auth.users u on u.id=aa.user_id
  left join public.profiles p on p.id=aa.user_id
  where aa.role='support'
  order by aa.is_active desc,aa.created_at asc;
end;
$function$;

revoke all on function public.owner_support_team_list_v1()
from public,anon;
grant execute on function public.owner_support_team_list_v1()
to authenticated;

create or replace function public.owner_support_team_add_v1(
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_email text := lower(trim(coalesce(p_email,'')));
  v_user_id uuid;
  v_existing_role text;
  v_actor uuid;
begin
  if auth.uid() is null or not public.owner_access_v1() then
    raise exception 'Acesso restrito ao proprietário Aura';
  end if;

  if v_email='' then
    raise exception 'Informe o e-mail';
  end if;

  select u.id
  into v_user_id
  from auth.users u
  where lower(u.email)=v_email
  limit 1;

  if v_user_id is null then
    raise exception 'Usuário não encontrado no Aura Beat';
  end if;

  if v_user_id=auth.uid() then
    raise exception 'O proprietário já possui acesso administrativo';
  end if;

  select aa.role
  into v_existing_role
  from public.aura_admins aa
  where aa.user_id=v_user_id;

  if v_existing_role is not null and v_existing_role<>'support' then
    raise exception 'Este usuário já possui outro papel administrativo';
  end if;

  insert into public.aura_admins(
    user_id,role,is_active,created_by,created_at,updated_at
  )
  values(
    v_user_id,'support',true,auth.uid(),now(),now()
  )
  on conflict(user_id)
  do update set
    role='support',
    is_active=true,
    updated_at=now();

  select case
    when exists(select 1 from public.profiles p where p.id=auth.uid())
      then auth.uid()
    else null
  end
  into v_actor;

  insert into public.admin_logs(
    actor_user_id,action,entity_type,entity_id,before_data,after_data
  )
  values(
    v_actor,
    'support_team_add',
    'aura_admin',
    v_user_id::text,
    null,
    jsonb_build_object('role','support','is_active',true)
  );

  return v_user_id;
end;
$function$;

revoke all on function public.owner_support_team_add_v1(text)
from public,anon;
grant execute on function public.owner_support_team_add_v1(text)
to authenticated;

create or replace function public.owner_support_team_set_active_v1(
  p_user_id uuid,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_before boolean;
  v_actor uuid;
begin
  if auth.uid() is null or not public.owner_access_v1() then
    raise exception 'Acesso restrito ao proprietário Aura';
  end if;

  select aa.is_active
  into v_before
  from public.aura_admins aa
  where aa.user_id=p_user_id
    and aa.role='support';

  if v_before is null then
    raise exception 'Atendente não encontrado';
  end if;

  update public.aura_admins
  set
    is_active=coalesce(p_is_active,false),
    updated_at=now()
  where user_id=p_user_id
    and role='support';

  select case
    when exists(select 1 from public.profiles p where p.id=auth.uid())
      then auth.uid()
    else null
  end
  into v_actor;

  insert into public.admin_logs(
    actor_user_id,action,entity_type,entity_id,before_data,after_data
  )
  values(
    v_actor,
    case
      when coalesce(p_is_active,false) then 'support_team_activate'
      else 'support_team_suspend'
    end,
    'aura_admin',
    p_user_id::text,
    jsonb_build_object('is_active',v_before),
    jsonb_build_object('is_active',coalesce(p_is_active,false))
  );
end;
$function$;

revoke all on function public.owner_support_team_set_active_v1(uuid,boolean)
from public,anon;
grant execute on function public.owner_support_team_set_active_v1(uuid,boolean)
to authenticated;

create or replace function public.owner_support_team_remove_v1(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_before jsonb;
  v_actor uuid;
begin
  if auth.uid() is null or not public.owner_access_v1() then
    raise exception 'Acesso restrito ao proprietário Aura';
  end if;

  select jsonb_build_object(
    'role',aa.role,
    'is_active',aa.is_active,
    'created_at',aa.created_at
  )
  into v_before
  from public.aura_admins aa
  where aa.user_id=p_user_id
    and aa.role='support';

  if v_before is null then
    raise exception 'Atendente não encontrado';
  end if;

  delete from public.aura_admins
  where user_id=p_user_id
    and role='support';

  select case
    when exists(select 1 from public.profiles p where p.id=auth.uid())
      then auth.uid()
    else null
  end
  into v_actor;

  insert into public.admin_logs(
    actor_user_id,action,entity_type,entity_id,before_data,after_data
  )
  values(
    v_actor,
    'support_team_remove',
    'aura_admin',
    p_user_id::text,
    v_before,
    null
  );
end;
$function$;

revoke all on function public.owner_support_team_remove_v1(uuid)
from public,anon;
grant execute on function public.owner_support_team_remove_v1(uuid)
to authenticated;

notify pgrst,'reload schema';
