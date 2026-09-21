"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isOwnerEmail } from "../../lib/owner-account";
import { supabase } from "../../lib/supabase";

export default function EscolherAcessoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [artistName, setArtistName] = useState("DJ Oliveira");

  useEffect(() => {
    let active = true;

    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) return;

      if (!session?.user) {
        router.replace("/login");
        return;
      }

      if (!isOwnerEmail(session.user.email)) {
        router.replace("/home-artista");
        return;
      }

      const { data: artist } = await supabase
        .from("artist_profiles")
        .select("stage_name")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!active) return;

      if (artist?.stage_name) {
        setArtistName(artist.stage_name);
      }

      setLoading(false);
    }

    void load();

    return () => {
      active = false;
    };
  }, [router]);

  async function sair() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return (
      <main className="aura-page flex min-h-screen items-center justify-center text-zinc-400">
        Preparando seus acessos…
      </main>
    );
  }

  return (
    <main className="aura-page min-h-screen px-4 py-10">
      <div className="mx-auto flex min-h-[80vh] max-w-4xl items-center justify-center">
        <section className="w-full rounded-3xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-red-400">
            AURA BEAT
          </p>

          <h1 className="mt-2 text-3xl font-black">
            Como você quer entrar?
          </h1>

          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Sua conta é proprietária do Aura Beat e também possui um perfil de DJ.
            Você pode usar os dois acessos com o mesmo e-mail.
          </p>

          <div className="mt-7 grid gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={() => router.push("/admin")}
              className="rounded-3xl border border-red-500/30 bg-red-500/10 p-6 text-left transition hover:border-red-400 hover:bg-red-500/15"
            >
              <p className="text-xs font-black uppercase tracking-[0.18em] text-red-300">
                PROPRIETÁRIO
              </p>
              <h2 className="mt-2 text-2xl font-black">
                Central Administrativa
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Financeiro, verificações, planos, suporte, equipe e segurança.
              </p>
            </button>

            <button
              type="button"
              onClick={() => router.push("/home-artista")}
              className="rounded-3xl border border-purple-500/30 bg-purple-500/10 p-6 text-left transition hover:border-purple-400 hover:bg-purple-500/15"
            >
              <p className="text-xs font-black uppercase tracking-[0.18em] text-purple-300">
                MODO ARTISTA
              </p>
              <h2 className="mt-2 text-2xl font-black">
                {artistName}
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Use o Aura Beat como DJ: explorar, ofertas, eventos, chat, agenda e perfil.
              </p>
            </button>
          </div>

          <button
            type="button"
            onClick={() => void sair()}
            className="mt-6 text-sm font-bold text-zinc-500 hover:text-white"
          >
            Sair da conta
          </button>
        </section>
      </div>
    </main>
  );
}
