"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PlanStatusCard } from "../../components/plan-status-card";
import { ProfileAvatar } from "../../components/profile-avatar";
import {
  getMyPlanAccess,
  hasPlanBenefit,
  type PlanAccess,
} from "../../lib/plan-access";
import { supabase } from "../../lib/supabase";

type Casa = {
  id: string;
  trade_name: string;
  city: string | null;
  state: string | null;
  verification_status: string;
  avatar_url: string | null;
};

export default function HomeCasaPage() {
  const router = useRouter();

  const [casa, setCasa] = useState<Casa | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [avaliacaoCasa, setAvaliacaoCasa] = useState(0);
  const [quantidadeAvaliacoesCasa, setQuantidadeAvaliacoesCasa] = useState(0);
  const [eventosConcluidos, setEventosConcluidos] = useState(0);
  const [planAccess, setPlanAccess] = useState<PlanAccess | null>(null);

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      try {
        setCarregando(true);
        setErro("");

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!ativo) return;

        if (!user) {
          router.replace("/login");
          return;
        }

        const { data: perfil, error: erroPerfil } = await supabase
          .from("venue_profiles")
          .select("id,trade_name,city,state,verification_status,avatar_url")
          .eq("owner_user_id", user.id)
          .maybeSingle();

        if (erroPerfil) throw erroPerfil;
        if (!ativo) return;

        if (!perfil) {
          router.replace("/perfil-casa");
          return;
        }

        const perfilCasa = perfil as Casa;
        setCasa(perfilCasa);

        const [avaliacoesResult, eventosResult, planoResult] = await Promise.all([
          supabase
            .from("reviews")
            .select("overall_rating")
            .eq("reviewee_type", "venue")
            .eq("venue_id", perfilCasa.id),
          supabase
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .eq("venue_id", perfilCasa.id)
            .eq("status", "completed"),
          getMyPlanAccess("venue"),
        ]);

        setPlanAccess(planoResult);

        if (!ativo) return;

        if (!avaliacoesResult.error) {
          const notas = (avaliacoesResult.data ?? [])
            .map((review) => Number(review.overall_rating || 0))
            .filter((nota) => nota > 0);

          setQuantidadeAvaliacoesCasa(notas.length);
          setAvaliacaoCasa(
            notas.length > 0
              ? notas.reduce((soma, nota) => soma + nota, 0) / notas.length
              : 0,
          );
        }

        if (!eventosResult.error) {
          setEventosConcluidos(eventosResult.count ?? 0);
        }
      } catch (error) {
        console.error(error);
        if (ativo) {
          setErro("Não foi possível carregar a Home da Casa.");
        }
      } finally {
        if (ativo) setCarregando(false);
      }
    }

    void carregar();

    return () => {
      ativo = false;
    };
  }, [router]);

  function statusCasa() {
    if (casa?.verification_status === "verified") {
      return {
        texto: "Casa Verificada",
        classe: "bg-green-500/10 border-green-800 text-green-400",
      };
    }

    if (casa?.verification_status === "rejected") {
      return {
        texto: "Verificação recusada",
        classe: "bg-red-500/10 border-red-800 text-red-400",
      };
    }

    if (casa?.verification_status === "suspended") {
      return {
        texto: "Casa suspensa",
        classe: "bg-red-500/10 border-red-800 text-red-400",
      };
    }

    return {
      texto: "Verificação pendente",
      classe: "bg-yellow-500/10 border-yellow-800 text-yellow-400",
    };
  }

  function abrirAreaProtegidaCasa(path: string) {
    if (casa?.verification_status !== "verified") {
      router.push("/verificacao-casa");
      return;
    }

    router.push(path);
  }

  if (carregando) {
    return (
      <main className="aura-page flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-zinc-800 border-t-red-500" />
          <p className="text-zinc-400">Carregando Aura Beat...</p>
        </div>
      </main>
    );
  }

  const status = statusCasa();
  const casaVerificada = casa?.verification_status === "verified";

  const atalhos = [
    {
      icon: "⚡",
      label: "Disponibilidade urgente",
      detail: "Veja tudo que os DJs publicaram",
      href: "/disponibilidades-casa",
      requiresVerification: true,
      hover: "hover:border-amber-400/70",
      destaque: true,
    },
    {
      icon: "🔥",
      label: "Ofertas",
      detail: "Criar e acompanhar",
      href: "/ofertas",
      requiresVerification: true,
      hover: "hover:border-red-500/50",
    },
    {
      icon: "🎟️",
      label: "Eventos",
      detail: "Contratações da Casa",
      href: "/eventos-casa",
      requiresVerification: true,
      hover: "hover:border-green-500/50",
    },
    {
      icon: "💰",
      label: "Financeiro",
      detail: "Pagamentos e taxas",
      href: "/financeiro-casa",
      requiresVerification: true,
      hover: "hover:border-green-500/50",
    },
    {
      icon: "💬",
      label: "Chat",
      detail: "Conversas com artistas",
      href: "/chat-direto",
      requiresVerification: true,
      hover: "hover:border-purple-500/50",
    },
    {
      icon: "🏠",
      label: "Meu perfil",
      detail: "Editar informações",
      href: "/perfil-casa",
      hover: "hover:border-red-500/50",
    },
    {
      icon: "📊",
      label: "Relatórios",
      detail: hasPlanBenefit(planAccess, "reports")
        ? "Análises liberadas"
        : "Intermediário / Pro",
      href: "/relatorios-casa",
      requiresVerification: true,
      hover: "hover:border-purple-500/50",
      locked: !hasPlanBenefit(planAccess, "reports"),
    },
    {
      icon: "🎧",
      label: "Suporte Aura",
      detail: hasPlanBenefit(planAccess, "support_chat")
        ? planAccess?.benefits?.support_priority === "priority"
          ? "Atendimento prioritário"
          : "Falar com a equipe"
        : "Intermediário / Pro",
      href: "/suporte-aura",
      requiresVerification: true,
      hover: "hover:border-purple-500/50",
      locked: !hasPlanBenefit(planAccess, "support_chat"),
      pro: planAccess?.benefits?.support_priority === "priority",
    },
    {
      icon: "💎",
      label: "Meu plano",
      detail: "Benefícios e nível atual",
      href: "/planos-casa",
      hover: "hover:border-amber-400/50",
    },
    {
      icon: "⚙️",
      label: "Configurações",
      detail: "Conta e preferências",
      href: "/configuracoes",
      hover: "hover:border-red-500/50",
    },
  ];

  return (
    <main className="aura-page pb-8">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <section className="aura-hero aura-venue-hero rounded-3xl p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
            <div className="flex items-center gap-4">
              <ProfileAvatar
                kind="venue"
                name={casa?.trade_name || "Casa"}
                url={casa?.avatar_url}
                sizeClassName="h-20 w-20 sm:h-24 sm:w-24"
                className="rounded-3xl shadow-[0_0_35px_rgba(239,68,68,0.22)]"
              />

              <div>
                <p className="aura-kicker">Painel da Casa</p>
                <h1 className="mt-2 text-3xl font-black">{casa?.trade_name}</h1>
                <p className="mt-2 text-zinc-400">
                  {casa?.city || "Cidade não informada"}
                  {casa?.state ? ` — ${casa.state}` : ""}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-start gap-3 md:items-end">
              <div className={`rounded-full border px-4 py-2 text-sm font-bold ${status.classe}`}>
                {status.texto}
              </div>

              <div className="flex flex-wrap gap-2">
                {casa?.id && (
                  <button
                    type="button"
                    onClick={() => router.push(`/casas/${casa.id}`)}
                    className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-300"
                  >
                    Ver perfil público
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => abrirAreaProtegidaCasa("/ofertas")}
                  className="rounded-xl bg-red-500 px-4 py-2 text-sm font-black text-white"
                >
                  Criar oferta
                </button>
              </div>
            </div>
          </div>
        </section>

        <PlanStatusCard
          audience="venue"
          access={planAccess}
          onViewPlans={() => router.push("/planos-casa")}
        />

        <section className="grid gap-3 sm:grid-cols-2" aria-label="Resumo da Casa">
          <div className="aura-stat rounded-2xl border p-5">
            <p className="text-sm text-zinc-500">Avaliação da Casa</p>
            <p className="mt-2 text-2xl font-black">
              ⭐ {avaliacaoCasa > 0 ? avaliacaoCasa.toFixed(1) : "--"}
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              {quantidadeAvaliacoesCasa}{" "}
              {quantidadeAvaliacoesCasa === 1 ? "avaliação" : "avaliações"}
            </p>
          </div>

          <div className="aura-stat rounded-2xl border p-5">
            <p className="text-sm text-zinc-500">Eventos concluídos</p>
            <p className="mt-2 text-2xl font-black">{eventosConcluidos}</p>
            <p className="mt-1 text-xs text-zinc-600">Contratações finalizadas</p>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-black">Acesso rápido</h2>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {atalhos.map((atalho) => (
              <button
                key={atalho.href}
                type="button"
                onClick={() =>
                  "requiresVerification" in atalho && atalho.requiresVerification
                    ? abrirAreaProtegidaCasa(atalho.href)
                    : router.push(atalho.href)
                }
                className={`group relative overflow-hidden rounded-2xl border p-5 text-left transition duration-300 ${
                  "destaque" in atalho && atalho.destaque
                    ? "border-amber-400/50 bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-red-500/10 shadow-[0_0_28px_rgba(245,158,11,0.18)] hover:-translate-y-1 hover:border-amber-300/80 hover:shadow-[0_0_42px_rgba(245,158,11,0.30)]"
                    : `border-zinc-800 bg-zinc-950 ${atalho.hover}`
                }`}
              >
                {"destaque" in atalho && atalho.destaque && (
                  <>
                    <span className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-amber-300/30" />
                    <span className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full bg-amber-400/20 blur-2xl" />
                  </>
                )}

                <div
                  className={`relative z-10 flex h-11 w-11 items-center justify-center rounded-xl text-2xl ${
                    "destaque" in atalho && atalho.destaque
                      ? "bg-amber-400/15 shadow-[0_0_22px_rgba(251,191,36,0.25)] ring-1 ring-amber-300/30"
                      : ""
                  }`}
                >
                  {"destaque" in atalho && atalho.destaque && (
                    <span className="absolute inset-0 animate-ping rounded-xl bg-amber-400/10" />
                  )}
                  <span className="relative">{atalho.icon}</span>
                </div>

                <p
                  className={`relative z-10 mt-3 font-bold ${
                    "destaque" in atalho && atalho.destaque
                      ? "text-amber-200"
                      : ""
                  }`}
                >
                  {atalho.label}
                </p>

                <p className="relative z-10 mt-1 text-xs text-zinc-500">
                  {atalho.detail}
                </p>

                {"locked" in atalho && atalho.locked && (
                  <span className="relative z-10 mt-3 inline-flex rounded-full border border-zinc-700 bg-black/30 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-zinc-400">
                    🔒 Bloqueado
                  </span>
                )}

                {"pro" in atalho && atalho.pro && !("locked" in atalho && atalho.locked) && (
                  <span className="relative z-10 mt-3 inline-flex rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-300">
                    ✦ PRO
                  </span>
                )}

                {"destaque" in atalho && atalho.destaque && (
                  <span className="relative z-10 mt-3 inline-flex rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-300">
                    Destaque
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>

        {erro && (
          <div className="rounded-2xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
            {erro}
          </div>
        )}

        {!casaVerificada ? (
          <section className="rounded-3xl border border-yellow-900/50 bg-yellow-950/10 p-8 text-center">
            <div className="text-5xl">🔐</div>
            <h2 className="mt-4 text-2xl font-black">Casa ainda não verificada</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-400">
              Finalize a verificação para usar todos os recursos de contratação do Aura Beat.
            </p>
            <button
              type="button"
              onClick={() => router.push("/verificacao-casa")}
              className="mt-6 rounded-xl bg-red-500 px-6 py-3 font-bold transition hover:bg-red-600"
            >
              Enviar documentos e verificar
            </button>
          </section>
        ) : (
          <section className="aura-card rounded-3xl border p-6 sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="aura-kicker">Descoberta de talentos</p>
                <h2 className="mt-2 text-2xl font-black">Encontre DJs no Explorar</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                  O mapa e a busca de Artistas ficam em um único lugar. Veja DJs de qualquer
                  região, abra o perfil, converse e envie ofertas pelo Explorar.
                </p>
              </div>

              <button
                type="button"
                onClick={() => abrirAreaProtegidaCasa("/buscar")}
                className="rounded-2xl bg-red-500 px-6 py-4 font-black text-white transition hover:bg-red-600"
              >
                Explorar DJs
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
