-- 2026-09-21
-- Vincula cada atendente da Equipe Aura a um unico dispositivo confiavel.
-- O Magic Link e de uso unico e, depois da ativacao, o acesso de suporte exige:
-- 1) cargo support ativo
-- 2) mesma sessao autenticada vinculada ao dispositivo
-- 3) segredo local do dispositivo para religar uma nova sessao no mesmo navegador

create table if not exists public.support_agent_devices (
  user_id uuid primary key references auth.users(id) on delete cascade,
  device_secret_hash bytea not null,
  session_id uuid not null,
  device_label text,
  activated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.support_agent_devices enable row level security;
revoke all on public.support_agent_devices from public,anon,authenticated;

create or replace function public.is_support_account_v1()
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select exists (
    select 1
    from public.aura_admins aa
    where aa.user_id=auth.uid()
      and aa.is_active=true
      and aa.role='support'
  );
$function$;

revoke all on function public.is_support_account_v1()
from public,anon;
grant execute on function public.is_support_account_v1()
to authenticated;

create or replace function public.is_aura_support_agent_v1()
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select exists (
    select 1
    from public.aura_admins aa
    where aa.user_id=auth.uid()
      and aa.is_active=true
      and (
        aa.role in ('admin','owner')
        or (
          aa.role='support'
          and exists (
            select 1
            from public.support_agent_devices d
            where d.user_id=aa.user_id
              and d.revoked_at is null
              and d.session_id=
                nullif((select auth.jwt())->>'session_id','')::uuid
          )
        )
      )
  );
$function$;

revoke all on function public.is_aura_support_agent_v1()
from public,anon;
grant execute on function public.is_aura_support_agent_v1()
to authenticated;

create or replace function public.support_portal_only_v1()
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select
    public.is_support_account_v1()
    and public.is_aura_support_agent_v1();
$function$;

revoke all on function public.support_portal_only_v1()
from public,anon;
grant execute on function public.support_portal_only_v1()
to authenticated;

create or replace function public.support_accept_invite_v2(
  p_full_name text,
  p_device_label text,
  p_device_secret text
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_invite_id uuid;
  v_invited_by uuid;
  v_existing_role text;
  v_name text := trim(coalesce(p_full_name,''));
  v_device_label text := left(trim(coalesce(p_device_label,'Dispositivo do atendente')),160);
  v_device_secret text := coalesce(p_device_secret,'');
  v_session_id uuid;
begin
  if v_user_id is null then
    raise exception 'Abra novamente o convite recebido no e-mail';
  end if;

  if length(v_name)<2 then
    raise exception 'Informe seu nome';
  end if;

  if length(v_device_secret)<32 then
    raise exception 'Não foi possível registrar este dispositivo';
  end if;

  v_session_id := nullif((select auth.jwt())->>'session_id','')::uuid;

  if v_session_id is null then
    raise exception 'Sessão de autenticação inválida';
  end if;

  select lower(u.email)
  into v_email
  from auth.users u
  where u.id=v_user_id;

  if v_email is null then
    raise exception 'Não foi possível identificar o e-mail da conta';
  end if;

  update public.support_team_invites
  set status='expired'
  where status='pending'
    and expires_at<=now();

  select i.id,i.invited_by
  into v_invite_id,v_invited_by
  from public.support_team_invites i
  where lower(i.email)=v_email
    and i.status='pending'
    and i.expires_at>now()
  order by i.created_at desc
  limit 1
  for update;

  if v_invite_id is null then
    raise exception 'Convite inválido, expirado, cancelado ou já utilizado';
  end if;

  select aa.role
  into v_existing_role
  from public.aura_admins aa
  where aa.user_id=v_user_id;

  if v_existing_role is not null and v_existing_role<>'support' then
    raise exception 'Esta conta já possui outro papel administrativo';
  end if;

  insert into public.aura_admins(
    user_id,role,is_active,created_by,created_at,updated_at
  )
  values(
    v_user_id,'support',true,v_invited_by,now(),now()
  )
  on conflict(user_id)
  do update set
    role='support',
    is_active=true,
    created_by=coalesce(public.aura_admins.created_by,excluded.created_by),
    updated_at=now();

  insert into public.support_agent_devices(
    user_id,
    device_secret_hash,
    session_id,
    device_label,
    activated_at,
    last_seen_at,
    revoked_at
  )
  values(
    v_user_id,
    extensions.digest(v_device_secret,'sha256'),
    v_session_id,
    nullif(v_device_label,''),
    now(),
    now(),
    null
  )
  on conflict(user_id)
  do update set
    device_secret_hash=excluded.device_secret_hash,
    session_id=excluded.session_id,
    device_label=excluded.device_label,
    activated_at=now(),
    last_seen_at=now(),
    revoked_at=null;

  update public.profiles
  set full_name=v_name
  where id=v_user_id;

  update auth.users
  set raw_user_meta_data=
    coalesce(raw_user_meta_data,'{}'::jsonb)
    || jsonb_build_object('full_name',v_name)
  where id=v_user_id;

  update public.support_team_invites
  set
    status='accepted',
    accepted_at=now(),
    accepted_user_id=v_user_id
  where id=v_invite_id;
end;
$function$;

revoke all on function public.support_accept_invite_v2(text,text,text)
from public,anon;
grant execute on function public.support_accept_invite_v2(text,text,text)
to authenticated;

create or replace function public.support_rebind_device_v1(
  p_device_secret text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
begin
  if v_user_id is null or not public.is_support_account_v1() then
    return false;
  end if;

  if length(coalesce(p_device_secret,''))<32 then
    return false;
  end if;

  v_session_id := nullif((select auth.jwt())->>'session_id','')::uuid;

  if v_session_id is null then
    return false;
  end if;

  update public.support_agent_devices d
  set
    session_id=v_session_id,
    last_seen_at=now()
  where d.user_id=v_user_id
    and d.revoked_at is null
    and d.device_secret_hash=
      extensions.digest(p_device_secret,'sha256');

  return found;
end;
$function$;

revoke all on function public.support_rebind_device_v1(text)
from public,anon;
grant execute on function public.support_rebind_device_v1(text)
to authenticated;

create or replace function public.support_device_touch_v1()
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
begin
  if auth.uid() is null or not public.is_aura_support_agent_v1() then
    return false;
  end if;

  update public.support_agent_devices d
  set last_seen_at=now()
  where d.user_id=auth.uid()
    and d.revoked_at is null
    and d.session_id=
      nullif((select auth.jwt())->>'session_id','')::uuid;

  return true;
end;
$function$;

revoke all on function public.support_device_touch_v1()
from public,anon;
grant execute on function public.support_device_touch_v1()
to authenticated;

create or replace function public.owner_support_team_list_v2()
returns table(
  user_id uuid,
  full_name text,
  email text,
  avatar_url text,
  role text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  device_label text,
  device_activated_at timestamptz,
  device_last_seen_at timestamptz,
  device_revoked_at timestamptz
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
    aa.updated_at,
    d.device_label,
    d.activated_at,
    d.last_seen_at,
    d.revoked_at
  from public.aura_admins aa
  join auth.users u on u.id=aa.user_id
  left join public.profiles p on p.id=aa.user_id
  left join public.support_agent_devices d on d.user_id=aa.user_id
  where aa.role='support'
  order by aa.is_active desc,aa.created_at asc;
end;
$function$;

revoke all on function public.owner_support_team_list_v2()
from public,anon;
grant execute on function public.owner_support_team_list_v2()
to authenticated;

create or replace function public.owner_support_device_reset_v1(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
begin
  if auth.uid() is null or not public.owner_access_v1() then
    raise exception 'Acesso restrito ao proprietário Aura';
  end if;

  if not exists (
    select 1
    from public.aura_admins aa
    where aa.user_id=p_user_id
      and aa.role='support'
  ) then
    raise exception 'Atendente não encontrado';
  end if;

  update public.support_agent_devices
  set revoked_at=now()
  where user_id=p_user_id
    and revoked_at is null;
end;
$function$;

revoke all on function public.owner_support_device_reset_v1(uuid)
from public,anon;
grant execute on function public.owner_support_device_reset_v1(uuid)
to authenticated;

create or replace function public.revoke_support_device_on_role_change_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if tg_op='DELETE' then
    if old.role='support' then
      update public.support_agent_devices
      set revoked_at=coalesce(revoked_at,now())
      where user_id=old.user_id;
    end if;
    return old;
  end if;

  if old.role='support'
     and (new.role<>'support' or new.is_active=false) then
    update public.support_agent_devices
    set revoked_at=coalesce(revoked_at,now())
    where user_id=old.user_id;
  end if;

  return new;
end;
$function$;

revoke all on function public.revoke_support_device_on_role_change_v1()
from public,anon,authenticated;

drop trigger if exists trg_revoke_support_device_on_role_change_v1
on public.aura_admins;

create trigger trg_revoke_support_device_on_role_change_v1
after update or delete on public.aura_admins
for each row
execute function public.revoke_support_device_on_role_change_v1();

notify pgrst,'reload schema';
