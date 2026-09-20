-- Direct Chat -> Central de Alertas.
-- Cria uma notificação para o destinatário de cada nova mensagem direta.

create or replace function public.notify_direct_message_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient uuid;
  v_sender_kind text;
  v_sender_name text;
begin
  select
    case
      when c.user_a = new.sender_user_id then c.user_b
      else c.user_a
    end,
    case
      when c.user_a = new.sender_user_id then c.user_a_kind
      else c.user_b_kind
    end
  into v_recipient, v_sender_kind
  from public.direct_conversations c
  where c.id = new.conversation_id
    and new.sender_user_id in (c.user_a, c.user_b);

  if v_recipient is null then
    return new;
  end if;

  if v_sender_kind = 'artist' then
    select a.stage_name
      into v_sender_name
    from public.artist_profiles a
    where a.user_id = new.sender_user_id
    limit 1;
  else
    select v.trade_name
      into v_sender_name
    from public.venue_profiles v
    where v.owner_user_id = new.sender_user_id
    limit 1;
  end if;

  insert into public.notifications (
    user_id,
    type,
    title,
    body,
    link_url
  )
  values (
    v_recipient,
    'message',
    'Nova mensagem de ' || coalesce(
      nullif(trim(v_sender_name), ''),
      case when v_sender_kind = 'venue' then 'uma Casa' else 'um Artista' end
    ),
    left(new.body, 180),
    '/chat-direto?id=' || new.conversation_id::text
  );

  return new;
end;
$$;

drop trigger if exists direct_messages_create_notification
on public.direct_messages;

create trigger direct_messages_create_notification
after insert on public.direct_messages
for each row
execute function public.notify_direct_message_v1();

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  )
  and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime
      add table public.notifications;
  end if;
end;
$$;
