-- 2026-09-21
-- Niveis visuais publicos de plano para mapa, cards e perfis.

create or replace function public.get_public_plan_levels_v1(
  p_artist_ids uuid[] default '{}'::uuid[],
  p_venue_ids uuid[] default '{}'::uuid[]
)
returns table(
  profile_kind text,
  profile_id uuid,
  plan_code text,
  plan_name text
)
language sql
stable
security definer
set search_path=''
as $function$
  with valid_subscriptions as (
    select
      s.artist_id,
      s.venue_id,
      s.plan_id,
      s.created_at,
      row_number() over (
        partition by coalesce(s.artist_id, s.venue_id)
        order by s.created_at desc
      ) as rn
    from public.subscriptions s
    where s.status in ('active','trialing')
      and (s.current_period_end is null or s.current_period_end > now())
      and (
        s.status <> 'trialing'
        or s.trial_ends_at is null
        or s.trial_ends_at > now()
      )
      and (
        (s.artist_id is not null and s.artist_id = any(coalesce(p_artist_ids,'{}'::uuid[])))
        or
        (s.venue_id is not null and s.venue_id = any(coalesce(p_venue_ids,'{}'::uuid[])))
      )
  )
  select
    case when v.artist_id is not null then 'artist'::text else 'venue'::text end,
    coalesce(v.artist_id, v.venue_id),
    p.code,
    p.name
  from valid_subscriptions v
  join public.plans p on p.id=v.plan_id
  where v.rn=1
    and p.is_active=true;
$function$;

revoke all on function public.get_public_plan_levels_v1(uuid[],uuid[])
from public;

grant execute on function public.get_public_plan_levels_v1(uuid[],uuid[])
to anon, authenticated;

update public.plans
set
  name = case code
    when 'normal' then 'Básico'
    when 'intermediate' then 'Intermediário'
    when 'pro' then 'Pro'
    else name
  end,
  benefits = case
    when audience='artist' and code='normal' then
      jsonb_build_object(
        'trial_days',30,
        'visibility','standard',
        'core_profile',true,
        'presskit',true,
        'chat',true,
        'offers',true,
        'agenda',true
      )
    when audience='artist' and code='intermediate' then
      jsonb_build_object(
        'trial_days',30,
        'visibility','enhanced',
        'core_profile',true,
        'presskit',true,
        'chat',true,
        'offers',true,
        'agenda',true,
        'analytics',true,
        'profile_highlight',true
      )
    when audience='artist' and code='pro' then
      jsonb_build_object(
        'trial_days',30,
        'visibility','high',
        'core_profile',true,
        'presskit',true,
        'chat',true,
        'offers',true,
        'agenda',true,
        'analytics',true,
        'profile_highlight',true,
        'pro_badge',true,
        'priority_support',true
      )
    when audience='venue' and code='normal' then
      jsonb_build_object(
        'trial_days',30,
        'offers','standard',
        'explore',true,
        'chat',true,
        'events',true
      )
    when audience='venue' and code='intermediate' then
      jsonb_build_object(
        'trial_days',30,
        'offers','enhanced',
        'explore',true,
        'chat',true,
        'events',true,
        'advanced_filters',true,
        'reports',true
      )
    when audience='venue' and code='pro' then
      jsonb_build_object(
        'trial_days',30,
        'offers','high',
        'explore',true,
        'chat',true,
        'events',true,
        'advanced_filters',true,
        'reports',true,
        'team',true,
        'priority_support',true
      )
    else benefits
  end
where code in ('normal','intermediate','pro');

notify pgrst,'reload schema';
