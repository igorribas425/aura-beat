"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatBRL } from "../../lib/finance";
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
  analytics: "Estatísticas avançadas",
  pro_badge: "Selo Pro",
  priority_support: "Suporte prioritário",
  advanced_filters: "Filtros avançados",
  reports: "Relatórios",
  team: "Equipe",
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

  if (key === "visibility") {
    const labels: Record<string, string> = {
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

      const [planResult, subscriptionResult] = await Promise.all([
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
      ]);

      if (planResult.error) throw planResult.error;
      if (subscriptionResult.error) throw subscriptionResult.error;

      setPlans((planResult.data || []) as Plan[]);
      setSubscriptions((subscriptionResult.data || []) as Subscription[]);
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

  useEffect(() => {
    void load();
  }, []);

  const currentSubscription = useMemo(
    () =>
      subscriptions.find((subscription) =>
        ["active", "trialing", "past_due"].includes(subscription.status),
      ) || null,
    [subscriptions],
  );

  const currentPlan = useMemo(
    () =>
      currentSubscription
        ? plans.find((plan) => plan.id === currentSubscription.plan_id) || null
        : null,
    [currentSubscription, plans],
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

        {error && (
          <div className="rounded-2xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
          <p className="text-xs font-black uppercase text-purple-400">
            Plano atual
          </p>

          {currentPlan && currentSubscription ? (
            <div className="mt-4 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-3xl font-black">{currentPlan.name}</h2>
                <p className="mt-2 text-2xl font-black text-green-400">
                  {money(currentPlan.monthly_price)}/mês
                </p>
                <p className="mt-2 text-sm text-zinc-500">
                  Status: {currentSubscription.status}
                  {currentSubscription.status === "trialing" &&
                    currentSubscription.trial_ends_at &&
                    ` · teste até ${date(currentSubscription.trial_ends_at)}`}
                  {currentSubscription.current_period_end
                    ? ` · período até ${date(currentSubscription.current_period_end)}`
                    : currentSubscription.status === "active"
                      ? " · ♾ acesso ilimitado"
                      : ""}
                </p>
              </div>

              <span className="h-fit rounded-full border border-green-800 bg-green-950/20 px-4 py-2 text-sm font-black text-green-300">
                ✓ Plano ativo
              </span>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-zinc-800 p-6">
              <h2 className="text-xl font-black">Sem plano ativo</h2>
              <p className="mt-2 text-sm text-zinc-500">
                Você ainda não possui uma assinatura ativa.
              </p>
            </div>
          )}
        </section>

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
                  className={`rounded-3xl border p-6 ${
                    current
                      ? "border-purple-500/60 bg-purple-950/10 shadow-[0_0_30px_rgba(168,85,247,0.12)]"
                      : "border-zinc-800 bg-zinc-950"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-2xl font-black">{plan.name}</h3>
                    {current && (
                      <span className="rounded-full bg-purple-500/15 px-3 py-1 text-xs font-black text-purple-300">
                        SEU PLANO
                      </span>
                    )}
                  </div>

                  <p className="mt-4 text-3xl font-black text-green-400">
                    {money(plan.monthly_price)}
                    <span className="text-sm font-semibold text-zinc-500">/mês</span>
                  </p>

                  <div className="mt-5 space-y-2">
                    {benefits.map(([key, value]) => (
                      <p key={key} className="text-sm text-zinc-300">
                        ✓ {benefitText(key, value)}
                      </p>
                    ))}
                  </div>

                  {!current && (
                    <div className="mt-6 rounded-xl border border-zinc-800 bg-black/30 p-3 text-xs leading-5 text-zinc-500">
                      A contratação automática deste plano pelo ASAAS será habilitada na próxima etapa.
                    </div>
                  )}
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
