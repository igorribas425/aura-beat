-- Alinha a tabela artist_media existente com o Midia Kit usado pelo app.
-- Preserva a tabela antiga e converte os nomes de colunas quando necessario.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='artist_media' and column_name='kind'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='artist_media' and column_name='media_type'
  ) then
    alter table public.artist_media rename column kind to media_type;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='artist_media' and column_name='title'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='artist_media' and column_name='caption'
  ) then
    alter table public.artist_media rename column title to caption;
  end if;
end;
$$;

alter table public.artist_media
  add column if not exists public_url text,
  add column if not exists is_cover boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

update public.artist_media
set media_type = 'photo'
where media_type = 'presskit';

alter table public.artist_media
  drop constraint if exists artist_media_kind_check,
  drop constraint if exists artist_media_media_type_check;

alter table public.artist_media
  add constraint artist_media_media_type_check
  check (media_type in ('photo','video','flyer'));

create unique index if not exists artist_media_artist_storage_unique
  on public.artist_media(artist_id, storage_path);

create index if not exists artist_media_public_idx
  on public.artist_media(artist_id, is_cover desc, sort_order, created_at);

create unique index if not exists artist_media_one_cover_per_artist
  on public.artist_media(artist_id)
  where is_cover = true;

alter table public.artist_media enable row level security;

drop policy if exists artist_media_manage_own on public.artist_media;
drop policy if exists artist_media_select_auth on public.artist_media;
drop policy if exists artist_media_public_read on public.artist_media;
drop policy if exists artist_media_owner_insert on public.artist_media;
drop policy if exists artist_media_owner_update on public.artist_media;
drop policy if exists artist_media_owner_delete on public.artist_media;
drop policy if exists "artist_media_public_read" on public.artist_media;
drop policy if exists "artist_media_owner_insert" on public.artist_media;
drop policy if exists "artist_media_owner_update" on public.artist_media;
drop policy if exists "artist_media_owner_delete" on public.artist_media;

create policy artist_media_public_read
on public.artist_media
for select
to anon, authenticated
using (
  coalesce(is_public, true)
  and public_url is not null
  and exists (
    select 1
    from public.artist_profiles artist
    where artist.id = artist_media.artist_id
      and artist.is_active = true
  )
);

create policy artist_media_owner_insert
on public.artist_media
for insert
to authenticated
with check (
  exists (
    select 1
    from public.artist_profiles artist
    where artist.id = artist_media.artist_id
      and artist.user_id = (select auth.uid())
  )
);

create policy artist_media_owner_update
on public.artist_media
for update
to authenticated
using (
  exists (
    select 1
    from public.artist_profiles artist
    where artist.id = artist_media.artist_id
      and artist.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.artist_profiles artist
    where artist.id = artist_media.artist_id
      and artist.user_id = (select auth.uid())
  )
);

create policy artist_media_owner_delete
on public.artist_media
for delete
to authenticated
using (
  exists (
    select 1
    from public.artist_profiles artist
    where artist.id = artist_media.artist_id
      and artist.user_id = (select auth.uid())
  )
);

grant select on public.artist_media to anon, authenticated;
grant insert, update, delete on public.artist_media to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'artist-media',
  'artist-media',
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

drop policy if exists artist_media_storage_owner_insert on storage.objects;
drop policy if exists artist_media_storage_owner_update on storage.objects;
drop policy if exists artist_media_storage_owner_delete on storage.objects;
drop policy if exists "artist_media_storage_owner_insert" on storage.objects;
drop policy if exists "artist_media_storage_owner_update" on storage.objects;
drop policy if exists "artist_media_storage_owner_delete" on storage.objects;

create policy artist_media_storage_owner_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'artist-media'
  and exists (
    select 1
    from public.artist_profiles artist
    where artist.user_id = (select auth.uid())
      and artist.id::text = (storage.foldername(name))[1]
  )
);

create policy artist_media_storage_owner_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'artist-media'
  and exists (
    select 1
    from public.artist_profiles artist
    where artist.user_id = (select auth.uid())
      and artist.id::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'artist-media'
  and exists (
    select 1
    from public.artist_profiles artist
    where artist.user_id = (select auth.uid())
      and artist.id::text = (storage.foldername(name))[1]
  )
);

create policy artist_media_storage_owner_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'artist-media'
  and exists (
    select 1
    from public.artist_profiles artist
    where artist.user_id = (select auth.uid())
      and artist.id::text = (storage.foldername(name))[1]
  )
);

create or replace function public.sync_artist_media_cover_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_cover and new.media_type <> 'video' and new.public_url is not null then
    update public.artist_profiles
    set avatar_url = new.public_url,
        updated_at = now()
    where id = new.artist_id;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_artist_media_cover_v1()
from public, anon, authenticated;

drop trigger if exists artist_media_sync_cover
on public.artist_media;

create trigger artist_media_sync_cover
after insert or update of is_cover, public_url, media_type
on public.artist_media
for each row
execute function public.sync_artist_media_cover_v1();
