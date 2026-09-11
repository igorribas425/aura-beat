"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState("");

  async function entrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setMensagem("");
    setCarregando(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: senha,
      });

      if (error) {
        setMensagem("❌ E-mail ou senha incorretos.");
        setCarregando(false);
        return;
      }

      if (!data.user) {
        setMensagem("❌ Não foi possível entrar.");
        setCarregando(false);
        return;
      }

      const { data: perfil, error: perfilError } = await supabase
        .from("profiles")
        .select("full_name, default_mode")
        .eq("id", data.user.id)
        .single();

      if (perfilError) {
        setMensagem("❌ Não foi possível carregar seu perfil.");
        setCarregando(false);
        return;
      }

      setMensagem(
        `✅ Bem-vindo${perfil?.full_name ? ", " + perfil.full_name : ""}!`
      );

      setTimeout(() => {
        if (perfil?.default_mode === "venue") {
          router.push("/perfil-casa");
        } else {
          router.push("/perfil-artista");
        }
      }, 500);
    } catch {
      setMensagem("❌ Ocorreu um erro inesperado.");
      setCarregando(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050507] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-10">
        
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-red-500 via-red-600 to-purple-700 text-4xl font-black shadow-[0_0_45px_rgba(239,68,68,0.30)]">
            A
          </div>

          <h1 className="text-3xl font-black">
            AURA <span className="text-red-500">BEAT</span>
          </h1>

          <p className="mt-2 text-sm text-zinc-400">
            Conectando talentos aos melhores eventos.
          </p>
        </div>

        <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
          <h2 className="text-2xl font-bold">
            Bem-vindo de volta
          </h2>

          <p className="mt-1 text-sm text-zinc-400">
            Entre na sua conta Aura Beat.
          </p>

          <form onSubmit={entrar} className="mt-6 space-y-4">
            
            <div>
              <label className="mb-2 block text-sm font-medium">
                E-mail
              </label>

              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com"
                required
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none transition focus:border-red-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Senha
              </label>

              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Sua senha"
                required
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none transition focus:border-red-500"
              />
            </div>

            <button
              type="submit"
              disabled={carregando}
              className="w-full rounded-xl bg-red-500 py-4 font-bold transition hover:bg-red-600 disabled:opacity-50"
            >
              {carregando ? "Entrando..." : "Entrar"}
            </button>

            {mensagem && (
              <div className="rounded-xl bg-zinc-900 p-3 text-sm">
                {mensagem}
              </div>
            )}

          </form>

          <button
            type="button"
            onClick={() => router.push("/cadastro")}
            className="mt-4 w-full rounded-xl border border-zinc-800 py-3 text-sm font-medium text-zinc-300 transition hover:bg-zinc-900"
          >
            Ainda não tenho conta
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-500">
          Música move pessoas. Aura Beat conecta.
        </p>

      </div>
    </main>
  );
}
