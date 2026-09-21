"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuthenticatedDestination } from "../../../lib/auth-navigation";
import { supabase } from "../../../lib/supabase";

function createDeviceSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function deviceLabel() {
  if (typeof navigator === "undefined") return "Dispositivo da Equipe Aura";

  const platform = navigator.platform || "Dispositivo";
  const agent = navigator.userAgent || "Navegador";
  const browser = agent.includes("Edg/")
    ? "Edge"
    : agent.includes("Chrome/")
      ? "Chrome"
      : agent.includes("Firefox/")
        ? "Firefox"
        : agent.includes("Safari/")
          ? "Safari"
          : "Navegador";

  return platform + " · " + browser;
}

function isSamePasswordError(caught: unknown) {
  if (
    typeof caught === "object" &&
    caught !== null &&
    "code" in caught &&
    (caught as { code?: unknown }).code === "same_password"
  ) {
    return true;
  }

  const message = errorMessage(caught, "").toLowerCase();
  return (
    message.includes("new password should be different from the old password") ||
    message.includes("new password should be different from old password")
  );
}

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

        const { data: supportAccount } = await supabase.rpc(
          "is_support_account_v1",
        );

        if (!active) return;

        if (supportAccount === true) {
          const destination = await getAuthenticatedDestination(user.id);
          router.replace(destination);
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
  }, [router]);

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

      const { error: profileError } = await supabase.auth.updateUser({
        data: {
          full_name: name.trim(),
        },
      });

      if (profileError) throw profileError;

      const { error: passwordError } = await supabase.auth.updateUser({
        password,
      });

      // Se esta conta já existia e a pessoa digitou a senha que já usa,
      // o Supabase rejeita a "troca" por ser igual. Para o convite da
      // Equipe Aura isso é válido: mantemos a senha existente e seguimos.
      if (passwordError && !isSamePasswordError(passwordError)) {
        throw passwordError;
      }

      const secret = createDeviceSecret();

      const { error: acceptError } = await supabase.rpc(
        "support_accept_invite_v2",
        {
          p_full_name: name.trim(),
          p_device_label: deviceLabel(),
          p_device_secret: secret,
        },
      );

      if (acceptError) throw acceptError;

      window.localStorage.setItem("aura_support_device_secret", secret);
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
            Este acesso serve somente para o chat do Suporte Aura. Ao concluir,
            este navegador será registrado como o dispositivo de trabalho. Outro
            dispositivo não conseguirá acessar o suporte sem liberação do administrador.
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
                Senha de acesso
              </label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Use sua senha atual ou crie uma nova"
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
