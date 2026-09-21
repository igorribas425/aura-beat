"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ProfileAvatar } from "../../../components/profile-avatar";
import { formatBRL } from "../../../lib/finance";
import { supabase } from "../../../lib/supabase";

type Audience = "artist" | "venue";
type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "cancelled"
  | "expired";

type Plan = {
  id: string;
  audience: Audience;
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
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  provider: string | null;
  created_at: string;
};

type Artist = {
  id: string;
  stage_name: string;
  base_city: string | null;
  base_state: string | null;
  avatar_url: string | null;
};

type Venue = {
  id: string;
  trade_name: string;
  city: string | null;
  state: string | null;
  avatar_url: string | null;
};

type Draft = {
  name: string;
  price: string;
  active: boolean;
  benefits: string;
};

type DurationChoice =
  | "1"
  | "3"
  | "6"
  | "12"
  | "custom"
  | "unlimited";

function money(value: number) {
  return formatBRL(Number(value || 0));
}

function date(value: string | null) {
  if (!value) return "--";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function statusLabel(status: SubscriptionStatus) {
  switch (status) {
    case "active":
      return "Ativo";
    case "trialing":
      return "Teste";
    case "past_due":
      return "Pagamento pendente";
    case "cancelled":
      return "Cancelado";
    case "expired":
      return "Expirado";
    default:
      return status;
  }
}

function isCurrentStatus(status: SubscriptionStatus) {
  return ["active", "trialing", "past_due"].includes(status);
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

  const [audience, setAudience] = useState<Audience>("artist");
  const [query, setQuery] = useState("");
  const [targetId, setTargetId] = useState("");
  const [planId, setPlanId] = useState("");
  const [status, setStatus] = useState<"active" | "trialing">("active");
  const [duration, setDuration] = useState<DurationChoice>("1");
  const [customMonths, setCustomMonths] = useState("18");

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

      const { data: ownerAccess, error: ownerAccessError } =
        await supabase.rpc("owner_access_v1");

      if (ownerAccessError) throw ownerAccessError;

      if (ownerAccess !== true) {
        setAccessDenied(true);
        return;
      }

      setAccessDenied(false);

      const [
        planResult,
        subscriptionResult,
        artistResult,
        venueResult,
      ] = await Promise.all([
        supabase
          .from("plans")
          .select(
            "id,audience,code,name,monthly_price,benefits,is_active",
          )
          .order("audience")
          .order("monthly_price"),
        supabase.rpc(
          "owner_list_subscriptions_v1",
        ),
        supabase
          .from("artist_profiles")
          .select(
            "id,stage_name,base_city,base_state,avatar_url",
          )
          .eq("is_active", true)
          .order("stage_name"),
        supabase
          .from("venue_profiles")
          .select(
            "id,trade_name,city,state,avatar_url",
          )
          .eq("is_active", true)
          .order("trade_name"),
      ]);

      if (planResult.error) throw planResult.error;
      if (subscriptionResult.error) throw subscriptionResult.error;
      if (artistResult.error) throw artistResult.error;
      if (venueResult.error) throw venueResult.error;

      const loadedPlans = (planResult.data || []) as Plan[];
      const loadedArtists = (artistResult.data || []) as Artist[];
      const loadedVenues = (venueResult.data || []) as Venue[];

      setPlans(loadedPlans);
      setSubscriptions(
        (subscriptionResult.data || []) as Subscription[],
      );
      setArtists(loadedArtists);
      setVenues(loadedVenues);

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

      setPlanId((current) => {
        const currentStillValid = loadedPlans.some(
          (plan) =>
            plan.id === current &&
            plan.audience === audience &&
            plan.is_active,
        );

        if (currentStillValid) return current;

        return (
          loadedPlans.find(
            (plan) =>
              plan.audience === audience &&
              plan.is_active,
          )?.id || ""
        );
      });

      setTargetId((current) => {
        const currentStillValid =
          audience === "artist"
            ? loadedArtists.some((artist) => artist.id === current)
            : loadedVenues.some((venue) => venue.id === current);

        if (currentStillValid) return current;

        return audience === "artist"
          ? loadedArtists[0]?.id || ""
          : loadedVenues[0]?.id || "";
      });
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
      (plan) =>
        plan.audience === audience &&
        plan.is_active,
    );

    setPlanId(validPlan?.id || "");
    setQuery("");

    const firstTarget =
      audience === "artist"
        ? artists[0]?.id
        : venues[0]?.id;

    setTargetId(firstTarget || "");
  }, [audience]);

  const planMap = useMemo(
    () => new Map(plans.map((plan) => [plan.id, plan])),
    [plans],
  );

  const artistMap = useMemo(
    () =>
      new Map(
        artists.map((artist) => [artist.id, artist.stage_name]),
      ),
    [artists],
  );

  const venueMap = useMemo(
    () =>
      new Map(
        venues.map((venue) => [venue.id, venue.trade_name]),
      ),
    [venues],
  );

  const activePlans = useMemo(
    () =>
      plans.filter(
        (plan) =>
          plan.audience === audience &&
          plan.is_active,
      ),
    [audience, plans],
  );

  const filteredTargets = useMemo(() => {
    const term = query.trim().toLowerCase();

    if (audience === "artist") {
      return artists.filter((artist) => {
        if (!term) return true;

        return [
          artist.stage_name,
          artist.base_city,
          artist.base_state,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term);
      });
    }

    return venues.filter((venue) => {
      if (!term) return true;

      return [
        venue.trade_name,
        venue.city,
        venue.state,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [artists, audience, query, venues]);

  const selectedArtist =
    audience === "artist"
      ? artists.find((artist) => artist.id === targetId) || null
      : null;

  const selectedVenue =
    audience === "venue"
      ? venues.find((venue) => venue.id === targetId) || null
      : null;

  const selectedName =
    selectedArtist?.stage_name ||
    selectedVenue?.trade_name ||
    "";

  const selectedAvatar =
    selectedArtist?.avatar_url ||
    selectedVenue?.avatar_url ||
    null;

  const selectedLocation = [
    selectedArtist?.base_city || selectedVenue?.city,
    selectedArtist?.base_state || selectedVenue?.state,
  ]
    .filter(Boolean)
    .join(" — ");

  const currentSubscription = useMemo(
    () =>
      subscriptions.find(
        (subscription) =>
          isCurrentStatus(subscription.status) &&
          (audience === "artist"
            ? subscription.artist_id === targetId
            : subscription.venue_id === targetId),
      ) || null,
    [audience, subscriptions, targetId],
  );

  const currentPlan = currentSubscription
    ? planMap.get(currentSubscription.plan_id) || null
    : null;

  const selectedPlan =
    plans.find((plan) => plan.id === planId) || null;

  function resolveDuration() {
    if (duration === "unlimited") {
      return {
        unlimited: true,
        months: 0,
      };
    }

    if (duration === "custom") {
      const parsed = Number(customMonths);

      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 120) {
        throw new Error(
          "Use 0 para ilimitado ou um período entre 1 e 120 meses.",
        );
      }

      if (parsed === 0) {
        return {
          unlimited: true,
          months: 0,
        };
      }

      return {
        unlimited: false,
        months: parsed,
      };
    }

    return {
      unlimited: false,
      months: Number(duration),
    };
  }

  async function assignPlan() {
    if (!targetId || !planId) {
      setError("Escolha o perfil e o plano.");
      return;
    }

    let durationResult: {
      unlimited: boolean;
      months: number;
    };

    try {
      durationResult = resolveDuration();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Duração inválida.",
      );
      return;
    }

    const durationText = durationResult.unlimited
      ? "ilimitado"
      : `${durationResult.months} mês(es)`;

    const confirmed = window.confirm(
      `Aplicar o plano ${selectedPlan?.name || ""} para ${selectedName} por ${durationText}?`,
    );

    if (!confirmed) return;

    try {
      setSaving("assign");
      setMessage("");
      setError("");

      const { error: rpcError } = await supabase.rpc(
        "owner_assign_subscription_v2",
        {
          p_plan_id: planId,
          p_artist_id:
            audience === "artist"
              ? targetId
              : null,
          p_venue_id:
            audience === "venue"
              ? targetId
              : null,
          p_status: status,
          p_period_months: durationResult.months,
          p_unlimited: durationResult.unlimited,
        },
      );

      if (rpcError) throw rpcError;

      setMessage(
        `Plano ${selectedPlan?.name || ""} aplicado para ${selectedName}.`,
      );

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

  async function cancelSubscription(
    subscription: Subscription,
  ) {
    const targetName = subscription.artist_id
      ? artistMap.get(subscription.artist_id)
      : subscription.venue_id
        ? venueMap.get(subscription.venue_id)
        : "perfil";

    if (
      !window.confirm(
        `Cancelar a assinatura de ${targetName || "perfil"}?`,
      )
    ) {
      return;
    }

    const reason =
      window.prompt(
        "Motivo do cancelamento (opcional):",
        "",
      ) || "";

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

  async function savePlan(plan: Plan) {
    const draft = drafts[plan.id];

    if (!draft) return;

    try {
      setSaving(plan.id);
      setMessage("");
      setError("");

      const price = Number(
        draft.price.replace(",", "."),
      );

      if (
        !Number.isFinite(price) ||
        price < 0
      ) {
        setError("Informe um preço válido.");
        return;
      }

      let benefits: Record<string, unknown>;

      try {
        benefits = JSON.parse(
          draft.benefits || "{}",
        ) as Record<string, unknown>;
      } catch {
        setError(
          "Os benefícios precisam estar em JSON válido.",
        );
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
        caught instanceof Error
          ? caught.message
          : "Não foi possível salvar o plano.",
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

          <h1 className="mt-4 text-2xl font-black">
            Acesso restrito
          </h1>

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
          <p className="aura-kicker">
            CENTRAL MESTRE
          </p>

          <h1 className="mt-2 text-3xl font-black">
            Planos e assinaturas
          </h1>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
            Encontre um Artista ou Casa, escolha o plano e defina por quanto tempo o acesso ficará liberado.
          </p>

          <div className="mt-4 inline-flex rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs font-semibold text-amber-200">
            Atribuição manual não gera cobrança automática no ASAAS.
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

        <section className="rounded-3xl border border-zinc-800 bg-zinc-950/80 p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-purple-400">
                ATRIBUIR ACESSO
              </p>

              <h2 className="mt-2 text-2xl font-black">
                Escolha quem receberá o plano
              </h2>
            </div>

            <div className="inline-flex w-fit rounded-2xl border border-zinc-800 bg-black p-1">
              <button
                type="button"
                onClick={() => setAudience("artist")}
                className={`rounded-xl px-5 py-2.5 text-sm font-black transition ${
                  audience === "artist"
                    ? "bg-purple-600 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                🎧 Artistas
              </button>

              <button
                type="button"
                onClick={() => setAudience("venue")}
                className={`rounded-xl px-5 py-2.5 text-sm font-black transition ${
                  audience === "venue"
                    ? "bg-red-600 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                🏢 Casas
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
            <aside className="rounded-3xl border border-zinc-800 bg-black/40 p-4">
              <label className="block text-xs font-black uppercase tracking-wider text-zinc-500">
                Buscar {audience === "artist" ? "Artista" : "Casa"}
              </label>

              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={
                  audience === "artist"
                    ? "Nome do DJ ou cidade..."
                    : "Nome da Casa ou cidade..."
                }
                className="mt-3 w-full rounded-2xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-purple-500"
              />

              <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                <span>
                  {filteredTargets.length} resultado(s)
                </span>

                {targetId && (
                  <span className="text-green-400">
                    ✓ selecionado
                  </span>
                )}
              </div>

              <div className="mt-3 max-h-[520px] space-y-2 overflow-y-auto pr-1">
                {filteredTargets.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
                    Nenhum perfil encontrado.
                  </div>
                ) : (
                  filteredTargets.map((item) => {
                    const isArtist =
                      "stage_name" in item;

                    const name = isArtist
                      ? item.stage_name
                      : item.trade_name;

                    const avatar = item.avatar_url;

                    const location = [
                      isArtist
                        ? item.base_city
                        : item.city,
                      isArtist
                        ? item.base_state
                        : item.state,
                    ]
                      .filter(Boolean)
                      .join(" — ");

                    const selected =
                      item.id === targetId;

                    const itemSubscription =
                      subscriptions.find(
                        (subscription) =>
                          isCurrentStatus(
                            subscription.status,
                          ) &&
                          (audience === "artist"
                            ? subscription.artist_id === item.id
                            : subscription.venue_id === item.id),
                      );

                    const itemPlan =
                      itemSubscription
                        ? planMap.get(
                            itemSubscription.plan_id,
                          )
                        : null;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() =>
                          setTargetId(item.id)
                        }
                        className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
                          selected
                            ? "border-purple-500/70 bg-purple-500/10"
                            : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
                        }`}
                      >
                        <ProfileAvatar
                          kind={audience}
                          name={name}
                          url={avatar}
                          sizeClassName="h-12 w-12"
                          className="rounded-2xl"
                        />

                        <div className="min-w-0 flex-1">
                          <p className="truncate font-black">
                            {name}
                          </p>

                          <p className="mt-0.5 truncate text-xs text-zinc-500">
                            {location ||
                              "Localização não informada"}
                          </p>

                          {itemPlan && (
                            <p className="mt-1 text-[11px] font-bold text-green-400">
                              {itemPlan.name} ·{" "}
                              {itemSubscription?.current_period_end
                                ? `até ${date(itemSubscription.current_period_end)}`
                                : "ilimitado"}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            <div className="space-y-5">
              {!targetId ? (
                <div className="grid min-h-[420px] place-items-center rounded-3xl border border-dashed border-zinc-800 p-8 text-center">
                  <div>
                    <div className="text-5xl">
                      👤
                    </div>

                    <h3 className="mt-4 text-xl font-black">
                      Escolha um perfil
                    </h3>

                    <p className="mt-2 text-sm text-zinc-500">
                      Selecione um Artista ou Casa na lista ao lado.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <section className="rounded-3xl border border-zinc-800 bg-black/30 p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <ProfileAvatar
                        kind={audience}
                        name={selectedName}
                        url={selectedAvatar}
                        sizeClassName="h-20 w-20"
                        className="rounded-3xl"
                      />

                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black uppercase tracking-wider text-zinc-500">
                          {audience === "artist"
                            ? "Artista selecionado"
                            : "Casa selecionada"}
                        </p>

                        <h3 className="mt-1 truncate text-2xl font-black">
                          {selectedName}
                        </h3>

                        <p className="mt-1 text-sm text-zinc-500">
                          {selectedLocation ||
                            "Localização não informada"}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm">
                        <p className="text-xs text-zinc-500">
                          Plano atual
                        </p>

                        {currentPlan &&
                        currentSubscription ? (
                          <>
                            <p className="mt-1 font-black text-green-400">
                              {currentPlan.name}
                            </p>

                            <p className="mt-1 text-xs text-zinc-500">
                              {currentSubscription.current_period_end
                                ? `Até ${date(currentSubscription.current_period_end)}`
                                : "Ilimitado"}
                            </p>
                          </>
                        ) : (
                          <p className="mt-1 font-bold text-zinc-400">
                            Sem plano ativo
                          </p>
                        )}
                      </div>
                    </div>
                  </section>

                  <section className="rounded-3xl border border-zinc-800 bg-black/30 p-5">
                    <p className="text-xs font-black uppercase tracking-wider text-purple-400">
                      1. Escolha o plano
                    </p>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      {activePlans.map((plan) => {
                        const selected =
                          plan.id === planId;

                        return (
                          <button
                            key={plan.id}
                            type="button"
                            onClick={() =>
                              setPlanId(plan.id)
                            }
                            className={`rounded-2xl border p-4 text-left transition ${
                              selected
                                ? "border-purple-500 bg-purple-500/10"
                                : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
                            }`}
                          >
                            <p className="font-black">
                              {plan.name}
                            </p>

                            <p className="mt-2 text-lg font-black text-green-400">
                              {money(plan.monthly_price)}
                              <span className="text-xs font-semibold text-zinc-500">
                                /mês
                              </span>
                            </p>

                            {selected && (
                              <p className="mt-2 text-xs font-bold text-purple-300">
                                ✓ Selecionado
                              </p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section className="rounded-3xl border border-zinc-800 bg-black/30 p-5">
                    <p className="text-xs font-black uppercase tracking-wider text-amber-400">
                      2. Escolha o tempo
                    </p>

                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                      {[
                        ["1", "1 mês"],
                        ["3", "3 meses"],
                        ["6", "6 meses"],
                        ["12", "12 meses"],
                        ["custom", "Personalizado"],
                        ["unlimited", "♾ Ilimitado"],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() =>
                            setDuration(
                              value as DurationChoice,
                            )
                          }
                          className={`rounded-2xl border px-3 py-3 text-sm font-black transition ${
                            duration === value
                              ? "border-amber-500 bg-amber-500/10 text-amber-200"
                              : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {duration === "custom" && (
                      <label className="mt-4 block max-w-xs text-xs font-bold text-zinc-500">
                        Quantos meses?
                        <input
                          value={customMonths}
                          onChange={(event) =>
                            setCustomMonths(
                              event.target.value,
                            )
                          }
                          inputMode="numeric"
                          placeholder="Ex.: 18"
                          className="mt-2 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-white"
                        />
                        <span className="mt-1 block text-[11px] text-zinc-600">
                          Use 0 para ilimitado ou de 1 até 120 meses.
                        </span>
                      </label>
                    )}

                    {duration === "unlimited" && (
                      <div className="mt-4 rounded-2xl border border-green-500/20 bg-green-500/5 p-4 text-sm text-green-200">
                        ♾ O acesso ficará sem data de vencimento até você cancelar ou trocar o plano.
                      </div>
                    )}
                  </section>

                  <section className="rounded-3xl border border-zinc-800 bg-black/30 p-5">
                    <p className="text-xs font-black uppercase tracking-wider text-sky-400">
                      3. Situação
                    </p>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setStatus("active")
                        }
                        className={`rounded-xl border px-4 py-3 text-sm font-black ${
                          status === "active"
                            ? "border-green-500 bg-green-500/10 text-green-300"
                            : "border-zinc-800 text-zinc-400"
                        }`}
                      >
                        ✓ Ativar agora
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setStatus("trialing")
                        }
                        className={`rounded-xl border px-4 py-3 text-sm font-black ${
                          status === "trialing"
                            ? "border-blue-500 bg-blue-500/10 text-blue-300"
                            : "border-zinc-800 text-zinc-400"
                        }`}
                      >
                        🧪 Período de teste
                      </button>
                    </div>

                    <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        disabled={
                          saving === "assign" ||
                          !planId ||
                          !targetId
                        }
                        onClick={() =>
                          void assignPlan()
                        }
                        className="rounded-2xl bg-purple-600 px-6 py-4 font-black text-white transition hover:bg-purple-500 disabled:opacity-50"
                      >
                        {saving === "assign"
                          ? "Aplicando…"
                          : currentSubscription
                            ? "Trocar / renovar plano"
                            : "Aplicar plano"}
                      </button>

                      {currentSubscription && (
                        <button
                          type="button"
                          disabled={
                            saving ===
                            currentSubscription.id
                          }
                          onClick={() =>
                            void cancelSubscription(
                              currentSubscription,
                            )
                          }
                          className="rounded-2xl border border-red-800 px-6 py-4 font-black text-red-300 disabled:opacity-50"
                        >
                          Cancelar plano atual
                        </button>
                      )}
                    </div>
                  </section>
                </>
              )}
            </div>
          </div>
        </section>

        <details className="rounded-3xl border border-zinc-800 bg-zinc-950">
          <summary className="cursor-pointer p-6 font-black">
            ⚙️ Configurar catálogo de planos
            <span className="ml-2 text-xs font-normal text-zinc-500">
              preços, nomes, benefícios e plano ativo/inativo
            </span>
          </summary>

          <div className="border-t border-zinc-800 p-6">
            <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
              {plans.map((plan) => {
                const draft = drafts[plan.id];

                if (!draft) return null;

                return (
                  <article
                    key={plan.id}
                    className="rounded-3xl border border-zinc-800 bg-black/40 p-5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-black uppercase text-zinc-400">
                        {plan.audience === "artist"
                          ? "Artista"
                          : "Casa"}{" "}
                        · {plan.code}
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
                                active:
                                  event.target.checked,
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
                              price:
                                event.target.value,
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
                        rows={7}
                        value={draft.benefits}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [plan.id]: {
                              ...current[plan.id],
                              benefits:
                                event.target.value,
                            },
                          }))
                        }
                        className="mt-2 w-full resize-y rounded-xl border border-zinc-800 bg-black px-4 py-3 font-mono text-xs text-zinc-300"
                      />
                    </label>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <p className="text-lg font-black text-green-400">
                        {money(
                          Number(
                            draft.price.replace(",", "."),
                          ) || 0,
                        )}
                        /mês
                      </p>

                      <button
                        type="button"
                        disabled={
                          saving === plan.id
                        }
                        onClick={() =>
                          void savePlan(plan)
                        }
                        className="rounded-xl bg-purple-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
                      >
                        {saving === plan.id
                          ? "Salvando…"
                          : "Salvar"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </details>

        <section>
          <div className="mb-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-green-400">
              HISTÓRICO
            </p>

            <h2 className="mt-1 text-2xl font-black">
              Assinaturas recentes
            </h2>
          </div>

          {subscriptions.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-zinc-800 p-10 text-center text-zinc-500">
              Nenhuma assinatura criada ainda.
            </div>
          ) : (
            <div className="space-y-3">
              {subscriptions
                .slice(0, 50)
                .map((subscription) => {
                  const plan = planMap.get(
                    subscription.plan_id,
                  );

                  const target =
                    subscription.artist_id
                      ? artistMap.get(
                          subscription.artist_id,
                        )
                      : subscription.venue_id
                        ? venueMap.get(
                            subscription.venue_id,
                          )
                        : "Perfil";

                  const unlimited =
                    isCurrentStatus(
                      subscription.status,
                    ) &&
                    subscription.current_period_end ===
                      null;

                  return (
                    <article
                      key={subscription.id}
                      className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-black">
                              {target ||
                                "Perfil removido"}
                            </p>

                            <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] font-black uppercase text-zinc-400">
                              {subscription.artist_id
                                ? "Artista"
                                : "Casa"}
                            </span>
                          </div>

                          <p className="mt-1 text-sm text-zinc-500">
                            {plan?.name || "Plano"} ·{" "}
                            {plan
                              ? money(
                                  plan.monthly_price,
                                )
                              : "--"}
                          </p>

                          <p className="mt-1 text-xs text-zinc-600">
                            {statusLabel(
                              subscription.status,
                            )}{" "}
                            ·{" "}
                            {unlimited
                              ? "♾ Ilimitado"
                              : `até ${date(subscription.current_period_end)}`}
                            {subscription.provider
                              ? ` · ${subscription.provider}`
                              : ""}
                          </p>
                        </div>

                        {isCurrentStatus(
                          subscription.status,
                        ) && (
                          <button
                            type="button"
                            disabled={
                              saving ===
                              subscription.id
                            }
                            onClick={() =>
                              void cancelSubscription(
                                subscription,
                              )
                            }
                            className="rounded-xl border border-red-800 px-4 py-3 text-sm font-bold text-red-300 disabled:opacity-50"
                          >
                            Cancelar
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
