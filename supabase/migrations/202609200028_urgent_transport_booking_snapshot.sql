-- 2026-09-20
-- Persist urgent-availability transport details into the booking snapshot.

create or replace function public.responder_solicitacao_oferta_artista(
  p_request_id uuid,
  p_action text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_request public.artist_offer_requests%rowtype;
  v_offer public.artist_offers%rowtype;
  v_booking_id uuid;
begin
  if p_action not in ('accepted','declined') then
    raise exception 'Ação inválida';
  end if;

  select * into v_request
  from public.artist_offer_requests
  where id=p_request_id
  for update;

  if not found then
    raise exception 'Solicitação não encontrada';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Esta solicitação já foi respondida';
  end if;

  select * into v_offer
  from public.artist_offers
  where id=v_request.artist_offer_id
  for update;

  if not found then
    raise exception 'Oferta do artista não encontrada';
  end if;

  if not exists (
    select 1
    from public.artist_profiles a
    where a.id=v_offer.artist_id
      and a.user_id=auth.uid()
  ) then
    raise exception 'Você não pode responder esta solicitação';
  end if;

  if p_action='declined' then
    update public.artist_offer_requests
    set status='declined',updated_at=now()
    where id=p_request_id;
    return null;
  end if;

  if v_offer.status <> 'open' then
    raise exception 'Esta oferta não está mais disponível';
  end if;

  if v_offer.expires_at is not null and v_offer.expires_at < now() then
    raise exception 'Esta oferta expirou';
  end if;

  if v_request.requested_starts_at < v_offer.available_from
     or (
       v_request.requested_starts_at + make_interval(mins=>v_request.duration_minutes)
     ) > v_offer.available_until then
    raise exception 'O horário solicitado está fora da disponibilidade do artista';
  end if;

  insert into public.bookings (
    offer_id,response_id,venue_id,artist_id,status,starts_at,duration_minutes,
    event_address_snapshot,agreed_fee,travel_amount,toll_amount,lodging_amount,
    terms_snapshot
  )
  values (
    null,null,v_request.venue_id,v_offer.artist_id,'awaiting_payment',
    v_request.requested_starts_at,v_request.duration_minutes,
    v_request.event_address,v_request.agreed_fee,v_request.travel_amount,
    v_request.toll_amount,v_request.lodging_amount,
    jsonb_build_object(
      'source','artist_offer',
      'is_urgent',true,
      'artist_offer_id',v_offer.id,
      'artist_offer_request_id',v_request.id,
      'venue_fee_rate',0.03,
      'artist_fee_rate',0.03,
      'commission_applies_to','agreed_fee',
      'transport_mode',coalesce(v_request.transport_mode,v_offer.transport_mode),
      'transport_type',coalesce(v_request.transport_type,v_offer.transport_type),
      'ticket_amount',coalesce(v_request.ticket_amount,v_offer.ticket_amount,0),
      'local_transport_amount',coalesce(v_request.local_transport_amount,v_offer.local_transport_amount,0),
      'transport_notes',coalesce(v_request.transport_notes,v_offer.transport_notes)
    )
  )
  returning id into v_booking_id;

  update public.artist_offer_requests
  set status='accepted',updated_at=now()
  where id=p_request_id;

  update public.artist_offers
  set status='filled',updated_at=now()
  where id=v_offer.id;

  update public.artist_offer_requests
  set status='declined',updated_at=now()
  where artist_offer_id=v_offer.id
    and id<>p_request_id
    and status='pending';

  return v_booking_id;
end;
$function$;

revoke all on function public.responder_solicitacao_oferta_artista(uuid,text)
from public,anon;

grant execute on function public.responder_solicitacao_oferta_artista(uuid,text)
to authenticated;

notify pgrst,'reload schema';
