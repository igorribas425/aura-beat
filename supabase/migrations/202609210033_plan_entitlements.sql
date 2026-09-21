-- 2026-09-21
-- Plano/assinatura: administração owner, histórico e benefícios efetivos.

create or replace function public.owner_update_plan_v1(
  p_plan_id uuid,
  p_name text,
  p_monthly_price numeric,
  p_is_active boolean,
  p_benefits jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not exists (
    select 1
    from public.aura_admins aa
    where aa.user_id=auth.uid()
      and aa.is_active=true
      and aa.role='owner'
  ) then
    raise exception 'owner access required';
  end if;

  if p_monthly_price < 0 then
    raise exception 'Preço inválido';
  end if;

  update public.plans
  set
    name=trim(p_name),
    monthly_price=p_monthly_price,
    is_active=p_is_active,
    benefits=coalesce(p_benefits,benefits)
  where id=p_plan_id;

  if not found then
    raise exception 'Plano não encontrado';
  end if;

  insert into public.admin_logs(
    actor_user_id,action,entity_type,entity_id,after_data
  )
  values (
    auth.uid(),
    'plan_updated',
    'plan',
    p_plan_id::text,
    jsonb_build_object(
      'name',trim(p_name),
      'monthly_price',p_monthly_price,
      'is_active',p_is_active,
      'benefits',coalesce(p_benefits,'{}'::jsonb)
    )
  );

  return p_plan_id;
end;
$function$;

revoke all on function public.owner_update_plan_v1(uuid,text,numeric,boolean,jsonb)
from public,anon;
grant execute on function public.owner_update_plan_v1(uuid,text,numeric,boolean,jsonb)
to authenticated;

create or replace function public.owner_assign_subscription_v2(
  p_plan_id uuid,
  p_artist_id uuid default null,
  p_venue_id uuid default null,
  p_status text default 'active',
  p_period_months integer default 1,
  p_unlimited boolean default false
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_plan public.plans%rowtype;
  v_subscription_id uuid;
  v_now timestamptz := now();
  v_period_end timestamptz;
  v_unlimited boolean := coalesce(p_unlimited,false) or coalesce(p_period_months,0)=0;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not exists (
    select 1
    from public.aura_admins aa
    where aa.user_id=auth.uid()
      and aa.is_active=true
      and aa.role='owner'
  ) then
    raise exception 'owner access required';
  end if;

  if (p_artist_id is null) = (p_venue_id is null) then
    raise exception 'Informe exatamente um Artista ou uma Casa';
  end if;

  if p_status not in ('trialing','active','past_due','cancelled','expired') then
    raise exception 'Status inválido';
  end if;

  if not v_unlimited then
    if p_period_months is null or p_period_months < 1 or p_period_months > 120 then
      raise exception 'Período deve ficar entre 1 e 120 meses';
    end if;

    v_period_end := v_now + make_interval(months=>p_period_months);
  else
    v_period_end := null;
  end if;

  select *
  into v_plan
  from public.plans
  where id=p_plan_id;

  if not found then
    raise exception 'Plano não encontrado';
  end if;

  if p_artist_id is not null and v_plan.audience <> 'artist' then
    raise exception 'Este plano não pertence a Artistas';
  end if;

  if p_venue_id is not null and v_plan.audience <> 'venue' then
    raise exception 'Este plano não pertence a Casas';
  end if;

  if p_artist_id is not null and not exists (
    select 1 from public.artist_profiles a where a.id=p_artist_id
  ) then
    raise exception 'Artista não encontrado';
  end if;

  if p_venue_id is not null and not exists (
    select 1 from public.venue_profiles v where v.id=p_venue_id
  ) then
    raise exception 'Casa não encontrada';
  end if;

  update public.subscriptions
  set
    status='cancelled',
    current_period_end=coalesce(current_period_end,v_now),
    updated_at=v_now
  where status in ('trialing','active','past_due')
    and (
      (p_artist_id is not null and artist_id=p_artist_id)
      or
      (p_venue_id is not null and venue_id=p_venue_id)
    );

  insert into public.subscriptions(
    plan_id,
    artist_id,
    venue_id,
    status,
    trial_ends_at,
    current_period_start,
    current_period_end,
    provider,
    provider_subscription_id
  )
  values (
    p_plan_id,
    p_artist_id,
    p_venue_id,
    p_status,
    case
      when p_status='trialing'
      then v_now + make_interval(days=>coalesce((v_plan.benefits->>'trial_days')::integer,30))
      else null
    end,
    v_now,
    v_period_end,
    'manual_admin',
    null
  )
  returning id into v_subscription_id;

  insert into public.admin_logs(
    actor_user_id,action,entity_type,entity_id,after_data
  )
  values (
    auth.uid(),
    'subscription_assigned',
    'subscription',
    v_subscription_id::text,
    jsonb_build_object(
      'plan_id',p_plan_id,
      'artist_id',p_artist_id,
      'venue_id',p_venue_id,
      'status',p_status,
      'period_months',case when v_unlimited then 0 else p_period_months end,
      'unlimited',v_unlimited
    )
  );

  return v_subscription_id;
end;
$function$;

revoke all on function public.owner_assign_subscription_v2(uuid,uuid,uuid,text,integer,boolean)
from public,anon;
grant execute on function public.owner_assign_subscription_v2(uuid,uuid,uuid,text,integer,boolean)
to authenticated;

create or replace function public.owner_cancel_subscription_v1(
  p_subscription_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_before jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not exists (
    select 1
    from public.aura_admins aa
    where aa.user_id=auth.uid()
      and aa.is_active=true
      and aa.role='owner'
  ) then
    raise exception 'owner access required';
  end if;

  select to_jsonb(s)
  into v_before
  from public.subscriptions s
  where s.id=p_subscription_id;

  if v_before is null then
    raise exception 'Assinatura não encontrada';
  end if;

  update public.subscriptions
  set status='cancelled',updated_at=now()
  where id=p_subscription_id;

  insert into public.admin_logs(
    actor_user_id,action,entity_type,entity_id,before_data,after_data
  )
  values (
    auth.uid(),
    'subscription_cancelled',
    'subscription',
    p_subscription_id::text,
    v_before,
    jsonb_build_object(
      'reason',
      nullif(trim(coalesce(p_reason,'')),'')
    )
  );
end;
$function$;

revoke all on function public.owner_cancel_subscription_v1(uuid,text)
from public,anon;
grant execute on function public.owner_cancel_subscription_v1(uuid,text)
to authenticated;

create or replace function public.owner_list_subscriptions_v1()
returns setof public.subscriptions
language plpgsql
security definer
set search_path=''
as $function$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not exists (
    select 1
    from public.aura_admins aa
    where aa.user_id=auth.uid()
      and aa.is_active=true
      and aa.role='owner'
  ) then
    raise exception 'owner access required';
  end if;

  return query
  select s.*
  from public.subscriptions s
  order by s.created_at desc;
end;
$function$;

revoke all on function public.owner_list_subscriptions_v1()
from public,anon;
grant execute on function public.owner_list_subscriptions_v1()
to authenticated;

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
  v_subscription public.subscriptions%rowtype;
  v_plan public.plans%rowtype;
  v_valid boolean := false;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_audience not in ('artist','venue') then
    raise exception 'invalid audience';
  end if;

  if p_audience='artist' then
    select a.id
    into v_profile_id
    from public.artist_profiles a
    where a.user_id=auth.uid()
      and coalesce(a.is_active,true)=true
    order by a.created_at desc
    limit 1;
  else
    select v.id
    into v_profile_id
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

  if p_audience='artist' then
    select s.*
    into v_subscription
    from public.subscriptions s
    where s.artist_id=v_profile_id
      and s.status in ('active','trialing')
    order by s.created_at desc
    limit 1;
  else
    select s.*
    into v_subscription
    from public.subscriptions s
    where s.venue_id=v_profile_id
      and s.status in ('active','trialing')
    order by s.created_at desc
    limit 1;
  end if;

  if not found then
    return jsonb_build_object(
      'active',false,
      'audience',p_audience,
      'profile_id',v_profile_id,
      'benefits','{}'::jsonb
    );
  end if;

  v_valid :=
    (v_subscription.current_period_end is null or v_subscription.current_period_end > now())
    and (
      v_subscription.status <> 'trialing'
      or v_subscription.trial_ends_at is null
      or v_subscription.trial_ends_at > now()
    );

  if not v_valid then
    return jsonb_build_object(
      'active',false,
      'audience',p_audience,
      'profile_id',v_profile_id,
      'subscription_id',v_subscription.id,
      'status',v_subscription.status,
      'benefits','{}'::jsonb
    );
  end if;

  select p.*
  into v_plan
  from public.plans p
  where p.id=v_subscription.plan_id;

  if not found then
    return jsonb_build_object(
      'active',false,
      'audience',p_audience,
      'profile_id',v_profile_id,
      'subscription_id',v_subscription.id,
      'benefits','{}'::jsonb
    );
  end if;

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
end;
$function$;

revoke all on function public.get_my_plan_access_v1(text)
from public,anon;
grant execute on function public.get_my_plan_access_v1(text)
to authenticated;

revoke insert, update, delete, truncate, references, trigger
on public.plans
from anon, authenticated;

grant select on public.plans
to anon, authenticated;

revoke insert, update, delete, truncate, references, trigger
on public.subscriptions
from anon, authenticated;

revoke select on public.subscriptions from anon;
grant select on public.subscriptions to authenticated;

notify pgrst,'reload schema';
