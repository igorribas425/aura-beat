-- Central de Alertas para o fluxo de contratação.
-- Cobre convites, respostas de ofertas, bookings, mudanças de evento e pagamentos.

create or replace function public.create_aura_notification_v1(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_link_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.notifications (
    user_id,
    type,
    title,
    body,
    link_url
  )
  values (
    p_user_id,
    p_type,
    left(coalesce(nullif(trim(p_title), ''), 'Aura Beat'), 120),
    nullif(left(coalesce(p_body, ''), 500), ''),
    p_link_url
  );
end;
$$;

revoke all on function public.create_aura_notification_v1(uuid,text,text,text,text) from public;

create or replace function public.notify_offer_response_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
  join public.venue_profiles v on v.id = o.venue_id
  join public.artist_profiles a on a.id = new.artist_id
  where o.id = new.offer_id;

  if v_artist_user is null or v_venue_user is null then
    return new;
  end if;

  v_changed :=
    tg_op = 'INSERT'
    or old.status is distinct from new.status
    or old.proposed_fee is distinct from new.proposed_fee;

  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.create_aura_notification_v1(
      v_artist_user,
      'invitation',
      'Novo convite de ' || coalesce(nullif(trim(v_venue_name), ''), 'uma Casa'),
      coalesce(v_offer_title, 'Você recebeu um novo convite de contratação.'),
      '/ofertas-artista'
    );
  end if;

  if v_changed and new.status = 'accepted' then
    perform public.create_aura_notification_v1(
      v_venue_user,
      'offer_accepted',
      coalesce(nullif(trim(v_artist_name), ''), 'O artista') || ' aceitou a oferta',
      coalesce(v_offer_title, 'Sua oferta foi aceita.'),
      '/ofertas'
    );
  elsif v_changed and new.status = 'declined' then
    perform public.create_aura_notification_v1(
      v_venue_user,
      'offer_declined',
      coalesce(nullif(trim(v_artist_name), ''), 'O artista') || ' recusou a oferta',
      coalesce(v_offer_title, 'Sua oferta foi recusada.'),
      '/ofertas'
    );
  elsif v_changed and new.status = 'countered' then
    perform public.create_aura_notification_v1(
      v_venue_user,
      'counterproposal',
      'Nova contraproposta de ' || coalesce(nullif(trim(v_artist_name), ''), 'um artista'),
      case
        when new.proposed_fee is not null
          then coalesce(v_offer_title, 'Oferta') || ' · R$ ' ||
               replace(to_char(new.proposed_fee, 'FM999G999G990D00'), '.', ',')
        else coalesce(v_offer_title, 'O artista enviou uma contraproposta.')
      end,
      '/ofertas'
    );
  elsif v_changed and new.status = 'selected' then
    perform public.create_aura_notification_v1(
      v_artist_user,
      'offer_accepted',
      'Você foi selecionado por ' || coalesce(nullif(trim(v_venue_name), ''), 'uma Casa'),
      coalesce(v_offer_title, 'Sua proposta foi selecionada.'),
      '/eventos-artista'
    );
  end if;

  return new;
end;
$$;

revoke all on function public.notify_offer_response_v1() from public;

drop trigger if exists offer_responses_create_notifications
on public.offer_responses;

create trigger offer_responses_create_notifications
after insert or update of status, proposed_fee
on public.offer_responses
for each row
execute function public.notify_offer_response_v1();

create or replace function public.notify_booking_change_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artist_user uuid;
  v_artist_name text;
  v_venue_user uuid;
  v_venue_name text;
  v_offer_title text;
  v_body text;
begin
  select
    a.user_id,
    a.stage_name,
    v.owner_user_id,
    v.trade_name,
    o.title
  into
    v_artist_user,
    v_artist_name,
    v_venue_user,
    v_venue_name,
    v_offer_title
  from public.artist_profiles a
  join public.venue_profiles v on v.id = new.venue_id
  left join public.offers o on o.id = new.offer_id
  where a.id = new.artist_id;

  if v_artist_user is null or v_venue_user is null then
    return new;
  end if;

  v_body := coalesce(v_offer_title, 'Evento em ' || to_char(new.starts_at, 'DD/MM/YYYY HH24:MI'));

  if tg_op = 'INSERT' then
    perform public.create_aura_notification_v1(
      v_artist_user,
      'booking',
      'Nova contratação com ' || coalesce(nullif(trim(v_venue_name), ''), 'uma Casa'),
      v_body,
      '/eventos-artista'
    );

    perform public.create_aura_notification_v1(
      v_venue_user,
      'booking',
      'Contratação criada com ' || coalesce(nullif(trim(v_artist_name), ''), 'o artista'),
      v_body,
      '/eventos-casa'
    );

    return new;
  end if;

  if old.status is not distinct from new.status then
    return new;
  end if;

  case new.status
    when 'confirmed' then
      perform public.create_aura_notification_v1(
        v_artist_user, 'booking', 'Evento confirmado', v_body, '/eventos-artista'
      );
      perform public.create_aura_notification_v1(
        v_venue_user, 'booking', 'Evento confirmado', v_body, '/eventos-casa'
      );

    when 'in_transit' then
      perform public.create_aura_notification_v1(
        v_venue_user,
        'in_transit',
        coalesce(nullif(trim(v_artist_name), ''), 'O artista') || ' está a caminho',
        v_body,
        '/eventos-casa'
      );

    when 'arrived' then
      perform public.create_aura_notification_v1(
        v_venue_user,
        'arrived',
        coalesce(nullif(trim(v_artist_name), ''), 'O artista') || ' chegou ao local',
        v_body,
        '/eventos-casa'
      );

    when 'in_event' then
      perform public.create_aura_notification_v1(
        v_artist_user, 'event_changed', 'Evento iniciado', v_body, '/eventos-artista'
      );
      perform public.create_aura_notification_v1(
        v_venue_user, 'event_changed', 'Evento iniciado', v_body, '/eventos-casa'
      );

    when 'completed' then
      perform public.create_aura_notification_v1(
        v_artist_user, 'completed', 'Evento finalizado', v_body, '/eventos-artista'
      );
      perform public.create_aura_notification_v1(
        v_venue_user, 'completed', 'Evento finalizado', v_body, '/eventos-casa'
      );
      perform public.create_aura_notification_v1(
        v_artist_user,
        'review_request',
        'Avalie a Casa',
        'Conte como foi o evento com ' || coalesce(nullif(trim(v_venue_name), ''), 'a Casa') || '.',
        '/eventos-artista'
      );
      perform public.create_aura_notification_v1(
        v_venue_user,
        'review_request',
        'Avalie o artista',
        'Conte como foi o evento com ' || coalesce(nullif(trim(v_artist_name), ''), 'o artista') || '.',
        '/eventos-casa'
      );

    when 'cancelled' then
      perform public.create_aura_notification_v1(
        v_artist_user, 'event_changed', 'Evento cancelado', v_body, '/eventos-artista'
      );
      perform public.create_aura_notification_v1(
        v_venue_user, 'event_changed', 'Evento cancelado', v_body, '/eventos-casa'
      );

    when 'disputed' then
      perform public.create_aura_notification_v1(
        v_artist_user, 'event_changed', 'Evento em análise', v_body, '/eventos-artista'
      );
      perform public.create_aura_notification_v1(
        v_venue_user, 'event_changed', 'Evento em análise', v_body, '/eventos-casa'
      );

    else
      null;
  end case;

  return new;
end;
$$;

revoke all on function public.notify_booking_change_v1() from public;

drop trigger if exists bookings_create_notifications
on public.bookings;

create trigger bookings_create_notifications
after insert or update of status
on public.bookings
for each row
execute function public.notify_booking_change_v1();

create or replace function public.notify_payment_change_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artist_user uuid;
  v_venue_user uuid;
  v_artist_name text;
  v_event_title text;
  v_status_title text;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  select
    a.user_id,
    v.owner_user_id,
    a.stage_name,
    o.title
  into
    v_artist_user,
    v_venue_user,
    v_artist_name,
    v_event_title
  from public.bookings b
  join public.artist_profiles a on a.id = b.artist_id
  join public.venue_profiles v on v.id = b.venue_id
  left join public.offers o on o.id = b.offer_id
  where b.id = new.booking_id;

  case new.status
    when 'paid' then v_status_title := 'Pagamento confirmado';
    when 'processing' then v_status_title := 'Pagamento em processamento';
    when 'failed' then v_status_title := 'Pagamento não aprovado';
    when 'refunded' then v_status_title := 'Pagamento reembolsado';
    when 'cancelled' then v_status_title := 'Pagamento cancelado';
    else v_status_title := 'Pagamento pendente';
  end case;

  perform public.create_aura_notification_v1(
    coalesce(new.payer_user_id, v_venue_user),
    'payment',
    v_status_title,
    coalesce(v_event_title, 'Confira os detalhes do pagamento.'),
    '/financeiro-casa'
  );

  if new.status in ('paid', 'refunded') then
    perform public.create_aura_notification_v1(
      v_artist_user,
      'payment',
      case
        when new.status = 'paid' then 'Pagamento do evento confirmado'
        else 'Pagamento do evento reembolsado'
      end,
      coalesce(v_event_title, 'Confira os detalhes financeiros do evento.'),
      '/financeiro-artista'
    );
  end if;

  return new;
end;
$$;

revoke all on function public.notify_payment_change_v1() from public;

drop trigger if exists payments_create_notifications
on public.payments;

create trigger payments_create_notifications
after insert or update of status
on public.payments
for each row
execute function public.notify_payment_change_v1();

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  )
  and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime
      add table public.notifications;
  end if;
end;
$$;
