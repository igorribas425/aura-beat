-- Aura Beat: regras de segurança para contratação formal.
-- IMPORTANTE: revisar contra o schema remoto atual antes de aplicar em produção.
-- Esta migration NÃO verifica CNPJ/CPF em fonte externa; ela apenas impede que
-- perfis ainda não aprovados formalizem ofertas, respostas e bookings.

create or replace function public.enforce_verified_venue_offer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'open' and not exists (
    select 1
    from public.venue_profiles venue
    where venue.id = new.venue_id
      and venue.verification_status = 'verified'
      and coalesce(venue.is_active, true) = true
  ) then
    raise exception 'Casa precisa estar verificada para publicar oferta';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_verified_venue_offer() from public;

drop trigger if exists offers_require_verified_venue on public.offers;
create trigger offers_require_verified_venue
before insert or update of venue_id, status
on public.offers
for each row
execute function public.enforce_verified_venue_offer();

create or replace function public.enforce_verified_offer_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_venue_id uuid;
begin
  -- Recusar ou retirar uma resposta deve continuar possível mesmo se um perfil
  -- perder a verificação depois. Qualquer ação que avance a contratação exige
  -- verificação dos dois lados.
  if new.status in ('pending', 'accepted', 'countered', 'selected') then
    select offer.venue_id
      into target_venue_id
    from public.offers offer
    where offer.id = new.offer_id;

    if target_venue_id is null then
      raise exception 'Oferta não encontrada';
    end if;

    if not exists (
      select 1
      from public.venue_profiles venue
      where venue.id = target_venue_id
        and venue.verification_status = 'verified'
        and coalesce(venue.is_active, true) = true
    ) then
      raise exception 'Casa precisa estar verificada para avançar a contratação';
    end if;

    if not exists (
      select 1
      from public.artist_profiles artist
      where artist.id = new.artist_id
        and artist.verification_status = 'verified'
        and coalesce(artist.is_active, true) = true
    ) then
      raise exception 'Artista precisa estar verificado para avançar a contratação';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_verified_offer_response() from public;

drop trigger if exists offer_responses_require_verified_profiles on public.offer_responses;
create trigger offer_responses_require_verified_profiles
before insert or update of offer_id, artist_id, status
on public.offer_responses
for each row
execute function public.enforce_verified_offer_response();

create or replace function public.enforce_verified_booking_participants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.venue_profiles venue
    where venue.id = new.venue_id
      and venue.verification_status = 'verified'
      and coalesce(venue.is_active, true) = true
  ) then
    raise exception 'Casa precisa estar verificada para criar contratação';
  end if;

  if not exists (
    select 1
    from public.artist_profiles artist
    where artist.id = new.artist_id
      and artist.verification_status = 'verified'
      and coalesce(artist.is_active, true) = true
  ) then
    raise exception 'Artista precisa estar verificado para criar contratação';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_verified_booking_participants() from public;

drop trigger if exists bookings_require_verified_profiles on public.bookings;
create trigger bookings_require_verified_profiles
before insert or update of venue_id, artist_id
on public.bookings
for each row
execute function public.enforce_verified_booking_participants();
