-- Indicador de digitacao persistente para o Chat Direto.
-- Substitui Presence/Broadcast no cliente por um estado pequeno em Postgres + Realtime,
-- mantendo acesso somente aos participantes da conversa.

create table if not exists public.direct_typing_status (
  conversation_id uuid not null
    references public.direct_conversations(id) on delete cascade,
  user_id uuid not null
    references public.profiles(id) on delete cascade,
  is_typing boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.direct_typing_status enable row level security;

drop policy if exists direct_typing_status_participants_read
on public.direct_typing_status;

create policy direct_typing_status_participants_read
on public.direct_typing_status
for select
to authenticated
using (
  exists (
    select 1
    from public.direct_conversations c
    where c.id = direct_typing_status.conversation_id
      and (
        c.user_a = (select auth.uid())
        or c.user_b = (select auth.uid())
      )
  )
);

drop policy if exists direct_typing_status_own_insert
on public.direct_typing_status;

create policy direct_typing_status_own_insert
on public.direct_typing_status
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.direct_conversations c
    where c.id = direct_typing_status.conversation_id
      and (
        c.user_a = (select auth.uid())
        or c.user_b = (select auth.uid())
      )
  )
);

drop policy if exists direct_typing_status_own_update
on public.direct_typing_status;

create policy direct_typing_status_own_update
on public.direct_typing_status
for update
to authenticated
using (
  user_id = (select auth.uid())
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.direct_conversations c
    where c.id = direct_typing_status.conversation_id
      and (
        c.user_a = (select auth.uid())
        or c.user_b = (select auth.uid())
      )
  )
);

drop policy if exists direct_typing_status_own_delete
on public.direct_typing_status;

create policy direct_typing_status_own_delete
on public.direct_typing_status
for delete
to authenticated
using (
  user_id = (select auth.uid())
);

grant select, insert, update, delete
on public.direct_typing_status
to authenticated;

revoke all
on public.direct_typing_status
from anon;

create or replace function public.touch_direct_typing_status_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.touch_direct_typing_status_v1()
from public, anon, authenticated;

drop trigger if exists direct_typing_status_touch_updated_at
on public.direct_typing_status;

create trigger direct_typing_status_touch_updated_at
before insert or update
on public.direct_typing_status
for each row
execute function public.touch_direct_typing_status_v1();

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
      and tablename = 'direct_typing_status'
  ) then
    alter publication supabase_realtime
      add table public.direct_typing_status;
  end if;
end;
$$;
