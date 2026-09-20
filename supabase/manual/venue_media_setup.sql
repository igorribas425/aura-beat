-- Aura Beat - ativacao manual da Galeria da Casa.
-- NAO e aplicada automaticamente. Execute no Supabase SQL Editor somente apos revisar.
-- Depois de validada, converta este SQL em uma migration oficial usando o Supabase CLI.

create table if not exists public.venue_media (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venue_profiles(id) on delete cascade,
  media_type text not null check (media_type in ('photo', 'video')),
  storage_path text not null,
  public_url text not null,
  caption text check (caption is null or char_length(caption) <= 120),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_cover boolean not null default false,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (venue_id, storage_path)
);

create index if not exists venue_media_public_idx
  on public.venue_media(venue_id, is_cover desc, sort_order, created_at);

create unique index if not exists venue_media_one_cover_per_venue
  on public.venue_media(venue_id)
  where is_cover = true;

alter table public.venue_media enable row level security;

drop policy if exists venue_media_public_read on public.venue_media;
drop policy if exists venue_media_owner_insert on public.venue_media;
drop policy if exists venue_media_owner_update on public.venue_media;
drop policy if exists venue_media_owner_delete on public.venue_media;

create policy venue_media_public_read
on public.venue_media
for select
to anon, authenticated
using (
  is_public = true
  and public_url is not null
  and exists (
    select 1
    from public.venue_profiles venue
    where venue.id = venue_media.venue_id
      and coalesce(venue.is_active, true) = true
  )
);

create policy venue_media_owner_insert
on public.venue_media
for insert
to authenticated
with check (
  exists (
    select 1
    from public.venue_profiles venue
    where venue.id = venue_media.venue_id
      and venue.owner_user_id = (select auth.uid())
  )
);

create policy venue_media_owner_update
on public.venue_media
for update
to authenticated
using (
  exists (
    select 1
    from public.venue_profiles venue
    where venue.id = venue_media.venue_id
      and venue.owner_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.venue_profiles venue
    where venue.id = venue_media.venue_id
      and venue.owner_user_id = (select auth.uid())
  )
);

create policy venue_media_owner_delete
on public.venue_media
for delete
to authenticated
using (
  exists (
    select 1
    from public.venue_profiles venue
    where venue.id = venue_media.venue_id
      and venue.owner_user_id = (select auth.uid())
  )
);

grant select on public.venue_media to anon, authenticated;
grant insert, update, delete on public.venue_media to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'venue-media',
  'venue-media',
  true,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/webm'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists venue_media_storage_owner_insert on storage.objects;
drop policy if exists venue_media_storage_owner_update on storage.objects;
drop policy if exists venue_media_storage_owner_delete on storage.objects;

create policy venue_media_storage_owner_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'venue-media'
  and exists (
    select 1
    from public.venue_profiles venue
    where venue.owner_user_id = (select auth.uid())
      and venue.id::text = (storage.foldername(name))[1]
  )
);

create policy venue_media_storage_owner_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'venue-media'
  and exists (
    select 1
    from public.venue_profiles venue
    where venue.owner_user_id = (select auth.uid())
      and venue.id::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'venue-media'
  and exists (
    select 1
    from public.venue_profiles venue
    where venue.owner_user_id = (select auth.uid())
      and venue.id::text = (storage.foldername(name))[1]
  )
);

create policy venue_media_storage_owner_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'venue-media'
  and exists (
    select 1
    from public.venue_profiles venue
    where venue.owner_user_id = (select auth.uid())
      and venue.id::text = (storage.foldername(name))[1]
  )
);

create or replace function public.venue_media_set_updated_at_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.venue_media_set_updated_at_v1()
from public, anon, authenticated;

drop trigger if exists venue_media_set_updated_at
on public.venue_media;

create trigger venue_media_set_updated_at
before update
on public.venue_media
for each row
execute function public.venue_media_set_updated_at_v1();

create or replace function public.sync_venue_media_cover_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_cover
     and new.media_type = 'photo'
     and new.public_url is not null then
    update public.venue_profiles
    set avatar_url = new.public_url
    where id = new.venue_id;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_venue_media_cover_v1()
from public, anon, authenticated;

drop trigger if exists venue_media_sync_cover
on public.venue_media;

create trigger venue_media_sync_cover
after insert or update of is_cover, public_url, media_type
on public.venue_media
for each row
execute function public.sync_venue_media_cover_v1();

notify pgrst, 'reload schema';
