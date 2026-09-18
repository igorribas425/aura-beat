-- Aura Beat
-- Inclui o custo do provedor na taxa exibida para a Casa,
-- sem alterar a comissao base da plataforma.
--
-- Regra:
-- platform_fee_venue = comissao Aura Beat da Casa (3% do cache)
-- provider_fee       = custo do meio de pagamento
-- gross_amount       = cache + platform_fee_venue + provider_fee + extras
--
-- Para o cliente, platform_fee_venue + provider_fee pode ser exibido
-- como uma unica "Taxa Aura Beat".

-- =========================================================
-- 1. CONFIRMACAO DO PAGAMENTO
-- =========================================================

create or replace function public.confirm_booking_after_paid_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_expected numeric(12,2);
begin
  if new.status <> 'paid' then
    return new;
  end if;

  select
    round(
      coalesce(booking.agreed_fee, 0)
      + coalesce(booking.platform_fee_venue, 0)
      + coalesce(new.provider_fee, 0)
      + coalesce(booking.travel_amount, 0)
      + coalesce(booking.toll_amount, 0)
      + coalesce(booking.lodging_amount, 0),
      2
    )
  into v_expected
  from public.bookings booking
  where booking.id = new.booking_id;

  if v_expected is null then
    raise exception 'Booking do pagamento nao encontrado';
  end if;

  if new.gross_amount is null
     or abs(round(new.gross_amount, 2) - v_expected) > 0.01 then
    raise exception 'Valor pago nao corresponde ao total esperado da Casa';
  end if;

  update public.bookings
  set
    status = 'confirmed',
    contact_unlocked = true,
    updated_at = now()
  where id = new.booking_id
    and status = 'awaiting_payment';

  return new;
end;
$function$;

revoke all
on function public.confirm_booking_after_paid_payment()
from public;

drop trigger if exists trg_confirm_booking_after_paid_payment
on public.payments;

create trigger trg_confirm_booking_after_paid_payment
after update of status
on public.payments
for each row
when (
  new.status = 'paid'
  and old.status is distinct from new.status
)
execute function public.confirm_booking_after_paid_payment();

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
  provider_fee numeric,
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
    coalesce(p.provider_fee, 0) as provider_fee,
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

notify pgrst, 'reload schema';
