-- 2026-09-21
-- Convites por e-mail para a Equipe Aura.
-- O convidado recebe um magic link do Supabase, conclui o cadastro e ganha
-- somente o cargo support. Nenhum acesso administrativo adicional e concedido.

create table if not exists public.support_team_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  invited_by uuid,
  status text not null default 'pending'
    check (status in ('pending','accepted','cancelled','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_user_id uuid
);

create index if not exists support_team_invites_email_idx
  on public.support_team_invites (lower(email));

create unique index if not exists support_team_invites_one_pending_email_idx
  on public.support_team_invites (lower(email))
  where status='pending';

alter table public.support_team_invites enable row level security;

create or replace function public.owner_support_invite_create_v1(
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_email text := lower(trim(coalesce(p_email,'')));
  v_invite_id uuid;
  v_existing_role text;
begin
  if auth.uid() is null or not public.owner_access_v1() then
    raise exception 'Acesso restrito ao proprietário Aura';
  end if;

  if v_email='' or position('@' in v_email)=0 then
    raise exception 'Informe um e-mail válido';
  end if;

  select aa.role
  into v_existing_role
  from public.aura_admins aa
  join auth.users u on u.id=aa.user_id
  where lower(u.email)=v_email
    and aa.is_active=true
  limit 1;

  if v_existing_role='support' then
    raise exception 'Este e-mail já faz parte da Equipe Aura';
  end if;

  if v_existing_role is not null then
    raise exception 'Este e-mail já possui acesso administrativo';
  end if;

  update public.support_team_invites
  set status='expired'
  where status='pending'
    and expires_at<=now();

  update public.support_team_invites
  set
    invited_by=auth.uid(),
    created_at=now(),
    expires_at=now() + interval '7 days'
  where lower(email)=v_email
    and status='pending'
  returning id into v_invite_id;

  if v_invite_id is null then
    insert into public.support_team_invites(
      email,invited_by,status,created_at,expires_at
    )
    values(
      v_email,auth.uid(),'pending',now(),now() + interval '7 days'
    )
    returning id into v_invite_id;
  end if;

  return v_invite_id;
end;
$function$;

revoke all on function public.owner_support_invite_create_v1(text)
from public,anon;
grant execute on function public.owner_support_invite_create_v1(text)
to authenticated;

create or replace function public.owner_support_invite_list_v1()
returns table(
  invite_id uuid,
  email text,
  status text,
  created_at timestamptz,
  expires_at timestamptz
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
    i.id,
    i.email,
    case
      when i.status='pending' and i.expires_at<=now() then 'expired'
      else i.status
    end,
    i.created_at,
    i.expires_at
  from public.support_team_invites i
  where i.status='pending'
     or (i.status='accepted' and i.accepted_at>now() - interval '30 days')
  order by i.created_at desc;
end;
$function$;

revoke all on function public.owner_support_invite_list_v1()
from public,anon;
grant execute on function public.owner_support_invite_list_v1()
to authenticated;

create or replace function public.owner_support_invite_cancel_v1(
  p_invite_id uuid
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

  update public.support_team_invites
  set status='cancelled'
  where id=p_invite_id
    and status='pending';

  if not found then
    raise exception 'Convite pendente não encontrado';
  end if;
end;
$function$;

revoke all on function public.owner_support_invite_cancel_v1(uuid)
from public,anon;
grant execute on function public.owner_support_invite_cancel_v1(uuid)
to authenticated;

create or replace function public.support_accept_invite_v1(
  p_full_name text
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
begin
  if v_user_id is null then
    raise exception 'Faça login pelo link recebido no e-mail';
  end if;

  if length(v_name)<2 then
    raise exception 'Informe seu nome';
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
    raise exception 'Convite inválido, expirado ou cancelado';
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
    updated_at=now();

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

revoke all on function public.support_accept_invite_v1(text)
from public,anon;
grant execute on function public.support_accept_invite_v1(text)
to authenticated;

create or replace function public.support_portal_only_v1()
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

revoke all on function public.support_portal_only_v1()
from public,anon;
grant execute on function public.support_portal_only_v1()
to authenticated;

notify pgrst,'reload schema';
