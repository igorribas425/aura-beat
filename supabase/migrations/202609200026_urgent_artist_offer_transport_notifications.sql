-- 2026-09-20
-- Urgent artist availability: transport snapshot + request notifications.

alter table public.artist_offers
  add column if not exists transport_mode text,
  add column if not exists transport_type text,
  add column if not exists ticket_amount numeric not null default 0,
  add column if not exists local_transport_amount numeric not null default 0,
  add column if not exists transport_notes text;

alter table public.artist_offer_requests
  add column if not exists transport_mode text,
  add column if not exists transport_type text,
  add column if not exists ticket_amount numeric not null default 0,
  add column if not exists local_transport_amount numeric not null default 0,
  add column if not exists transport_notes text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.artist_offers'::regclass
      and conname='artist_offers_transport_mode_check'
  ) then
    alter table public.artist_offers
      add constraint artist_offers_transport_mode_check
      check (
        transport_mode is null
        or transport_mode in ('fixed','vehicle','ticket','venue_pickup','other')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.artist_offer_requests'::regclass
      and conname='artist_offer_requests_transport_mode_check'
  ) then
    alter table public.artist_offer_requests
      add constraint artist_offer_requests_transport_mode_check
      check (
        transport_mode is null
        or transport_mode in ('fixed','vehicle','ticket','venue_pickup','other')
      );
  end if;
end $$;

create or replace function public.notify_artist_offer_request_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_artist_user uuid;
  v_artist_name text;
  v_venue_user uuid;
  v_venue_name text;
  v_offer_title text;
begin
  select a.user_id,a.stage_name,ao.title
  into v_artist_user,v_artist_name,v_offer_title
  from public.artist_offers ao
  join public.artist_profiles a on a.id=ao.artist_id
  where ao.id=new.artist_offer_id;

  select v.owner_user_id,v.trade_name
  into v_venue_user,v_venue_name
  from public.venue_profiles v
  where v.id=new.venue_id;

  if tg_op='INSERT' and new.status='pending' then
    perform public.create_aura_notification_v1(
      v_artist_user,
      'invitation',
      'Nova solicitação de ' || coalesce(nullif(trim(v_venue_name),''),'uma Casa'),
      coalesce(v_offer_title,'Disponibilidade urgente') || ' · toque para responder.',
      '/disponibilidade-artista?request=' || new.id::text
    );
  elsif tg_op='UPDATE' and old.status is distinct from new.status then
    if new.status='accepted' then
      perform public.create_aura_notification_v1(
        v_venue_user,
        'offer_accepted',
        coalesce(nullif(trim(v_artist_name),''),'O DJ') || ' aceitou sua solicitação',
        coalesce(v_offer_title,'Disponibilidade urgente') || ' · contratação criada.',
        '/eventos-casa'
      );
    elsif new.status='declined' then
      perform public.create_aura_notification_v1(
        v_venue_user,
        'offer_declined',
        coalesce(nullif(trim(v_artist_name),''),'O DJ') || ' recusou sua solicitação',
        coalesce(v_offer_title,'Disponibilidade urgente'),
        '/disponibilidades-casa'
      );
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.notify_artist_offer_request_v1()
from public,anon,authenticated;

drop trigger if exists artist_offer_request_notifications
on public.artist_offer_requests;

create trigger artist_offer_request_notifications
after insert or update of status
on public.artist_offer_requests
for each row
execute function public.notify_artist_offer_request_v1();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='artist_offers'
  ) then
    alter publication supabase_realtime add table public.artist_offers;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='artist_offer_requests'
  ) then
    alter publication supabase_realtime add table public.artist_offer_requests;
  end if;
end $$;

notify pgrst,'reload schema';
