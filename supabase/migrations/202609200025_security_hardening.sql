-- Aura Beat 2026-09-20
-- Security hardening that is safe for current frontend behavior.
-- PostGIS itself is intentionally left in public to avoid breaking map/location.

alter view public.v_artist_ratings set (security_invoker=true);
alter view public.v_booking_totals set (security_invoker=true);

revoke select on public.v_booking_totals from anon;
grant select on public.v_booking_totals to authenticated;

alter function public.set_updated_at() set search_path='';
alter function public.calculate_aura_fees(numeric) set search_path='';
alter function public.preencher_lat_lng_tracking() set search_path='public';
alter function public.preencher_coordenadas_evento_booking() set search_path='public';

-- SECURITY DEFINER functions used only as trigger entry points are not RPC endpoints.
do $$
declare r record;
begin
  for r in
    select distinct p.oid
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    join pg_trigger t on t.tgfoid=p.oid and not t.tgisinternal
    where n.nspname='public'
      and p.prosecdef
      and not exists (
        select 1
        from pg_depend d
        join pg_extension e on e.oid=d.refobjid
        where d.classid='pg_proc'::regclass
          and d.objid=p.oid
          and d.deptype='e'
      )
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated',
      r.oid::regprocedure
    );
  end loop;
end $$;

-- RPCs intentionally called by the authenticated Aura Beat frontend.
do $$
declare r record;
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname=any(array[
        'admin_review_verification',
        'artist_travel_quote_v1',
        'explore_profiles_v1',
        'find_available_artists',
        'get_admin_finance',
        'get_artist_finance',
        'get_venue_finance',
        'mark_conversation_read',
        'mark_direct_conversation_read_v1',
        'responder_solicitacao_oferta_artista',
        'set_public_profile_location_v1',
        'start_direct_conversation_v1',
        'submit_review'
      ])
      and not exists (
        select 1
        from pg_depend d
        join pg_extension e on e.oid=d.refobjid
        where d.classid='pg_proc'::regclass
          and d.objid=p.oid
          and d.deptype='e'
      )
  loop
    execute format('revoke all on function %s from public, anon',r.oid::regprocedure);
    execute format('grant execute on function %s to authenticated',r.oid::regprocedure);
  end loop;
end $$;

notify pgrst,'reload schema';
