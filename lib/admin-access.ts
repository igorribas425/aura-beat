import { isOwnerEmail } from "./owner-account";
import { supabase } from "./supabase";

export type OwnerAccessResult = {
  authenticated: boolean;
  allowed: boolean;
  email: string;
};

export async function getOwnerAccessFast(): Promise<OwnerAccessResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

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
