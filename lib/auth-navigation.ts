import { supabase } from "./supabase";
import { isOwnerEmail } from "./owner-account";

export type AuthenticatedDestination =
  | "/admin"
  | "/home-artista"
  | "/home-casa"
  | "/perfil-artista"
  | "/perfil-casa"
  | "/equipe-aura"
  | "/equipe-aura/dispositivo-bloqueado";

export async function getAuthenticatedDestination(
  userId: string,
): Promise<AuthenticatedDestination> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (
    user?.id === userId &&
    isOwnerEmail(user.email)
  ) {
    return "/admin";
  }
  const [ownerAccessResult, supportAccountResult, profileResult, artistResult, venueResult] = await Promise.all([
    supabase.rpc("owner_access_v1"),
    supabase.rpc("is_support_account_v1"),
    supabase.from("profiles").select("default_mode").eq("id", userId).maybeSingle(),
    supabase.from("artist_profiles").select("id").eq("user_id", userId).maybeSingle(),
    supabase.from("venue_profiles").select("id").eq("owner_user_id", userId).maybeSingle(),
  ]);

  if (ownerAccessResult.data === true) {
    return "/admin";
  }

  if (supportAccountResult.data === true) {
    const deviceSecret =
      typeof window !== "undefined"
        ? window.localStorage.getItem("aura_support_device_secret")
        : null;

    if (deviceSecret) {
      await supabase.rpc("support_rebind_device_v1", {
        p_device_secret: deviceSecret,
      });
    }

    const { data: allowed } = await supabase.rpc("support_portal_only_v1");

    return allowed === true
      ? "/equipe-aura"
      : "/equipe-aura/dispositivo-bloqueado";
  }

  const preferredMode = profileResult.data?.default_mode;
  const hasArtist = Boolean(artistResult.data);
  const hasVenue = Boolean(venueResult.data);

  if (preferredMode === "venue") return hasVenue ? "/home-casa" : "/perfil-casa";
  if (preferredMode === "artist") return hasArtist ? "/home-artista" : "/perfil-artista";
  if (hasArtist) return "/home-artista";
  if (hasVenue) return "/home-casa";
  return "/perfil-artista";
}
