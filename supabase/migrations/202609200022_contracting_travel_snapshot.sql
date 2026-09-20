-- Consolida o deslocamento no momento em que o Artista aceita uma oferta.
-- Também corrige a criação de booking quando uma oferta aberta é aceita por INSERT,
-- além do fluxo de convite já existente que aceita por UPDATE.

create or replace function public.snapshot_offer_travel_on_accept_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_location public.geography;
  v_artist_location public.geography;
  v_precision numeric;
  v_artist_hourly_rate numeric;
  v_mode text;
  v_price_per_km numeric;
  v_free_radius numeric;
  v_consumption numeric;
  v_fuel_price numeric;
  v_maintenance numeric;
  v_margin numeric;
  v_safe_artist_point public.geometry;
  v_distance numeric;
  v_billable_km numeric;
  v_fuel_cost_per_km numeric;
  v_travel_rate numeric;
  v_travel_amount numeric;
begin
  if new.status <> 'accepted' then
    return new;
  end if;

  select o.event_location
    into v_event_location
  from public.offers o
  where o.id = new.offer_id;

  select
    l.location,
    greatest(coalesce(l.precision_km, 5), 5),
    coalesce(a.fixed_fee, 0),
    coalesce(a.travel_calculation_mode, 'fixed'),
    coalesce(a.price_per_km, 0),
    coalesce(a.free_radius_km, 0),
    a.vehicle_consumption_km_l,
    a.fuel_price_per_liter,
    coalesce(a.maintenance_cost_per_km, 0),
    coalesce(a.travel_margin_per_km, 0)
  into
    v_artist_location,
    v_precision,
    v_artist_hourly_rate,
    v_mode,
    v_price_per_km,
    v_free_radius,
    v_consumption,
    v_fuel_price,
    v_maintenance,
    v_margin
  from public.artist_profiles a
  left join public.public_profile_locations l
    on l.artist_id = a.id
  where a.id = new.artist_id
  limit 1;

  -- O cachê/hora é salvo mesmo quando o evento ainda não possui coordenada.
  update public.offers
  set artist_hourly_rate = v_artist_hourly_rate
  where id = new.offer_id;

  if v_event_location is null or v_artist_location is null then
    return new;
  end if;

  -- Usa somente a posição pública aproximada do Artista.
  v_safe_artist_point := public.st_snaptogrid(
    v_artist_location::public.geometry,
    v_precision / 111.0
  );

  v_distance := round((
    public.st_distance(
      v_safe_artist_point::public.geography,
      v_event_location
    ) / 1000.0
  )::numeric, 1);

  -- Cobrança de deslocamento considera ida e volta após o raio grátis.
  v_billable_km := round(
    (greatest(v_distance - v_free_radius, 0) * 2)::numeric,
    1
  );

  if v_mode = 'vehicle'
     and coalesce(v_consumption, 0) > 0
     and coalesce(v_fuel_price, 0) >= 0 then
    v_fuel_cost_per_km := v_fuel_price / v_consumption;
    v_travel_rate :=
      v_fuel_cost_per_km
      + v_maintenance
      + v_margin;
  else
    v_mode := 'fixed';
    v_fuel_cost_per_km := null;
    v_travel_rate := v_price_per_km;
  end if;

  v_travel_amount := round(
    greatest(v_billable_km * coalesce(v_travel_rate, 0), 0)::numeric,
    2
  );

  update public.offers
  set
    distance_km = v_distance,
    billable_distance_km = v_billable_km,
    travel_amount = v_travel_amount,
    travel_calculation_mode = v_mode,
    travel_rate_per_km = round(coalesce(v_travel_rate, 0)::numeric, 4),
    fuel_cost_per_km = case
      when v_fuel_cost_per_km is null then null
      else round(v_fuel_cost_per_km::numeric, 4)
    end,
    -- Dados pessoais do veículo não são copiados para a oferta pública.
    vehicle_type = null,
    fuel_type = null,
    vehicle_consumption_km_l = null,
    fuel_price_per_liter = null,
    maintenance_cost_per_km = null,
    travel_margin_per_km = null
  where id = new.offer_id;

  return new;
end;
$$;

revoke all on function public.snapshot_offer_travel_on_accept_v1() from public;
revoke execute on function public.snapshot_offer_travel_on_accept_v1() from anon;
revoke execute on function public.snapshot_offer_travel_on_accept_v1() from authenticated;

drop trigger if exists offer_responses_snapshot_travel
on public.offer_responses;

create trigger offer_responses_snapshot_travel
before insert or update of status
on public.offer_responses
for each row
when (new.status = 'accepted')
execute function public.snapshot_offer_travel_on_accept_v1();

-- O fluxo anterior criava booking apenas quando uma resposta existente mudava
-- para accepted. Uma oferta pública aceita diretamente cria a resposta já aceita.
drop trigger if exists trg_criar_booking_ao_aceitar_oferta
on public.offer_responses;

create trigger trg_criar_booking_ao_aceitar_oferta
after insert or update of status
on public.offer_responses
for each row
when (new.status = 'accepted')
execute function public.criar_booking_ao_aceitar_oferta();
