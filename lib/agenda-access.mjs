// @ts-check

/**
 * @typedef {{ id: string, stage_name: string }} AgendaArtist
 */

/**
 * @typedef {{
 *   loadActiveMode: () => Promise<string | null | undefined>,
 *   loadArtist: () => Promise<AgendaArtist | null>
 * }} AgendaAccessLoaders
 */

/**
 * @param {AgendaAccessLoaders} loaders
 * @returns {Promise<
 *   | { kind: "artist", artist: AgendaArtist }
 *   | { kind: "redirect", href: "/eventos-casa" | "/perfil-artista" }
 * >}
 */
export async function resolveAgendaAccess({
  loadActiveMode,
  loadArtist,
}) {
  const activeMode = await loadActiveMode();

  if (activeMode === "venue") {
    return {
      kind: "redirect",
      href: "/eventos-casa",
    };
  }

  const artist = await loadArtist();

  if (!artist) {
    return {
      kind: "redirect",
      href: "/perfil-artista",
    };
  }

  return {
    kind: "artist",
    artist,
  };
}
