-- 2026-09-21
-- Suporte Aura: realtime completo, leitura por lado, alertas e Modo Ausente robusto.

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
  v_responder uuid;
begin
  if auth.uid() is null or not public.is_aura_staff_v1() then
    raise exception 'Acesso restrito à administração Aura';
  end if;

  if char_length(v_message)<5 or char_length(v_message)>1000 then
    raise exception 'A mensagem automática deve ter entre 5 e 1000 caracteres';
  end if;

  if public.is_aura_support_agent_v1() then
    v_responder := auth.uid();
  else
    select aa.user_id
    into v_responder
    from public.aura_admins aa
    where aa.is_active=true
      and aa.role in ('owner','admin','support')
    order by
      case aa.role when 'owner' then 0 when 'admin' then 1 else 2 end,
      aa.created_at
    limit 1;
  end if;

  if coalesce(p_away_enabled,false) and v_responder is null then
    raise exception 'Nenhum membro ativo da Equipe Aura disponível para resposta automática';
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
    v_responder,
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
  v_responder uuid;
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

  v_responder := v_settings.responder_user_id;

  if v_responder is null
     or not exists (
       select 1
       from public.aura_admins aa
       where aa.user_id=v_responder
         and aa.is_active=true
         and aa.role in ('support','admin','owner')
     ) then
    select aa.user_id
    into v_responder
    from public.aura_admins aa
    where aa.is_active=true
      and aa.role in ('owner','admin','support')
    order by
      case aa.role when 'owner' then 0 when 'admin' then 1 else 2 end,
      aa.created_at
    limit 1;
  end if;

  if v_responder is null then
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
      and m.created_at >= v_settings.updated_at
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
    v_responder,
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

create or replace function public.notify_support_message_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_thread public.support_threads%rowtype;
  v_staff record;
begin
  select *
  into v_thread
  from public.support_threads
  where id=new.thread_id;

  if not found then
    return new;
  end if;

  if new.sender_side='customer' then
    for v_staff in
      select aa.user_id,aa.role
      from public.aura_admins aa
      where aa.is_active=true
        and aa.role in ('support','admin','owner')
        and aa.user_id<>new.sender_user_id
    loop
      perform public.create_aura_notification_v1(
        v_staff.user_id,
        'support',
        'Novo atendimento no Suporte Aura',
        left(new.body,180),
        case
          when v_staff.role in ('admin','owner')
            then '/admin/suporte?thread=' || new.thread_id::text
          else '/equipe-aura?thread=' || new.thread_id::text
        end
      );
    end loop;
  elsif new.sender_side='support'
        and v_thread.requester_user_id<>new.sender_user_id then
    perform public.create_aura_notification_v1(
      v_thread.requester_user_id,
      'support',
      case
        when new.is_automatic then 'Resposta automática da Equipe Aura'
        else 'Equipe Aura respondeu seu atendimento'
      end,
      left(new.body,180),
      '/suporte-aura?thread=' || new.thread_id::text
    );
  end if;

  return new;
end;
$function$;

revoke all on function public.notify_support_message_v1()
from public,anon,authenticated;

drop trigger if exists trg_notify_support_message_v1
on public.support_messages;

create trigger trg_notify_support_message_v1
after insert on public.support_messages
for each row
execute function public.notify_support_message_v1();

create or replace function public.support_send_customer_message_v1(
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

  if v_thread.requester_user_id<>auth.uid() then
    raise exception 'Acesso negado ao atendimento';
  end if;

  if not public.user_has_active_plan_benefit_v1(
    v_thread.audience,
    'support_chat'
  ) then
    raise exception 'Seu plano atual não possui Chat com a Equipe Aura';
  end if;

  if v_thread.status='closed' then
    raise exception 'Este atendimento está encerrado';
  end if;

  update public.support_threads
  set
    updated_at=now(),
    last_message_at=now(),
    status='open'
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
    'customer',
    v_body,
    false
  )
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.support_send_customer_message_v1(uuid,text)
from public,anon;
grant execute on function public.support_send_customer_message_v1(uuid,text)
to authenticated;

create or replace function public.support_mark_customer_read_v1(
  p_thread_id uuid
)
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_updated integer := 0;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not exists (
    select 1
    from public.support_threads t
    where t.id=p_thread_id
      and t.requester_user_id=auth.uid()
  ) then
    raise exception 'Acesso negado ao atendimento';
  end if;

  update public.support_messages
  set read_at=coalesce(read_at,now())
  where thread_id=p_thread_id
    and sender_side='support'
    and read_at is null;

  get diagnostics v_updated=row_count;
  return v_updated;
end;
$function$;

revoke all on function public.support_mark_customer_read_v1(uuid)
from public,anon;
grant execute on function public.support_mark_customer_read_v1(uuid)
to authenticated;

create or replace function public.support_mark_staff_read_v1(
  p_thread_id uuid
)
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_updated integer := 0;
begin
  if auth.uid() is null or not public.is_aura_support_agent_v1() then
    raise exception 'Acesso restrito à Equipe Aura';
  end if;

  if not exists (
    select 1
    from public.support_threads t
    where t.id=p_thread_id
  ) then
    raise exception 'Atendimento não encontrado';
  end if;

  update public.support_messages
  set read_at=coalesce(read_at,now())
  where thread_id=p_thread_id
    and sender_side='customer'
    and read_at is null;

  get diagnostics v_updated=row_count;
  return v_updated;
end;
$function$;

revoke all on function public.support_mark_staff_read_v1(uuid)
from public,anon;
grant execute on function public.support_mark_staff_read_v1(uuid)
to authenticated;

notify pgrst,'reload schema';
