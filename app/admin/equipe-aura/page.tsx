"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

type SupportAgent = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: "support";
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function initials(value: string) {
  return (
    value
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "AU"
  );
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function errorMessage(caught: unknown, fallback: string) {
  if (caught instanceof Error && caught.message) {
    return caught.message;
  }

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

export default function AdminAuraTeamPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<SupportAgent[]>([]);
  const [email, setEmail] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();

    if (!term) return agents;

    return agents.filter((agent) =>
      [agent.full_name, agent.email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [agents, query]);

  async function loadAgents() {
    const { data, error: listError } = await supabase.rpc(
      "owner_support_team_list_v1",
    );

    if (listError) throw listError;

    setAgents((data || []) as SupportAgent[]);
  }

  useEffect(() => {
    let active = true;

    async function init() {
      try {
        setLoading(true);
        setError("");

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.replace("/login");
          return;
        }

        const { data: allowed, error: accessError } = await supabase.rpc(
          "owner_access_v1",
        );

        if (accessError) throw accessError;

        if (allowed !== true) {
          router.replace("/home");
          return;
        }

        await loadAgents();
      } catch (caught) {
        console.error(caught);

        if (active) {
          setError(
            errorMessage(caught, "Não foi possível carregar a Equipe Aura."),
          );
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

  async function addAgent(event: FormEvent) {
    event.preventDefault();

    if (!email.trim()) {
      setError("Informe o e-mail da pessoa.");
      return;
    }

    try {
      setBusy("add");
      setError("");
      setMessage("");

      const { error: addError } = await supabase.rpc(
        "owner_support_team_add_v1",
        {
          p_email: email.trim(),
        },
      );

      if (addError) throw addError;

      setEmail("");
      setMessage("Atendente adicionado com acesso somente ao Suporte Aura.");
      await loadAgents();
    } catch (caught) {
      console.error(caught);

      setError(
        errorMessage(caught, "Não foi possível adicionar o atendente."),
      );
    } finally {
      setBusy("");
    }
  }

  async function setActive(agent: SupportAgent, nextActive: boolean) {
    const name = agent.full_name || agent.email || "este atendente";

    const confirmMessage = nextActive
      ? "Reativar o acesso de " + name + "?"
      : "Suspender o acesso de " + name + "?";

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      setBusy(agent.user_id);
      setError("");
      setMessage("");

      const { error: updateError } = await supabase.rpc(
        "owner_support_team_set_active_v1",
        {
          p_user_id: agent.user_id,
          p_is_active: nextActive,
        },
      );

      if (updateError) throw updateError;

      setMessage(
        nextActive
          ? "Acesso da equipe reativado."
          : "Acesso da equipe suspenso imediatamente.",
      );

      await loadAgents();
    } catch (caught) {
      console.error(caught);

      setError(
        errorMessage(caught, "Não foi possível alterar o acesso."),
      );
    } finally {
      setBusy("");
    }
  }

  async function removeAgent(agent: SupportAgent) {
    const name = agent.full_name || agent.email || "este atendente";

    if (
      !window.confirm(
        "Remover " +
          name +
          " da Equipe Aura? A conta da pessoa não será apagada; somente o acesso ao suporte será removido.",
      )
    ) {
      return;
    }

    try {
      setBusy(agent.user_id);
      setError("");
      setMessage("");

      const { error: removeError } = await supabase.rpc(
        "owner_support_team_remove_v1",
        {
          p_user_id: agent.user_id,
        },
      );

      if (removeError) throw removeError;

      setMessage("Atendente removido da Equipe Aura.");
      await loadAgents();
    } catch (caught) {
      console.error(caught);

      setError(
        errorMessage(caught, "Não foi possível remover o atendente."),
      );
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return (
      <main className="aura-page flex min-h-[70vh] items-center justify-center text-zinc-400">
        Carregando Equipe Aura…
      </main>
    );
  }

  return (
    <main className="aura-page px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-3xl border border-cyan-500/25 bg-gradient-to-br from-cyan-500/10 via-zinc-950 to-purple-500/10 p-6 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">
                ADMIN · EQUIPE AURA
              </p>
              <h1 className="mt-2 text-3xl font-black">
                Gestão dos atendentes
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
                Aqui você libera pessoas para responder o Suporte Aura sem dar acesso
                à Central Administrativa, Financeiro, Planos ou Verificações.
              </p>
            </div>

            <Link
              href="/equipe-aura"
              className="w-fit rounded-xl bg-cyan-400 px-5 py-3 text-sm font-black text-black"
            >
              🎧 Abrir portal da equipe
            </Link>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {message && (
          <div className="rounded-2xl border border-green-900 bg-green-950/30 p-4 text-sm text-green-300">
            {message}
          </div>
        )}

        <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">
            ADICIONAR ATENDENTE
          </p>
          <h2 className="mt-2 text-xl font-black">
            Liberar acesso ao Suporte Aura
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            A pessoa precisa já ter uma conta cadastrada no Aura Beat. Depois de adicionada,
            ela entra pelo endereço <strong className="text-zinc-300">/equipe-aura</strong>.
            O proprietário e administradores já podem acessar esse portal sem serem adicionados à equipe.
          </p>

          <form
            onSubmit={addAgent}
            className="mt-5 flex flex-col gap-3 sm:flex-row"
          >
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="email@exemplo.com"
              className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-cyan-400"
            />

            <button
              type="submit"
              disabled={busy === "add"}
              className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-black text-black disabled:opacity-50"
            >
              {busy === "add" ? "Adicionando…" : "+ Adicionar à equipe"}
            </button>
          </form>
        </section>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-purple-300">
                EQUIPE ATUAL
              </p>
              <h2 className="mt-2 text-2xl font-black">
                {agents.length} atendente(s)
              </h2>
            </div>

            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar nome ou e-mail..."
              className="rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-cyan-400 sm:w-72"
            />
          </div>

          <div className="mt-5 space-y-3">
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center">
                <div className="text-4xl">👥</div>
                <p className="mt-3 font-black">
                  Nenhum atendente encontrado
                </p>
                <p className="mt-2 text-sm text-zinc-500">
                  Adicione alguém pelo e-mail quando quiser montar a equipe.
                </p>
              </div>
            ) : (
              filtered.map((agent) => {
                const name =
                  agent.full_name ||
                  agent.email ||
                  "Usuário Aura Beat";

                return (
                  <article
                    key={agent.user_id}
                    className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-black/30 p-4 lg:flex-row lg:items-center"
                  >
                    <div
                      className={
                        "grid h-12 w-12 shrink-0 place-items-center rounded-xl border text-sm font-black " +
                        (agent.is_active
                          ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-200"
                          : "border-zinc-800 bg-zinc-900 text-zinc-500")
                      }
                    >
                      {initials(name)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-black">
                          {name}
                        </p>

                        <span
                          className={
                            "rounded-full border px-2.5 py-1 text-[10px] font-black uppercase " +
                            (agent.is_active
                              ? "border-green-500/30 bg-green-500/10 text-green-300"
                              : "border-zinc-700 bg-zinc-900 text-zinc-500")
                          }
                        >
                          {agent.is_active ? "● Ativo" : "○ Suspenso"}
                        </span>

                        <span className="rounded-full border border-cyan-500/20 bg-cyan-500/5 px-2.5 py-1 text-[10px] font-black uppercase text-cyan-300">
                          Suporte
                        </span>
                      </div>

                      <p className="mt-1 truncate text-xs text-zinc-500">
                        {agent.email || "E-mail indisponível"}
                      </p>

                      <p className="mt-1 text-[11px] text-zinc-600">
                        Liberado em {dateTime(agent.created_at)}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy === agent.user_id}
                        onClick={() =>
                          void setActive(agent, !agent.is_active)
                        }
                        className={
                          "rounded-xl border px-4 py-2 text-sm font-black disabled:opacity-50 " +
                          (agent.is_active
                            ? "border-amber-700 text-amber-300"
                            : "border-green-800 text-green-300")
                        }
                      >
                        {agent.is_active ? "Suspender" : "Reativar"}
                      </button>

                      <button
                        type="button"
                        disabled={busy === agent.user_id}
                        onClick={() => void removeAgent(agent)}
                        className="rounded-xl border border-red-900 px-4 py-2 text-sm font-black text-red-300 disabled:opacity-50"
                      >
                        Remover
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-zinc-800 bg-black/20 p-5">
          <p className="text-sm font-black text-zinc-300">
            🔐 Como funciona o acesso
          </p>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            O cargo de suporte só libera o portal <strong>/equipe-aura</strong>.
            Ele não libera <strong>/admin</strong>. Suspender ou remover aqui corta
            o acesso da equipe, mas não apaga a conta pessoal do usuário no Aura Beat.
          </p>
        </section>
      </div>
    </main>
  );
}
