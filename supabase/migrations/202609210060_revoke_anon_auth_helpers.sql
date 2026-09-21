revoke execute on function public.has_verified_venue_membership() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_aura_admin(text[]) from anon;
revoke execute on function public.is_venue_member(uuid) from public, anon;
revoke execute on function public.is_venue_owner(uuid) from public, anon;
revoke execute on function public.owns_artist(uuid) from public, anon;

grant execute on function public.has_verified_venue_membership() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_aura_admin(text[]) to authenticated, service_role;
grant execute on function public.is_venue_member(uuid) to authenticated, service_role;
grant execute on function public.is_venue_owner(uuid) to authenticated, service_role;
grant execute on function public.owns_artist(uuid) to authenticated, service_role;
