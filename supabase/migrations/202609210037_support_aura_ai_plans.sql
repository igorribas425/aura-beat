-- 2026-09-21
-- Suporte Aura para Intermediario/Pro e Aura IA exclusivo Pro.

create or replace function public.is_aura_staff_v1()
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
      and aa.role in ('reviewer','admin','owner')
  );
$function$;

revoke all on function public.is_aura_staff_v1() from public,anon;
grant execute on function public.is_aura_staff_v1() to authenticated;

create or replace function public.user_has_active_plan_benefit_v1(
  p_audience text,
  p_benefit text
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_profile_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  if p_audience='artist' then
    select a.id
    into v_profile_id
    from public.artist_profiles a
    where a.user_id=auth.uid()
      and coalesce(a.is_active,true)=true
    order by a.created_at desc
    limit 1;
  elsif p_audience='venue' then
    select v.id
    into v_profile_id
    from public.venue_profiles v
    where v.owner_user_id=auth.uid()
      and coalesce(v.is_active,true)=true
    order by v.created_at desc
    limit 1;
  else
    return false;
  end if;

  if v_profile_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.subscriptions s
    join public.plans p on p.id=s.plan_id
    where p.is_active=true
      and p.audience=p_audience
      and s.status in ('active','trialing')
      and (s.current_period_end is null or s.current_period_end>now())
      and (
        s.status<>'trialing'
        or s.trial_ends_at is null
        or s.trial_ends_at>now()
      )
      and (
        (p_audience='artist' and s.artist_id=v_profile_id)
        or
        (p_audience='venue' and s.venue_id=v_profile_id)
      )
      and p.benefits -> p_benefit = 'true'::jsonb
  );
end;
$function$;

revoke all on function public.user_has_active_plan_benefit_v1(text,text)
from public,anon;
grant execute on function public.user_has_active_plan_benefit_v1(text,text)
to authenticated;

update public.plans
set benefits =
  case
    when code='normal' then
      (benefits - 'team' - 'support_chat' - 'ai_chat')
    when code='intermediate' then
      (benefits - 'team' - 'ai_chat')
      || jsonb_build_object(
        'support_chat',true,
        'support_priority','standard'
      )
    when code='pro' then
      (benefits - 'team')
      || jsonb_build_object(
        'support_chat',true,
        'ai_chat',true,
        'support_priority','priority',
        'priority_support',true
      )
    else benefits
  end
where code in ('normal','intermediate','pro');

