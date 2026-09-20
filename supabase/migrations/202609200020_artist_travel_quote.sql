-- Alinha dados de deslocamento do Artista e adiciona cotacao segura por distancia.
-- A cotacao usa a localizacao publica aproximada do Artista (minimo 5 km de precisao)
-- e nunca retorna a coordenada protegida nem os dados brutos do veiculo.

alter table public.artist_profiles
  add column if not exists travel_calculation_mode text not null default 'fixed',
  add column if not exists vehicle_type text,
  add column if not exists fuel_type text,
  add column if not exists vehicle_consumption_km_l numeric,
  add column if not exists fuel_price_per_liter numeric,
  add column if not exists maintenance_cost_per_km numeric not null default 0,
  add column if not exists travel_margin_per_km numeric not null default 0;

create or replace function public.artist_travel_quote_v1(
  p_artist_id uuid,
  p_event_lat double precision,
  p_event_lng double precision
)
returns table (
  distance_km numeric,
  round_trip_km numeric,
  within_radius boolean,
  calculation_mode text,
  fuel_liters numeric,
  estimated_amount numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_location public.geography;
  v_precision numeric;
  v_mode text;
  v_price_per_km numeric;
  v_free_radius numeric;
  v_availability_radius numeric;
  v_consumption numeric;
  v_fuel_price numeric;
  v_maintenance numeric;
  v_margin numeric;
  v_safe_point public.geometry;
  v_distance numeric;
  v_round_trip numeric;
  v_billable_km numeric;
  v_fuel_liters numeric;
  v_estimated numeric;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_artist_id is null
     or p_event_lat is null
     or p_event_lng is null
     or p_event_lat not between -90 and 90
     or p_event_lng not between -180 and 180 then
    raise exception 'invalid coordinates';
  end if;

  if not exists (
    select 1
    from public.venue_profiles v
    where v.owner_user_id = auth.uid()
      and coalesce(v.is_active, true) = true
  )
  and not exists (
    select 1
    from public.artist_profiles a
    where a.id = p_artist_id
      and a.user_id = auth.uid()
  ) then
    raise exception 'travel quote access denied';
  end if;

  select
    l.location,
    greatest(coalesce(l.precision_km, 5), 5),
    coalesce(a.travel_calculation_mode, 'fixed'),
    coalesce(a.price_per_km, 0),
    coalesce(a.free_radius_km, 0),
    a.availability_radius_km,
    a.vehicle_consumption_km_l,
    a.fuel_price_per_liter,
    coalesce(a.maintenance_cost_per_km, 0),
    coalesce(a.travel_margin_per_km, 0)
  into
    v_location,
    v_precision,
    v_mode,
    v_price_per_km,
    v_free_radius,
    v_availability_radius,
    v_consumption,
    v_fuel_price,
    v_maintenance,
    v_margin
  from public.artist_profiles a
  left join public.public_profile_locations l
    on l.artist_id = a.id
  where a.id = p_artist_id
    and coalesce(a.is_active, true) = true
  limit 1;

  if v_location is null then
    return;
  end if;

  v_safe_point := public.st_snaptogrid(
    v_location::public.geometry,
    v_precision / 111.0
  );

  v_distance := round((
    public.st_distance(
      v_safe_point::public.geography,
      public.st_setsrid(
        public.st_makepoint(p_event_lng, p_event_lat),
        4326
      )::public.geography
    ) / 1000.0
  )::numeric, 1);

  v_round_trip := round((v_distance * 2)::numeric, 1);
  v_billable_km := greatest(v_distance - v_free_radius, 0) * 2;

  if v_mode = 'vehicle'
     and coalesce(v_consumption, 0) > 0
     and coalesce(v_fuel_price, 0) >= 0 then
    v_fuel_liters := round((v_billable_km / v_consumption)::numeric, 2);
    v_estimated :=
      (v_fuel_liters * coalesce(v_fuel_price, 0))
      + (v_billable_km * v_maintenance)
      + (v_billable_km * v_margin);
  else
    v_mode := 'fixed';
    v_fuel_liters := null;
    v_estimated := v_billable_km * v_price_per_km;
  end if;

  return query
  select
    v_distance,
    v_round_trip,
    case
      when v_availability_radius is null then true
      else v_distance <= v_availability_radius
    end,
    v_mode,
    v_fuel_liters,
    round(greatest(v_estimated, 0)::numeric, 2);
end;
$$;

revoke all on function public.artist_travel_quote_v1(uuid,double precision,double precision) from public;
revoke execute on function public.artist_travel_quote_v1(uuid,double precision,double precision) from anon;
grant execute on function public.artist_travel_quote_v1(uuid,double precision,double precision) to authenticated;

comment on function public.artist_travel_quote_v1(uuid,double precision,double precision)
is 'Retorna estimativa de deslocamento sem expor coordenada exata ou dados brutos do veiculo do Artista.';
