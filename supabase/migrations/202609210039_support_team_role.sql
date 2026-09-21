-- 2026-09-21
-- Cargo limitado de suporte e portal separado da Equipe Aura.

alter table public.aura_admins
  drop constraint if exists aura_admins_role_check;

alter table public.aura_admins
  add constraint aura_admins_role_check
  check (role in ('support','reviewer','admin','owner'));

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
      and aa.role in ('support','admin','owner')
  );
$function$;

revoke all on function public.is_aura_support_agent_v1()
from public,anon;

grant execute on function public.is_aura_support_agent_v1()
to authenticated;

drop policy if exists support_threads_read_v1
on public.support_threads;

create policy support_threads_read_v1
on public.support_threads
for select
to authenticated
using (
  requester_user_id=(select auth.uid())
  or (select public.is_aura_support_agent_v1())
);

drop policy if exists support_messages_read_v1
on public.support_messages;

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
        t.requester_user_id=(select auth.uid())
        or (select public.is_aura_support_agent_v1())
      )
  )
);

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
  if auth.uid() is null or not public.is_aura_support_agent_v1() then
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
  v_staff boolean := public.is_aura_support_agent_v1();
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
     and not public.is_aura_support_agent_v1() then
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
  v_staff boolean := public.is_aura_support_agent_v1();
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

notify pgrst,'reload schema';