create table if not exists public.support_threads (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  audience text not null check (audience in ('artist','venue')),
  subject text not null check (char_length(trim(subject)) between 2 and 120),
  status text not null default 'open'
    check (status in ('open','waiting_user','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create index if not exists support_threads_requester_idx
  on public.support_threads(requester_user_id,last_message_at desc);

create index if not exists support_threads_status_idx
  on public.support_threads(status,last_message_at desc);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  sender_side text not null check (sender_side in ('customer','support')),
  body text not null check (char_length(trim(body)) between 1 and 4000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists support_messages_thread_idx
  on public.support_messages(thread_id,created_at);

alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;

revoke all on public.support_threads from public,anon,authenticated;
revoke all on public.support_messages from public,anon,authenticated;

grant select on public.support_threads to authenticated;
grant select on public.support_messages to authenticated;

drop policy if exists support_threads_read_v1 on public.support_threads;
create policy support_threads_read_v1
on public.support_threads
for select
to authenticated
using (
  requester_user_id=auth.uid()
  or public.is_aura_staff_v1()
);

drop policy if exists support_messages_read_v1 on public.support_messages;
create policy support_messages_read_v1
on public.support_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.support_threads t
    where t.id=thread_id
      and (
        t.requester_user_id=auth.uid()
        or public.is_aura_staff_v1()
      )
  )
);

create or replace function public.support_open_thread_v1(
  p_audience text,
  p_subject text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_id uuid;
  v_subject text := trim(coalesce(p_subject,''));
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_audience not in ('artist','venue') then
    raise exception 'Modo inválido';
  end if;

  if char_length(v_subject)<2 or char_length(v_subject)>120 then
    raise exception 'Assunto deve ter entre 2 e 120 caracteres';
  end if;

  if not public.user_has_active_plan_benefit_v1(p_audience,'support_chat') then
    raise exception 'Chat com a Equipe Aura exige plano Intermediário ou Pro';
  end if;

  insert into public.support_threads(
    requester_user_id,audience,subject,status
  )
  values(
    auth.uid(),p_audience,v_subject,'open'
  )
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.support_open_thread_v1(text,text)
from public,anon;
grant execute on function public.support_open_thread_v1(text,text)
to authenticated;

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

  insert into public.support_messages(
    thread_id,sender_user_id,sender_side,body
  )
  values(
    p_thread_id,auth.uid(),v_side,v_body
  )
  returning id into v_id;

  update public.support_threads
  set
    updated_at=now(),
    last_message_at=now(),
    status=case
      when v_side='support' then 'waiting_user'
      else 'open'
    end
  where id=p_thread_id;

  return v_id;
end;
$function$;

revoke all on function public.support_send_message_v1(uuid,text)
from public,anon;
grant execute on function public.support_send_message_v1(uuid,text)
to authenticated;

create or replace function public.support_close_thread_v1(
  p_thread_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_thread public.support_threads%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select *
  into v_thread
  from public.support_threads
  where id=p_thread_id;

  if not found then
    raise exception 'Atendimento não encontrado';
  end if;

  if v_thread.requester_user_id<>auth.uid()
     and not public.is_aura_staff_v1() then
    raise exception 'Acesso negado ao atendimento';
  end if;

  update public.support_threads
  set status='closed',updated_at=now()
  where id=p_thread_id;
end;
$function$;

revoke all on function public.support_close_thread_v1(uuid)
from public,anon;
grant execute on function public.support_close_thread_v1(uuid)
to authenticated;

create or replace function public.support_mark_read_v1(
  p_thread_id uuid
)
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_thread public.support_threads%rowtype;
  v_staff boolean := public.is_aura_staff_v1();
  v_updated integer := 0;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select *
  into v_thread
  from public.support_threads
  where id=p_thread_id;

  if not found then
    raise exception 'Atendimento não encontrado';
  end if;

  if v_thread.requester_user_id<>auth.uid() and not v_staff then
    raise exception 'Acesso negado ao atendimento';
  end if;

  update public.support_messages
  set read_at=coalesce(read_at,now())
  where thread_id=p_thread_id
    and sender_user_id<>auth.uid()
    and read_at is null;

  get diagnostics v_updated=row_count;
  return v_updated;
end;
$function$;

revoke all on function public.support_mark_read_v1(uuid)
from public,anon;
grant execute on function public.support_mark_read_v1(uuid)
to authenticated;

create or replace function public.admin_support_threads_v1()
returns table(
  thread_id uuid,
  requester_user_id uuid,
  requester_name text,
  requester_email text,
  audience text,
  subject text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  last_message_at timestamptz
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
    t.id,
    t.requester_user_id,
    coalesce(
      case
        when t.audience='artist' then a.stage_name
        else v.trade_name
      end,
      p.full_name,
      'Usuário Aura Beat'
    )::text,
    u.email::text,
    t.audience,
    t.subject,
    t.status,
    t.created_at,
    t.updated_at,
    t.last_message_at
  from public.support_threads t
  left join auth.users u on u.id=t.requester_user_id
  left join public.profiles p on p.id=t.requester_user_id
  left join public.artist_profiles a
    on a.user_id=t.requester_user_id
   and t.audience='artist'
  left join public.venue_profiles v
    on v.owner_user_id=t.requester_user_id
   and t.audience='venue'
  order by
    case t.status when 'open' then 0 when 'waiting_user' then 1 else 2 end,
    t.last_message_at desc;
end;
$function$;

revoke all on function public.admin_support_threads_v1()
from public,anon;
grant execute on function public.admin_support_threads_v1()
to authenticated;

revoke all on function public.venue_team_list_v1() from authenticated;
revoke all on function public.venue_team_add_by_email_v1(text,text) from authenticated;
revoke all on function public.venue_team_update_role_v1(uuid,text) from authenticated;
revoke all on function public.venue_team_remove_v1(uuid) from authenticated;

do $function$
begin
  if exists (
    select 1 from pg_publication where pubname='supabase_realtime'
  ) then
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime'
        and schemaname='public'
        and tablename='support_threads'
    ) then
      alter publication supabase_realtime add table public.support_threads;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime'
        and schemaname='public'
        and tablename='support_messages'
    ) then
      alter publication supabase_realtime add table public.support_messages;
    end if;
  end if;
end
$function$;

notify pgrst,'reload schema';
