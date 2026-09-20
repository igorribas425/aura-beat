-- 2026-09-20
-- Distinguish who accepted a counterproposal and enforce artist event progression.

create or replace function public.notify_offer_response_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_offer_title text;
  v_venue_user uuid;
  v_venue_name text;
  v_artist_user uuid;
  v_artist_name text;
  v_changed boolean;
begin
  select
    o.title,
    v.owner_user_id,
    v.trade_name,
    a.user_id,
    a.stage_name
  into
    v_offer_title,
    v_venue_user,
    v_venue_name,
    v_artist_user,
    v_artist_name
  from public.offers o
  join public.venue_profiles v on v.id=o.venue_id
  join public.artist_profiles a on a.id=new.artist_id
  where o.id=new.offer_id;

  if v_artist_user is null or v_venue_user is null then
    return new;
  end if;

  if tg_op='INSERT' then
    v_changed:=true;
  else
    v_changed:=
      old.status is distinct from new.status
      or old.proposed_fee is distinct from new.proposed_fee
      or old.message is distinct from new.message;
  end if;

  if tg_op='INSERT' and new.status='pending' then
    perform public.create_aura_notification_v1(
      v_artist_user,
      'invitation',
      'Novo convite de ' || coalesce(nullif(trim(v_venue_name),''),'uma Casa'),
      coalesce(v_offer_title,'Você recebeu um novo convite de contratação.'),
      '/ofertas-artista'
    );
  end if;

  if v_changed and new.status='accepted' then
    if tg_op='UPDATE' and old.status='countered' then
      perform public.create_aura_notification_v1(
        v_artist_user,
        'offer_accepted',
        coalesce(nullif(trim(v_venue_name),''),'A Casa') || ' aceitou sua contraproposta',
        coalesce(v_offer_title,'Sua contraproposta foi aceita.'),
        '/eventos-artista'
      );
    else
      perform public.create_aura_notification_v1(
        v_venue_user,
        'offer_accepted',
        coalesce(nullif(trim(v_artist_name),''),'O artista') || ' aceitou a oferta',
        coalesce(v_offer_title,'Sua oferta foi aceita.'),
        '/eventos-casa'
      );
    end if;
  elsif v_changed and new.status='declined' then
    if tg_op='UPDATE' and old.status='countered' then
      perform public.create_aura_notification_v1(
        v_artist_user,
        'offer_declined',
        coalesce(nullif(trim(v_venue_name),''),'A Casa') || ' recusou sua contraproposta',
        coalesce(v_offer_title,'Sua contraproposta foi recusada.'),
        '/ofertas-artista'
      );
    else
      perform public.create_aura_notification_v1(
        v_venue_user,
        'offer_declined',
        coalesce(nullif(trim(v_artist_name),''),'O artista') || ' recusou a oferta',
        coalesce(v_offer_title,'Sua oferta foi recusada.'),
        '/ofertas'
      );
    end if;
  elsif v_changed and new.status='countered' then
    perform public.create_aura_notification_v1(
      v_venue_user,
      'counterproposal',
      'Nova contraproposta de ' || coalesce(nullif(trim(v_artist_name),''),'um artista'),
      case
        when new.proposed_fee is not null then
          coalesce(v_offer_title,'Oferta')
          || ' · R$ '
          || replace(to_char(new.proposed_fee,'FM999G999G990D00'),'.',',')
          || case
               when nullif(trim(coalesce(new.message,'')),'') is not null
                 then ' · ' || left(trim(new.message),220)
               else ''
             end
        else
          coalesce(v_offer_title,'O artista enviou uma contraproposta.')
      end,
      '/contraproposta/' || new.id::text
    );
  elsif v_changed and new.status='selected' then
    perform public.create_aura_notification_v1(
      v_artist_user,
      'offer_accepted',
      'Você foi selecionado por ' || coalesce(nullif(trim(v_venue_name),''),'uma Casa'),
      coalesce(v_offer_title,'Sua proposta foi selecionada.'),
      '/eventos-artista'
    );
  end if;

  return new;
end;
$function$;

revoke all on function public.notify_offer_response_v1()
from public,anon,authenticated;

create or replace function public.advance_artist_booking_status_v1(
  p_booking_id uuid
)
returns text
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_booking public.bookings%rowtype;
  v_next text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select *
  into v_booking
  from public.bookings
  where id=p_booking_id
  for update;

  if not found then
    raise exception 'Evento não encontrado';
  end if;

  if not exists (
    select 1
    from public.artist_profiles a
    where a.id=v_booking.artist_id
      and a.user_id=auth.uid()
  ) then
    raise exception 'Somente o artista contratado pode avançar este evento';
  end if;

  v_next := case v_booking.status
    when 'confirmed' then 'in_transit'
    when 'in_transit' then 'arrived'
    when 'arrived' then 'in_event'
    when 'in_event' then 'completed'
    else null
  end;

  if v_next is null then
    raise exception 'Este evento não pode avançar a partir do status atual: %', v_booking.status;
  end if;

  update public.bookings
  set status=v_next,
      updated_at=now()
  where id=p_booking_id;

  return v_next;
end;
$function$;

revoke all on function public.advance_artist_booking_status_v1(uuid)
from public,anon;

grant execute on function public.advance_artist_booking_status_v1(uuid)
to authenticated;

notify pgrst,'reload schema';
