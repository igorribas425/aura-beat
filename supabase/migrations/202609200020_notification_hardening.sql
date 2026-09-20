-- Hardening dos alertas + alinhamento com os status reais de payments.

create or replace function public.notify_payment_change_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artist_user uuid;
  v_venue_user uuid;
  v_event_title text;
  v_status_title text;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  select
    a.user_id,
    v.owner_user_id,
    o.title
  into
    v_artist_user,
    v_venue_user,
    v_event_title
  from public.bookings b
  join public.artist_profiles a on a.id = b.artist_id
  join public.venue_profiles v on v.id = b.venue_id
  left join public.offers o on o.id = b.offer_id
  where b.id = new.booking_id;

  case new.status
    when 'paid' then v_status_title := 'Pagamento confirmado';
    when 'partially_released' then v_status_title := 'Pagamento parcialmente liberado';
    when 'released' then v_status_title := 'Pagamento liberado';
    when 'refunded' then v_status_title := 'Pagamento reembolsado';
    when 'chargeback' then v_status_title := 'Pagamento em contestação';
    when 'failed' then v_status_title := 'Pagamento não aprovado';
    else v_status_title := 'Pagamento pendente';
  end case;

  perform public.create_aura_notification_v1(
    coalesce(new.payer_user_id, v_venue_user),
    'payment',
    v_status_title,
    coalesce(v_event_title, 'Confira os detalhes do pagamento.'),
    '/financeiro-casa'
  );

  if new.status in ('paid', 'partially_released', 'released', 'refunded', 'chargeback') then
    perform public.create_aura_notification_v1(
      v_artist_user,
      'payment',
      case new.status
        when 'paid' then 'Pagamento do evento confirmado'
        when 'partially_released' then 'Pagamento parcialmente liberado'
        when 'released' then 'Pagamento liberado'
        when 'refunded' then 'Pagamento do evento reembolsado'
        else 'Pagamento em contestação'
      end,
      coalesce(v_event_title, 'Confira os detalhes financeiros do evento.'),
      '/financeiro-artista'
    );
  end if;

  return new;
end;
$$;

revoke all on function public.notify_direct_message_v1() from public, anon, authenticated;
revoke all on function public.create_aura_notification_v1(uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function public.notify_offer_response_v1() from public, anon, authenticated;
revoke all on function public.notify_booking_change_v1() from public, anon, authenticated;
revoke all on function public.notify_payment_change_v1() from public, anon, authenticated;
