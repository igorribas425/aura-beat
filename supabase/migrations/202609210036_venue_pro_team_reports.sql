-- 2026-09-21
-- Beneficios reais da Casa: Relatorios (Intermediario/Pro) e Equipe (Pro).

create or replace function public.venue_has_active_plan_benefit_v1(
  p_venue_id uuid,
  p_benefit text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select exists (
    select 1
    from public.subscriptions s
    join public.plans p on p.id=s.plan_id
    where s.venue_id=p_venue_id
      and s.status in ('active','trialing')
      and (s.current_period_end is null or s.current_period_end>now())
      and (
        s.status<>'trialing'
        or s.trial_ends_at is null
        or s.trial_ends_at>now()
      )
      and p.is_active=true
      and p.audience='venue'
      and p.benefits -> p_benefit = 'true'::jsonb
  );
$function$;

revoke all on function public.venue_has_active_plan_benefit_v1(uuid,text)
from public,anon,authenticated;

create or replace function public.is_venue_member(p_venue_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select exists (
    select 1
    from public.venue_team vt
    where vt.venue_id=p_venue_id
      and vt.user_id=auth.uid()
      and (
        vt.role='owner'
        or public.venue_has_active_plan_benefit_v1(p_venue_id,'team')
      )
  );
$function$;

revoke all on function public.is_venue_member(uuid) from public;
grant execute on function public.is_venue_member(uuid) to anon,authenticated;

create or replace function public.venue_team_list_v1()
returns table(
  venue_id uuid,
  user_id uuid,
  full_name text,
  email text,
  avatar_url text,
  role text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_venue_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select v.id into v_venue_id
  from public.venue_profiles v
  where v.owner_user_id=auth.uid()
    and coalesce(v.is_active,true)=true
  order by v.created_at desc
  limit 1;

  if v_venue_id is null then
    raise exception 'Casa não encontrada';
  end if;

  return query
  select
    vt.venue_id,
    vt.user_id,
    p.full_name,
    u.email::text,
    p.avatar_url,
    vt.role,
    vt.created_at
  from public.venue_team vt
  left join public.profiles p on p.id=vt.user_id
  left join auth.users u on u.id=vt.user_id
  where vt.venue_id=v_venue_id
  order by
    case vt.role when 'owner' then 0 when 'manager' then 1 when 'producer' then 2 else 3 end,
    vt.created_at;
end;
$function$;

revoke all on function public.venue_team_list_v1()
from public,anon;
grant execute on function public.venue_team_list_v1()
to authenticated;

create or replace function public.venue_team_add_by_email_v1(
  p_email text,
  p_role text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_venue_id uuid;
  v_user_id uuid;
  v_email text := lower(trim(coalesce(p_email,'')));
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_role not in ('manager','finance','producer') then
    raise exception 'Função inválida';
  end if;

  select v.id into v_venue_id
  from public.venue_profiles v
  where v.owner_user_id=auth.uid()
    and coalesce(v.is_active,true)=true
  order by v.created_at desc
  limit 1;

  if v_venue_id is null then
    raise exception 'Casa não encontrada';
  end if;

  if not public.venue_has_active_plan_benefit_v1(v_venue_id,'team') then
    raise exception 'Gestão de equipe é um recurso do plano Pro';
  end if;

  if v_email='' then
    raise exception 'Informe o e-mail';
  end if;

  select u.id into v_user_id
  from auth.users u
  where lower(u.email)=v_email
  limit 1;

  if v_user_id is null then
    raise exception 'Usuário não encontrado no Aura Beat';
  end if;

  if v_user_id=auth.uid() then
    raise exception 'O proprietário já faz parte da equipe';
  end if;

  if not exists (
    select 1 from public.profiles p where p.id=v_user_id
  ) then
    raise exception 'Este usuário ainda não possui perfil no Aura Beat';
  end if;

  insert into public.venue_team(venue_id,user_id,role)
  values(v_venue_id,v_user_id,p_role)
  on conflict(venue_id,user_id)
  do update set role=excluded.role;

  return v_user_id;
end;
$function$;

revoke all on function public.venue_team_add_by_email_v1(text,text)
from public,anon;
grant execute on function public.venue_team_add_by_email_v1(text,text)
to authenticated;

create or replace function public.venue_team_update_role_v1(
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_venue_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_role not in ('manager','finance','producer') then
    raise exception 'Função inválida';
  end if;

  select v.id into v_venue_id
  from public.venue_profiles v
  where v.owner_user_id=auth.uid()
    and coalesce(v.is_active,true)=true
  order by v.created_at desc
  limit 1;

  if v_venue_id is null then
    raise exception 'Casa não encontrada';
  end if;

  if not public.venue_has_active_plan_benefit_v1(v_venue_id,'team') then
    raise exception 'Gestão de equipe é um recurso do plano Pro';
  end if;

  update public.venue_team
  set role=p_role
  where venue_id=v_venue_id
    and user_id=p_user_id
    and role<>'owner';

  if not found then
    raise exception 'Membro não encontrado ou proprietário protegido';
  end if;
end;
$function$;

revoke all on function public.venue_team_update_role_v1(uuid,text)
from public,anon;
grant execute on function public.venue_team_update_role_v1(uuid,text)
to authenticated;

create or replace function public.venue_team_remove_v1(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_venue_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select v.id into v_venue_id
  from public.venue_profiles v
  where v.owner_user_id=auth.uid()
    and coalesce(v.is_active,true)=true
  order by v.created_at desc
  limit 1;

  if v_venue_id is null then
    raise exception 'Casa não encontrada';
  end if;

  delete from public.venue_team
  where venue_id=v_venue_id
    and user_id=p_user_id
    and role<>'owner';

  if not found then
    raise exception 'Membro não encontrado ou proprietário protegido';
  end if;
end;
$function$;

revoke all on function public.venue_team_remove_v1(uuid)
from public,anon;
grant execute on function public.venue_team_remove_v1(uuid)
to authenticated;

create or replace function public.venue_reports_v1(
  p_days integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_venue_id uuid;
  v_days integer := greatest(7,least(coalesce(p_days,30),365));
  v_start timestamptz;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select v.id into v_venue_id
  from public.venue_profiles v
  where v.owner_user_id=auth.uid()
    and coalesce(v.is_active,true)=true
  order by v.created_at desc
  limit 1;

  if v_venue_id is null then
    raise exception 'Casa não encontrada';
  end if;

  if not public.venue_has_active_plan_benefit_v1(v_venue_id,'reports') then
    raise exception 'Relatórios avançados exigem plano Intermediário ou Pro';
  end if;

  v_start := now() - make_interval(days=>v_days);

  with period_bookings as (
    select b.*
    from public.bookings b
    where b.venue_id=v_venue_id
      and b.created_at>=v_start
  ),
  top_artists as (
    select
      b.artist_id,
      a.stage_name,
      count(*)::int as bookings_count,
      coalesce(sum(
        b.agreed_fee +
        coalesce(b.travel_amount,0) +
        coalesce(b.toll_amount,0) +
        coalesce(b.lodging_amount,0)
      ),0)::numeric as contracted_value
    from period_bookings b
    join public.artist_profiles a on a.id=b.artist_id
    where b.status<>'cancelled'
    group by b.artist_id,a.stage_name
    order by bookings_count desc,contracted_value desc
    limit 5
  )
  select jsonb_build_object(
    'period_days',v_days,
    'period_start',v_start,
    'total_bookings',(select count(*) from period_bookings),
    'completed_bookings',(select count(*) from period_bookings where status='completed'),
    'cancelled_bookings',(select count(*) from period_bookings where status='cancelled'),
    'active_bookings',(select count(*) from period_bookings where status in ('confirmed','in_transit','arrived','in_event')),
    'awaiting_payment',(select count(*) from period_bookings where status='awaiting_payment'),
    'contracted_value',coalesce((
      select sum(
        agreed_fee +
        coalesce(travel_amount,0) +
        coalesce(toll_amount,0) +
        coalesce(lodging_amount,0)
      )
      from period_bookings
      where status<>'cancelled'
    ),0),
    'average_contract_value',coalesce((
      select avg(
        agreed_fee +
        coalesce(travel_amount,0) +
        coalesce(toll_amount,0) +
        coalesce(lodging_amount,0)
      )
      from period_bookings
      where status<>'cancelled'
    ),0),
    'upcoming_events',(
      select count(*)
      from public.bookings b
      where b.venue_id=v_venue_id
        and b.starts_at>now()
        and b.status in ('confirmed','awaiting_payment')
    ),
    'top_artists',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'artist_id',artist_id,
          'stage_name',stage_name,
          'bookings_count',bookings_count,
          'contracted_value',contracted_value
        )
        order by bookings_count desc,contracted_value desc
      )
      from top_artists
    ),'[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$function$;

revoke all on function public.venue_reports_v1(integer)
from public,anon;
grant execute on function public.venue_reports_v1(integer)
to authenticated;

revoke insert,update,delete,truncate,references,trigger
on public.venue_team
from anon,authenticated;

grant select on public.venue_team to authenticated;

notify pgrst,'reload schema';
