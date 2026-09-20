-- 2026-09-20
-- Expose safe "available now" artist cards to authenticated venue owners
-- without exposing precise GPS data, and make counterproposal notifications
-- react to description changes too.

create or replace function public.available_artists_for_venue_v1(
  p_search text default null
)
returns table(
  artist_id uuid,
  stage_name text,
  avatar_url text,
  base_city text,
  base_state text,
  verification_status text,
  radius_km numeric,
  last_seen_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_search text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not exists (
    select 1
    from public.venue_profiles v
    where v.owner_user_id=auth.uid()
      and coalesce(v.is_active,true)=true
  ) then
    raise exception 'venue access required';
  end if;

  v_search := lower(trim(coalesce(p_search,'')));

  return query
  select
    a.id,
    a.stage_name,
    a.avatar_url,
    nullif(trim(a.base_city),''),
    nullif(trim(a.base_state),''),
    a.verification_status,
    coalesce(aa.radius_km,50),
    aa.last_seen_at
  from public.artist_availability aa
  join public.artist_profiles a on a.id=aa.artist_id
  where aa.is_available=true
    and coalesce(a.is_active,true)=true
    and (
      v_search=''
      or lower(coalesce(a.stage_name,'')) like '%' || v_search || '%'
      or lower(coalesce(a.base_city,'')) like '%' || v_search || '%'
      or lower(coalesce(a.base_state,'')) like '%' || v_search || '%'
    )
  order by
    case when a.verification_status='verified' then 0 else 1 end,
    aa.last_seen_at desc nulls last,
    a.stage_name;
end;
$function$;

revoke all on function public.available_artists_for_venue_v1(text)
from public,anon;

grant execute on function public.available_artists_for_venue_v1(text)
to authenticated;

drop trigger if exists offer_responses_create_notifications
on public.offer_responses;

create trigger offer_responses_create_notifications
after insert or update of status, proposed_fee, message
on public.offer_responses
for each row
execute function public.notify_offer_response_v1();

notify pgrst,'reload schema';
