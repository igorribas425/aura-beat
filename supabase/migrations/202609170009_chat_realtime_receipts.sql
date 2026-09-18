-- Chat em tempo real: recibo de leitura persistente e suporte a Postgres Changes.
-- O status "digitando" é efêmero e usa Supabase Realtime Broadcast no frontend.

alter table public.messages
  add column if not exists read_at timestamptz;

create index if not exists messages_conversation_unread_idx
  on public.messages(conversation_id, created_at)
  where read_at is null;

create or replace function public.mark_conversation_read(
  p_conversation_id uuid
)
returns integer
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_updated integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if not exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and (
        public.owns_artist(c.artist_id)
        or public.is_venue_member(c.venue_id)
        or public.is_admin()
      )
  ) then
    raise exception 'Sem permissão para visualizar esta conversa';
  end if;

  update public.messages
  set read_at = coalesce(read_at, now())
  where conversation_id = p_conversation_id
    and sender_user_id <> auth.uid()
    and read_at is null;

  get diagnostics v_updated = row_count;

  return v_updated;
end;
$function$;

revoke all
on function public.mark_conversation_read(uuid)
from public;

grant execute
on function public.mark_conversation_read(uuid)
to authenticated;

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
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime
      add table public.messages;
  end if;
end;
$$;
