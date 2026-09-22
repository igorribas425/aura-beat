"use client";

import type { PlanAccess } from "../lib/plan-access";

type Props = {
  audience: "artist" | "venue";
  access: PlanAccess | null;
  onViewPlans?: () => void;
};

type Feature = {
  key: string;
  label: string;
  available: boolean;
};

function value(access: PlanAccess | null, key: string) {
  return access?.active ? access.benefits?.[key] : null;
}

function formatDate(date: string | null) {
  if (!date) return null;

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
  }).format(new Date(date));
}

function visual(code: string | null) {
  if (code === "pro") {
    return {
      border: "border-amber-400/40",
      bg: "bg-gradient-to-br from-amber-500/10 via-zinc-950 to-purple-500/10",
      badge: "border-amber-400/40 bg-amber-400/10 text-amber-300",
      kicker: "text-amber-300",
      glow: "shadow-[0_0_45px_rgba(251,191,36,0.10)]",
      icon: "✦",
    };
  }

  if (code === "intermediate") {
    return {
      border: "border-purple-500/40",
      bg: "bg-gradient-to-br from-purple-500/10 via-zinc-950 to-blue-500/5",
      badge: "border-purple-500/40 bg-purple-500/10 text-purple-300",
      kicker: "text-purple-300",
      glow: "shadow-[0_0_40px_rgba(168,85,247,0.10)]",
      icon: "◆",
    };
  }

  return {
    border: "border-zinc-700",
    bg: "bg-zinc-950",
    badge: "border-zinc-700 bg-zinc-900 text-zinc-300",
    kicker: "text-zinc-400",
    glow: "",
    icon: "●",
  };
}

export function PlanStatusCard({
  audience,
  access,
  onViewPlans,
}: Props) {
  const active = access?.active === true;
  const style = visual(active ? access.planCode : null);

  const visibility = String(value(access, "visibility") || "");
  const offerLevel = String(value(access, "offers") || "");

  const features: Feature[] =
    audience === "artist"
      ? [
          {
            key: "base",
            label: "Perfil, Press Kit, chat, ofertas e agenda",
            available: active,
          },
          {
            key: "visibility",
            label:
              visibility === "high"
                ? "Alta visibilidade"
                : visibility === "enhanced"
                  ? "Visibilidade ampliada"
                  : "Visibilidade padrão",
            available: active,
          },
          {
            key: "analytics",
            label: "Analytics avançado",
            available: value(access, "analytics") === true,
          },
          {
            key: "profile_highlight",
            label: "Destaque visual do perfil",
            available: value(access, "profile_highlight") === true,
          },
          {
            key: "pro_badge",
            label: "Selo exclusivo PRO",
            available: value(access, "pro_badge") === true,
          },
          {
            key: "support_chat",
            label:
              value(access, "support_priority") === "priority"
                ? "Suporte Aura prioritário"
                : "Chat com a Equipe Aura",
            available: value(access, "support_chat") === true,
          },
        ]
      : [
          {
            key: "base",
            label: "Explorar DJs, chat, ofertas e eventos",
            available: active,
          },
          {
            key: "offers",
            label:
              offerLevel === "high"
                ? "Recursos de oferta em nível Pro"
                : offerLevel === "enhanced"
                  ? "Recursos de oferta ampliados"
                  : "Recursos de oferta padrão",
            available: active,
          },
          {
            key: "advanced_filters",
            label: "Filtros avançados no Explorar",
            available: value(access, "advanced_filters") === true,
          },
          {
            key: "reports",
            label: "Relatórios avançados",
            available: value(access, "reports") === true,
          },
          {
            key: "support_chat",
            label:
              value(access, "support_priority") === "priority"
                ? "Suporte Aura prioritário"
                : "Chat com a Equipe Aura",
            available: value(access, "support_chat") === true,
          },
        ];

  const isTrial = active && access?.status === "trialing";

  const period = !active
    ? "Nenhum plano ativo"
    : isTrial && access.trialEndsAt
      ? `🎁 30 dias grátis · até ${formatDate(access.trialEndsAt)}`
      : access.unlimited
        ? "♾ Acesso ilimitado"
        : access.currentPeriodEnd
          ? `Ativo até ${formatDate(access.currentPeriodEnd)}`
          : "Plano ativo";

  return (
    <section
      className={`rounded-3xl border p-5 sm:p-6 ${style.border} ${style.bg} ${style.glow}`}
      aria-label="Resumo do plano"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className={`text-xs font-black uppercase tracking-[0.22em] ${style.kicker}`}>
            SEU PLANO
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-black">
              {active ? access.planName || "Plano ativo" : "Sem plano ativo"}
            </h2>

            {active && (
              <span
                className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase ${style.badge}`}
              >
                {style.icon}{" "}
                {access.planCode === "pro"
                  ? "PRO"
                  : access.planCode === "intermediate"
                    ? "INTERMEDIÁRIO"
                    : "BÁSICO"}
              </span>
            )}
          </div>

          <p className="mt-2 text-sm text-zinc-400">
            {period}
          </p>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">
            {active
              ? isTrial
                ? "Período promocional de lançamento no plano Básico. Não há cobrança automática ao final dos 30 dias."
                : "O Aura Beat libera os recursos deste nível automaticamente."
              : "Seu acesso aos recursos do Aura Beat fica bloqueado até você escolher um plano e confirmar o pagamento."}
          </p>
        </div>

        {onViewPlans && (
          <button
            type="button"
            onClick={onViewPlans}
            className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-black text-white transition hover:bg-white/10"
          >
            Ver planos
          </button>
        )}
      </div>

      {isTrial && (
        <div className="mt-5 rounded-2xl border border-green-500/25 bg-green-500/5 px-4 py-3 text-sm text-green-200">
          <span className="font-black">🎁 PERÍODO GRÁTIS DE LANÇAMENTO</span>
          <span className="ml-2 text-green-300/80">Plano Básico por 30 dias.</span>
        </div>
      )}

      <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <div
            key={feature.key}
            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${
              feature.available
                ? "border-green-500/20 bg-green-500/5 text-zinc-200"
                : "border-zinc-800 bg-black/30 text-zinc-500"
            }`}
          >
            <span className={feature.available ? "text-green-400" : "text-zinc-600"}>
              {feature.available ? "✓" : "🔒"}
            </span>

            <span className="font-semibold">
              {feature.label}
            </span>
          </div>
        ))}
      </div>

      {access?.planCode === "pro" && active && (
        <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm font-bold text-amber-200">
          ✦ Você está no nível mais completo do Aura Beat.
        </div>
      )}
    </section>
  );
}
