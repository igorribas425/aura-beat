-- Aura Beat
-- RPCs financeiras para Artista, Casa e Administracao.
--
-- Este arquivo registra no repositorio as consultas financeiras
-- ja utilizadas pelo frontend.

-- =========================================================
-- 1. FINANCEIRO DO ARTISTA
-- =========================================================

drop function if exists public.get_artist_finance();

create function public.get_artist_finance()
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
set search_path = ''
as $function$
  with artist_bookings as (
    select
      b.id,
      b.starts_at,
      b.status,
      b.agreed_fee,
      b.platform_fee_artist,
      b.travel_amount,
      b.toll_amount,
      b.lodging_amount,
      b.venue_id
    from public.bookings b
    join public.artist_profiles a
      on a.id = b.artist_id
    where a.user_id = auth.uid()
  ),
  selected_payment as (
    select
      ab.id as booking_id,
      p.id as payment_id,
      p.status as payment_status
    from artist_bookings ab
    left join lateral (
      select p1.*
      from public.payments p1
      where p1.booking_id = ab.id
      order by
        case when p1.status = 'paid' then 0 else 1 end,
        p1.created_at desc
      limit 1
    ) p on true
  )
  select
    ab.id as booking_id,
    ab.starts_at,
    v.trade_name as venue_name,
    ab.status as booking_status,
    sp.payment_status,
    coalesce(ab.agreed_fee, 0) as agreed_fee,
    coalesce(ab.platform_fee_artist, 0) as platform_fee_artist,
    coalesce(ab.travel_amount, 0) as travel_amount,
    coalesce(ab.toll_amount, 0) as toll_amount,
    coalesce(ab.lodging_amount, 0) as lodging_amount,
    (
      coalesce(ab.agreed_fee, 0)
      - coalesce(ab.platform_fee_artist, 0)
      + coalesce(ab.travel_amount, 0)
      + coalesce(ab.toll_amount, 0)
      + coalesce(ab.lodging_amount, 0)
    ) as artist_total,
    r.kind as release_kind,
    r.amount as release_amount,
    r.status as release_status,
    r.eligible_at,
    r.released_at
  from artist_bookings ab
  join public.venue_profiles v
    on v.id = ab.venue_id
  left join selected_payment sp
    on sp.booking_id = ab.id
  left join public.payment_releases r
    on r.payment_id = sp.payment_id
    and sp.payment_status = 'paid'
  order by ab.starts_at desc, r.kind nulls last;
$function$;

revoke all on function public.get_artist_finance() from public;
grant execute on function public.get_artist_finance() to authenticated;


-- =========================================================
-- 2. FINANCEIRO DA CASA
-- =========================================================

drop function if exists public.get_venue_finance();

create function public.get_venue_finance()
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
  gross_amount numeric,
  paid_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $function$
  select
    p.id as payment_id,
    b.id as booking_id,
    b.starts_at,
    a.stage_name as artist_name,
    b.status as booking_status,
    p.status as payment_status,
    p.method as payment_method,
    p.provider,
    coalesce(p.agreed_fee, 0) as agreed_fee,
    coalesce(p.travel_amount, 0) as travel_amount,
    coalesce(p.toll_amount, 0) as toll_amount,
    coalesce(p.lodging_amount, 0) as lodging_amount,
    coalesce(p.platform_fee_venue, 0) as platform_fee_venue,
    coalesce(p.gross_amount, 0) as gross_amount,
    p.paid_at,
    p.created_at
  from public.payments p
  join public.bookings b
    on b.id = p.booking_id
  join public.artist_profiles a
    on a.id = b.artist_id
  where public.is_venue_member(b.venue_id)
  order by p.created_at desc;
$function$;

revoke all on function public.get_venue_finance() from public;
grant execute on function public.get_venue_finance() to authenticated;


-- =========================================================
-- 3. FINANCEIRO ADMINISTRATIVO
-- =========================================================

drop function if exists public.get_admin_finance();

create function public.get_admin_finance()
returns table (
  payment_id uuid,
  booking_id uuid,
  booking_status text,
  starts_at timestamptz,
  venue_name text,
  artist_name text,
  payment_status text,
  payment_method text,
  provider text,
  gross_amount numeric,
  agreed_fee numeric,
  travel_amount numeric,
  toll_amount numeric,
  lodging_amount numeric,
  platform_fee_venue numeric,
  platform_fee_artist numeric,
  provider_fee numeric,
  aura_fee_total numeric,
  artist_total numeric,
  release_pending numeric,
  release_eligible numeric,
  release_released numeric,
  paid_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Autenticacao obrigatoria';
  end if;

  if not public.is_aura_admin(array['admin','owner']::text[]) then
    raise exception 'Acesso administrativo negado';
  end if;

  return query
  select
    p.id,
    b.id,
    b.status,
    b.starts_at,
    v.trade_name,
    a.stage_name,
    p.status,
    p.method,
    p.provider,
    coalesce(p.gross_amount, 0),
    coalesce(p.agreed_fee, 0),
    coalesce(p.travel_amount, 0),
    coalesce(p.toll_amount, 0),
    coalesce(p.lodging_amount, 0),
    coalesce(p.platform_fee_venue, 0),
    coalesce(p.platform_fee_artist, 0),
    coalesce(p.provider_fee, 0),
    (
      coalesce(p.platform_fee_venue, 0)
      + coalesce(p.platform_fee_artist, 0)
    ),
    (
      coalesce(p.agreed_fee, 0)
      - coalesce(p.platform_fee_artist, 0)
      + coalesce(p.travel_amount, 0)
      + coalesce(p.toll_amount, 0)
      + coalesce(p.lodging_amount, 0)
    ),
    coalesce((
      select sum(pr.amount)
      from public.payment_releases pr
      where pr.payment_id = p.id
        and pr.status = 'pending'
    ), 0),
    coalesce((
      select sum(pr.amount)
      from public.payment_releases pr
      where pr.payment_id = p.id
        and pr.status = 'eligible'
    ), 0),
    coalesce((
      select sum(pr.amount)
      from public.payment_releases pr
      where pr.payment_id = p.id
        and pr.status = 'released'
    ), 0),
    p.paid_at,
    p.created_at
  from public.payments p
  join public.bookings b
    on b.id = p.booking_id
  join public.venue_profiles v
    on v.id = b.venue_id
  join public.artist_profiles a
    on a.id = b.artist_id
  order by p.created_at desc;
end;
$function$;

revoke all on function public.get_admin_finance() from public;
grant execute on function public.get_admin_finance() to authenticated;

notify pgrst, 'reload schema';
