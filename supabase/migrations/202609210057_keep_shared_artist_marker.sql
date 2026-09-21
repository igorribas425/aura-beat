-- Keep an Artist marker on the public map while location sharing consent remains enabled.
-- "available_now" still expires after 30 minutes without GPS activity; only the approximate
-- map marker remains until the Artist explicitly disables sharing.

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'public.explore_profiles_v1(text,text,text,text,text,boolean,boolean,numeric,numeric,double precision,double precision,numeric,integer,integer)'::regprocedure
  )
  into function_definition;

  function_definition := regexp_replace(
    function_definition,
    'availability\.is_available\s+and availability\.sharing_consent\s+and availability\.last_seen_at >=\s+now\(\) - interval ''30 minutes''\s+then availability\.current_location',
    'availability.sharing_consent
              and availability.current_location is not null
            then availability.current_location',
    'g'
  );

  execute function_definition;
end;
$$;

notify pgrst, 'reload schema';
