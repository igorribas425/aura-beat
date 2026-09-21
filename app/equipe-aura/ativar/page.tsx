"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

function errorMessage(caught: unknown, fallback: string) {
  if (caught instanceof Error && caught.message) return caught.message;

  if (
    typeof caught === "object" &&
    caught !== null &&
    "message" in caught &&
    typeof (caught as { message?: unknown }).message === "string"
  ) {
    return (caught as { message: string }).message;
  }

  return fallback;
}

export default function ActivateAuraTeamInvitePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function init() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!active) return;

        const user = session?.user;

        if (!user) {
          setError(
            "Este link não está mais autenticado. Abra novamente o convite recebido no seu e-mail.",
          );
          return;
        }

        setEmail(user.email || "");
        setName(
          typeof user.user_metadata?.full_name === "string"
            ? user.user_metadata.full_name
            : "",
        );
      } catch (caught) {
        if (active) {
          setError(errorMessage(caught, "Não foi possível validar o convite."));
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void init();

    return () => {
      active = false;
    };
  }, []);

  async function activate(event: FormEvent) {
    event.preventDefault();

    if (name.trim().length < 2) {
      setError("Informe seu nome.");
      return;
    }

    if (password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    try {
      setBusy(true);
      setError("");

      const { error: passwordError } = await supabase.auth.updateUser({
        password,
        data: {
          full_name: name.trim(),
        },
      });

      if (passwordError) throw passwordError;

      const { error: acceptError } = await supabase.rpc(
        "support_accept_invite_v1",
        {
          p_full_name: name.trim(),
        },
      );

      if (acceptError) throw acceptError;

      router.replace("/equipe-aura");
    } catch (caught) {
      setError(
        errorMessage(
          caught,
          "Não foi possível concluir seu acesso à Equipe Aura.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="aura-page flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-lg rounded-3xl border border-cyan-500/25 bg-gradient-to-br from-cyan-500/10 via-zinc-950 to-purple-500/10 p-6 sm:p-8">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-3xl">
          🎧
        </div>

        <div className="mt-5 text-center">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">
            EQUIPE AURA
          </p>
          <h1 className="mt-2 text-3xl font-black">
            Criar acesso de trabalho
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Este acesso serve somente para o chat do Suporte Aura. Ele não libera
            Financeiro, Planos, Verificações ou a Central Administrativa.
          </p>
        </div>

        {loading ? (
          <div className="mt-8 text-center text-sm text-zinc-500">
            Validando convite…
          </div>
        ) : error && !email ? (
          <div className="mt-8 rounded-2xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
            {error}
          </div>
        ) : (
          <form onSubmit={activate} className="mt-8 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                E-mail convidado
              </label>
              <input
                value={email}
                readOnly
                className="w-full rounded-2xl border border-zinc-800 bg-black/40 px-4 py-3.5 text-zinc-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Seu nome
              </label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Nome do atendente"
                required
                autoComplete="name"
                className="w-full rounded-2xl border border-zinc-800 bg-black px-4 py-3.5 text-white outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Crie sua senha
              </label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Mínimo 6 caracteres"
                minLength={6}
                required
                autoComplete="new-password"
                className="w-full rounded-2xl border border-zinc-800 bg-black px-4 py-3.5 text-white outline-none focus:border-cyan-400"
              />
            </div>

            {error && (
              <div className="rounded-2xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-2xl bg-cyan-400 py-4 font-black text-black disabled:opacity-50"
            >
              {busy ? "Criando acesso…" : "Entrar para a Equipe Aura"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
