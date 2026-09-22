-- Aura Beat 2026-09-22
-- Final hardening for launch verification gates.
-- Keeps verified-only business features enforced even if a user bypasses the UI.

create or replace function public.start_direct_conversation_v2(
  p_source_kind text,
  p_target_kind text,
  p_target_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_me uuid := auth.uid();
  v_target_user uuid;
  v_user_a uuid;
  v_user_b uuid;
  v_kind_a text;
  v_kind_b text;
  v_conversation_id uuid;
begin
  if v_me is null then
    raise exception 'authentication required';
  end if;

  if p_source_kind not in ('artist','venue')
     or p_target_kind not in ('artist','venue') then
    raise exception 'invalid profile kind';
  end if;

  if p_source_kind = p_target_kind then
    raise exception 'direct chat must be between Artist and Casa';
  end if;

  if p_source_kind='artist' then
    if not exists (
      select 1
      from public.artist_profiles a
      where a.user_id=v_me
        and coalesce(a.is_active,true)=true
        and a.verification_status='verified'
    ) then
      raise exception 'verified artist profile required';
    end if;
  else
    if not exists (
      select 1
      from public.venue_profiles v
      where v.owner_user_id=v_me
        and coalesce(v.is_active,true)=true
        and v.verification_status='verified'
    ) then
      raise exception 'verified venue profile required';
    end if;
  end if;

  if p_target_kind='artist' then
    select a.user_id
    into v_target_user
    from public.artist_profiles a
    where a.id=p_target_profile_id
      and coalesce(a.is_active,true)=true
      and a.verification_status='verified';
  else
    select v.owner_user_id
    into v_target_user
    from public.venue_profiles v
    where v.id=p_target_profile_id
      and coalesce(v.is_active,true)=true
      and v.verification_status='verified';
  end if;

  if v_target_user is null then
    raise exception 'verified target profile not found';
  end if;

  if v_target_user=v_me then
    raise exception 'cannot message your own profile';
  end if;

  if v_me::text < v_target_user::text then
    v_user_a:=v_me;
    v_user_b:=v_target_user;
    v_kind_a:=p_source_kind;
    v_kind_b:=p_target_kind;
  else
    v_user_a:=v_target_user;
    v_user_b:=v_me;
    v_kind_a:=p_target_kind;
    v_kind_b:=p_source_kind;
  end if;

  select c.id
  into v_conversation_id
  from public.direct_conversations c
  where c.user_a=v_user_a
    and c.user_b=v_user_b;

  if v_conversation_id is null then
    insert into public.direct_conversations(
      user_a,user_b,user_a_kind,user_b_kind
    )
    values(
      v_user_a,v_user_b,v_kind_a,v_kind_b
    )
    returning id into v_conversation_id;
  else
    update public.direct_conversations
    set
      user_a_kind=v_kind_a,
      user_b_kind=v_kind_b,
      updated_at=now()
    where id=v_conversation_id;
  end if;

  return v_conversation_id;
end;
$function$;

revoke all on function public.start_direct_conversation_v2(text,text,uuid)
from public,anon;
grant execute on function public.start_direct_conversation_v2(text,text,uuid)
to authenticated;

drop policy if exists direct_messages_verified_participants_insert
on public.direct_messages;

create policy direct_messages_verified_participants_insert
on public.direct_messages
as restrictive
for insert
to authenticated
with check (
  exists (
    select 1
    from public.direct_conversations c
    where c.id=conversation_id
      and (
        (
          c.user_a_kind='artist'
          and exists (
            select 1
            from public.artist_profiles a
            where a.user_id=c.user_a
              and coalesce(a.is_active,true)=true
              and a.verification_status='verified'
          )
        )
        or (
          c.user_a_kind='venue'
          and exists (
            select 1
            from public.venue_profiles v
            where v.owner_user_id=c.user_a
              and coalesce(v.is_active,true)=true
              and v.verification_status='verified'
          )
        )
      )
      and (
        (
          c.user_b_kind='artist'
          and exists (
            select 1
            from public.artist_profiles a
            where a.user_id=c.user_b
              and coalesce(a.is_active,true)=true
              and a.verification_status='verified'
          )
        )
        or (
          c.user_b_kind='venue'
          and exists (
            select 1
            from public.venue_profiles v
            where v.owner_user_id=c.user_b
              and coalesce(v.is_active,true)=true
              and v.verification_status='verified'
          )
        )
      )
  )
);

drop policy if exists offers_verified_feature_insert
on public.offers;

create policy offers_verified_feature_insert
on public.offers
as restrictive
for insert
to authenticated
with check (
  public.is_admin()
  or exists (
    select 1
    from public.venue_profiles v
    where v.id=venue_id
      and coalesce(v.is_active,true)=true
      and v.verification_status='verified'
  )
);

drop policy if exists offers_verified_feature_update
on public.offers;

create policy offers_verified_feature_update
on public.offers
as restrictive
for update
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.venue_profiles v
    where v.id=venue_id
      and coalesce(v.is_active,true)=true
      and v.verification_status='verified'
  )
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.venue_profiles v
    where v.id=venue_id
      and coalesce(v.is_active,true)=true
      and v.verification_status='verified'
  )
);

drop policy if exists offer_responses_verified_feature_insert
on public.offer_responses;

create policy offer_responses_verified_feature_insert
on public.offer_responses
as restrictive
for insert
to authenticated
with check (
  public.is_admin()
  or (
    exists (
      select 1
      from public.artist_profiles a
      where a.id=artist_id
        and coalesce(a.is_active,true)=true
        and a.verification_status='verified'
    )
    and exists (
      select 1
      from public.offers o
      join public.venue_profiles v on v.id=o.venue_id
      where o.id=offer_id
        and coalesce(v.is_active,true)=true
        and v.verification_status='verified'
    )
  )
);

drop policy if exists offer_responses_verified_feature_update
on public.offer_responses;

create policy offer_responses_verified_feature_update
on public.offer_responses
as restrictive
for update
to authenticated
using (
  public.is_admin()
  or (
    exists (
      select 1
      from public.artist_profiles a
      where a.id=artist_id
        and coalesce(a.is_active,true)=true
        and a.verification_status='verified'
    )
    and exists (
      select 1
      from public.offers o
      join public.venue_profiles v on v.id=o.venue_id
      where o.id=offer_id
        and coalesce(v.is_active,true)=true
        and v.verification_status='verified'
    )
  )
)
with check (
  public.is_admin()
  or (
    exists (
      select 1
      from public.artist_profiles a
      where a.id=artist_id
        and coalesce(a.is_active,true)=true
        and a.verification_status='verified'
    )
    and exists (
      select 1
      from public.offers o
      join public.venue_profiles v on v.id=o.venue_id
      where o.id=offer_id
        and coalesce(v.is_active,true)=true
        and v.verification_status='verified'
    )
  )
);

notify pgrst,'reload schema';
