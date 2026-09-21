"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PlanStatusCard } from "../../components/plan-status-card";
import { formatBRL } from "../../lib/finance";
import {
  getMyPlanAccess,
  type PlanAccess,
} from "../../lib/plan-access";
import { supabase } from "../../lib/supabase";

type Plan = {
  id: string;
  code: string;
  name: string;
  monthly_price: number;
  benefits: Record<string, unknown>;
  is_active: boolean;
};

function money(value: number) {
  return formatBRL(Number(value || 0));
}

function planVisual(code: string) {
  if (code === "pro") {
    return {
      border: "border-amber-400/50",
      bg: "bg-gradient-to-b from-amber-500/10 via-zinc-950 to-purple-500/5",
      badge: "bg-amber-400/10 text-amber-300 border-amber-400/30",
      title: "text-amber-200",
      glow: "shadow-[0_0_45px_rgba(251,191,36,0.10)]",
      top: "MAIS COMPLETO",
    };
  }

  if (code === "intermediate") {
    return {
      border: "border-purple-500/40",
      bg: "bg-gradient-to-b from-purple-500/10 to-zinc-950",
      badge: "bg-purple-500/10 text-purple-300 border-purple-500/30",
      title: "text-purple-200",
      glow: "shadow-[0_0_35px_rgba(168,85,247,0.08)]",
      top: "PROFISSIONAL",
    };
  }

  return {
    border: "border-zinc-800",
    bg: "bg-zinc-950",
    badge: "bg-zinc-900 text-zinc-300 border-zinc-700",
    title: "text-white",
    glow: "",
    top: "ESSENCIAL",
  };
}

function benefitLines(plan: Plan) {
  const benefits = plan.benefits || {};

  return [
    {
      label: "Explorar DJs",
      available: benefits.explore === true,
      emphasis: false,
    },
    {
      label: "Chat direto com Artistas",
      available: benefits.chat === true,
      emphasis: false,
    },
    {
      label:
        benefits.offers === "high"
          ? "Ofertas em nível Pro"
          : benefits.offers === "enhanced"
            ? "Ofertas com recursos ampliados"
            : "Ofertas padrão",
      available: Boolean(benefits.offers),
      emphasis: benefits.offers === "high",
    },
    {
      label: "Gestão de eventos",
      available: benefits.events === true,
      emphasis: false,
    },
    {
      label: "Filtros avançados no Explorar",
      available: benefits.advanced_filters === true,
      emphasis: false,
    },
    {
      label: "Relatórios avançados",
      available: benefits.reports === true,
      emphasis: false,
    },
    {
      label:
        benefits.support_priority === "priority"
          ? "Suporte Aura prioritário"
          : "Chat com a Equipe Aura",
      available: benefits.support_chat === true,
      emphasis: benefits.support_priority === "priority",
    },
  ];
}

export default function VenuePlansPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [venueName, setVenueName] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [access, setAccess] = useState<PlanAccess | null>(null);

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

        const { data: venue, error: venueError } = await supabase
          .from("venue_profiles")
          .select("id,trade_name")
          .eq("owner_user_id", user.id)
          .maybeSingle();

        if (venueError) throw venueError;

        if (!venue) {
          router.replace("/perfil-casa");
          return;
        }

        const [planResult, planAccess] = await Promise.all([
          supabase
            .from("plans")
            .select("id,code,name,monthly_price,benefits,is_active")
            .eq("audience", "venue")
            .eq("is_active", true)
            .order("monthly_price"),
          getMyPlanAccess("venue"),
        ]);

        if (planResult.error) throw planResult.error;
        if (!active) return;

        setVenueName(venue.trade_name);
        setPlans((planResult.data || []) as Plan[]);
        setAccess(planAccess);
      } catch (caught) {
        console.error(caught);

        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Não foi possível carregar os planos da Casa.",
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
  }, [router]);

  const currentPlan = useMemo(
    () =>
      access?.active
        ? plans.find((plan) => plan.id === access.planId) || null
        : null,
    [access, plans],
  );

  if (loading) {
    return (
      <main className="aura-page flex min-h-[70vh] items-center justify-center text-zinc-400">
        Carregando planos…
      </main>
    );
  }

  return (
    <main className="aura-page px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="aura-hero aura-venue-hero rounded-3xl p-6 sm:p-8">
          <p className="aura-kicker">PLANO DA CASA</p>

          <h1 className="mt-2 text-3xl font-black">
            Escolha o nível da sua operação
          </h1>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
            {venueName || "Sua Casa"} · quanto maior o nível, mais ferramentas
            profissionais o Aura Beat libera.
          </p>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        <PlanStatusCard
          audience="venue"
          access={access}
        />

        <section>
          <div className="mb-5">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-red-300">
              COMPARAR PLANOS
            </p>

            <h2 className="mt-2 text-2xl font-black">
              Do essencial ao nível Pro
            </h2>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {plans.map((plan) => {
              const style = planVisual(plan.code);
              const current = currentPlan?.id === plan.id;

              return (
                <article
                  key={plan.id}
                  className={
                    "relative rounded-3xl border p-6 " +
                    style.border +
                    " " +
                    style.bg +
                    " " +
                    style.glow
                  }
                >
                  {plan.code === "pro" && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-amber-400/30 bg-black px-4 py-1.5 text-[10px] font-black tracking-[0.18em] text-amber-300">
                      ✦ EXPERIÊNCIA PREMIUM
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                        {style.top}
                      </p>

                      <h3 className={"mt-2 text-2xl font-black " + style.title}>
                        {plan.name}
                      </h3>
                    </div>

                    {current && (
                      <span
                        className={
                          "rounded-full border px-3 py-1 text-[10px] font-black " +
                          style.badge
                        }
                      >
                        SEU PLANO
                      </span>
                    )}
                  </div>

                  <p className="mt-5 text-3xl font-black text-green-400">
                    {money(plan.monthly_price)}
                    <span className="text-sm font-semibold text-zinc-500">
                      /mês
                    </span>
                  </p>

                  <div className="mt-6 space-y-2">
                    {benefitLines(plan).map((benefit) => (
                      <div
                        key={benefit.label}
                        className={
                          "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm " +
                          (benefit.available
                            ? benefit.emphasis
                              ? "border-amber-400/20 bg-amber-400/5 text-amber-100"
                              : "border-green-500/15 bg-green-500/5 text-zinc-200"
                            : "border-zinc-800/70 bg-black/20 text-zinc-600")
                        }
                      >
                        <span>
                          {benefit.available ? "✓" : "🔒"}
                        </span>

                        <span className="font-semibold">
                          {benefit.label}
                        </span>
                      </div>
                    ))}
                  </div>

                  {plan.code === "pro" && (
                    <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm font-bold text-amber-200">
                      ✦ Para Casas que querem a experiência mais completa do Aura Beat.
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => router.push(`/assinatura/${plan.id}`)}
                    className={`mt-6 w-full rounded-xl px-4 py-3 text-sm font-black transition ${
                      current
                        ? "border border-green-700 text-green-300 hover:bg-green-950/30"
                        : "bg-green-600 text-white hover:bg-green-500"
                    }`}
                  >
                    {current ? "Renovar por mais 1 mês" : "Assinar com Pix"}
                  </button>

                  <p className="mt-3 text-xs leading-5 text-zinc-500">
                    Pagamento processado pelo ASAAS. Após a confirmação do Pix,
                    o plano é ativado automaticamente por 1 mês.
                  </p>
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
          ← Voltar para a Home da Casa
        </button>
      </div>
    </main>
  );
}
