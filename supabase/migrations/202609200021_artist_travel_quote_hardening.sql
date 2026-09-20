revoke execute on function public.artist_travel_quote_v1(uuid,double precision,double precision) from anon;
revoke all on function public.artist_travel_quote_v1(uuid,double precision,double precision) from public;
grant execute on function public.artist_travel_quote_v1(uuid,double precision,double precision) to authenticated;
