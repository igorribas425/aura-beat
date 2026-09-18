-- Aura Beat
-- Alinha as regras de comissao entre contratacao normal e urgente.
--
-- CONTRATACAO NORMAL
-- Casa: 3% sobre o cache
-- Artista: 0%
--
-- CONTRATACAO URGENTE
-- Casa: 3% sobre o cache
-- Artista: 3% sobre o cache
--
-- Deslocamento, pedagio e hospedagem nao recebem comissao.

drop function if exists public.booking_price(
  numeric,
  integer,
  numeric,
  numeric,
  numeric,
  boolean,
  numeric,
  numeric
);

drop function if exists public.booking_price(
  numeric,
  integer,
  numeric,
  numeric,
  numeric,
  boolean,
  numeric,
  numeric,
  boolean
);

create function public.booking_price(
  hourly numeric,
  duration_minutes integer,
  distance_km numeric default 0,
  free_radius_km numeric default 0,
  price_per_km numeric default 0,
  round_trip boolean default true,
  tolls numeric default 0,
  lodging numeric default 0,
  is_urgent boolean default false
)
returns table (
  performance_fee numeric,
  venue_fee numeric,
  artist_fee numeric,
  travel numeric,
  venue_total numeric,
  artist_net numeric
)
language sql
immutable
set search_path = ''
as $function$

with valores as (
  select
    round(
      greatest(hourly, 0) *
      greatest(duration_minutes, 0) /
      60,
      2
    ) as performance,

    round(
      greatest(
        greatest(distance_km, 0) -
        greatest(free_radius_km, 0),
        0
      ) *
      case
        when round_trip then 2
        else 1
      end *
      greatest(price_per_km, 0),
      2
    ) as trip
)

select
  performance,

  round(
    performance * 0.03,
    2
  ) as venue_fee,

  case
    when is_urgent then
      round(
        performance * 0.03,
        2
      )
    else
      0
  end as artist_fee,

  trip as travel,

  round(
    performance +
    (performance * 0.03) +
    trip +
    greatest(tolls, 0) +
    greatest(lodging, 0),
    2
  ) as venue_total,

  round(
    performance -
    case
      when is_urgent then
        performance * 0.03
      else
        0
    end +
    trip +
    greatest(tolls, 0) +
    greatest(lodging, 0),
    2
  ) as artist_net

from valores;

$function$;

revoke all
on function public.booking_price(
  numeric,
  integer,
  numeric,
  numeric,
  numeric,
  boolean,
  numeric,
  numeric,
  boolean
)
from public;

grant execute
on function public.booking_price(
  numeric,
  integer,
  numeric,
  numeric,
  numeric,
  boolean,
  numeric,
  numeric,
  boolean
)
to authenticated;

create or replace function public.aplicar_taxas_aura_booking()
returns trigger
language plpgsql
set search_path = 'public'
as $function$

declare
  v_urgente boolean := false;

begin

  if new.offer_id is not null then
    select
      coalesce(o.is_urgent, false)
    into
      v_urgente
    from public.offers o
    where o.id = new.offer_id;
  end if;

  if coalesce(
    new.terms_snapshot->>'source',
    ''
  ) = 'artist_offer' then
    v_urgente := true;
  end if;

  new.platform_fee_venue :=
    round(
      coalesce(
        new.agreed_fee,
        0
      ) * 0.03,
      2
    );

  if v_urgente then
    new.platform_fee_artist :=
      round(
        coalesce(
          new.agreed_fee,
          0
        ) * 0.03,
        2
      );
  else
    new.platform_fee_artist := 0;
  end if;

  return new;

end;

$function$;

drop trigger if exists
trg_aplicar_taxas_aura_booking
on public.bookings;

create trigger
trg_aplicar_taxas_aura_booking
before insert or update of
  agreed_fee,
  offer_id,
  terms_snapshot
on public.bookings
for each row
execute function
public.aplicar_taxas_aura_booking();

notify pgrst, 'reload schema';
