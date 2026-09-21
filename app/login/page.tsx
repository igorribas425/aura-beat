"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAuthenticatedDestination } from "../../lib/auth-navigation";
import { isOwnerEmail } from "../../lib/owner-account";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState("");

  useEffect(() => {
    let active = true;

    async function redirectAuthenticatedUser() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;

        const user = data.session?.user;
        if (!user) return;

        if (isOwnerEmail(user.email)) {
          router.replace("/acesso");
          return;
        }

        const destination = await getAuthenticatedDestination(user.id);
        if (active) router.replace(destination);
      } catch {
        // O formulario de login continua disponivel mesmo se a verificacao falhar.
      }
    }

    void redirectAuthenticatedUser();

    return () => {
      active = false;
    };
  }, [router]);

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

      if (isOwnerEmail(data.user.email)) {
        router.replace("/acesso");
        return;
      }

      const destination = await getAuthenticatedDestination(data.user.id);
      router.replace(destination);
    } catch {
      setMensagem("❌ Ocorreu um erro inesperado.");
      setCarregando(false);
    }
  }

  return (
    <main className="aura-page">
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

        <div className="aura-card rounded-3xl border p-5">
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

        <div className="mt-6 text-center text-xs text-zinc-500">
          <p>Música move pessoas. Aura Beat conecta.</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <Link href="/privacidade" className="hover:text-zinc-300">
              Privacidade
            </Link>
            <Link href="/termos" className="hover:text-zinc-300">
              Termos
            </Link>
            <Link href="/excluir-conta" className="hover:text-zinc-300">
              Exclusão de conta
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
