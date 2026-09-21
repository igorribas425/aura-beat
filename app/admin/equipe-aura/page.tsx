"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getOwnerAccessFast } from "../../../lib/admin-access";
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
  device_label: string | null;
  device_activated_at: string | null;
  device_last_seen_at: string | null;
  device_revoked_at: string | null;
};

type SupportInvite = {
  invite_id: string;
  email: string;
  status: "pending" | "accepted" | "expired";
  created_at: string;
  expires_at: string;
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
  const [invites, setInvites] = useState<SupportInvite[]>([]);
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

  async function loadTeamData() {
    const [agentsResult, invitesResult] = await Promise.all([
      supabase.rpc("owner_support_team_list_v2"),
      supabase.rpc("owner_support_invite_list_v1"),
    ]);

    if (agentsResult.error) throw agentsResult.error;
    if (invitesResult.error) throw invitesResult.error;

    setAgents((agentsResult.data || []) as SupportAgent[]);
    setInvites((invitesResult.data || []) as SupportInvite[]);
  }

  useEffect(() => {
    let active = true;

    async function init() {
      try {
        setLoading(true);
        setError("");

        const ownerAccess =
          await getOwnerAccessFast();

        if (!ownerAccess.authenticated) {
          router.replace("/login");
          return;
        }

        if (!ownerAccess.allowed) {
          router.replace("/home");
          return;
        }

        await loadTeamData();
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

  async function sendInvite(event: FormEvent) {
    event.preventDefault();

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setError("Informe o e-mail da pessoa.");
      return;
    }

    try {
      setBusy("invite");
      setError("");
      setMessage("");

      const { error: inviteError } = await supabase.rpc(
        "owner_support_invite_create_v1",
        {
          p_email: cleanEmail,
        },
      );

      if (inviteError) throw inviteError;

      const { error: emailError } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          shouldCreateUser: true,
          emailRedirectTo:
            window.location.origin + "/equipe-aura/ativar",
        },
      });

      if (emailError) {
        throw new Error(
          "O convite foi criado, mas o e-mail não pôde ser enviado: " +
            emailError.message,
        );
      }

      setEmail("");
      setMessage(
        "Convite enviado. A pessoa receberá um link por e-mail para criar o acesso de trabalho.",
      );
      await loadTeamData();
    } catch (caught) {
      console.error(caught);
      setError(
        errorMessage(caught, "Não foi possível enviar o convite."),
      );
      await loadTeamData().catch(() => undefined);
    } finally {
      setBusy("");
    }
  }

  async function resendInvite(invite: SupportInvite) {
    try {
      setBusy(invite.invite_id);
      setError("");
      setMessage("");

      const existingAgent = agents.find(
        (agent) =>
          agent.email?.toLowerCase() === invite.email.toLowerCase() &&
          agent.is_active,
      );

      if (existingAgent) {
        const { error: prepareError } = await supabase.rpc(
          "owner_support_device_reinvite_v1",
          {
            p_user_id: existingAgent.user_id,
          },
        );

        if (prepareError) throw prepareError;
      } else {
        const { error: inviteError } = await supabase.rpc(
          "owner_support_invite_create_v1",
          {
            p_email: invite.email,
          },
        );

        if (inviteError) throw inviteError;
      }

      const { error: emailError } = await supabase.auth.signInWithOtp({
        email: invite.email,
        options: {
          shouldCreateUser: existingAgent ? false : true,
          emailRedirectTo:
            window.location.origin + "/equipe-aura/ativar",
        },
      });

      if (emailError) throw emailError;

      setMessage(
        existingAgent
          ? "Novo convite de dispositivo enviado para " + invite.email + "."
          : "Convite reenviado para " + invite.email + ".",
      );
      await loadTeamData();
    } catch (caught) {
      console.error(caught);
      setError(errorMessage(caught, "Não foi possível reenviar o convite."));
    } finally {
      await loadTeamData().catch(() => undefined);
      setBusy("");
    }
  }

  async function cancelInvite(invite: SupportInvite) {
    if (!window.confirm("Cancelar o convite de " + invite.email + "?")) {
      return;
    }

    try {
      setBusy(invite.invite_id);
      setError("");
      setMessage("");

      const { error: cancelError } = await supabase.rpc(
        "owner_support_invite_cancel_v1",
        {
          p_invite_id: invite.invite_id,
        },
      );

      if (cancelError) throw cancelError;

      setMessage("Convite cancelado.");
      await loadTeamData();
    } catch (caught) {
      console.error(caught);
      setError(errorMessage(caught, "Não foi possível cancelar o convite."));
    } finally {
      await loadTeamData().catch(() => undefined);
      setBusy("");
    }
  }

  async function blockDevice(agent: SupportAgent) {
    const name = agent.full_name || agent.email || "este atendente";

    if (
      !window.confirm(
        "Bloquear o dispositivo atual de " +
          name +
          "? O acesso ao chat será interrompido.",
      )
    ) {
      return;
    }

    try {
      setBusy(agent.user_id);
      setError("");
      setMessage("");

      const { error: resetError } = await supabase.rpc(
        "owner_support_device_reset_v1",
        {
          p_user_id: agent.user_id,
        },
      );

      if (resetError) throw resetError;

      setMessage("Dispositivo bloqueado. O atendente não consegue mais abrir o chat.");
      await loadTeamData();
    } catch (caught) {
      console.error(caught);
      setError(errorMessage(caught, "Não foi possível bloquear o dispositivo."));
    } finally {
      await loadTeamData().catch(() => undefined);
      setBusy("");
    }
  }

  async function moveDevice(agent: SupportAgent) {
    const name = agent.full_name || agent.email || "este atendente";

    if (
      !window.confirm(
        "Transferir o acesso de " +
          name +
          " para outro dispositivo? O dispositivo atual será bloqueado e um novo convite será enviado.",
      )
    ) {
      return;
    }

    try {
      setBusy(agent.user_id);
      setError("");
      setMessage("");

      const { data: invitedEmail, error: prepareError } = await supabase.rpc(
        "owner_support_device_reinvite_v1",
        {
          p_user_id: agent.user_id,
        },
      );

      if (prepareError) throw prepareError;

      const targetEmail =
        typeof invitedEmail === "string" ? invitedEmail : agent.email;

      if (!targetEmail) {
        throw new Error("E-mail do atendente indisponível.");
      }

      const { error: emailError } = await supabase.auth.signInWithOtp({
        email: targetEmail,
        options: {
          shouldCreateUser: false,
          emailRedirectTo:
            window.location.origin + "/equipe-aura/ativar",
        },
      });

      if (emailError) throw emailError;

      setMessage(
        "Dispositivo antigo bloqueado e novo convite enviado para " +
          targetEmail +
          ".",
      );
      await loadTeamData();
    } catch (caught) {
      console.error(caught);
      setError(
        errorMessage(caught, "Não foi possível transferir o dispositivo."),
      );
    } finally {
      await loadTeamData().catch(() => undefined);
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
          ? "Acesso reativado. O atendente volta ao chat no dispositivo já autorizado."
          : "Acesso da equipe suspenso imediatamente.",
      );

      await loadTeamData();
    } catch (caught) {
      console.error(caught);

      setError(
        errorMessage(caught, "Não foi possível alterar o acesso."),
      );
    } finally {
      await loadTeamData().catch(() => undefined);
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
      await loadTeamData();
    } catch (caught) {
      console.error(caught);

      setError(
        errorMessage(caught, "Não foi possível remover o atendente."),
      );
    } finally {
      await loadTeamData().catch(() => undefined);
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
            Digite o e-mail da pessoa. Ela receberá um link para criar o acesso de trabalho
            e, ao concluir o cadastro, entrará somente pelo endereço{" "}
            <strong className="text-zinc-300">/equipe-aura</strong>.
            O proprietário e administradores já podem acessar esse portal sem convite.
          </p>

          <form
            onSubmit={sendInvite}
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
              disabled={busy === "invite"}
              className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-black text-black disabled:opacity-50"
            >
              {busy === "invite" ? "Enviando…" : "✉ Enviar convite"}
            </button>
          </form>
        </section>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">
                CONVITES
              </p>
              <h2 className="mt-2 text-xl font-black">Convites enviados</h2>
              <p className="mt-2 text-sm text-zinc-500">
                O link vale por 7 dias. Depois de aceito, a pessoa aparece na equipe atual.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {invites.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-800 p-6 text-sm text-zinc-500">
                Nenhum convite pendente.
              </div>
            ) : (
              invites.map((invite) => (
                <article
                  key={invite.invite_id}
                  className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-black/30 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-black">{invite.email}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {invite.status === "accepted"
                        ? "Aceito"
                        : invite.status === "expired"
                          ? "Expirado"
                          : "Aguardando cadastro"}{" "}
                      · enviado em {dateTime(invite.created_at)}
                    </p>
                  </div>

                  {invite.status === "pending" && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy === invite.invite_id}
                        onClick={() => void resendInvite(invite)}
                        className="rounded-xl border border-cyan-800 px-4 py-2 text-sm font-black text-cyan-300 disabled:opacity-50"
                      >
                        Reenviar
                      </button>
                      <button
                        type="button"
                        disabled={busy === invite.invite_id}
                        onClick={() => void cancelInvite(invite)}
                        className="rounded-xl border border-red-900 px-4 py-2 text-sm font-black text-red-300 disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
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
                  Envie um convite por e-mail para montar a equipe.
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

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                        <span
                          className={
                            agent.device_revoked_at
                              ? "font-bold text-red-300"
                              : agent.device_label
                                ? "font-bold text-green-300"
                                : "text-zinc-600"
                          }
                        >
                          {agent.device_revoked_at
                            ? "🔒 Dispositivo bloqueado"
                            : agent.device_label
                              ? "💻 " + agent.device_label
                              : "⌛ Aguardando ativação do dispositivo"}
                        </span>

                        {agent.device_last_seen_at && !agent.device_revoked_at && (
                          <span className="text-zinc-500">
                            Último acesso: {dateTime(agent.device_last_seen_at)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {agent.is_active && agent.device_label && !agent.device_revoked_at && (
                        <button
                          type="button"
                          disabled={busy === agent.user_id}
                          onClick={() => void blockDevice(agent)}
                          className="rounded-xl border border-amber-800 px-4 py-2 text-sm font-black text-amber-300 disabled:opacity-50"
                        >
                          Bloquear dispositivo
                        </button>
                      )}

                      {agent.is_active && (
                        <button
                          type="button"
                          disabled={busy === agent.user_id}
                          onClick={() => void moveDevice(agent)}
                          className="rounded-xl border border-cyan-800 px-4 py-2 text-sm font-black text-cyan-300 disabled:opacity-50"
                        >
                          Trocar dispositivo
                        </button>
                      )}

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
            Cada atendente recebe um convite individual e o link é de uso único. No primeiro
            cadastro, o acesso fica vinculado ao dispositivo usado pela pessoa. Mesmo com
            e-mail e senha, outro dispositivo não consegue abrir o chat sem você usar
            <strong> Trocar dispositivo</strong>. O cargo de suporte não libera{" "}
            <strong>/admin</strong>, Financeiro, Planos ou Verificações.
          </p>
        </section>
      </div>
    </main>
  );
}
