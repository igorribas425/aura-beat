-- Aura Beat 2026-09-20
-- Separate public offers from private direct offers, add contract transport
-- snapshots, conflict checks, and realtime booking updates.

alter table public.offers
  add column if not exists offer_kind text not null default 'public',
  add column if not exists target_artist_id uuid,
  add column if not exists direct_conversation_id uuid,
  add column if not exists transport_mode text,
  add column if not exists transport_type text,
  add column if not exists ticket_amount numeric not null default 0,
  add column if not exists local_transport_amount numeric not null default 0,
  add column if not exists transport_notes text;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.offers'::regclass and conname='offers_target_artist_id_fkey') then
    alter table public.offers add constraint offers_target_artist_id_fkey
      foreign key (target_artist_id) references public.artist_profiles(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.offers'::regclass and conname='offers_direct_conversation_id_fkey') then
    alter table public.offers add constraint offers_direct_conversation_id_fkey
      foreign key (direct_conversation_id) references public.direct_conversations(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.offers'::regclass and conname='offers_kind_check') then
    alter table public.offers add constraint offers_kind_check check (offer_kind in ('public','direct'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.offers'::regclass and conname='offers_kind_target_check') then
    alter table public.offers add constraint offers_kind_target_check check (
      (offer_kind='public' and target_artist_id is null)
      or (offer_kind='direct' and target_artist_id is not null)
    );
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.offers'::regclass and conname='offers_transport_mode_check') then
    alter table public.offers add constraint offers_transport_mode_check check (
      transport_mode is null or transport_mode in ('auto','fixed','vehicle','ticket','venue_pickup','other')
    );
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.offers'::regclass and conname='offers_ticket_amount_check') then
    alter table public.offers add constraint offers_ticket_amount_check check (ticket_amount >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.offers'::regclass and conname='offers_local_transport_amount_check') then
    alter table public.offers add constraint offers_local_transport_amount_check check (local_transport_amount >= 0);
  end if;
end $$;

create index if not exists offers_target_artist_idx on public.offers(target_artist_id,status,starts_at)
  where target_artist_id is not null;
create index if not exists offers_direct_conversation_idx on public.offers(direct_conversation_id)
  where direct_conversation_id is not null;

update public.offers o
set offer_kind='direct', target_artist_id=r.artist_id
from public.offer_responses r
where r.offer_id=o.id
  and o.target_artist_id is null
  and coalesce(r.message,'')='Convite enviado diretamente pela Casa.';

drop policy if exists offers_select_relevant on public.offers;
drop policy if exists offers_insert_venue_member on public.offers;
drop policy if exists offers_update_venue_member on public.offers;
drop policy if exists offers_delete_venue_owner_or_admin on public.offers;

create policy offers_select_relevant on public.offers for select to authenticated using (
  public.is_admin()
  or public.is_venue_member(venue_id)
  or (offer_kind='public' and status='open')
  or (offer_kind='direct' and target_artist_id is not null and public.owns_artist(target_artist_id))
);
create policy offers_insert_venue_member on public.offers for insert to authenticated with check (
  public.is_venue_member(venue_id)
  and created_by=(select auth.uid())
  and (
    (offer_kind='public' and target_artist_id is null)
    or (
      offer_kind='direct' and target_artist_id is not null
      and exists (
        select 1 from public.artist_profiles a
        where a.id=target_artist_id and coalesce(a.is_active,true)=true
      )
    )
  )
);
create policy offers_update_venue_member on public.offers for update to authenticated
  using (public.is_venue_member(venue_id) or public.is_admin())
  with check (public.is_venue_member(venue_id) or public.is_admin());
create policy offers_delete_venue_owner_or_admin on public.offers for delete to authenticated
  using (public.is_venue_owner(venue_id) or public.is_admin());

drop policy if exists offer_responses_insert_artist on public.offer_responses;
drop policy if exists offer_responses_insert_venue_invite on public.offer_responses;

create policy offer_responses_insert_artist on public.offer_responses for insert to authenticated with check (
  public.owns_artist(artist_id)
  and exists (
    select 1 from public.offers o
    where o.id=offer_responses.offer_id
      and o.status='open'
      and (o.offer_kind='public' or (o.offer_kind='direct' and o.target_artist_id=offer_responses.artist_id))
  )
);
create policy offer_responses_insert_venue_invite on public.offer_responses for insert to authenticated with check (
  status='pending'
  and proposed_fee is null
  and exists (
    select 1 from public.offers o
    where o.id=offer_responses.offer_id
      and o.offer_kind='direct'
      and o.target_artist_id=offer_responses.artist_id
      and public.is_venue_member(o.venue_id)
  )
);

alter table public.artist_profiles
  add column if not exists ticket_transport_type text,
  add column if not exists ticket_round_trip_amount numeric not null default 0,
  add column if not exists local_transport_default_amount numeric not null default 0,
  add column if not exists travel_notes text;

alter table public.artist_profiles drop constraint if exists artist_profiles_travel_calculation_mode_check;
alter table public.artist_profiles add constraint artist_profiles_travel_calculation_mode_check
  check (travel_calculation_mode in ('fixed','vehicle','ticket'));

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.artist_profiles'::regclass and conname='artist_profiles_ticket_round_trip_amount_check') then
    alter table public.artist_profiles add constraint artist_profiles_ticket_round_trip_amount_check check (ticket_round_trip_amount >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.artist_profiles'::regclass and conname='artist_profiles_local_transport_default_amount_check') then
    alter table public.artist_profiles add constraint artist_profiles_local_transport_default_amount_check check (local_transport_default_amount >= 0);
  end if;
end $$;

create or replace function public.artist_travel_quote_v1(
  p_artist_id uuid,
  p_event_lat double precision,
  p_event_lng double precision
)
returns table(
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
set search_path=''
as $function$
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
  v_ticket_amount numeric;
  v_local_transport numeric;
  v_safe_point public.geometry;
  v_distance numeric;
  v_round_trip numeric;
  v_billable_km numeric;
  v_fuel_liters numeric;
  v_estimated numeric;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_artist_id is null or p_event_lat is null or p_event_lng is null
     or p_event_lat not between -90 and 90 or p_event_lng not between -180 and 180 then
    raise exception 'invalid coordinates';
  end if;
  if not exists (
    select 1 from public.venue_profiles v where v.owner_user_id=auth.uid() and coalesce(v.is_active,true)=true
  ) and not exists (
    select 1 from public.artist_profiles a where a.id=p_artist_id and a.user_id=auth.uid()
  ) then
    raise exception 'travel quote access denied';
  end if;

  select l.location, greatest(coalesce(l.precision_km,5),5),
         coalesce(a.travel_calculation_mode,'fixed'), coalesce(a.price_per_km,0),
         coalesce(a.free_radius_km,0), a.availability_radius_km,
         a.vehicle_consumption_km_l, a.fuel_price_per_liter,
         coalesce(a.maintenance_cost_per_km,0), coalesce(a.travel_margin_per_km,0),
         coalesce(a.ticket_round_trip_amount,0), coalesce(a.local_transport_default_amount,0)
  into v_location,v_precision,v_mode,v_price_per_km,v_free_radius,v_availability_radius,
       v_consumption,v_fuel_price,v_maintenance,v_margin,v_ticket_amount,v_local_transport
  from public.artist_profiles a
  left join public.public_profile_locations l on l.artist_id=a.id
  where a.id=p_artist_id and coalesce(a.is_active,true)=true
  limit 1;

  if v_location is null then return; end if;

  v_safe_point := public.st_snaptogrid(v_location::public.geometry,v_precision/111.0);
  v_distance := round((public.st_distance(
    v_safe_point::public.geography,
    public.st_setsrid(public.st_makepoint(p_event_lng,p_event_lat),4326)::public.geography
  )/1000.0)::numeric,1);
  v_round_trip := round((v_distance*2)::numeric,1);
  v_billable_km := greatest(v_distance-v_free_radius,0)*2;

  if v_mode='ticket' then
    v_fuel_liters := null;
    v_estimated := v_ticket_amount+v_local_transport;
  elsif v_mode='vehicle' and coalesce(v_consumption,0)>0 and coalesce(v_fuel_price,0)>=0 then
    v_fuel_liters := round((v_billable_km/v_consumption)::numeric,2);
    v_estimated := (v_fuel_liters*coalesce(v_fuel_price,0))+(v_billable_km*v_maintenance)+(v_billable_km*v_margin);
  else
    v_mode := 'fixed';
    v_fuel_liters := null;
    v_estimated := v_billable_km*v_price_per_km;
  end if;

  return query select
    v_distance,
    v_round_trip,
    case when v_availability_radius is null then true else v_distance<=v_availability_radius end,
    v_mode,
    v_fuel_liters,
    round(greatest(v_estimated,0)::numeric,2);
end;
$function$;

revoke all on function public.artist_travel_quote_v1(uuid,double precision,double precision) from public,anon;
grant execute on function public.artist_travel_quote_v1(uuid,double precision,double precision) to authenticated;

create or replace function public.enforce_offer_schedule_conflict_v1()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare
  v_artist_id uuid;
  v_venue_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
begin
  if new.status <> 'accepted' then return new; end if;
  select new.artist_id,o.venue_id,o.starts_at,o.starts_at+make_interval(mins=>o.duration_minutes)
  into v_artist_id,v_venue_id,v_starts_at,v_ends_at
  from public.offers o where o.id=new.offer_id;

  if v_starts_at is null then raise exception 'Oferta não encontrada'; end if;

  if exists (
    select 1 from public.bookings b
    where b.artist_id=v_artist_id
      and b.offer_id is distinct from new.offer_id
      and b.status not in ('cancelled','completed')
      and b.starts_at<v_ends_at
      and b.starts_at+make_interval(mins=>b.duration_minutes)>v_starts_at
  ) then raise exception 'Artista já possui contratação neste horário'; end if;

  if exists (
    select 1 from public.artist_calendar c
    where c.artist_id=v_artist_id and c.kind in ('blocked','manual')
      and c.starts_at<v_ends_at and c.ends_at>v_starts_at
  ) then raise exception 'Artista possui horário bloqueado ou compromisso nesta data'; end if;

  if exists (
    select 1 from public.bookings b
    where b.venue_id=v_venue_id
      and b.offer_id is distinct from new.offer_id
      and b.status not in ('cancelled','completed')
      and b.starts_at<v_ends_at
      and b.starts_at+make_interval(mins=>b.duration_minutes)>v_starts_at
  ) then raise exception 'Casa já possui contratação neste horário'; end if;

  return new;
end;
$function$;

revoke all on function public.enforce_offer_schedule_conflict_v1() from public,anon,authenticated;
drop trigger if exists offer_responses_schedule_conflict on public.offer_responses;
create trigger offer_responses_schedule_conflict
before insert or update of status on public.offer_responses
for each row when (new.status='accepted')
execute function public.enforce_offer_schedule_conflict_v1();

create or replace function public.snapshot_offer_travel_on_accept_v1()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare
  v_event_location public.geography;
  v_artist_location public.geography;
  v_precision numeric;
  v_artist_hourly_rate numeric;
  v_profile_mode text;
  v_contract_mode text;
  v_price_per_km numeric;
  v_free_radius numeric;
  v_consumption numeric;
  v_fuel_price numeric;
  v_maintenance numeric;
  v_margin numeric;
  v_ticket_amount numeric;
  v_local_transport numeric;
  v_current_travel numeric;
  v_safe_artist_point public.geometry;
  v_distance numeric;
  v_billable_km numeric;
  v_fuel_cost_per_km numeric;
  v_travel_rate numeric;
  v_travel_amount numeric;
begin
  if new.status <> 'accepted' then return new; end if;
  select o.event_location,coalesce(o.transport_mode,'auto'),coalesce(o.ticket_amount,0),
         coalesce(o.local_transport_amount,0),coalesce(o.travel_amount,0)
  into v_event_location,v_contract_mode,v_ticket_amount,v_local_transport,v_current_travel
  from public.offers o where o.id=new.offer_id;

  select l.location,greatest(coalesce(l.precision_km,5),5),coalesce(a.fixed_fee,0),
         coalesce(a.travel_calculation_mode,'fixed'),coalesce(a.price_per_km,0),
         coalesce(a.free_radius_km,0),a.vehicle_consumption_km_l,a.fuel_price_per_liter,
         coalesce(a.maintenance_cost_per_km,0),coalesce(a.travel_margin_per_km,0)
  into v_artist_location,v_precision,v_artist_hourly_rate,v_profile_mode,v_price_per_km,
       v_free_radius,v_consumption,v_fuel_price,v_maintenance,v_margin
  from public.artist_profiles a
  left join public.public_profile_locations l on l.artist_id=a.id
  where a.id=new.artist_id limit 1;

  update public.offers set artist_hourly_rate=v_artist_hourly_rate where id=new.offer_id;

  if v_contract_mode='ticket' then
    update public.offers set travel_amount=greatest(v_ticket_amount+v_local_transport,0),
      travel_calculation_mode='ticket',travel_rate_per_km=null,fuel_cost_per_km=null
    where id=new.offer_id;
    return new;
  elsif v_contract_mode='venue_pickup' then
    update public.offers set travel_amount=0,travel_calculation_mode='venue_pickup',
      travel_rate_per_km=null,fuel_cost_per_km=null where id=new.offer_id;
    return new;
  elsif v_contract_mode='other' then
    update public.offers set travel_amount=greatest(v_current_travel,0),
      travel_calculation_mode='other',travel_rate_per_km=null,fuel_cost_per_km=null
    where id=new.offer_id;
    return new;
  end if;

  if v_contract_mode in ('fixed','vehicle') then v_profile_mode:=v_contract_mode; end if;

  if v_event_location is null or v_artist_location is null then
    update public.offers set travel_calculation_mode=v_profile_mode where id=new.offer_id;
    return new;
  end if;

  v_safe_artist_point:=public.st_snaptogrid(v_artist_location::public.geometry,v_precision/111.0);
  v_distance:=round((public.st_distance(v_safe_artist_point::public.geography,v_event_location)/1000.0)::numeric,1);
  v_billable_km:=round((greatest(v_distance-v_free_radius,0)*2)::numeric,1);

  if v_profile_mode='vehicle' and coalesce(v_consumption,0)>0 and coalesce(v_fuel_price,0)>=0 then
    v_fuel_cost_per_km:=v_fuel_price/v_consumption;
    v_travel_rate:=v_fuel_cost_per_km+v_maintenance+v_margin;
  else
    v_profile_mode:='fixed';
    v_fuel_cost_per_km:=null;
    v_travel_rate:=v_price_per_km;
  end if;

  v_travel_amount:=round(greatest(v_billable_km*coalesce(v_travel_rate,0),0)::numeric,2);
  update public.offers set
    distance_km=v_distance,
    billable_distance_km=v_billable_km,
    travel_amount=v_travel_amount,
    travel_calculation_mode=v_profile_mode,
    travel_rate_per_km=round(coalesce(v_travel_rate,0)::numeric,4),
    fuel_cost_per_km=case when v_fuel_cost_per_km is null then null else round(v_fuel_cost_per_km::numeric,4) end
  where id=new.offer_id;
  return new;
end;
$function$;

revoke all on function public.snapshot_offer_travel_on_accept_v1() from public,anon,authenticated;

create or replace function public.criar_booking_ao_aceitar_oferta()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_booking_id uuid;
begin
  if new.status <> 'accepted' then return new; end if;
  if exists (select 1 from public.bookings b where b.offer_id=new.offer_id) then return new; end if;

  insert into public.bookings(
    offer_id,response_id,venue_id,artist_id,status,starts_at,duration_minutes,
    event_address_snapshot,event_location,agreed_fee,travel_amount,toll_amount,lodging_amount,
    platform_fee_venue,platform_fee_artist,late_tolerance_artist_minutes,
    late_tolerance_venue_minutes,contact_unlocked,terms_snapshot
  )
  select
    o.id,new.id,o.venue_id,new.artist_id,'awaiting_payment',o.starts_at,o.duration_minutes,
    o.address_text,o.event_location,coalesce(new.proposed_fee,o.budget_amount),
    coalesce(o.travel_amount,0),coalesce(o.toll_amount,0),coalesce(o.lodging_amount,0),
    coalesce(o.platform_fee_venue,0),coalesce(o.platform_fee_artist,0),
    o.late_tolerance_artist_minutes,o.late_tolerance_venue_minutes,false,
    jsonb_build_object(
      'title',o.title,'event_type',o.event_type,'offer_kind',o.offer_kind,
      'target_artist_id',o.target_artist_id,'direct_conversation_id',o.direct_conversation_id,
      'artist_hourly_rate',coalesce(o.artist_hourly_rate,0),
      'distance_km',coalesce(o.distance_km,0),'billable_distance_km',coalesce(o.billable_distance_km,0),
      'transport_mode',o.transport_mode,'transport_type',o.transport_type,
      'ticket_amount',coalesce(o.ticket_amount,0),
      'local_transport_amount',coalesce(o.local_transport_amount,0),
      'transport_notes',o.transport_notes,
      'travel_calculation_mode',o.travel_calculation_mode,
      'travel_rate_per_km',coalesce(o.travel_rate_per_km,0),
      'travel_amount',coalesce(o.travel_amount,0),
      'fuel_type',o.fuel_type,'vehicle_type',o.vehicle_type,
      'fuel_price_per_liter',coalesce(o.fuel_price_per_liter,0),
      'fuel_cost_per_km',coalesce(o.fuel_cost_per_km,0),
      'maintenance_cost_per_km',coalesce(o.maintenance_cost_per_km,0),
      'travel_margin_per_km',coalesce(o.travel_margin_per_km,0)
    )
  from public.offers o where o.id=new.offer_id
  returning id into v_booking_id;

  if v_booking_id is not null then
    update public.offers set status='filled' where id=new.offer_id;
  end if;
  return new;
end;
$function$;

revoke all on function public.criar_booking_ao_aceitar_oferta() from public,anon,authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='bookings') then
    alter publication supabase_realtime add table public.bookings;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='offer_responses') then
    alter publication supabase_realtime add table public.offer_responses;
  end if;
end $$;

notify pgrst,'reload schema';
