-- Aura Beat
-- Alinha pagamentos, confirmacao de booking e repasses do artista.
--
-- IMPORTANTE:
-- A migration 202609120001 possui um modelo antigo da tabela payments.
-- Este arquivo reconcilia esse modelo com a estrutura financeira atual.
--
-- Regras:
-- 1. O total cobrado da Casa e:
--    cache + taxa da Casa + deslocamento + pedagio + hospedagem.
-- 2. A taxa do artista ja vem gravada no booking conforme o tipo de contratacao.
-- 3. O repasse de performance e:
--    cache - taxa do artista.
-- 4. Extras sao repassados integralmente ao artista.
-- 5. Um repasse so fica released depois de transferencia real confirmada.

create extension if not exists pgcrypto;

-- =========================================================
-- 1. RECONCILIACAO DA TABELA PAYMENTS
-- =========================================================

alter table public.payments
  add column if not exists gross_amount numeric(12,2),
  add column if not exists agreed_fee numeric(12,2),
  add column if not exists travel_amount numeric(12,2) not null default 0,
  add column if not exists toll_amount numeric(12,2) not null default 0,
  add column if not exists lodging_amount numeric(12,2) not null default 0,
  add column if not exists platform_fee_venue numeric(12,2) not null default 0,
  add column if not exists platform_fee_artist numeric(12,2) not null default 0,
  add column if not exists provider_fee numeric(12,2) not null default 0,
  add column if not exists currency text not null default 'BRL',
  add column if not exists paid_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Se esta migration estiver sendo executada sobre o schema antigo,
-- preserva o valor antigo de amount em gross_amount antes de remover a coluna.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'payments'
      and column_name = 'amount'
  ) then
    execute '
      update public.payments
      set gross_amount = coalesce(gross_amount, amount)
      where gross_amount is null
    ';
  end if;
end;
$$;

-- Preenche o snapshot financeiro a partir do booking quando necessario.
update public.payments p
set
  agreed_fee = coalesce(p.agreed_fee, b.agreed_fee),
  travel_amount = coalesce(p.travel_amount, b.travel_amount, 0),
  toll_amount = coalesce(p.toll_amount, b.toll_amount, 0),
  lodging_amount = coalesce(p.lodging_amount, b.lodging_amount, 0),
  platform_fee_venue = coalesce(p.platform_fee_venue, b.platform_fee_venue, 0),
  platform_fee_artist = coalesce(p.platform_fee_artist, b.platform_fee_artist, 0),
  gross_amount = coalesce(
    p.gross_amount,
    coalesce(b.agreed_fee, 0)
      + coalesce(b.platform_fee_venue, 0)
      + coalesce(b.travel_amount, 0)
      + coalesce(b.toll_amount, 0)
      + coalesce(b.lodging_amount, 0)
  )
from public.bookings b
where b.id = p.booking_id;

-- Remove a policy antiga antes de remover colunas legadas usadas por ela.
drop policy if exists "payments_participants_read"
on public.payments;

-- Colunas do modelo antigo que nao fazem parte do schema financeiro atual.
alter table public.payments
  drop column if exists payer_user_id,
  drop column if exists amount,
  drop column if exists installments,
  drop column if exists installment_cost,
  drop column if exists raw_status;

alter table public.payments enable row level security;

-- Participantes podem ler os pagamentos dos proprios bookings.
-- Escrita continua reservada ao backend/triggers/RPCs autorizados.
create policy "payments_participants_read"
on public.payments
for select
to authenticated
using (
  exists (
    select 1
    from public.bookings booking
    where booking.id = payments.booking_id
      and (
        public.is_venue_member(booking.venue_id)
        or exists (
          select 1
          from public.artist_profiles artist
          where artist.id = booking.artist_id
            and artist.user_id = auth.uid()
        )
        or public.is_aura_admin()
      )
  )
);

-- =========================================================
-- 2. REPASSES
-- =========================================================

create table if not exists public.payment_releases (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  kind text not null check (kind in ('performance','travel')),
  amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'pending'
    check (status in ('pending','eligible','released','held','cancelled')),
  eligible_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  unique(payment_id, kind)
);

alter table public.payment_releases enable row level security;

drop policy if exists "releases_participants_read"
on public.payment_releases;

create policy "releases_participants_read"
on public.payment_releases
for select
to authenticated
using (
  exists (
    select 1
    from public.payments payment
    join public.bookings booking
      on booking.id = payment.booking_id
    where payment.id = payment_releases.payment_id
      and (
        public.is_venue_member(booking.venue_id)
        or exists (
          select 1
          from public.artist_profiles artist
          where artist.id = booking.artist_id
            and artist.user_id = auth.uid()
        )
        or public.is_aura_admin()
      )
  )
);

-- =========================================================
-- 3. PAGAMENTO PAGO CONFIRMA O BOOKING
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
-- 4. CRIA OS REPASSES QUANDO O PAGAMENTO FICA PAGO
-- =========================================================

create or replace function public.criar_repasses_do_pagamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_performance numeric(12,2);
  v_travel numeric(12,2);
begin
  if new.status <> 'paid' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status is not distinct from new.status then
    return new;
  end if;

  v_performance :=
    round(
      greatest(
        coalesce(new.agreed_fee, 0)
        - coalesce(new.platform_fee_artist, 0),
        0
      ),
      2
    );

  v_travel :=
    round(
      coalesce(new.travel_amount, 0)
      + coalesce(new.toll_amount, 0)
      + coalesce(new.lodging_amount, 0),
      2
    );

  insert into public.payment_releases (
    payment_id,
    kind,
    amount,
    status
  )
  values (
    new.id,
    'performance',
    v_performance,
    'pending'
  )
  on conflict (payment_id, kind)
  do update
  set
    amount = excluded.amount,
    status = case
      when public.payment_releases.status = 'released'
        then public.payment_releases.status
      else excluded.status
    end;

  insert into public.payment_releases (
    payment_id,
    kind,
    amount,
    status
  )
  values (
    new.id,
    'travel',
    v_travel,
    'pending'
  )
  on conflict (payment_id, kind)
  do update
  set
    amount = excluded.amount,
    status = case
      when public.payment_releases.status = 'released'
        then public.payment_releases.status
      else excluded.status
    end;

  return new;
end;
$function$;

revoke all
on function public.criar_repasses_do_pagamento()
from public;

drop trigger if exists trg_criar_repasses_do_pagamento
on public.payments;

create trigger trg_criar_repasses_do_pagamento
after insert or update of status
on public.payments
for each row
execute function public.criar_repasses_do_pagamento();

-- =========================================================
-- 5. EVENTO FINALIZADO TORNA O REPASSE ELEGIVEL
-- =========================================================

create or replace function public.liberar_repasses_ao_finalizar_evento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'completed'
     and old.status is distinct from new.status then

    update public.payment_releases release
    set
      status = 'eligible',
      eligible_at = coalesce(release.eligible_at, now())
    from public.payments payment
    where payment.id = release.payment_id
      and payment.booking_id = new.id
      and payment.status = 'paid'
      and release.status = 'pending';

  end if;

  return new;
end;
$function$;

revoke all
on function public.liberar_repasses_ao_finalizar_evento()
from public;

drop trigger if exists trg_liberar_repasses_ao_finalizar_evento
on public.bookings;

create trigger trg_liberar_repasses_ao_finalizar_evento
after update of status
on public.bookings
for each row
execute function public.liberar_repasses_ao_finalizar_evento();

notify pgrst, 'reload schema';
