-- Harden public map storage before production.
-- Location rows are private to the profile owner; public discovery goes through
-- explore_profiles_v1(), which returns snapped/approximate coordinates only.

revoke all on table public.public_profile_locations from anon;

grant select, insert, update, delete
on table public.public_profile_locations
to authenticated;

notify pgrst, 'reload schema';
