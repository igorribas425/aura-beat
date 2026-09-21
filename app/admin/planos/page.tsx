"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatBRL } from "../../../lib/finance";
import { supabase } from "../../../lib/supabase";

type Plan = {
  id: string;
  audience: "artist" | "venue";
  code: string;
  name: string;
  monthly_price: number;
  benefits: Record<string, unknown>;
  is_active: boolean;
};

type Subscription = {
  id: string;
  plan_id: string;
  artist_id: string | null;
  venue_id: string | null;
  status: "trialing" | "active" | "past_due" | "cancelled" | "expired";
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  provider: string | null;
  created_at: string;
};

type Artist = {
  id: string;
  stage_name: string;
};

type Venue = {
  id: string;
  trade_name: string;
};

type Draft = {
  name: string;
  price: string;
  active: boolean;
  benefits: string;
};

function money(value: number) {
  return formatBRL(Number(value || 0));
}

function date(value: string | null) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export default function AdminPlansPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const [audience, setAudience] = useState<"artist" | "venue">("artist");
  const [targetId, setTargetId] = useState("");
  const [planId, setPlanId] = useState("");
  const [status, setStatus] = useState<"active" | "trialing">("active");
  const [months, setMonths] = useState("1");

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

      const { data: adminData } = await supabase
        .from("aura_admins")
        .select("role,is_active")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!adminData?.is_active || adminData.role !== "owner") {
        setAccessDenied(true);
        return;
      }

      const [planResult, subscriptionResult, artistResult, venueResult] =
        await Promise.all([
          supabase
            .from("plans")
            .select("id,audience,code,name,monthly_price,benefits,is_active")
            .order("audience")
            .order("monthly_price"),
          supabase
            .from("subscriptions")
            .select("id,plan_id,artist_id,venue_id,status,trial_ends_at,current_period_start,current_period_end,provider,created_at")
            .order("created_at", { ascending: false }),
          supabase
            .from("artist_profiles")
            .select("id,stage_name")
            .eq("is_active", true)
            .order("stage_name"),
          supabase
            .from("venue_profiles")
            .select("id,trade_name")
            .eq("is_active", true)
            .order("trade_name"),
        ]);

      if (planResult.error) throw planResult.error;
      if (subscriptionResult.error) throw subscriptionResult.error;
      if (artistResult.error) throw artistResult.error;
      if (venueResult.error) throw venueResult.error;

      const loadedPlans = (planResult.data || []) as Plan[];
      setPlans(loadedPlans);
      setSubscriptions((subscriptionResult.data || []) as Subscription[]);
      setArtists((artistResult.data || []) as Artist[]);
      setVenues((venueResult.data || []) as Venue[]);

      const nextDrafts: Record<string, Draft> = {};
      for (const plan of loadedPlans) {
        nextDrafts[plan.id] = {
          name: plan.name,
          price: String(plan.monthly_price),
          active: plan.is_active,
          benefits: JSON.stringify(plan.benefits || {}, null, 2),
        };
      }
      setDrafts(nextDrafts);

      const firstArtistPlan = loadedPlans.find(
        (plan) => plan.audience === "artist" && plan.is_active,
      );
      if (firstArtistPlan) setPlanId(firstArtistPlan.id);
    } catch (caught) {
      console.error(caught);
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível carregar os planos.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const validPlan = plans.find(
      (plan) => plan.audience === audience && plan.is_active,
    );
    setPlanId(validPlan?.id || "");
    setTargetId("");
  }, [audience, plans]);

  const planMap = useMemo(
    () => new Map(plans.map((plan) => [plan.id, plan])),
    [plans],
  );

  const artistMap = useMemo(
    () => new Map(artists.map((artist) => [artist.id, artist.stage_name])),
    [artists],
  );

  const venueMap = useMemo(
    () => new Map(venues.map((venue) => [venue.id, venue.trade_name])),
    [venues],
  );

  async function savePlan(plan: Plan) {
    const draft = drafts[plan.id];
    if (!draft) return;

    try {
      setSaving(plan.id);
      setMessage("");
      setError("");

      const price = Number(draft.price.replace(",", "."));
      if (!Number.isFinite(price) || price < 0) {
        setError("Informe um preço válido.");
        return;
      }

      let benefits: Record<string, unknown>;
      try {
        benefits = JSON.parse(draft.benefits || "{}") as Record<string, unknown>;
      } catch {
        setError("Os benefícios precisam estar em JSON válido.");
        return;
      }

      const { error: rpcError } = await supabase.rpc(
        "owner_update_plan_v1",
        {
          p_plan_id: plan.id,
          p_name: draft.name.trim(),
          p_monthly_price: price,
          p_is_active: draft.active,
          p_benefits: benefits,
        },
      );

      if (rpcError) throw rpcError;

      setMessage("Plano atualizado com sucesso.");
      await load();
    } catch (caught) {
      console.error(caught);
      setError(
        caught instanceof Error ? caught.message : "Não foi possível salvar o plano.",
      );
    } finally {
      setSaving("");
    }
  }

  async function assignPlan() {
    if (!targetId || !planId) {
      setError("Escolha o perfil e o plano.");
      return;
    }

    const periodMonths = Number(months);

    if (!Number.isInteger(periodMonths) || periodMonths < 1 || periodMonths > 24) {
      setError("O período deve ficar entre 1 e 24 meses.");
      return;
    }

    try {
      setSaving("assign");
      setMessage("");
      setError("");

      const { error: rpcError } = await supabase.rpc(
        "owner_assign_subscription_v1",
        {
          p_plan_id: planId,
          p_artist_id: audience === "artist" ? targetId : null,
          p_venue_id: audience === "venue" ? targetId : null,
          p_status: status,
          p_period_months: periodMonths,
        },
      );

      if (rpcError) throw rpcError;

      setMessage("Plano atribuído com sucesso.");
      setTargetId("");
      await load();
    } catch (caught) {
      console.error(caught);
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível atribuir o plano.",
      );
    } finally {
      setSaving("");
    }
  }

  async function cancelSubscription(subscription: Subscription) {
    const targetName = subscription.artist_id
      ? artistMap.get(subscription.artist_id)
      : subscription.venue_id
        ? venueMap.get(subscription.venue_id)
        : "perfil";

    if (!window.confirm(`Cancelar a assinatura de ${targetName || "perfil"}?`)) {
      return;
    }

    const reason = window.prompt("Motivo do cancelamento (opcional):", "") || "";

    try {
      setSaving(subscription.id);
      setMessage("");
      setError("");

      const { error: rpcError } = await supabase.rpc(
        "owner_cancel_subscription_v1",
        {
          p_subscription_id: subscription.id,
          p_reason: reason || null,
        },
      );

      if (rpcError) throw rpcError;

      setMessage("Assinatura cancelada.");
      await load();
    } catch (caught) {
      console.error(caught);
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível cancelar a assinatura.",
      );
    } finally {
      setSaving("");
    }
  }

  if (loading) {
    return (
      <main className="aura-page flex min-h-[70vh] items-center justify-center text-zinc-400">
        Carregando planos…
      </main>
    );
  }

  if (accessDenied) {
    return (
      <main className="aura-page flex min-h-[70vh] items-center justify-center px-4">
        <section className="rounded-3xl border border-red-900/50 bg-red-950/10 p-8 text-center">
          <div className="text-5xl">🔒</div>
          <h1 className="mt-4 text-2xl font-black">Acesso restrito</h1>
          <p className="mt-2 text-zinc-400">
            Somente o owner pode administrar planos e assinaturas.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="aura-page px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="aura-hero rounded-3xl p-6 sm:p-8">
          <p className="aura-kicker">ADMINISTRAÇÃO</p>
          <h1 className="mt-2 text-3xl font-black">Planos e assinaturas</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
            Controle os planos de Artistas e Casas, valores, benefícios e
            atribuições manuais. A cobrança recorrente pelo ASAAS será ligada
            em uma etapa separada.
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

        <section>
          <div className="mb-4">
            <p className="text-xs font-black uppercase text-purple-400">Catálogo</p>
            <h2 className="mt-1 text-2xl font-black">Planos cadastrados</h2>
          </div>

          <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => {
              const draft = drafts[plan.id];
              if (!draft) return null;

              return (
                <article
                  key={plan.id}
                  className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-black uppercase text-zinc-400">
                      {plan.audience === "artist" ? "Artista" : "Casa"} · {plan.code}
                    </span>

                    <label className="flex items-center gap-2 text-xs text-zinc-400">
                      <input
                        type="checkbox"
                        checked={draft.active}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [plan.id]: {
                              ...current[plan.id],
                              active: event.target.checked,
                            },
                          }))
                        }
                      />
                      Ativo
                    </label>
                  </div>

                  <label className="mt-5 block text-xs font-bold text-zinc-500">
                    Nome
                    <input
                      value={draft.name}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [plan.id]: {
                            ...current[plan.id],
                            name: event.target.value,
                          },
                        }))
                      }
                      className="mt-2 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-white"
                    />
                  </label>

                  <label className="mt-4 block text-xs font-bold text-zinc-500">
                    Mensalidade
                    <input
                      value={draft.price}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [plan.id]: {
                            ...current[plan.id],
                            price: event.target.value,
                          },
                        }))
                      }
                      inputMode="decimal"
                      className="mt-2 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-white"
                    />
                  </label>

                  <label className="mt-4 block text-xs font-bold text-zinc-500">
                    Benefícios (JSON)
                    <textarea
                      rows={8}
                      value={draft.benefits}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [plan.id]: {
                            ...current[plan.id],
                            benefits: event.target.value,
                          },
                        }))
                      }
                      className="mt-2 w-full resize-y rounded-xl border border-zinc-800 bg-black px-4 py-3 font-mono text-xs text-zinc-300"
                    />
                  </label>

                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-xl font-black text-green-400">
                      {money(Number(draft.price.replace(",", ".")) || 0)}/mês
                    </p>

                    <button
                      type="button"
                      disabled={saving === plan.id}
                      onClick={() => void savePlan(plan)}
                      className="rounded-xl bg-purple-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
                    >
                      {saving === plan.id ? "Salvando…" : "Salvar"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
          <p className="text-xs font-black uppercase text-amber-400">
            Atribuição manual
          </p>
          <h2 className="mt-1 text-2xl font-black">Adicionar plano a um perfil</h2>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <label className="text-xs font-bold text-zinc-500">
              Tipo
              <select
                value={audience}
                onChange={(event) =>
                  setAudience(event.target.value as "artist" | "venue")
                }
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-white"
              >
                <option value="artist">Artista</option>
                <option value="venue">Casa</option>
              </select>
            </label>

            <label className="text-xs font-bold text-zinc-500">
              Perfil
              <select
                value={targetId}
                onChange={(event) => setTargetId(event.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-white"
              >
                <option value="">Selecione…</option>
                {(audience === "artist" ? artists : venues).map((item) => (
                  <option key={item.id} value={item.id}>
                    {"stage_name" in item ? item.stage_name : item.trade_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-bold text-zinc-500">
              Plano
              <select
                value={planId}
                onChange={(event) => setPlanId(event.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-white"
              >
                {plans
                  .filter((plan) => plan.audience === audience && plan.is_active)
                  .map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} · {money(plan.monthly_price)}
                    </option>
                  ))}
              </select>
            </label>

            <label className="text-xs font-bold text-zinc-500">
              Situação
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as "active" | "trialing")
                }
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-white"
              >
                <option value="active">Ativo</option>
                <option value="trialing">Teste</option>
              </select>
            </label>

            <label className="text-xs font-bold text-zinc-500">
              Meses
              <input
                value={months}
                onChange={(event) => setMonths(event.target.value)}
                inputMode="numeric"
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-white"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={saving === "assign"}
            onClick={() => void assignPlan()}
            className="mt-5 rounded-xl bg-green-600 px-6 py-3 font-black text-white disabled:opacity-50"
          >
            {saving === "assign" ? "Atribuindo…" : "Adicionar plano"}
          </button>
        </section>

        <section>
          <div className="mb-4">
            <p className="text-xs font-black uppercase text-green-400">
              Assinaturas
            </p>
            <h2 className="mt-1 text-2xl font-black">Histórico e assinaturas atuais</h2>
          </div>

          {subscriptions.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-zinc-800 p-10 text-center text-zinc-500">
              Nenhuma assinatura criada ainda.
            </div>
          ) : (
            <div className="space-y-3">
              {subscriptions.map((subscription) => {
                const plan = planMap.get(subscription.plan_id);
                const target = subscription.artist_id
                  ? artistMap.get(subscription.artist_id)
                  : subscription.venue_id
                    ? venueMap.get(subscription.venue_id)
                    : "Perfil";

                return (
                  <article
                    key={subscription.id}
                    className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-black">{target || "Perfil removido"}</p>
                        <p className="mt-1 text-sm text-zinc-500">
                          {plan?.name || "Plano"} · {plan ? money(plan.monthly_price) : "--"}
                        </p>
                        <p className="mt-1 text-xs text-zinc-600">
                          {subscription.status} · até {date(subscription.current_period_end)}
                          {subscription.provider ? ` · ${subscription.provider}` : ""}
                        </p>
                      </div>

                      {["active", "trialing", "past_due"].includes(
                        subscription.status,
                      ) && (
                        <button
                          type="button"
                          disabled={saving === subscription.id}
                          onClick={() => void cancelSubscription(subscription)}
                          className="rounded-xl border border-red-800 px-4 py-3 text-sm font-bold text-red-300 disabled:opacity-50"
                        >
                          Cancelar assinatura
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
