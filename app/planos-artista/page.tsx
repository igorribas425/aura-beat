"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PlanStatusCard } from "../../components/plan-status-card";
import { formatBRL } from "../../lib/finance";
import { getMyPlanAccess, type PlanAccess } from "../../lib/plan-access";
import { supabase } from "../../lib/supabase";

type Plan = {
  id: string;
  code: string;
  name: string;
  monthly_price: number;
  benefits: Record<string, unknown>;
  is_active: boolean;
};

type Subscription = {
  id: string;
  plan_id: string;
  status: "trialing" | "active" | "past_due" | "cancelled" | "expired";
  trial_ends_at: string | null;
  current_period_end: string | null;
  provider: string | null;
  created_at: string;
};

const BENEFIT_LABELS: Record<string, string> = {
  core_profile: "Perfil profissional completo",
  presskit: "Press Kit público",
  chat: "Chat direto com Casas",
  offers: "Acesso a ofertas",
  agenda: "Agenda profissional",
  analytics: "Analytics avançado",
  profile_highlight: "Destaque visual do perfil",
  pro_badge: "Selo exclusivo PRO",
  support_chat: "Chat com a Equipe Aura",
  priority_support: "Atendimento prioritário",
};

function money(value: number) {
  return formatBRL(Number(value || 0));
}

function date(value: string | null) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
  }).format(new Date(value));
}

function benefitText(key: string, value: unknown) {
  if (key === "trial_days") {
    return `${value} dias de teste`;
  }

  if (key === "support_priority") {
    return value === "priority"
      ? "Suporte Aura prioritário"
      : "Chat com a Equipe Aura";
  }

  if (key === "visibility") {
    const labels: Record<string, string> = {
      limited: "Visibilidade inicial",
      standard: "Visibilidade padrão",
      enhanced: "Visibilidade ampliada",
      high: "Alta visibilidade",
    };
    return labels[String(value)] || `Visibilidade: ${String(value)}`;
  }

  if (BENEFIT_LABELS[key] && value === true) {
    return BENEFIT_LABELS[key];
  }

  if (typeof value === "number") {
    return `${BENEFIT_LABELS[key] || key}: ${value}`;
  }

  if (typeof value === "string") {
    return `${BENEFIT_LABELS[key] || key}: ${value}`;
  }

  return BENEFIT_LABELS[key] || key;
}

