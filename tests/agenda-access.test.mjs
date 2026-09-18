import assert from "node:assert/strict";
import test from "node:test";

import { resolveAgendaAccess } from "../lib/agenda-access.mjs";

test("redirects Casa to its events without loading an artist profile", async () => {
  let artistLoads = 0;

  const result = await resolveAgendaAccess({
    loadActiveMode: async () => "venue",
    loadArtist: async () => {
      artistLoads += 1;
      return { id: "artist-1", stage_name: "DJ Oliveira" };
    },
  });

  assert.deepEqual(result, {
    kind: "redirect",
    href: "/eventos-casa",
  });
  assert.equal(artistLoads, 0);
});

test("loads the artist agenda context in Artista mode", async () => {
  const artist = { id: "artist-1", stage_name: "DJ Oliveira" };

  const result = await resolveAgendaAccess({
    loadActiveMode: async () => "artist",
    loadArtist: async () => artist,
  });

  assert.deepEqual(result, {
    kind: "artist",
    artist,
  });
});

test("redirects Artista to profile creation when no artist profile exists", async () => {
  const result = await resolveAgendaAccess({
    loadActiveMode: async () => "artist",
    loadArtist: async () => null,
  });

  assert.deepEqual(result, {
    kind: "redirect",
    href: "/perfil-artista",
  });
});
