"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro("");
    setMensagem("");

    const emailLimpo = email.trim().toLowerCase();
    if (!emailLimpo) {
      setErro("Informe seu e-mail.");
      return;
    }

    try {
      setEnviando(true);

      const redirectTo = `${window.location.origin}/redefinir-senha`;
      const { error } = await supabase.auth.resetPasswordForEmail(emailLimpo, {
        redirectTo,
      });

      if (error) throw error;

      setMensagem(
        "Se existir uma conta com esse e-mail, você receberá um link para redefinir a senha.",
      );
    } catch (cause) {
      console.error(cause);
      setErro("Não foi possível enviar o e-mail de recuperação agora.");
    } finally {
      setEnviando(false);
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
            Recupere o acesso à sua conta.
          </p>
        </div>

        <section className="aura-card rounded-3xl border p-5">
          <h2 className="text-2xl font-bold">Esqueci minha senha</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Digite o e-mail usado no Aura Beat. Enviaremos um link de recuperação.
          </p>

          <form onSubmit={enviar} className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="voce@email.com"
                required
                autoComplete="email"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none transition focus:border-red-500"
              />
            </div>

            {erro && (
              <div className="rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">
                {erro}
              </div>
            )}

            {mensagem && (
              <div className="rounded-xl border border-green-900 bg-green-950/30 p-3 text-sm text-green-300">
                {mensagem}
              </div>
            )}

            <button
              type="submit"
              disabled={enviando}
              className="w-full rounded-xl bg-red-500 py-4 font-bold transition hover:bg-red-600 disabled:opacity-50"
            >
              {enviando ? "Enviando..." : "Enviar link de recuperação"}
            </button>
          </form>

          <Link
            href="/login"
            className="mt-4 block w-full rounded-xl border border-zinc-800 py-3 text-center text-sm font-medium text-zinc-300 transition hover:bg-zinc-900"
          >
            Voltar ao login
          </Link>
        </section>
      </div>
    </main>
  );
}
