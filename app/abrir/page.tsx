"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAuthenticatedDestination } from "../../lib/auth-navigation";
import { supabase } from "../../lib/supabase";

export default function AbrirAuraBeatPage() {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    async function encaminhar() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!active) return;

        if (!session?.user) {
          router.replace("/login");
          return;
        }

        const destination = await getAuthenticatedDestination(session.user.id);

        if (active) {
          router.replace(destination);
        }
      } catch {
        if (active) {
          router.replace("/login");
        }
      }
    }

    void encaminhar();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="aura-page flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-zinc-800 border-t-red-500" />
        <p className="text-sm text-zinc-400">Abrindo Aura Beat...</p>
      </div>
    </main>
  );
}
