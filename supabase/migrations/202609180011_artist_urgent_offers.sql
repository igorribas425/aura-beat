-- Aura Beat
-- Registra o fluxo de ofertas urgentes publicadas pelo artista.
-- Esta migration apenas espelha no repositorio a estrutura ja usada no Supabase remoto.

create extension if not exists pgcrypto;

create table if not exists public.artist_offers (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artist_profiles(id) on delete cascade,
  title text not null,
  description text,
  styles text[] not null default '{}'::text[],
  available_from timestamptz not null,
  available_until timestamptz not null,
  fee_amount numeric(12,2) not null check (fee_amount >= 0),
  radius_km numeric(10,2) not null default 50 check (radius_km >= 0),
  base_city text,
  base_state text,
  is_urgent boolean not null default true,
  status text not null default 'open'
    check (status in ('draft','open','filled','closed','cancelled')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists artist_offers_artist_idx
  on public.artist_offers(artist_id, created_at desc);

create index if not exists artist_offers_status_date_idx
  on public.artist_offers(status, available_from, available_until);

alter table public.artist_offers enable row level security;

drop policy if exists "artist_offers_select" on public.artist_offers;
create policy "artist_offers_select"
on public.artist_offers
for select
to authenticated
using (
  status = 'open'
  or exists (
    select 1
    from public.artist_profiles artist
    where artist.id = artist_offers.artist_id
      and artist.user_id = auth.uid()
  )
  or public.is_aura_admin()
);

drop policy if exists "artist_offers_insert_own" on public.artist_offers;
create policy "artist_offers_insert_own"
on public.artist_offers
for insert
to authenticated
with check (
  exists (
    select 1
    from public.artist_profiles artist
    where artist.id = artist_offers.artist_id
      and artist.user_id = auth.uid()
  )
  or public.is_aura_admin(array['admin','owner']::text[])
);

drop policy if exists "artist_offers_update_own" on public.artist_offers;
create policy "artist_offers_update_own"
on public.artist_offers
for update
to authenticated
using (
  exists (
    select 1
    from public.artist_profiles artist
    where artist.id = artist_offers.artist_id
      and artist.user_id = auth.uid()
  )
  or public.is_aura_admin(array['admin','owner']::text[])
)
with check (
  exists (
    select 1
    from public.artist_profiles artist
    where artist.id = artist_offers.artist_id
      and artist.user_id = auth.uid()
  )
  or public.is_aura_admin(array['admin','owner']::text[])
);

drop policy if exists "artist_offers_delete_own" on public.artist_offers;
create policy "artist_offers_delete_own"
on public.artist_offers
for delete
to authenticated
using (
  exists (
    select 1
    from public.artist_profiles artist
    where artist.id = artist_offers.artist_id
      and artist.user_id = auth.uid()
  )
  or public.is_aura_admin(array['admin','owner']::text[])
);

create or replace function public.validar_oferta_urgente_artista()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'open' and not exists (
    select 1
    from public.artist_profiles artist
    where artist.id = new.artist_id
      and artist.verification_status = 'verified'
      and coalesce(artist.is_active, true) = true
  ) then
    raise exception 'Artista precisa estar verificado para publicar disponibilidade';
  end if;

  return new;
end;
$function$;

revoke all on function public.validar_oferta_urgente_artista() from public;

drop trigger if exists trg_validar_oferta_urgente_artista
on public.artist_offers;

create trigger trg_validar_oferta_urgente_artista
before insert or update of artist_id, status
on public.artist_offers
for each row
execute function public.validar_oferta_urgente_artista();


create table if not exists public.artist_offer_requests (
  id uuid primary key default gen_random_uuid(),
  artist_offer_id uuid not null references public.artist_offers(id) on delete cascade,
  venue_id uuid not null references public.venue_profiles(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  requested_starts_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes > 0),
  agreed_fee numeric(12,2) not null check (agreed_fee >= 0),
  travel_amount numeric(12,2) not null default 0 check (travel_amount >= 0),
  toll_amount numeric(12,2) not null default 0 check (toll_amount >= 0),
  lodging_amount numeric(12,2) not null default 0 check (lodging_amount >= 0),
  event_address text,
  message text,
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(artist_offer_id, venue_id)
);

create index if not exists artist_offer_requests_offer_idx
  on public.artist_offer_requests(artist_offer_id, created_at desc);

create index if not exists artist_offer_requests_venue_idx
  on public.artist_offer_requests(venue_id, created_at desc);

alter table public.artist_offer_requests enable row level security;

drop policy if exists "artist_offer_requests_select" on public.artist_offer_requests;
create policy "artist_offer_requests_select"
on public.artist_offer_requests
for select
to authenticated
using (
  public.is_venue_member(venue_id)
  or exists (
    select 1
    from public.artist_offers offer
    join public.artist_profiles artist
      on artist.id = offer.artist_id
    where offer.id = artist_offer_requests.artist_offer_id
      and artist.user_id = auth.uid()
  )
  or public.is_aura_admin()
);

drop policy if exists "artist_offer_requests_insert_venue" on public.artist_offer_requests;
create policy "artist_offer_requests_insert_venue"
on public.artist_offer_requests
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.is_venue_member(venue_id)
);

create or replace function public.validar_solicitacao_casa_oferta_artista()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'pending' and not exists (
    select 1
    from public.venue_profiles venue
    where venue.id = new.venue_id
      and venue.verification_status = 'verified'
      and coalesce(venue.is_active, true) = true
  ) then
    raise exception 'Casa precisa estar verificada para solicitar contratacao';
  end if;

  return new;
end;
$function$;

revoke all on function public.validar_solicitacao_casa_oferta_artista() from public;

drop trigger if exists trg_validar_solicitacao_casa_oferta_artista
on public.artist_offer_requests;

create trigger trg_validar_solicitacao_casa_oferta_artista
before insert or update of venue_id, status
on public.artist_offer_requests
for each row
execute function public.validar_solicitacao_casa_oferta_artista();


create or replace function public.responder_solicitacao_oferta_artista(
  p_request_id uuid,
  p_action text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_request public.artist_offer_requests%rowtype;
  v_offer public.artist_offers%rowtype;
  v_booking_id uuid;
begin
  if v_user_id is null then
    raise exception 'Autenticacao obrigatoria';
  end if;

  if p_action not in ('accepted','declined') then
    raise exception 'Acao invalida';
  end if;

  select *
    into v_request
  from public.artist_offer_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Solicitacao nao encontrada';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Esta solicitacao ja foi respondida';
  end if;

  select *
    into v_offer
  from public.artist_offers
  where id = v_request.artist_offer_id
  for update;

  if not found then
    raise exception 'Oferta do artista nao encontrada';
  end if;

  if not exists (
    select 1
    from public.artist_profiles artist
    where artist.id = v_offer.artist_id
      and artist.user_id = v_user_id
  ) then
    raise exception 'Apenas o artista dono da oferta pode responder';
  end if;

  if p_action = 'declined' then
    update public.artist_offer_requests
    set
      status = 'declined',
      updated_at = now()
    where id = p_request_id;

    return null;
  end if;

  if v_offer.status <> 'open' then
    raise exception 'Esta oferta nao esta mais aberta';
  end if;

  if v_offer.expires_at is not null
     and v_offer.expires_at <= now() then
    raise exception 'Esta oferta expirou';
  end if;

  if v_request.requested_starts_at < v_offer.available_from
     or (
       v_request.requested_starts_at
       + make_interval(mins => v_request.duration_minutes)
     ) > v_offer.available_until then
    raise exception 'Horario solicitado fora da disponibilidade do artista';
  end if;

  insert into public.bookings (
    offer_id,
    response_id,
    venue_id,
    artist_id,
    status,
    starts_at,
    duration_minutes,
    event_address_snapshot,
    agreed_fee,
    travel_amount,
    toll_amount,
    lodging_amount,
    contact_unlocked,
    terms_snapshot
  )
  values (
    null,
    null,
    v_request.venue_id,
    v_offer.artist_id,
    'awaiting_payment',
    v_request.requested_starts_at,
    v_request.duration_minutes,
    v_request.event_address,
    v_request.agreed_fee,
    v_request.travel_amount,
    v_request.toll_amount,
    v_request.lodging_amount,
    false,
    jsonb_build_object(
      'source', 'artist_offer',
      'is_urgent', true,
      'artist_offer_id', v_offer.id,
      'artist_offer_request_id', v_request.id,
      'venue_fee_rate', 0.03,
      'artist_fee_rate', 0.03,
      'commission_applies_to', 'agreed_fee'
    )
  )
  returning id into v_booking_id;

  update public.artist_offer_requests
  set
    status = 'accepted',
    updated_at = now()
  where id = p_request_id;

  update public.artist_offers
  set
    status = 'filled',
    updated_at = now()
  where id = v_offer.id;

  update public.artist_offer_requests
  set
    status = 'declined',
    updated_at = now()
  where artist_offer_id = v_offer.id
    and id <> p_request_id
    and status = 'pending';

  return v_booking_id;
end;
$function$;

revoke all on function public.responder_solicitacao_oferta_artista(uuid,text) from public;
grant execute on function public.responder_solicitacao_oferta_artista(uuid,text) to authenticated;


create or replace function public.criar_conversa_ao_criar_booking()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if new.offer_id is null then
    insert into public.conversations (
      offer_id,
      booking_id,
      venue_id,
      artist_id
    )
    values (
      null,
      new.id,
      new.venue_id,
      new.artist_id
    )
    on conflict do nothing;

    return new;
  end if;

  insert into public.conversations (
    offer_id,
    booking_id,
    venue_id,
    artist_id
  )
  values (
    new.offer_id,
    new.id,
    new.venue_id,
    new.artist_id
  )
  on conflict (offer_id, artist_id)
    where offer_id is not null
  do update
    set booking_id = excluded.booking_id;

  return new;
end;
$function$;

drop trigger if exists trg_criar_conversa_ao_criar_booking
on public.bookings;

create trigger trg_criar_conversa_ao_criar_booking
after insert
on public.bookings
for each row
execute function public.criar_conversa_ao_criar_booking();

notify pgrst, 'reload schema';
