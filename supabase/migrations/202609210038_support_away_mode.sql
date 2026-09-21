-- 2026-09-21
-- Simplifica planos para Suporte Aura e adiciona Modo Ausente no Admin.

alter table public.support_messages
  add column if not exists is_automatic boolean not null default false;

create table if not exists public.support_settings (
  singleton boolean primary key default true check (singleton=true),
  away_enabled boolean not null default false,
  away_message text not null default 'Recebemos sua mensagem. A Equipe Aura está ausente no momento e responderá assim que possível.',
  ai_enabled boolean not null default false,
  responder_user_id uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references auth.users(id) on delete set null
);

insert into public.support_settings(singleton)
values(true)
on conflict(singleton) do nothing;

alter table public.support_settings enable row level security;
revoke all on public.support_settings from public,anon,authenticated;

update public.plans
set benefits=(benefits - 'ai_chat')
where code in ('normal','intermediate','pro');

create or replace function public.admin_support_settings_v1()
returns table(
  away_enabled boolean,
  away_message text,
  ai_enabled boolean,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $function$
begin
  if auth.uid() is null or not public.is_aura_staff_v1() then
    raise exception 'Acesso restrito à Equipe Aura';
  end if;

  return query
  select
    s.away_enabled,
    s.away_message,
    s.ai_enabled,
    s.updated_at
  from public.support_settings s
  where s.singleton=true;
end;
$function$;

revoke all on function public.admin_support_settings_v1()
from public,anon;
grant execute on function public.admin_support_settings_v1()
to authenticated;

create or replace function public.admin_update_support_settings_v1(
  p_away_enabled boolean,
  p_away_message text,
  p_ai_enabled boolean default false
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_message text := trim(coalesce(p_away_message,''));
begin
  if auth.uid() is null or not public.is_aura_staff_v1() then
    raise exception 'Acesso restrito à Equipe Aura';
  end if;

  if char_length(v_message)<5 or char_length(v_message)>1000 then
    raise exception 'A mensagem automática deve ter entre 5 e 1000 caracteres';
  end if;

  insert into public.support_settings(
    singleton,
    away_enabled,
    away_message,
    ai_enabled,
    responder_user_id,
    updated_at,
    updated_by_user_id
  )
  values(
    true,
    coalesce(p_away_enabled,false),
    v_message,
    false,
    auth.uid(),
    now(),
    auth.uid()
  )
  on conflict(singleton)
  do update set
    away_enabled=excluded.away_enabled,
    away_message=excluded.away_message,
    ai_enabled=false,
    responder_user_id=excluded.responder_user_id,
    updated_at=excluded.updated_at,
    updated_by_user_id=excluded.updated_by_user_id;
end;
$function$;

revoke all on function public.admin_update_support_settings_v1(boolean,text,boolean)
from public,anon;
grant execute on function public.admin_update_support_settings_v1(boolean,text,boolean)
to authenticated;

create or replace function public.support_away_auto_reply_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_settings public.support_settings%rowtype;
  v_thread public.support_threads%rowtype;
begin
  if new.sender_side<>'customer' then
    return new;
  end if;

  select *
  into v_settings
  from public.support_settings
  where singleton=true;

  if not found or not v_settings.away_enabled then
    return new;
  end if;

  if v_settings.responder_user_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.aura_admins aa
    where aa.user_id=v_settings.responder_user_id
      and aa.is_active=true
      and aa.role in ('reviewer','admin','owner')
  ) then
    return new;
  end if;

  select *
  into v_thread
  from public.support_threads
  where id=new.thread_id;

  if not found or v_thread.status='closed' then
    return new;
  end if;

  if exists (
    select 1
    from public.support_messages m
    where m.thread_id=new.thread_id
      and m.is_automatic=true
      and m.created_at > now() - interval '4 hours'
  ) then
    return new;
  end if;

  insert into public.support_messages(
    thread_id,
    sender_user_id,
    sender_side,
    body,
    is_automatic
  )
  values(
    new.thread_id,
    v_settings.responder_user_id,
    'support',
    v_settings.away_message,
    true
  );

  update public.support_threads
  set
    status='waiting_user',
    updated_at=now(),
    last_message_at=now()
  where id=new.thread_id;

  return new;
end;
$function$;

revoke all on function public.support_away_auto_reply_v1()
from public,anon,authenticated;

drop trigger if exists trg_support_away_auto_reply_v1
on public.support_messages;

create trigger trg_support_away_auto_reply_v1
after insert on public.support_messages
for each row
execute function public.support_away_auto_reply_v1();

create or replace function public.support_send_message_v1(
  p_thread_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_thread public.support_threads%rowtype;
  v_id uuid;
  v_body text := trim(coalesce(p_body,''));
  v_staff boolean := public.is_aura_staff_v1();
  v_side text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if char_length(v_body)<1 or char_length(v_body)>4000 then
    raise exception 'Mensagem deve ter entre 1 e 4000 caracteres';
  end if;

  select *
  into v_thread
  from public.support_threads
  where id=p_thread_id;

  if not found then
    raise exception 'Atendimento não encontrado';
  end if;

  if v_staff then
    v_side:='support';
  elsif v_thread.requester_user_id=auth.uid() then
    if not public.user_has_active_plan_benefit_v1(
      v_thread.audience,
      'support_chat'
    ) then
      raise exception 'Seu plano atual não possui Chat com a Equipe Aura';
    end if;
    v_side:='customer';
  else
    raise exception 'Acesso negado ao atendimento';
  end if;

  if v_thread.status='closed' then
    raise exception 'Este atendimento está encerrado';
  end if;

  update public.support_threads
  set
    updated_at=now(),
    last_message_at=now(),
    status=case
      when v_side='support' then 'waiting_user'
      else 'open'
    end
  where id=p_thread_id;

  insert into public.support_messages(
    thread_id,
    sender_user_id,
    sender_side,
    body,
    is_automatic
  )
  values(
    p_thread_id,
    auth.uid(),
    v_side,
    v_body,
    false
  )
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.support_send_message_v1(uuid,text)
from public,anon;
grant execute on function public.support_send_message_v1(uuid,text)
to authenticated;

notify pgrst,'reload schema';
