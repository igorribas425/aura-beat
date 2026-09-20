-- 2026-09-20
-- Counterproposal alerts open the exact response.

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
  select o.title,v.owner_user_id,v.trade_name,a.user_id,a.stage_name
  into v_offer_title,v_venue_user,v_venue_name,v_artist_user,v_artist_name
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
      v_artist_user,'invitation',
      'Novo convite de ' || coalesce(nullif(trim(v_venue_name),''),'uma Casa'),
      coalesce(v_offer_title,'Você recebeu um novo convite de contratação.'),
      '/ofertas-artista'
    );
  end if;

  if v_changed and new.status='accepted' then
    perform public.create_aura_notification_v1(
      v_venue_user,'offer_accepted',
      coalesce(nullif(trim(v_artist_name),''),'O artista') || ' aceitou a oferta',
      coalesce(v_offer_title,'Sua oferta foi aceita.'),
      '/eventos-casa'
    );
  elsif v_changed and new.status='declined' then
    perform public.create_aura_notification_v1(
      v_venue_user,'offer_declined',
      coalesce(nullif(trim(v_artist_name),''),'O artista') || ' recusou a oferta',
      coalesce(v_offer_title,'Sua oferta foi recusada.'),
      '/ofertas'
    );
  elsif v_changed and new.status='countered' then
    perform public.create_aura_notification_v1(
      v_venue_user,'counterproposal',
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
        else coalesce(v_offer_title,'O artista enviou uma contraproposta.')
      end,
      '/contraproposta/' || new.id::text
    );
  elsif v_changed and new.status='selected' then
    perform public.create_aura_notification_v1(
      v_artist_user,'offer_accepted',
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

notify pgrst,'reload schema';
