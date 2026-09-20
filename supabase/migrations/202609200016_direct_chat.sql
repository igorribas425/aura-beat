-- Direct/social chat for Aura Beat discovery.
-- Apply manually in Supabase after reviewing. Keeps contracting chat untouched.

create table if not exists public.direct_conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  user_a_kind text not null check (user_a_kind in ('artist','venue')),
  user_b_kind text not null check (user_b_kind in ('artist','venue')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_a <> user_b),
  unique(user_a, user_b)
);

create index if not exists direct_conversations_user_a_idx
  on public.direct_conversations(user_a, updated_at desc);
create index if not exists direct_conversations_user_b_idx
  on public.direct_conversations(user_b, updated_at desc);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists direct_messages_conversation_created_idx
  on public.direct_messages(conversation_id, created_at);

alter table public.direct_conversations enable row level security;
alter table public.direct_messages enable row level security;

drop policy if exists "direct_conversations_participants_read" on public.direct_conversations;
create policy "direct_conversations_participants_read"
on public.direct_conversations
for select
to authenticated
using (auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists "direct_messages_participants_read" on public.direct_messages;
create policy "direct_messages_participants_read"
on public.direct_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.direct_conversations c
    where c.id = conversation_id
      and (c.user_a = auth.uid() or c.user_b = auth.uid())
  )
);

drop policy if exists "direct_messages_participants_insert" on public.direct_messages;
create policy "direct_messages_participants_insert"
on public.direct_messages
for insert
to authenticated
with check (
  sender_user_id = auth.uid()
  and exists (
    select 1
    from public.direct_conversations c
    where c.id = conversation_id
      and (c.user_a = auth.uid() or c.user_b = auth.uid())
  )
);

drop policy if exists "direct_messages_participants_update" on public.direct_messages;
create policy "direct_messages_participants_update"
on public.direct_messages
for update
to authenticated
using (
  exists (
    select 1
    from public.direct_conversations c
    where c.id = conversation_id
      and (c.user_a = auth.uid() or c.user_b = auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.direct_conversations c
    where c.id = conversation_id
      and (c.user_a = auth.uid() or c.user_b = auth.uid())
  )
);

create or replace function public.start_direct_conversation_v1(
  p_target_kind text,
  p_target_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_target_user uuid;
  v_my_kind text;
  v_user_a uuid;
  v_user_b uuid;
  v_kind_a text;
  v_kind_b text;
  v_conversation_id uuid;
begin
  if v_me is null then
    raise exception 'authentication required';
  end if;

  if p_target_kind not in ('artist','venue') then
    raise exception 'invalid target kind';
  end if;

  if p_target_kind = 'artist' then
    select a.user_id
      into v_target_user
    from public.artist_profiles a
    where a.id = p_target_profile_id
      and a.is_active = true;
  else
    select v.owner_user_id
      into v_target_user
    from public.venue_profiles v
    where v.id = p_target_profile_id
      and v.is_active = true;
  end if;

  if v_target_user is null then
    raise exception 'target profile not found';
  end if;

  if v_target_user = v_me then
    raise exception 'cannot message your own profile';
  end if;

  select case
    when p.default_mode = 'venue'
      and exists (select 1 from public.venue_profiles v where v.owner_user_id = v_me)
      then 'venue'
    else 'artist'
  end
  into v_my_kind
  from public.profiles p
  where p.id = v_me;

  if v_my_kind is null then
    if exists (select 1 from public.artist_profiles a where a.user_id = v_me) then
      v_my_kind := 'artist';
    elsif exists (select 1 from public.venue_profiles v where v.owner_user_id = v_me) then
      v_my_kind := 'venue';
    else
      raise exception 'profile required';
    end if;
  end if;

  if v_me::text < v_target_user::text then
    v_user_a := v_me;
    v_user_b := v_target_user;
    v_kind_a := v_my_kind;
    v_kind_b := p_target_kind;
  else
    v_user_a := v_target_user;
    v_user_b := v_me;
    v_kind_a := p_target_kind;
    v_kind_b := v_my_kind;
  end if;

  select c.id
    into v_conversation_id
  from public.direct_conversations c
  where c.user_a = v_user_a
    and c.user_b = v_user_b;

  if v_conversation_id is null then
    insert into public.direct_conversations(
      user_a, user_b, user_a_kind, user_b_kind
    )
    values (
      v_user_a, v_user_b, v_kind_a, v_kind_b
    )
    returning id into v_conversation_id;
  else
    update public.direct_conversations
    set
      user_a_kind = v_kind_a,
      user_b_kind = v_kind_b,
      updated_at = now()
    where id = v_conversation_id;
  end if;

  return v_conversation_id;
end;
$$;

revoke all on function public.start_direct_conversation_v1(text,uuid) from public;
grant execute on function public.start_direct_conversation_v1(text,uuid) to authenticated;

create or replace function public.touch_direct_conversation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.direct_conversations
  set updated_at = now()
  where id = new.conversation_id;

  return new;
end;
$$;

drop trigger if exists direct_messages_touch_conversation on public.direct_messages;
create trigger direct_messages_touch_conversation
after insert on public.direct_messages
for each row
execute function public.touch_direct_conversation_v1();
