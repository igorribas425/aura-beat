import { supabase } from "./supabase";

export type AuthenticatedDestination =
  | "/home-artista"
  | "/home-casa"
  | "/perfil-artista"
  | "/perfil-casa"
  | "/equipe-aura";

export async function getAuthenticatedDestination(
  userId: string,
): Promise<AuthenticatedDestination> {
  const [supportResult, profileResult, artistResult, venueResult] = await Promise.all([
    supabase.rpc("support_portal_only_v1"),
    supabase.from("profiles").select("default_mode").eq("id", userId).maybeSingle(),
    supabase.from("artist_profiles").select("id").eq("user_id", userId).maybeSingle(),
    supabase.from("venue_profiles").select("id").eq("owner_user_id", userId).maybeSingle(),
  ]);

  if (supportResult.data === true) return "/equipe-aura";

  const preferredMode = profileResult.data?.default_mode;
  const hasArtist = Boolean(artistResult.data);
  const hasVenue = Boolean(venueResult.data);

  if (preferredMode === "venue") return hasVenue ? "/home-casa" : "/perfil-casa";
  if (preferredMode === "artist") return hasArtist ? "/home-artista" : "/perfil-artista";
  if (hasArtist) return "/home-artista";
  if (hasVenue) return "/home-casa";
  return "/perfil-artista";
}
