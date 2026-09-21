-- Aura Beat fee-only payment model.
-- Normal: Casa pays 3%. Urgente: Casa 3% + Artista 3%. Cachê/extras ficam entre as partes.

alter table public.payments
  add column if not exists charge_type text not null default 'legacy_booking_total',
  add column if not exists payer_user_id uuid references auth.users(id) on delete set null;

alter table public.payments drop constraint if exists payments_booking_id_key;
alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('pending','processing','paid','partially_released','released','refunded','chargeback','failed','cancelled'));

alter table public.payments drop constraint if exists payments_charge_type_check;
alter table public.payments add constraint payments_charge_type_check
  check (charge_type in ('legacy_booking_total','venue_platform_fee','artist_platform_fee'));

create index if not exists payments_booking_charge_idx
  on public.payments(booking_id,charge_type,created_at desc);

create unique index if not exists payments_active_charge_unique_idx
  on public.payments(booking_id,charge_type,provider)
  where status in ('pending','processing','paid');

update public.payments
set status='cancelled',
    updated_at=now(),
    metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
      'legacy_disabled_at',now(),
      'legacy_disabled_reason','Aura Beat passou a cobrar somente taxas da plataforma'
    )
where charge_type='legacy_booking_total'
  and status in ('pending','processing');

create or replace function public.confirm_booking_after_paid_payment()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_booking public.bookings%rowtype;
  v_expected numeric(12,2);
  v_venue_paid boolean;
  v_artist_paid boolean;
begin
  if new.status <> 'paid' then return new; end if;

  select * into v_booking
  from public.bookings b
  where b.id=new.booking_id;

  if not found then
    raise exception 'Booking do pagamento nao encontrado';
  end if;

  if new.charge_type='legacy_booking_total' then
    return new;
  end if;

  if new.charge_type='venue_platform_fee' then
    v_expected := round(coalesce(v_booking.platform_fee_venue,0)+coalesce(new.provider_fee,0),2);
  elsif new.charge_type='artist_platform_fee' then
    v_expected := round(coalesce(v_booking.platform_fee_artist,0)+coalesce(new.provider_fee,0),2);
  else
    raise exception 'Tipo de cobranca invalido';
  end if;

  if new.gross_amount is null or abs(round(new.gross_amount,2)-v_expected)>0.01 then
    raise exception 'Valor pago nao corresponde a taxa Aura Beat esperada';
  end if;

  select
    case when coalesce(v_booking.platform_fee_venue,0)<=0 then true else exists (
      select 1 from public.payments p
      where p.booking_id=v_booking.id
        and p.charge_type='venue_platform_fee'
        and p.status='paid'
    ) end,
    case when coalesce(v_booking.platform_fee_artist,0)<=0 then true else exists (
      select 1 from public.payments p
      where p.booking_id=v_booking.id
        and p.charge_type='artist_platform_fee'
        and p.status='paid'
    ) end
  into v_venue_paid,v_artist_paid;

  if v_venue_paid and v_artist_paid then
    update public.bookings
    set status='confirmed',contact_unlocked=true,updated_at=now()
    where id=v_booking.id and status='awaiting_payment';
  end if;

  return new;
end;
$function$;

create or replace function public.criar_repasses_do_pagamento()
returns trigger
language plpgsql
security definer
set search_path='public'
as $function$
begin
  if new.status <> 'paid' then return new; end if;

  if coalesce(new.charge_type,'legacy_booking_total') <> 'legacy_booking_total' then
    return new;
  end if;

  insert into public.payment_releases(payment_id,kind,amount,status)
  values (
    new.id,'performance',
    greatest(coalesce(new.agreed_fee,0)-coalesce(new.platform_fee_artist,0),0),
    'pending'
  )
  on conflict(payment_id,kind) do update set amount=excluded.amount;

  insert into public.payment_releases(payment_id,kind,amount,status)
  values (
    new.id,'travel',
    greatest(coalesce(new.travel_amount,0)+coalesce(new.toll_amount,0)+coalesce(new.lodging_amount,0),0),
    'pending'
  )
  on conflict(payment_id,kind) do update set amount=excluded.amount;

  return new;
end;
$function$;

create or replace function public.notify_payment_change_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_artist_user uuid;
  v_venue_user uuid;
  v_event_title text;
  v_title text;
  v_body text;
  v_target uuid;
  v_link text;
begin
  if tg_op='UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  select
    a.user_id,
    v.owner_user_id,
    coalesce(o.title,b.terms_snapshot->>'title','Contratação Aura Beat')
  into v_artist_user,v_venue_user,v_event_title
  from public.bookings b
  join public.artist_profiles a on a.id=b.artist_id
  join public.venue_profiles v on v.id=b.venue_id
  left join public.offers o on o.id=b.offer_id
  where b.id=new.booking_id;

  if new.charge_type='artist_platform_fee' then
    v_target:=v_artist_user;
    v_link:='/financeiro-artista';
    v_body:='Taxa de 3% do Artista · ' || coalesce(v_event_title,'Contratação');
  else
    v_target:=v_venue_user;
    v_link:='/financeiro-casa';
    v_body:='Taxa de 3% da Casa · ' || coalesce(v_event_title,'Contratação');
  end if;

  case new.status
    when 'paid' then v_title:='Taxa Aura Beat confirmada';
    when 'refunded' then v_title:='Taxa Aura Beat reembolsada';
    when 'failed' then v_title:='Pagamento da taxa não aprovado';
    when 'cancelled' then v_title:='Cobrança da taxa cancelada';
    when 'processing' then v_title:='Pagamento da taxa em processamento';
    else v_title:='Taxa Aura Beat aguardando pagamento';
  end case;

  if v_target is not null then
    perform public.create_aura_notification_v1(
      v_target,'payment',v_title,v_body,v_link
    );
  end if;

  return new;
end;
$function$;

notify pgrst,'reload schema';
