-- Public professional media gallery for Artist profiles.
-- This creates a public-read bucket for media the Artist intentionally publishes.
-- Identity documents and private contracting files must never use this bucket.

create table if not exists public.artist_media (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artist_profiles(id) on delete cascade,
  media_type text not null check (media_type in ('photo', 'video', 'flyer')),
  storage_path text not null,
  public_url text not null,
  caption text,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (artist_id, storage_path)
);

create index if not exists artist_media_public_idx
  on public.artist_media(artist_id, is_cover desc, sort_order, created_at);

create unique index if not exists artist_media_one_cover_per_artist
  on public.artist_media(artist_id)
  where is_cover = true;

alter table public.artist_media enable row level security;

drop policy if exists "artist_media_public_read" on public.artist_media;
create policy "artist_media_public_read"
on public.artist_media
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.artist_profiles artist
    where artist.id = artist_id
      and artist.is_active = true
  )
);

drop policy if exists "artist_media_owner_insert" on public.artist_media;
create policy "artist_media_owner_insert"
on public.artist_media
for insert
to authenticated
with check (
  exists (
    select 1
    from public.artist_profiles artist
    where artist.id = artist_id
      and artist.user_id = auth.uid()
  )
);

drop policy if exists "artist_media_owner_update" on public.artist_media;
create policy "artist_media_owner_update"
on public.artist_media
for update
to authenticated
using (
  exists (
    select 1
    from public.artist_profiles artist
    where artist.id = artist_id
      and artist.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.artist_profiles artist
    where artist.id = artist_id
      and artist.user_id = auth.uid()
  )
);

drop policy if exists "artist_media_owner_delete" on public.artist_media;
create policy "artist_media_owner_delete"
on public.artist_media
for delete
to authenticated
using (
  exists (
    select 1
    from public.artist_profiles artist
    where artist.id = artist_id
      and artist.user_id = auth.uid()
  )
);

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

drop policy if exists "artist_media_storage_owner_insert" on storage.objects;
create policy "artist_media_storage_owner_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'artist-media'
  and exists (
    select 1
    from public.artist_profiles artist
    where artist.user_id = auth.uid()
      and artist.id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "artist_media_storage_owner_update" on storage.objects;
create policy "artist_media_storage_owner_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'artist-media'
  and exists (
    select 1
    from public.artist_profiles artist
    where artist.user_id = auth.uid()
      and artist.id::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'artist-media'
  and exists (
    select 1
    from public.artist_profiles artist
    where artist.user_id = auth.uid()
      and artist.id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "artist_media_storage_owner_delete" on storage.objects;
create policy "artist_media_storage_owner_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'artist-media'
  and exists (
    select 1
    from public.artist_profiles artist
    where artist.user_id = auth.uid()
      and artist.id::text = (storage.foldername(name))[1]
  )
);
