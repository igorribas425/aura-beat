"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ProfileAvatar } from "../../components/profile-avatar";
import {
  getMyPlanAccess,
  hasPlanBenefit,
  type PlanAccess,
} from "../../lib/plan-access";
import { supabase } from "../../lib/supabase";

type TeamRole = "owner" | "manager" | "finance" | "producer";

type TeamMember = {
  venue_id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: TeamRole;
  created_at: string;
};

const ROLE_LABELS: Record<TeamRole, string> = {
  owner: "Proprietário",
  manager: "Gerente",
  finance: "Financeiro",
  producer: "Produtor",
};

export default function VenueTeamPage() {
  const router = useRouter();
  const [access, setAccess] = useState<PlanAccess | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<TeamRole, "owner">>("producer");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const canManageTeam = hasPlanBenefit(access, "team");

  const loadMembers = useCallback(async () => {
    const { data, error: teamError } = await supabase.rpc(
      "venue_team_list_v1",
    );

    if (teamError) throw teamError;
    setMembers((data || []) as TeamMember[]);
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
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

        const [plan] = await Promise.all([
          getMyPlanAccess("venue"),
          loadMembers(),
        ]);

        if (!active) return;
        setAccess(plan);
      } catch (caught) {
        console.error(caught);
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Não foi possível carregar a equipe.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [loadMembers, router]);

  async function addMember(event: FormEvent) {
    event.preventDefault();

    if (!email.trim()) {
      setError("Informe o e-mail do usuário.");
      return;
    }

    try {
      setBusy("add");
      setError("");
      setMessage("");

      const { error: addError } = await supabase.rpc(
        "venue_team_add_by_email_v1",
        {
          p_email: email.trim(),
          p_role: role,
        },
      );

      if (addError) throw addError;

      setEmail("");
      setMessage("Membro adicionado à equipe.");
      await loadMembers();
    } catch (caught) {
      console.error(caught);
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível adicionar o membro.",
      );
    } finally {
      setBusy("");
    }
  }

  async function updateRole(userId: string, nextRole: Exclude<TeamRole, "owner">) {
    try {
      setBusy(userId);
      setError("");
      setMessage("");

      const { error: updateError } = await supabase.rpc(
        "venue_team_update_role_v1",
        {
          p_user_id: userId,
          p_role: nextRole,
        },
      );

      if (updateError) throw updateError;

      setMessage("Função atualizada.");
      await loadMembers();
    } catch (caught) {
      console.error(caught);
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível atualizar a função.",
      );
    } finally {
      setBusy("");
    }
  }

  async function removeMember(member: TeamMember) {
    const name = member.full_name || member.email || "membro";

    if (!window.confirm(`Remover ${name} da equipe?`)) {
      return;
    }

    try {
      setBusy(member.user_id);
      setError("");
      setMessage("");

      const { error: removeError } = await supabase.rpc(
        "venue_team_remove_v1",
        { p_user_id: member.user_id },
      );

      if (removeError) throw removeError;

      setMessage("Membro removido.");
      await loadMembers();
    } catch (caught) {
      console.error(caught);
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível remover o membro.",
      );
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return (
      <main className="aura-page flex min-h-[70vh] items-center justify-center text-zinc-400">
        Carregando equipe…
      </main>
    );
  }

  return (
    <main className="aura-page px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="aura-hero aura-venue-hero rounded-3xl p-6 sm:p-8">
          <p className="aura-kicker">GESTÃO DE EQUIPE</p>
          <h1 className="mt-2 text-3xl font-black">Equipe da Casa</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
            Adicione gerente, financeiro ou produtor. O proprietário nunca perde
            o acesso e os membros extras dependem do plano Pro ativo.
          </p>
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

        {!canManageTeam && (
          <section className="rounded-3xl border border-amber-400/30 bg-amber-400/5 p-6">
            <div className="text-3xl">🔒</div>
            <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-amber-300">
              EXCLUSIVO PRO
            </p>
            <h2 className="mt-2 text-2xl font-black">Gestão de equipe</h2>
            <p className="mt-3 max-w-2xl leading-7 text-zinc-400">
              O plano Pro permite delegar funções da Casa sem compartilhar a
              conta principal. Membros extras só têm efeito enquanto o Pro estiver ativo.
            </p>
            <button
              type="button"
              onClick={() => router.push("/planos-casa")}
              className="mt-5 rounded-xl bg-amber-400 px-5 py-3 font-black text-black"
            >
              Ver plano Pro
            </button>
          </section>
        )}

        {canManageTeam && (
          <form
            onSubmit={addMember}
            className="rounded-3xl border border-amber-400/25 bg-amber-400/5 p-6"
          >
            <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">
              ✦ RECURSO PRO
            </p>
            <h2 className="mt-2 text-xl font-black">Adicionar membro</h2>
            <p className="mt-2 text-sm text-zinc-500">
              O e-mail precisa pertencer a uma conta já cadastrada no Aura Beat.
            </p>

            <div className="mt-5 grid gap-3 md:grid-cols-[1fr_220px_auto]">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="email@exemplo.com"
                className="rounded-xl border border-zinc-800 bg-black px-4 py-3 text-white"
              />

              <select
                value={role}
                onChange={(event) =>
                  setRole(event.target.value as Exclude<TeamRole, "owner">)
                }
                className="rounded-xl border border-zinc-800 bg-black px-4 py-3 text-white"
              >
                <option value="manager">Gerente</option>
                <option value="finance">Financeiro</option>
                <option value="producer">Produtor</option>
              </select>

              <button
                type="submit"
                disabled={busy === "add"}
                className="rounded-xl bg-amber-400 px-5 py-3 font-black text-black disabled:opacity-50"
              >
                {busy === "add" ? "Adicionando…" : "Adicionar"}
              </button>
            </div>
          </form>
        )}

        <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-purple-300">
                MEMBROS
              </p>
              <h2 className="mt-2 text-2xl font-black">
                {members.length} pessoa(s)
              </h2>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {members.map((member) => {
              const owner = member.role === "owner";

              return (
                <article
                  key={member.user_id}
                  className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-black/30 p-4 lg:flex-row lg:items-center"
                >
                  <ProfileAvatar
                    kind="venue"
                    name={member.full_name || member.email || "Membro"}
                    url={member.avatar_url}
                    sizeClassName="h-12 w-12"
                    className="rounded-xl"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-black">
                        {member.full_name || "Usuário Aura Beat"}
                      </p>
                      {owner && (
                        <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-black text-amber-300">
                          OWNER
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-zinc-500">
                      {member.email || "E-mail protegido"}
                    </p>
                  </div>

                  {owner ? (
                    <span className="rounded-xl border border-zinc-800 px-4 py-2 text-sm font-bold text-zinc-400">
                      Proprietário protegido
                    </span>
                  ) : canManageTeam ? (
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={member.role}
                        disabled={busy === member.user_id}
                        onChange={(event) =>
                          void updateRole(
                            member.user_id,
                            event.target.value as Exclude<TeamRole, "owner">,
                          )
                        }
                        className="rounded-xl border border-zinc-800 bg-black px-3 py-2 text-sm text-white"
                      >
                        <option value="manager">Gerente</option>
                        <option value="finance">Financeiro</option>
                        <option value="producer">Produtor</option>
                      </select>

                      <button
                        type="button"
                        disabled={busy === member.user_id}
                        onClick={() => void removeMember(member)}
                        className="rounded-xl border border-red-800 px-4 py-2 text-sm font-black text-red-300 disabled:opacity-50"
                      >
                        Remover
                      </button>
                    </div>
                  ) : (
                    <span className="rounded-xl border border-zinc-800 px-4 py-2 text-sm text-zinc-500">
                      {ROLE_LABELS[member.role]}
                    </span>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <button
          type="button"
          onClick={() => router.push("/home-casa")}
          className="rounded-xl border border-zinc-800 px-5 py-3 text-sm font-black text-zinc-300"
        >
          ← Voltar para Home
        </button>
      </div>
    </main>
  );
}
