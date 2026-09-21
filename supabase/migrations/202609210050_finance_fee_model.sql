-- Financeiro alinhado ao modelo em que o Aura Beat recebe apenas as taxas.

create or replace function public.get_artist_finance()
returns table (
  booking_id uuid,
  starts_at timestamptz,
  venue_name text,
  booking_status text,
  payment_status text,
  agreed_fee numeric,
  platform_fee_artist numeric,
  travel_amount numeric,
  toll_amount numeric,
  lodging_amount numeric,
  artist_total numeric,
  release_kind text,
  release_amount numeric,
  release_status text,
  eligible_at timestamptz,
  released_at timestamptz
)
language sql
security definer
set search_path=''
as $function$
  select
    b.id,
    b.starts_at,
    v.trade_name,
    b.status,
    fee.status,
    b.agreed_fee,
    b.platform_fee_artist,
    b.travel_amount,
    b.toll_amount,
    b.lodging_amount,
    (
      coalesce(b.agreed_fee,0)
      - coalesce(b.platform_fee_artist,0)
      + coalesce(b.travel_amount,0)
      + coalesce(b.toll_amount,0)
      + coalesce(b.lodging_amount,0)
    ),
    null::text,
    null::numeric,
    null::text,
    null::timestamptz,
    null::timestamptz
  from public.artist_profiles a
  join public.bookings b on b.artist_id=a.id
  join public.venue_profiles v on v.id=b.venue_id
  left join lateral (
    select p.status
    from public.payments p
    where p.booking_id=b.id
      and p.charge_type='artist_platform_fee'
    order by
      case when p.status='paid' then 0 else 1 end,
      p.created_at desc
    limit 1
  ) fee on true
  where a.user_id=auth.uid()
  order by b.starts_at desc;
$function$;

revoke all on function public.get_artist_finance() from public,anon;
grant execute on function public.get_artist_finance() to authenticated;

create or replace function public.get_venue_finance()
returns table (
  payment_id uuid,
  booking_id uuid,
  starts_at timestamptz,
  artist_name text,
  booking_status text,
  payment_status text,
  payment_method text,
  provider text,
  agreed_fee numeric,
  travel_amount numeric,
  toll_amount numeric,
  lodging_amount numeric,
  platform_fee_venue numeric,
  provider_fee numeric,
  gross_amount numeric,
  paid_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path=''
as $function$
  select
    p.id,
    b.id,
    b.starts_at,
    a.stage_name,
    b.status,
    p.status,
    p.method,
    p.provider,
    coalesce(b.agreed_fee,0),
    coalesce(b.travel_amount,0),
    coalesce(b.toll_amount,0),
    coalesce(b.lodging_amount,0),
    coalesce(b.platform_fee_venue,0),
    coalesce(p.provider_fee,0),
    coalesce(p.gross_amount,0),
    p.paid_at,
    p.created_at
  from public.payments p
  join public.bookings b on b.id=p.booking_id
  join public.artist_profiles a on a.id=b.artist_id
  where public.is_venue_member(b.venue_id)
    and p.charge_type='venue_platform_fee'
  order by p.created_at desc;
$function$;

revoke all on function public.get_venue_finance() from public,anon;
grant execute on function public.get_venue_finance() to authenticated;

notify pgrst,'reload schema';
