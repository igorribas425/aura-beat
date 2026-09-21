-- Monthly Aura Beat plans paid by Pix through ASAAS.
-- A paid Pix activates/renews exactly one month of the selected plan.

create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  artist_id uuid references public.artist_profiles(id) on delete cascade,
  venue_id uuid references public.venue_profiles(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  provider text not null default 'asaas',
  provider_payment_id text,
  status text not null default 'pending',
  amount numeric(12,2) not null,
  currency text not null default 'BRL',
  paid_at timestamptz,
  refunded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_payments_profile_check
    check ((artist_id is not null) <> (venue_id is not null)),
  constraint subscription_payments_status_check
    check (status in ('pending','processing','paid','refunded','failed','cancelled')),
  constraint subscription_payments_amount_check
    check (amount > 0)
);

create unique index if not exists subscription_payments_provider_payment_uidx
  on public.subscription_payments(provider, provider_payment_id)
  where provider_payment_id is not null
    and provider_payment_id not like 'creating:%';

create unique index if not exists subscription_payments_active_checkout_uidx
  on public.subscription_payments(plan_id,user_id,provider)
  where status in ('pending','processing','paid');

create index if not exists subscription_payments_user_idx
  on public.subscription_payments(user_id,created_at desc);

alter table public.subscription_payments enable row level security;

revoke all on table public.subscription_payments from anon, authenticated;
grant select on table public.subscription_payments to authenticated;

drop policy if exists subscription_payments_owner_read
on public.subscription_payments;

create policy subscription_payments_owner_read
on public.subscription_payments
for select
to authenticated
using (
  user_id = auth.uid()
  or public.owner_access_v1()
);

create or replace function public.activate_subscription_from_payment_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_plan public.plans%rowtype;
  v_current public.subscriptions%rowtype;
  v_subscription_id uuid;
  v_now timestamptz := now();
  v_base timestamptz;
begin
  if new.status <> 'paid'
     or old.status = 'paid' then
    return new;
  end if;

  select *
  into v_plan
  from public.plans p
  where p.id=new.plan_id
    and p.is_active=true;

  if not found then
    raise exception 'Plano inexistente ou desativado';
  end if;

  if new.artist_id is not null then
    if v_plan.audience <> 'artist' then
      raise exception 'Plano incompatível com Artista';
    end if;

    if not exists (
      select 1
      from public.artist_profiles a
      where a.id=new.artist_id
        and a.user_id=new.user_id
        and coalesce(a.is_active,true)=true
    ) then
      raise exception 'Artista inválido para este pagamento';
    end if;

    select *
    into v_current
    from public.subscriptions s
    where s.artist_id=new.artist_id
      and s.status in ('active','trialing','past_due')
      and (s.current_period_end is null or s.current_period_end>v_now)
    order by s.created_at desc
    limit 1
    for update;
  else
    if v_plan.audience <> 'venue' then
      raise exception 'Plano incompatível com Casa';
    end if;

    if not exists (
      select 1
      from public.venue_profiles v
      where v.id=new.venue_id
        and v.owner_user_id=new.user_id
        and coalesce(v.is_active,true)=true
    ) then
      raise exception 'Casa inválida para este pagamento';
    end if;

    select *
    into v_current
    from public.subscriptions s
    where s.venue_id=new.venue_id
      and s.status in ('active','trialing','past_due')
      and (s.current_period_end is null or s.current_period_end>v_now)
    order by s.created_at desc
    limit 1
    for update;
  end if;

  if v_current.id is not null
     and v_current.plan_id = new.plan_id
     and v_current.provider = 'asaas' then

    v_base := greatest(
      coalesce(v_current.current_period_end,v_now),
      v_now
    );

    update public.subscriptions
    set
      status='active',
      trial_ends_at=null,
      current_period_start=coalesce(current_period_start,v_now),
      current_period_end=v_base + interval '1 month',
      provider='asaas',
      provider_subscription_id=new.provider_payment_id,
      assignment_source='asaas',
      cancelled_by_user_id=null,
      cancelled_at=null,
      updated_at=v_now
    where id=v_current.id
    returning id into v_subscription_id;

  else
    update public.subscriptions
    set
      status='cancelled',
      current_period_end=least(coalesce(current_period_end,v_now),v_now),
      cancelled_at=v_now,
      admin_note=coalesce(admin_note,'Substituído por novo plano pago via ASAAS'),
      updated_at=v_now
    where status in ('active','trialing','past_due')
      and (
        (new.artist_id is not null and artist_id=new.artist_id)
        or
        (new.venue_id is not null and venue_id=new.venue_id)
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
      provider_subscription_id,
      assignment_source,
      admin_note
    )
    values(
      new.plan_id,
      new.artist_id,
      new.venue_id,
      'active',
      null,
      v_now,
      v_now + interval '1 month',
      'asaas',
      new.provider_payment_id,
      'asaas',
      'Ativado automaticamente após confirmação do Pix'
    )
    returning id into v_subscription_id;
  end if;

  new.subscription_id := v_subscription_id;
  new.paid_at := coalesce(new.paid_at,v_now);
  new.updated_at := v_now;

  return new;
end;
$function$;

drop trigger if exists trg_activate_subscription_from_payment_v1
on public.subscription_payments;

create trigger trg_activate_subscription_from_payment_v1
before update of status
on public.subscription_payments
for each row
execute function public.activate_subscription_from_payment_v1();

-- Paid plans should not advertise a trial that has no checkout flow.
update public.plans
set benefits = benefits - 'trial_days'
where benefits ? 'trial_days';

notify pgrst,'reload schema';
