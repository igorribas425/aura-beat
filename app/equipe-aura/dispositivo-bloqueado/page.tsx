"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

export default function SupportDeviceBlockedPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    try {
      setBusy(true);
      await supabase.auth.signOut();
    } finally {
      router.replace("/login");
    }
  }

  return (
    <main className="aura-page flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-lg rounded-3xl border border-amber-500/25 bg-gradient-to-br from-amber-500/10 via-zinc-950 to-red-500/10 p-6 sm:p-8">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-amber-400/30 bg-amber-400/10 text-3xl">
          🔒
        </div>

        <div className="mt-5 text-center">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">
            EQUIPE AURA
          </p>
          <h1 className="mt-2 text-3xl font-black">
            Dispositivo não autorizado
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Esta conta de trabalho está vinculada ao dispositivo usado no primeiro cadastro.
            Para trocar de computador ou celular, o administrador da Aura Beat precisa
            liberar um novo dispositivo.
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-800 bg-black/30 p-4 text-sm leading-6 text-zinc-400">
          Mesmo com e-mail e senha corretos, outro dispositivo não recebe acesso ao chat
          da Equipe Aura.
        </div>

        <button
          type="button"
          onClick={() => void signOut()}
          disabled={busy}
          className="mt-6 w-full rounded-2xl border border-zinc-700 py-3.5 font-black text-zinc-200 disabled:opacity-50"
        >
          {busy ? "Saindo…" : "Sair desta conta"}
        </button>
      </section>
    </main>
  );
}
