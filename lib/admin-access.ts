import { isOwnerEmail } from "./owner-account";
import { supabase } from "./supabase";

export type OwnerAccessResult = {
  authenticated: boolean;
  allowed: boolean;
  email: string;
};

export async function ensureFreshSession() {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    return null;
  }

  // Admin pages use protected RPCs. Always rotate the access token before
  // entering the Admin so a stale browser JWT never reaches Supabase.
  const {
    data: refreshed,
    error: refreshError,
  } = await supabase.auth.refreshSession();

  if (!refreshError && refreshed.session) {
    return refreshed.session;
  }

  // If refresh failed but the current token is still accepted, keep it.
  const {
    data: userData,
    error: userError,
  } = await supabase.auth.getUser(
    session.access_token,
  );

  if (!userError && userData.user) {
    return session;
  }

  await supabase.auth.signOut({
    scope: "local",
  });

  return null;
}

export async function getOwnerAccessFast(): Promise<OwnerAccessResult> {
  const session =
    await ensureFreshSession();

  const user = session?.user;

  if (!user) {
    return {
      authenticated: false,
      allowed: false,
      email: "",
    };
  }

  const email = user.email || "";

  if (isOwnerEmail(email)) {
    return {
      authenticated: true,
      allowed: true,
      email,
    };
  }

  try {
    const result = await Promise.race([
      supabase.rpc("owner_access_v1"),
      new Promise<{
        data: boolean | null;
        error: Error;
      }>((resolve) => {
        window.setTimeout(() => {
          resolve({
            data: null,
            error: new Error(
              "Tempo limite ao verificar acesso administrativo.",
            ),
          });
        }, 5000);
      }),
    ]);

    return {
      authenticated: true,
      allowed:
        !result.error &&
        result.data === true,
      email,
    };
  } catch {
    return {
      authenticated: true,
      allowed: false,
      email,
    };
  }
}

export function isJwtExpiredError(
  error: unknown,
) {
  if (!error) return false;

  const text =
    error instanceof Error
      ? error.message
      : typeof error === "object" &&
          error !== null &&
          "message" in error
        ? String(
            (error as {
              message?: unknown;
            }).message || "",
          )
        : String(error);

  return /jwt.*expired|expired.*jwt/i.test(
    text,
  );
}
