-- Universal Explore for Aura Beat.
-- Review in staging and apply with the Supabase migration workflow. This file does
-- not read from or grant any access to booking_tracking.

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

alter table public.artist_profiles
  add column if not exists accepted_event_types text[] not null default '{}',
  add column if not exists availability_radius_km numeric(8,2)
    check (availability_radius_km is null or availability_radius_km between 1 and 500);

alter table public.venue_profiles
  add column if not exists venue_type text,
  add column if not exists avatar_url text;

-- Exact base/commercial coordinates stay in a protected table. Clients may manage
-- only their own row. Discovery reads them exclusively through the function below,
-- which coarsens every Artist point before returning it.
create table if not exists public.public_profile_locations (
  id uuid primary key default gen_random_uuid(),
  profile_kind text not null check (profile_kind in ('artist', 'venue')),
  artist_id uuid references public.artist_profiles(id) on delete cascade,
  venue_id uuid references public.venue_profiles(id) on delete cascade,
  location extensions.geography(point, 4326) not null,
  precision_km numeric(8,2) not null default 5 check (precision_km between 0.1 and 100),
  source text not null default 'profile' check (source in ('profile', 'city', 'commercial')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_profile_location_target check (
    (profile_kind = 'artist' and artist_id is not null and venue_id is null) or
    (profile_kind = 'venue' and venue_id is not null and artist_id is null)
  )
);

create unique index if not exists public_profile_locations_artist_unique
  on public.public_profile_locations(artist_id) where artist_id is not null;
create unique index if not exists public_profile_locations_venue_unique
  on public.public_profile_locations(venue_id) where venue_id is not null;
create index if not exists public_profile_locations_geo_idx
  on public.public_profile_locations using gist(location);
create index if not exists artist_profiles_explore_name_idx
  on public.artist_profiles(lower(stage_name)) where is_active = true;
create index if not exists venue_profiles_explore_name_idx
  on public.venue_profiles(lower(trade_name)) where is_active = true;
create index if not exists artist_styles_explore_idx
  on public.artist_styles(artist_id, lower(style_name));
create index if not exists artist_availability_explore_idx
  on public.artist_availability(artist_id, is_available, last_seen_at desc);

alter table public.public_profile_locations enable row level security;

drop policy if exists "profile_locations_owner_read" on public.public_profile_locations;
create policy "profile_locations_owner_read"
on public.public_profile_locations for select to authenticated
using (
  (artist_id is not null and exists (
    select 1 from public.artist_profiles artist
    where artist.id = artist_id and artist.user_id = auth.uid()
  )) or
  (venue_id is not null and exists (
    select 1 from public.venue_profiles venue
    where venue.id = venue_id and venue.owner_user_id = auth.uid()
  ))
);

drop policy if exists "profile_locations_owner_insert" on public.public_profile_locations;
create policy "profile_locations_owner_insert"
on public.public_profile_locations for insert to authenticated
with check (
  (artist_id is not null and exists (
    select 1 from public.artist_profiles artist
    where artist.id = artist_id and artist.user_id = auth.uid()
  )) or
  (venue_id is not null and exists (
    select 1 from public.venue_profiles venue
    where venue.id = venue_id and venue.owner_user_id = auth.uid()
  ))
);

drop policy if exists "profile_locations_owner_update" on public.public_profile_locations;
create policy "profile_locations_owner_update"
on public.public_profile_locations for update to authenticated
using (
  (artist_id is not null and exists (
    select 1 from public.artist_profiles artist
    where artist.id = artist_id and artist.user_id = auth.uid()
  )) or
  (venue_id is not null and exists (
    select 1 from public.venue_profiles venue
    where venue.id = venue_id and venue.owner_user_id = auth.uid()
  ))
)
with check (
  (artist_id is not null and exists (
    select 1 from public.artist_profiles artist
    where artist.id = artist_id and artist.user_id = auth.uid()
  )) or
  (venue_id is not null and exists (
    select 1 from public.venue_profiles venue
    where venue.id = venue_id and venue.owner_user_id = auth.uid()
  ))
);

drop policy if exists "profile_locations_owner_delete" on public.public_profile_locations;
create policy "profile_locations_owner_delete"
on public.public_profile_locations for delete to authenticated
using (
  (artist_id is not null and exists (
    select 1 from public.artist_profiles artist
    where artist.id = artist_id and artist.user_id = auth.uid()
  )) or
  (venue_id is not null and exists (
    select 1 from public.venue_profiles venue
    where venue.id = venue_id and venue.owner_user_id = auth.uid()
  ))
);

create or replace function public.set_public_profile_location_v1(
  p_kind text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_precision_km numeric default null,
  p_remove boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_artist_id uuid;
  target_venue_id uuid;
  safe_precision numeric;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if p_kind not in ('artist', 'venue') then
    raise exception 'invalid profile kind';
  end if;

  if p_kind = 'artist' then
    select artist.id into target_artist_id
    from public.artist_profiles artist
    where artist.user_id = auth.uid();
    if target_artist_id is null then raise exception 'artist profile required'; end if;
    if p_remove then
      delete from public.public_profile_locations where artist_id = target_artist_id;
      return;
    end if;
    safe_precision := greatest(coalesce(p_precision_km, 5), 5);
    delete from public.public_profile_locations where artist_id = target_artist_id;
  else
    select venue.id into target_venue_id
    from public.venue_profiles venue
    where venue.owner_user_id = auth.uid();
    if target_venue_id is null then raise exception 'venue profile required'; end if;
    if p_remove then
      delete from public.public_profile_locations where venue_id = target_venue_id;
      return;
    end if;
    safe_precision := greatest(coalesce(p_precision_km, 0.25), 0.1);
    delete from public.public_profile_locations where venue_id = target_venue_id;
  end if;

  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid coordinates';
  end if;

  insert into public.public_profile_locations(
    profile_kind, artist_id, venue_id, location, precision_km, source
  ) values (
    p_kind,
    target_artist_id,
    target_venue_id,
    extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
    safe_precision,
    case when p_kind = 'artist' then 'profile' else 'commercial' end
  );
end;
$$;

revoke all on function public.set_public_profile_location_v1(text,double precision,double precision,numeric,boolean) from public;
grant execute on function public.set_public_profile_location_v1(text,double precision,double precision,numeric,boolean) to authenticated;

create or replace function public.explore_profiles_v1(
  p_kind text default 'all',
  p_query text default null,
  p_city text default null,
  p_style text default null,
  p_event_type text default null,
  p_available_now boolean default false,
  p_verified_only boolean default false,
  p_min_rating numeric default 0,
  p_max_hourly_fee numeric default null,
  p_origin_lat double precision default null,
  p_origin_lng double precision default null,
  p_max_distance_km numeric default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  profile_kind text,
  profile_id uuid,
  display_name text,
  avatar_url text,
  city text,
  state text,
  description text,
  styles text[],
  event_types text[],
  venue_type text,
  verification_status text,
  rating numeric,
  review_count bigint,
  hourly_fee numeric,
  available_now boolean,
  radius_km numeric,
  latitude double precision,
  longitude double precision,
  location_precision_km numeric,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with artist_reviews as (
    select review.artist_id,
      round(avg(review.overall_rating)::numeric, 2) as rating,
      count(*) as review_count
    from public.reviews review
    where review.reviewee_type = 'artist' and review.artist_id is not null
    group by review.artist_id
  ),
  venue_reviews as (
    select review.venue_id,
      round(avg(review.overall_rating)::numeric, 2) as rating,
      count(*) as review_count
    from public.reviews review
    where review.reviewee_type = 'venue' and review.venue_id is not null
    group by review.venue_id
  ),
  artist_styles_agg as (
    select item.artist_id,
      array_agg(distinct item.style_name order by item.style_name) filter (where item.style_name is not null) as styles
    from public.artist_styles item
    group by item.artist_id
  ),
  all_profiles as (
    select
      'artist'::text as profile_kind,
      artist.id as profile_id,
      artist.stage_name as display_name,
      artist.avatar_url,
      artist.base_city as city,
      artist.base_state as state,
      artist.bio as description,
      coalesce(style_list.styles, '{}'::text[]) as styles,
      coalesce(artist.accepted_event_types, '{}'::text[]) as event_types,
      null::text as venue_type,
      artist.verification_status::text,
      coalesce(review.rating, 0::numeric) as rating,
      coalesce(review.review_count, 0::bigint) as review_count,
      artist.fixed_fee as hourly_fee,
      coalesce(availability.is_available, false)
        and coalesce(availability.sharing_consent, false)
        and availability.last_seen_at >= now() - interval '30 minutes' as available_now,
      coalesce(artist.availability_radius_km, artist.free_radius_km) as radius_km,
      case when coalesce(base_location.location, case
          when availability.is_available and availability.sharing_consent
            and availability.last_seen_at >= now() - interval '30 minutes'
          then availability.current_location else null end) is null then null
        else extensions.st_y(extensions.st_snaptogrid(
          coalesce(base_location.location, case
            when availability.is_available and availability.sharing_consent
              and availability.last_seen_at >= now() - interval '30 minutes'
            then availability.current_location else null end)::extensions.geometry,
          greatest(coalesce(base_location.precision_km, 5), 5) / 111.0
        )) end as latitude,
      case when coalesce(base_location.location, case
          when availability.is_available and availability.sharing_consent
            and availability.last_seen_at >= now() - interval '30 minutes'
          then availability.current_location else null end) is null then null
        else extensions.st_x(extensions.st_snaptogrid(
          coalesce(base_location.location, case
            when availability.is_available and availability.sharing_consent
              and availability.last_seen_at >= now() - interval '30 minutes'
            then availability.current_location else null end)::extensions.geometry,
          greatest(coalesce(base_location.precision_km, 5), 5) / 111.0
        )) end as longitude,
      case when coalesce(base_location.location, case
          when availability.is_available and availability.sharing_consent
            and availability.last_seen_at >= now() - interval '30 minutes'
          then availability.current_location else null end) is null then null
        else greatest(coalesce(base_location.precision_km, 5), 5) end as location_precision_km
    from public.artist_profiles artist
    left join artist_reviews review on review.artist_id = artist.id
    left join artist_styles_agg style_list on style_list.artist_id = artist.id
    left join public.artist_availability availability on availability.artist_id = artist.id
    left join public.public_profile_locations base_location on base_location.artist_id = artist.id
    where artist.is_active = true

    union all

    select
      'venue'::text as profile_kind,
      venue.id as profile_id,
      venue.trade_name as display_name,
      venue.avatar_url,
      venue.city,
      venue.state,
      null::text as description,
      '{}'::text[] as styles,
      '{}'::text[] as event_types,
      venue.venue_type,
      venue.verification_status::text,
      coalesce(review.rating, 0::numeric) as rating,
      coalesce(review.review_count, 0::bigint) as review_count,
      null::numeric as hourly_fee,
      false as available_now,
      null::numeric as radius_km,
      case when commercial_location.location is null then null
        else extensions.st_y(extensions.st_snaptogrid(
          commercial_location.location::extensions.geometry,
          commercial_location.precision_km / 111.0
        )) end as latitude,
      case when commercial_location.location is null then null
        else extensions.st_x(extensions.st_snaptogrid(
          commercial_location.location::extensions.geometry,
          commercial_location.precision_km / 111.0
        )) end as longitude,
      commercial_location.precision_km as location_precision_km
    from public.venue_profiles venue
    left join venue_reviews review on review.venue_id = venue.id
    left join public.public_profile_locations commercial_location on commercial_location.venue_id = venue.id
    where venue.is_active = true
  ),
  filtered as (
    select profile.*
    from all_profiles profile
    where (p_kind in ('all', profile.profile_kind))
      and (p_query is null or trim(p_query) = '' or
        lower(concat_ws(' ', profile.display_name, profile.city, profile.state, profile.venue_type, array_to_string(profile.styles, ' ')))
          like '%' || lower(trim(p_query)) || '%')
      and (p_city is null or trim(p_city) = '' or lower(coalesce(profile.city, '')) like '%' || lower(trim(p_city)) || '%')
      and (p_style is null or trim(p_style) = '' or exists (
        select 1 from unnest(profile.styles) item where lower(item) like '%' || lower(trim(p_style)) || '%'
      ))
      and (p_event_type is null or trim(p_event_type) = '' or exists (
        select 1 from unnest(profile.event_types) item where lower(item) like '%' || lower(trim(p_event_type)) || '%'
      ))
      and (not p_available_now or profile.available_now)
      and (not p_verified_only or profile.verification_status = 'verified')
      and profile.rating >= greatest(coalesce(p_min_rating, 0), 0)
      and (p_max_hourly_fee is null or profile.profile_kind = 'venue' or profile.hourly_fee <= p_max_hourly_fee)
      and (
        p_max_distance_km is null or (
          p_origin_lat between -90 and 90 and p_origin_lng between -180 and 180 and
          profile.latitude is not null and profile.longitude is not null and
          extensions.st_distance(
            extensions.st_setsrid(extensions.st_makepoint(p_origin_lng, p_origin_lat), 4326)::extensions.geography,
            extensions.st_setsrid(extensions.st_makepoint(profile.longitude, profile.latitude), 4326)::extensions.geography
          ) <= greatest(p_max_distance_km, 0) * 1000
        )
      )
  )
  select
    filtered.profile_kind,
    filtered.profile_id,
    filtered.display_name,
    filtered.avatar_url,
    filtered.city,
    filtered.state,
    filtered.description,
    filtered.styles,
    filtered.event_types,
    filtered.venue_type,
    filtered.verification_status,
    filtered.rating,
    filtered.review_count,
    filtered.hourly_fee,
    filtered.available_now,
    filtered.radius_km,
    filtered.latitude,
    filtered.longitude,
    filtered.location_precision_km,
    count(*) over() as total_count
  from filtered
  order by filtered.available_now desc, filtered.rating desc, filtered.display_name
  limit least(greatest(coalesce(p_limit, 24), 1), 48)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.explore_profiles_v1(text,text,text,text,text,boolean,boolean,numeric,numeric,double precision,double precision,numeric,integer,integer) from public;
grant execute on function public.explore_profiles_v1(text,text,text,text,text,boolean,boolean,numeric,numeric,double precision,double precision,numeric,integer,integer) to authenticated;

comment on function public.explore_profiles_v1(text,text,text,text,text,boolean,boolean,numeric,numeric,double precision,double precision,numeric,integer,integer)
is 'Paginated public discovery. Artist coordinates are snapped to a grid of at least 5 km; never reads booking_tracking.';
