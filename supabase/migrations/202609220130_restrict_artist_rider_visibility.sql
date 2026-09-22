-- Rider tecnico do Artista:
-- o proprio Artista, administradores e membros de Casas verificadas podem consultar.
-- Outros Artistas nao recebem acesso aos dados de producao/hospitalidade.

drop policy if exists "artist_riders_select_auth" on public.artist_riders;

create policy "artist_riders_select_visible"
on public.artist_riders
for select
to authenticated
using (
  public.owns_artist(artist_id)
  or public.is_admin()
  or public.has_verified_venue_membership()
);
