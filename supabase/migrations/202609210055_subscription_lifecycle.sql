-- Finish monthly plan lifecycle: refunds, owner finance view and user notifications.

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
  if new.status = 'refunded'
     and old.status = 'paid'
     and old.subscription_id is not null then

    update public.subscriptions
    set
      status='cancelled',
      current_period_end=least(coalesce(current_period_end,v_now),v_now),
      cancelled_at=v_now,
      admin_note='Cancelado automaticamente após estorno do Pix',
      updated_at=v_now
    where id=old.subscription_id
      and provider='asaas'
      and provider_subscription_id=old.provider_payment_id;

    new.refunded_at := coalesce(new.refunded_at,v_now);
    new.updated_at := v_now;
    return new;
  end if;

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

create or replace function public.owner_plan_payments_v1()
returns table(
  payment_id uuid,
  user_id uuid,
  audience text,
  profile_name text,
  plan_name text,
  plan_code text,
  status text,
  amount numeric,
  provider text,
  provider_payment_id text,
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $function$
begin
  if not public.owner_access_v1() then
    raise exception 'owner access required';
  end if;

  return query
  select
    sp.id,
    sp.user_id,
    p.audience,
    coalesce(a.stage_name,v.trade_name,'Perfil'),
    p.name,
    p.code,
    sp.status,
    sp.amount,
    sp.provider,
    sp.provider_payment_id,
    sp.paid_at,
    sp.refunded_at,
    sp.created_at
  from public.subscription_payments sp
  join public.plans p on p.id=sp.plan_id
  left join public.artist_profiles a on a.id=sp.artist_id
  left join public.venue_profiles v on v.id=sp.venue_id
  order by sp.created_at desc;
end;
$function$;

revoke all on function public.owner_plan_payments_v1() from public,anon;
grant execute on function public.owner_plan_payments_v1() to authenticated;

create or replace function public.notify_subscription_payment_change_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_plan_name text;
  v_title text;
  v_body text;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  select p.name
  into v_plan_name
  from public.plans p
  where p.id=new.plan_id;

  case new.status
    when 'paid' then
      v_title := 'Plano Aura Beat ativado';
      v_body := coalesce(v_plan_name,'Plano') || ' liberado por 1 mês.';
    when 'refunded' then
      v_title := 'Mensalidade estornada';
      v_body := 'O pagamento do plano ' || coalesce(v_plan_name,'Aura Beat') || ' foi estornado.';
    when 'failed' then
      v_title := 'Pagamento da mensalidade não aprovado';
      v_body := 'Gere um novo Pix para ativar o plano.';
    else
      return new;
  end case;

  perform public.create_aura_notification_v1(
    new.user_id,
    'payment',
    v_title,
    v_body,
    case
      when new.artist_id is not null then '/planos-artista'
      else '/planos-casa'
    end
  );

  return new;
end;
$function$;

drop trigger if exists trg_notify_subscription_payment_change_v1
on public.subscription_payments;

create trigger trg_notify_subscription_payment_change_v1
after update of status
on public.subscription_payments
for each row
execute function public.notify_subscription_payment_change_v1();

notify pgrst,'reload schema';
