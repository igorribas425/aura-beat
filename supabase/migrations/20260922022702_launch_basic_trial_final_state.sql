-- Promoção de lançamento: novos cadastros ganham 30 dias do plano Básico
-- somente após a verificação de identidade. Cadastros e assinaturas existentes
-- não são alterados.

create table if not exists public.launch_trial_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  audience text not null check (audience in ('artist','venue')),
  subscription_id uuid references public.subscriptions(id) on delete set null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, audience)
);

alter table public.launch_trial_claims enable row level security;
revoke all on public.launch_trial_claims from public, anon, authenticated;

create or replace function public.grant_launch_basic_trial_artist_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.user_id is not null then
    insert into public.launch_trial_claims(user_id, audience)
    values (new.user_id, 'artist')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.grant_launch_basic_trial_venue_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.owner_user_id is not null then
    insert into public.launch_trial_claims(user_id, audience)
    values (new.owner_user_id, 'venue')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.activate_launch_basic_trial_artist_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_plan_id uuid;
  v_subscription_id uuid;
  v_existing_subscription_id uuid;
begin
  if new.verification_status <> 'verified'
     or old.verification_status is not distinct from new.verification_status then
    return new;
  end if;

  if not exists (
    select 1
    from public.launch_trial_claims claim
    where claim.user_id=new.user_id
      and claim.audience='artist'
      and claim.subscription_id is null
  ) then
    return new;
  end if;

  select s.id
  into v_existing_subscription_id
  from public.subscriptions s
  where s.artist_id=new.id
    and s.status in ('active','trialing','past_due')
    and (s.current_period_end is null or s.current_period_end > now())
  order by s.created_at desc
  limit 1;

  if v_existing_subscription_id is not null then
    update public.launch_trial_claims
    set subscription_id=v_existing_subscription_id
    where user_id=new.user_id
      and audience='artist'
      and subscription_id is null;
    return new;
  end if;

  select p.id
  into v_plan_id
  from public.plans p
  where p.audience='artist'
    and p.code='normal'
    and p.is_active=true
  order by p.created_at asc
  limit 1;

  if v_plan_id is null then
    return new;
  end if;

  insert into public.subscriptions(
    plan_id, artist_id, venue_id, status, trial_ends_at,
    current_period_start, current_period_end, provider,
    provider_subscription_id, assignment_source, admin_note
  )
  values(
    v_plan_id, new.id, null, 'trialing',
    now() + interval '30 days', now(), now() + interval '30 days',
    'launch_trial', null, 'launch_trial',
    '30 dias grátis do plano Básico para novo cadastro verificado'
  )
  returning id into v_subscription_id;

  update public.launch_trial_claims
  set subscription_id=v_subscription_id
  where user_id=new.user_id
    and audience='artist'
    and subscription_id is null;

  return new;
end;
$$;

create or replace function public.activate_launch_basic_trial_venue_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_plan_id uuid;
  v_subscription_id uuid;
  v_existing_subscription_id uuid;
begin
  if new.verification_status <> 'verified'
     or old.verification_status is not distinct from new.verification_status then
    return new;
  end if;

  if not exists (
    select 1
    from public.launch_trial_claims claim
    where claim.user_id=new.owner_user_id
      and claim.audience='venue'
      and claim.subscription_id is null
  ) then
    return new;
  end if;

  select s.id
  into v_existing_subscription_id
  from public.subscriptions s
  where s.venue_id=new.id
    and s.status in ('active','trialing','past_due')
    and (s.current_period_end is null or s.current_period_end > now())
  order by s.created_at desc
  limit 1;

  if v_existing_subscription_id is not null then
    update public.launch_trial_claims
    set subscription_id=v_existing_subscription_id
    where user_id=new.owner_user_id
      and audience='venue'
      and subscription_id is null;
    return new;
  end if;

  select p.id
  into v_plan_id
  from public.plans p
  where p.audience='venue'
    and p.code='normal'
    and p.is_active=true
  order by p.created_at asc
  limit 1;

  if v_plan_id is null then
    return new;
  end if;

  insert into public.subscriptions(
    plan_id, artist_id, venue_id, status, trial_ends_at,
    current_period_start, current_period_end, provider,
    provider_subscription_id, assignment_source, admin_note
  )
  values(
    v_plan_id, null, new.id, 'trialing',
    now() + interval '30 days', now(), now() + interval '30 days',
    'launch_trial', null, 'launch_trial',
    '30 dias grátis do plano Básico para novo cadastro verificado'
  )
  returning id into v_subscription_id;

  update public.launch_trial_claims
  set subscription_id=v_subscription_id
  where user_id=new.owner_user_id
    and audience='venue'
    and subscription_id is null;

  return new;
end;
$$;

revoke all on function public.grant_launch_basic_trial_artist_v1() from public,anon,authenticated;
revoke all on function public.grant_launch_basic_trial_venue_v1() from public,anon,authenticated;
revoke all on function public.activate_launch_basic_trial_artist_v1() from public,anon,authenticated;
revoke all on function public.activate_launch_basic_trial_venue_v1() from public,anon,authenticated;

drop trigger if exists trg_grant_launch_basic_trial_artist_v1 on public.artist_profiles;
create trigger trg_grant_launch_basic_trial_artist_v1
after insert on public.artist_profiles
for each row execute function public.grant_launch_basic_trial_artist_v1();

drop trigger if exists trg_grant_launch_basic_trial_venue_v1 on public.venue_profiles;
create trigger trg_grant_launch_basic_trial_venue_v1
after insert on public.venue_profiles
for each row execute function public.grant_launch_basic_trial_venue_v1();

drop trigger if exists trg_activate_launch_basic_trial_artist_v1 on public.artist_profiles;
create trigger trg_activate_launch_basic_trial_artist_v1
after update of verification_status on public.artist_profiles
for each row execute function public.activate_launch_basic_trial_artist_v1();

drop trigger if exists trg_activate_launch_basic_trial_venue_v1 on public.venue_profiles;
create trigger trg_activate_launch_basic_trial_venue_v1
after update of verification_status on public.venue_profiles
for each row execute function public.activate_launch_basic_trial_venue_v1();

notify pgrst,'reload schema';
