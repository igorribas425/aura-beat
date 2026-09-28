-- 2026-09-28
-- Camada gratuita permanente e limitada para Artistas e Casas verificados.
--
-- Objetivos:
-- 1) manter perfis verificados dentro do Aura Beat mesmo sem assinatura paga;
-- 2) preservar integralmente assinaturas pagas/manuais já existentes;
-- 3) encerrar a concessão automática do antigo teste Básico de 30 dias;
-- 4) usar um plano virtual gratuito quando não houver assinatura paga válida.

insert into public.plans (
  audience,
  code,
  name,
  monthly_price,
  benefits,
  is_active
)
values
  (
    'artist',
    'free',
    'Gratuito',
    0,
    jsonb_build_object(
      'visibility','limited',
      'core_profile',true,
      'presskit',true,
      'chat',true,
      'offers',false,
      'agenda',false,
      'analytics',false,
      'profile_highlight',false,
      'pro_badge',false,
      'support_chat',false
    ),
    true
  ),
  (
    'venue',
    'free',
    'Gratuito',
    0,
    jsonb_build_object(
      'explore',true,
      'chat',true,
      'offers',false,
      'events',false,
      'advanced_filters',false,
      'reports',false,
      'support_chat',false
    ),
    true
  )
on conflict (audience, code)
do update set
  name=excluded.name,
  monthly_price=excluded.monthly_price,
  benefits=excluded.benefits,
  is_active=true;

-- A promoção anterior de 30 dias deixa de ser atribuída a novos verificados.
-- As linhas históricas e assinaturas existentes não são apagadas nem alteradas.
drop trigger if exists trg_activate_launch_basic_trial_artist_v1
on public.artist_profiles;

drop trigger if exists trg_activate_launch_basic_trial_venue_v1
on public.venue_profiles;

drop trigger if exists trg_grant_launch_basic_trial_artist_v1
on public.artist_profiles;

drop trigger if exists trg_grant_launch_basic_trial_venue_v1
on public.venue_profiles;

create or replace function public.get_my_plan_access_v1(
  p_audience text
)
returns jsonb
language plpgsql
security definer
set search_path=''
stable
as $function$
declare
  v_profile_id uuid;
  v_verification_status text;
  v_subscription public.subscriptions%rowtype;
  v_plan public.plans%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_audience not in ('artist','venue') then
    raise exception 'invalid audience';
  end if;

  if p_audience='artist' then
    select a.id, a.verification_status
    into v_profile_id, v_verification_status
    from public.artist_profiles a
    where a.user_id=auth.uid()
      and coalesce(a.is_active,true)=true
    order by a.created_at desc
    limit 1;
  else
    select v.id, v.verification_status
    into v_profile_id, v_verification_status
    from public.venue_profiles v
    where v.owner_user_id=auth.uid()
      and coalesce(v.is_active,true)=true
    order by v.created_at desc
    limit 1;
  end if;

  if v_profile_id is null then
    return jsonb_build_object(
      'active',false,
      'audience',p_audience,
      'benefits','{}'::jsonb
    );
  end if;

  -- Assinaturas pagas, administrativas ou trials válidos sempre têm prioridade
  -- sobre a camada gratuita.
  if p_audience='artist' then
    select s.*
    into v_subscription
    from public.subscriptions s
    where s.artist_id=v_profile_id
      and s.status in ('active','trialing')
      and (s.current_period_end is null or s.current_period_end > now())
      and (
        s.status <> 'trialing'
        or s.trial_ends_at is null
        or s.trial_ends_at > now()
      )
    order by s.created_at desc
    limit 1;
  else
    select s.*
    into v_subscription
    from public.subscriptions s
    where s.venue_id=v_profile_id
      and s.status in ('active','trialing')
      and (s.current_period_end is null or s.current_period_end > now())
      and (
        s.status <> 'trialing'
        or s.trial_ends_at is null
        or s.trial_ends_at > now()
      )
    order by s.created_at desc
    limit 1;
  end if;

  if found then
    select p.*
    into v_plan
    from public.plans p
    where p.id=v_subscription.plan_id;

    if found then
      return jsonb_build_object(
        'active',true,
        'audience',p_audience,
        'profile_id',v_profile_id,
        'subscription_id',v_subscription.id,
        'status',v_subscription.status,
        'plan_id',v_plan.id,
        'plan_code',v_plan.code,
        'plan_name',v_plan.name,
        'monthly_price',v_plan.monthly_price,
        'unlimited',v_subscription.current_period_end is null,
        'current_period_end',v_subscription.current_period_end,
        'trial_ends_at',v_subscription.trial_ends_at,
        'benefits',coalesce(v_plan.benefits,'{}'::jsonb)
      );
    end if;
  end if;

  -- O plano gratuito só é liberado após a verificação do perfil.
  if v_verification_status <> 'verified' then
    return jsonb_build_object(
      'active',false,
      'audience',p_audience,
      'profile_id',v_profile_id,
      'benefits','{}'::jsonb
    );
  end if;

  select p.*
  into v_plan
  from public.plans p
  where p.audience=p_audience
    and p.code='free'
    and p.is_active=true
  order by p.created_at asc
  limit 1;

  if not found then
    return jsonb_build_object(
      'active',false,
      'audience',p_audience,
      'profile_id',v_profile_id,
      'benefits','{}'::jsonb
    );
  end if;

  return jsonb_build_object(
    'active',true,
    'audience',p_audience,
    'profile_id',v_profile_id,
    'subscription_id',null,
    'status','free',
    'plan_id',v_plan.id,
    'plan_code',v_plan.code,
    'plan_name',v_plan.name,
    'monthly_price',0,
    'unlimited',true,
    'current_period_end',null,
    'trial_ends_at',null,
    'benefits',coalesce(v_plan.benefits,'{}'::jsonb)
  );
end;
$function$;

revoke all on function public.get_my_plan_access_v1(text)
from public,anon;

grant execute on function public.get_my_plan_access_v1(text)
to authenticated;

notify pgrst,'reload schema';
