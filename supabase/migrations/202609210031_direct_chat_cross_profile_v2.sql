-- 2026-09-21
-- Chat Direto v2: explicit source profile kind and cross-profile validation.

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
    ) then
      raise exception 'artist profile required';
    end if;
  else
    if not exists (
      select 1
      from public.venue_profiles v
      where v.owner_user_id=v_me
        and coalesce(v.is_active,true)=true
    ) then
      raise exception 'venue profile required';
    end if;
  end if;

  if p_target_kind='artist' then
    select a.user_id
    into v_target_user
    from public.artist_profiles a
    where a.id=p_target_profile_id
      and coalesce(a.is_active,true)=true;
  else
    select v.owner_user_id
    into v_target_user
    from public.venue_profiles v
    where v.id=p_target_profile_id
      and coalesce(v.is_active,true)=true;
  end if;

  if v_target_user is null then
    raise exception 'target profile not found';
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

notify pgrst,'reload schema';