export default function ArtistPlansPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [access, setAccess] = useState<PlanAccess | null>(null);
  const [artistName, setArtistName] = useState("");

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

      const { data: artist, error: artistError } = await supabase
        .from("artist_profiles")
        .select("id,stage_name")
        .eq("user_id", user.id)
        .maybeSingle();

      if (artistError) throw artistError;

      if (!artist) {
        router.replace("/perfil-artista");
        return;
      }

      setArtistName(artist.stage_name);

      const [planResult, subscriptionResult, planAccess] = await Promise.all([
        supabase
          .from("plans")
          .select("id,code,name,monthly_price,benefits,is_active")
          .eq("audience", "artist")
          .eq("is_active", true)
          .order("monthly_price"),
        supabase
          .from("subscriptions")
          .select("id,plan_id,status,trial_ends_at,current_period_end,provider,created_at")
          .eq("artist_id", artist.id)
          .order("created_at", { ascending: false }),
        getMyPlanAccess("artist"),
      ]);

      if (planResult.error) throw planResult.error;
      if (subscriptionResult.error) throw subscriptionResult.error;

      setPlans((planResult.data || []) as Plan[]);
      setSubscriptions((subscriptionResult.data || []) as Subscription[]);
      setAccess(planAccess);
    } catch (caught) {
      console.error(caught);
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível carregar seu plano.",
      );
    } finally {
      setLoading(false);
    }
  }

  const loadEffect = useEffectEvent(() => {
    void load();
  });

  useEffect(() => {
    loadEffect();
  }, []);

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
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="aura-hero rounded-3xl p-6 sm:p-8">
          <p className="aura-kicker">ASSINATURA DO ARTISTA</p>
          <h1 className="mt-2 text-3xl font-black">Meu plano</h1>
          <p className="mt-3 text-sm text-zinc-400">
            {artistName || "Artista"} · veja seu plano atual e compare os planos disponíveis.
          </p>
        </section>

        <section className="rounded-3xl border border-cyan-500/25 bg-cyan-500/5 p-5">
          <p className="font-black text-cyan-300">○ Plano Gratuito permanente para Artistas verificados</p>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Perfil, Press Kit e chat ficam disponíveis sem prazo. Ofertas, agenda, analytics,
            destaque e suporte profissional ficam nos planos pagos.
          </p>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        <PlanStatusCard
          audience="artist"
          access={access}
        />

        <section>
          <div className="mb-4">
            <p className="text-xs font-black uppercase text-amber-400">
              Comparar
            </p>
            <h2 className="mt-1 text-2xl font-black">Planos para Artistas</h2>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {plans.map((plan) => {
              const current = currentPlan?.id === plan.id;
              const benefits = Object.entries(plan.benefits || {}).filter(
                ([, value]) => value !== false && value !== null,
              );

              return (
                <article
                  key={plan.id}
                  className={`relative rounded-3xl border p-6 ${
                    plan.code === "pro"
                      ? "border-amber-400/50 bg-gradient-to-b from-amber-500/10 via-zinc-950 to-purple-500/5 shadow-[0_0_45px_rgba(251,191,36,0.10)]"
                      : plan.code === "intermediate"
                        ? "border-purple-500/40 bg-gradient-to-b from-purple-500/10 to-zinc-950"
                        : "border-zinc-800 bg-zinc-950"
                  } ${
                    current
                      ? "ring-1 ring-green-500/30"
                      : ""
                  }`}
                >
                  {plan.code === "pro" && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-amber-400/30 bg-black px-4 py-1.5 text-[10px] font-black tracking-[0.18em] text-amber-300">
                      ✦ EXPERIÊNCIA PREMIUM
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                        {plan.code === "pro"
                          ? "MAIS COMPLETO"
                          : plan.code === "intermediate"
                            ? "PROFISSIONAL"
                            : plan.code === "free"
                              ? "ACESSO INICIAL"
                              : "ESSENCIAL"}
                      </p>
                      <h3 className={`mt-2 text-2xl font-black ${
                        plan.code === "pro"
                          ? "text-amber-200"
                          : plan.code === "intermediate"
                            ? "text-purple-200"
                            : "text-white"
                      }`}>
                        {plan.name}
                      </h3>
                    </div>
                    {current && (
                      <span className="rounded-full bg-purple-500/15 px-3 py-1 text-xs font-black text-purple-300">
                        SEU PLANO
                      </span>
                    )}
                  </div>

                  <p className="mt-4 text-3xl font-black text-green-400">
                    {plan.code === "free" ? "Grátis" : money(plan.monthly_price)}
                    {plan.code !== "free" && (
                      <span className="text-sm font-semibold text-zinc-500">/mês</span>
                    )}
                  </p>

                  <div className="mt-5 space-y-2">
                    {benefits.map(([key, value]) => (
                      <p key={key} className="text-sm text-zinc-300">
                        ✓ {benefitText(key, value)}
                      </p>
                    ))}
                  </div>

                  {plan.code === "pro" && (
                    <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm font-bold text-amber-200">
                      ✦ Para Artistas que querem o nível mais completo e destacado do Aura Beat.
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={plan.code === "free"}
                    onClick={() => {
                      if (plan.code !== "free") {
                        router.push(`/assinatura/${plan.id}`);
                      }
                    }}
                    className={`mt-6 w-full rounded-xl px-4 py-3 text-sm font-black transition ${
                      plan.code === "free"
                        ? "cursor-default border border-cyan-700/50 bg-cyan-500/5 text-cyan-300"
                        : current
                          ? "border border-green-700 text-green-300 hover:bg-green-950/30"
                          : "bg-green-600 text-white hover:bg-green-500"
                    }`}
                  >
                    {plan.code === "free"
                      ? current
                        ? "Seu plano gratuito"
                        : "Disponível automaticamente"
                      : current
                        ? "Renovar por mais 1 mês"
                        : "Assinar com Pix"}
                  </button>

                  <p className="mt-3 text-xs leading-5 text-zinc-500">
                    {plan.code === "free"
                      ? "Liberado automaticamente após a verificação do perfil, sem cobrança e sem prazo."
                      : "Pagamento processado pelo ASAAS. Após a confirmação do Pix, o plano é ativado automaticamente por 1 mês."}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        {subscriptions.length > 0 && (
          <section>
            <h2 className="text-xl font-black">Histórico</h2>
            <div className="mt-4 space-y-2">
              {subscriptions.map((subscription) => (
                <div
                  key={subscription.id}
                  className="flex flex-col justify-between gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:flex-row"
                >
                  <span className="text-sm text-zinc-300">
                    {plans.find((plan) => plan.id === subscription.plan_id)?.name || "Plano"}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {subscription.status} · {date(subscription.current_period_end)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
