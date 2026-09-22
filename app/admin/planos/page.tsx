"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ProfileAvatar } from "../../../components/profile-avatar";
import { getOwnerAccessFast } from "../../../lib/admin-access";
import { formatBRL } from "../../../lib/finance";
import { supabase } from "../../../lib/supabase";

type Audience = "artist" | "venue";
type Tab = "add" | "history" | "catalog";
type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "cancelled"
  | "expired";

type Source =
  | "manual_admin"
  | "courtesy"
  | "partnership"
  | "trial"
  | "adjustment";

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

type HistoryEntry = {
  history_id: number;
  subscription_id: string;
  event_type: string;
  status: SubscriptionStatus;
  plan_id: string;
  plan_name: string | null;
  monthly_price: number | string | null;
  audience: Audience;
  profile_id: string;
  profile_name: string;
  assignment_source: string;
  provider: string | null;
  period_start: string | null;
  period_end: string | null;
  unlimited: boolean;
  actor_user_id: string | null;
  note: string | null;
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

const SOURCE_OPTIONS: Array<{
  value: Source;
  label: string;
  description: string;
}> = [
  {
    value: "manual_admin",
    label: "Liberação manual",
    description: "Acesso aplicado diretamente por você.",
  },
  {
    value: "courtesy",
    label: "Cortesia",
    description: "Plano sem cobrança para convidado ou parceiro.",
  },
  {
    value: "partnership",
    label: "Parceria",
    description: "Plano concedido por parceria comercial.",
  },
  {
    value: "trial",
    label: "Teste",
    description: "Liberação temporária para experimentar o plano.",
  },
  {
    value: "adjustment",
    label: "Ajuste administrativo",
    description: "Correção de plano, prazo ou situação.",
  },
];

function money(value: number | string | null | undefined) {
  return formatBRL(Number(value || 0));
}

function date(value: string | null) {
  if (!value) return "--";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function dateTime(value: string | null) {
  if (!value) return "--";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
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

function eventLabel(event: string) {
  switch (event) {
    case "created":
      return "Plano adicionado";
    case "cancelled":
      return "Plano cancelado";
    case "plan_changed":
      return "Plano alterado";
    case "period_changed":
      return "Prazo alterado";
    case "status_changed":
      return "Status alterado";
    case "updated":
      return "Assinatura atualizada";
    default:
      return event;
  }
}

function sourceLabel(source: string, provider?: string | null) {
  if (source === "asaas" || provider === "asaas") return "ASAAS automático";
  if (source === "courtesy") return "Cortesia";
  if (source === "partnership") return "Parceria";
  if (source === "trial") return "Teste";
  if (source === "adjustment") return "Ajuste administrativo";
  if (source === "manual_admin") return "Manual Admin";
  return source || provider || "Sistema";
}

function isCurrentStatus(status: SubscriptionStatus) {
  return ["active", "trialing", "past_due"].includes(status);
}

function isSubscriptionCurrent(subscription: Subscription) {
  if (!isCurrentStatus(subscription.status)) return false;
  if (!subscription.current_period_end) return true;

  return new Date(subscription.current_period_end).getTime() > Date.now();
}

export default function AdminPlansPage() {
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("add");
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
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
  const [source, setSource] = useState<Source>("manual_admin");
  const [note, setNote] = useState("");

  const [historyQuery, setHistoryQuery] = useState("");
  const [historyAudience, setHistoryAudience] = useState<"all" | Audience>("all");
  const [historyEvent, setHistoryEvent] = useState("all");

  async function load() {
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
        setAccessDenied(true);
        return;
      }

      setAccessDenied(false);

      const [
        planResult,
        subscriptionResult,
        historyResult,
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
        supabase.rpc("owner_list_subscriptions_v1"),
        supabase.rpc("owner_plan_history_v1", {
          p_limit: 500,
        }),
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
      if (historyResult.error) throw historyResult.error;
      if (artistResult.error) throw artistResult.error;
      if (venueResult.error) throw venueResult.error;

      const loadedPlans = (planResult.data || []) as Plan[];
      const loadedArtists = (artistResult.data || []) as Artist[];
      const loadedVenues = (venueResult.data || []) as Venue[];

      setPlans(loadedPlans);
      setSubscriptions(
        (subscriptionResult.data || []) as Subscription[],
      );
      setHistory((historyResult.data || []) as HistoryEntry[]);
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

  const loadEffect = useEffectEvent(() => {
    void load();
  });

  useEffect(() => {
    loadEffect();
  }, []);

  useEffect(() => {
    const validPlan = plans.find(
      (plan) =>
        plan.audience === audience &&
        plan.is_active,
    );

    setPlanId(validPlan?.id || "");
    setQuery("");

    setTargetId((current) => {
      const currentIsValid =
        audience === "artist"
          ? artists.some((artist) => artist.id === current)
          : venues.some((venue) => venue.id === current);

      if (currentIsValid) return current;

      return audience === "artist"
        ? artists[0]?.id || ""
        : venues[0]?.id || "";
    });
  }, [audience, artists, plans, venues]);

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
          isSubscriptionCurrent(subscription) &&
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

  const selectedProfileHistory = useMemo(
    () =>
      history
        .filter(
          (item) =>
            item.audience === audience &&
            item.profile_id === targetId,
        )
        .slice(0, 4),
    [audience, history, targetId],
  );

  const filteredHistory = useMemo(() => {
    const term = historyQuery.trim().toLowerCase();

    return history.filter((item) => {
      if (
        historyAudience !== "all" &&
        item.audience !== historyAudience
      ) {
        return false;
      }

      if (
        historyEvent !== "all" &&
        item.event_type !== historyEvent
      ) {
        return false;
      }

      if (!term) return true;

      return [
        item.profile_name,
        item.plan_name,
        sourceLabel(item.assignment_source, item.provider),
        eventLabel(item.event_type),
        item.note,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [history, historyAudience, historyEvent, historyQuery]);

  const activeSubscriptionCount = useMemo(
    () =>
      subscriptions.filter((subscription) =>
        isSubscriptionCurrent(subscription),
      ).length,
    [subscriptions],
  );

  const unlimitedCount = useMemo(
    () =>
      subscriptions.filter(
        (subscription) =>
          isSubscriptionCurrent(subscription) &&
          subscription.current_period_end === null,
      ).length,
    [subscriptions],
  );

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
      `Confirmar ${selectedPlan?.name || "plano"} para ${selectedName} por ${durationText}?`,
    );

    if (!confirmed) return;

    try {
      setSaving("assign");
      setMessage("");
      setError("");

      const { error: rpcError } = await supabase.rpc(
        "owner_assign_subscription_v3",
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
          p_source: source,
          p_note: note.trim() || null,
        },
      );

      if (rpcError) throw rpcError;

      const savedName = selectedName;
      const savedPlan = selectedPlan?.name || "Plano";

      await load();

      setMessage(
        `${savedPlan} aplicado para ${savedName}. O movimento já foi registrado no histórico.`,
      );
      setHistoryQuery(savedName);
      setHistoryAudience(audience);
      setHistoryEvent("all");
      setNote("");
      setTab("history");
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
        `Cancelar o plano atual de ${targetName || "perfil"}?`,
      )
    ) {
      return;
    }

    const reason =
      window.prompt(
        "Motivo do cancelamento:",
        "",
      ) || "";

    try {
      setSaving(subscription.id);
      setMessage("");
      setError("");

      const { error: rpcError } = await supabase.rpc(
        "owner_cancel_subscription_v2",
        {
          p_subscription_id: subscription.id,
          p_reason: reason || null,
        },
      );

      if (rpcError) throw rpcError;

      await load();

      setMessage(
        `Plano de ${targetName || "perfil"} cancelado e registrado no histórico.`,
      );
      setHistoryQuery(targetName || "");
      setHistoryEvent("all");
      setTab("history");
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

      if (!Number.isFinite(price) || price < 0) {
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

      setMessage("Catálogo atualizado.");
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
        Carregando Central de Planos…
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
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="aura-hero rounded-3xl p-6 sm:p-8">
          <p className="aura-kicker">CENTRAL MESTRE</p>

          <div className="mt-2 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black">
                Planos e assinaturas
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
                Controle manual de Artistas e Casas. Quando a cobrança automática pelo ASAAS estiver ligada, as assinaturas pagas entram sem você precisar cadastrar aqui.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl border border-zinc-800 bg-black/30 px-4 py-3">
                <p className="text-xl font-black">
                  {activeSubscriptionCount}
                </p>
                <p className="text-[10px] uppercase text-zinc-500">
                  ativos
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-black/30 px-4 py-3">
                <p className="text-xl font-black text-green-400">
                  {unlimitedCount}
                </p>
                <p className="text-[10px] uppercase text-zinc-500">
                  ilimitados
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-black/30 px-4 py-3">
                <p className="text-xl font-black text-purple-300">
                  {history.length}
                </p>
                <p className="text-[10px] uppercase text-zinc-500">
                  movimentos
                </p>
              </div>
            </div>
          </div>
        </section>

        <nav className="grid gap-2 rounded-3xl border border-zinc-800 bg-zinc-950 p-2 sm:grid-cols-3">
          {[
            {
              id: "add" as Tab,
              icon: "➕",
              title: "Adicionar plano",
              detail: "Pesquisar e liberar acesso",
            },
            {
              id: "history" as Tab,
              icon: "🧾",
              title: "Histórico",
              detail: "Tudo que aconteceu",
            },
            {
              id: "catalog" as Tab,
              icon: "⚙️",
              title: "Configurar planos",
              detail: "Preço e benefícios",
            },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-2xl border p-4 text-left transition ${
                tab === item.id
                  ? "border-purple-500/60 bg-purple-500/10"
                  : "border-transparent hover:border-zinc-800 hover:bg-black/30"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{item.icon}</span>
                <div>
                  <p className="font-black">{item.title}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {item.detail}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </nav>

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

        {tab === "add" && (
          <section className="space-y-6">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950/80 p-5 sm:p-6">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-purple-400">
                    PASSO 1
                  </p>
                  <h2 className="mt-2 text-2xl font-black">
                    Encontre o perfil
                  </h2>
                  <p className="mt-2 text-sm text-zinc-500">
                    Pesquise um DJ ou uma Casa para gerenciar o plano.
                  </p>
                </div>

                <div className="inline-flex w-fit rounded-2xl border border-zinc-800 bg-black p-1">
                  <button
                    type="button"
                    onClick={() => setAudience("artist")}
                    className={`rounded-xl px-5 py-2.5 text-sm font-black transition ${
                      audience === "artist"
                        ? "bg-purple-600 text-white"
                        : "text-zinc-400"
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
                        : "text-zinc-400"
                    }`}
                  >
                    🏢 Casas
                  </button>
                </div>
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
                <aside className="rounded-3xl border border-zinc-800 bg-black/40 p-4">
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={
                      audience === "artist"
                        ? "🔎 Nome do DJ ou cidade..."
                        : "🔎 Nome da Casa ou cidade..."
                    }
                    className="w-full rounded-2xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-purple-500"
                  />

                  <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                    <span>{filteredTargets.length} resultado(s)</span>
                    {targetId && (
                      <span className="font-bold text-green-400">
                        ✓ selecionado
                      </span>
                    )}
                  </div>

                  <div className="mt-3 max-h-[560px] space-y-2 overflow-y-auto pr-1">
                    {filteredTargets.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
                        Nenhum perfil encontrado.
                      </div>
                    ) : (
                      filteredTargets.map((item) => {
                        const isArtist = "stage_name" in item;
                        const name = isArtist
                          ? item.stage_name
                          : item.trade_name;
                        const location = [
                          isArtist ? item.base_city : item.city,
                          isArtist ? item.base_state : item.state,
                        ]
                          .filter(Boolean)
                          .join(" — ");
                        const selected = item.id === targetId;

                        const itemSubscription = subscriptions.find(
                          (subscription) =>
                            isSubscriptionCurrent(subscription) &&
                            (audience === "artist"
                              ? subscription.artist_id === item.id
                              : subscription.venue_id === item.id),
                        );

                        const itemPlan = itemSubscription
                          ? planMap.get(itemSubscription.plan_id)
                          : null;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setTargetId(item.id)}
                            className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
                              selected
                                ? "border-purple-500/70 bg-purple-500/10"
                                : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
                            }`}
                          >
                            <ProfileAvatar
                              kind={audience}
                              name={name}
                              url={item.avatar_url}
                              sizeClassName="h-12 w-12"
                              className="rounded-2xl"
                            />

                            <div className="min-w-0 flex-1">
                              <p className="truncate font-black">{name}</p>
                              <p className="mt-0.5 truncate text-xs text-zinc-500">
                                {location || "Localização não informada"}
                              </p>

                              {itemPlan ? (
                                <p className="mt-1 text-[11px] font-bold text-green-400">
                                  {itemPlan.name} ·{" "}
                                  {itemSubscription?.current_period_end
                                    ? `até ${date(itemSubscription.current_period_end)}`
                                    : "♾ ilimitado"}
                                </p>
                              ) : (
                                <p className="mt-1 text-[11px] text-zinc-600">
                                  Sem plano ativo
                                </p>
                              )}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </aside>

                {!targetId ? (
                  <div className="grid min-h-[520px] place-items-center rounded-3xl border border-dashed border-zinc-800 p-8 text-center">
                    <div>
                      <div className="text-5xl">👤</div>
                      <h3 className="mt-4 text-xl font-black">
                        Escolha um perfil
                      </h3>
                      <p className="mt-2 text-sm text-zinc-500">
                        O gerenciamento do plano aparece aqui.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
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
                            {selectedLocation || "Localização não informada"}
                          </p>
                        </div>

                        <div className="min-w-[180px] rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3">
                          <p className="text-xs text-zinc-500">
                            Plano atual
                          </p>

                          {currentPlan && currentSubscription ? (
                            <>
                              <p className="mt-1 font-black text-green-400">
                                {currentPlan.name}
                              </p>
                              <p className="mt-1 text-xs text-zinc-500">
                                {currentSubscription.current_period_end
                                  ? `Até ${date(currentSubscription.current_period_end)}`
                                  : "♾ Ilimitado"}
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
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-purple-400">
                        PASSO 2 · PLANO
                      </p>

                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        {activePlans.map((plan) => {
                          const selected = plan.id === planId;

                          return (
                            <button
                              key={plan.id}
                              type="button"
                              onClick={() => setPlanId(plan.id)}
                              className={`rounded-2xl border p-4 text-left transition ${
                                selected
                                  ? "border-purple-500 bg-purple-500/10 shadow-[0_0_25px_rgba(168,85,247,0.10)]"
                                  : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-black">{plan.name}</p>
                                {selected && (
                                  <span className="text-purple-300">✓</span>
                                )}
                              </div>
                              <p className="mt-2 text-lg font-black text-green-400">
                                {money(plan.monthly_price)}
                                <span className="text-xs font-semibold text-zinc-500">
                                  /mês
                                </span>
                              </p>
                              <p className="mt-3 text-xs text-zinc-500">
                                {Object.keys(plan.benefits || {}).length} benefício(s) configurado(s)
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </section>

                    <section className="rounded-3xl border border-zinc-800 bg-black/30 p-5">
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-400">
                        PASSO 3 · DURAÇÃO
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
                              setDuration(value as DurationChoice)
                            }
                            className={`rounded-2xl border px-3 py-3 text-sm font-black transition ${
                              duration === value
                                ? "border-amber-500 bg-amber-500/10 text-amber-200"
                                : "border-zinc-800 bg-zinc-950 text-zinc-400"
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
                              setCustomMonths(event.target.value)
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
                    </section>

                    <section className="rounded-3xl border border-zinc-800 bg-black/30 p-5">
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-400">
                        PASSO 4 · ORIGEM E OBSERVAÇÃO
                      </p>

                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <label className="text-xs font-bold text-zinc-500">
                          Tipo de liberação
                          <select
                            value={source}
                            onChange={(event) => {
                              const nextSource = event.target.value as Source;
                              setSource(nextSource);

                              if (nextSource === "trial") {
                                setStatus("trialing");
                              }
                            }}
                            className="mt-2 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-white"
                          >
                            {SOURCE_OPTIONS.map((item) => (
                              <option key={item.value} value={item.value}>
                                {item.label}
                              </option>
                            ))}
                          </select>

                          <span className="mt-2 block font-normal leading-5 text-zinc-600">
                            {
                              SOURCE_OPTIONS.find((item) => item.value === source)
                                ?.description
                            }
                          </span>
                        </label>

                        <div>
                          <p className="text-xs font-bold text-zinc-500">
                            Situação inicial
                          </p>

                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              onClick={() => setStatus("active")}
                              className={`flex-1 rounded-xl border px-3 py-3 text-sm font-black ${
                                status === "active"
                                  ? "border-green-500 bg-green-500/10 text-green-300"
                                  : "border-zinc-800 text-zinc-400"
                              }`}
                            >
                              ✓ Ativo
                            </button>

                            <button
                              type="button"
                              onClick={() => setStatus("trialing")}
                              className={`flex-1 rounded-xl border px-3 py-3 text-sm font-black ${
                                status === "trialing"
                                  ? "border-blue-500 bg-blue-500/10 text-blue-300"
                                  : "border-zinc-800 text-zinc-400"
                              }`}
                            >
                              🧪 Teste
                            </button>
                          </div>
                        </div>
                      </div>

                      <label className="mt-4 block text-xs font-bold text-zinc-500">
                        Observação administrativa
                        <textarea
                          rows={3}
                          value={note}
                          onChange={(event) => setNote(event.target.value)}
                          placeholder="Ex.: cortesia por parceria com evento de lançamento..."
                          className="mt-2 w-full resize-y rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white"
                        />
                      </label>
                    </section>

                    <section className="rounded-3xl border border-purple-500/30 bg-purple-500/5 p-5">
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-purple-300">
                        CONFIRMAÇÃO
                      </p>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <p className="text-xs text-zinc-500">Perfil</p>
                          <p className="mt-1 font-black">{selectedName}</p>
                        </div>

                        <div>
                          <p className="text-xs text-zinc-500">Plano</p>
                          <p className="mt-1 font-black">
                            {selectedPlan?.name || "--"}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-zinc-500">Duração</p>
                          <p className="mt-1 font-black">
                            {duration === "unlimited"
                              ? "♾ Ilimitado"
                              : duration === "custom"
                                ? customMonths === "0"
                                  ? "♾ Ilimitado"
                                  : `${customMonths} mês(es)`
                                : `${duration} mês(es)`}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-zinc-500">Origem</p>
                          <p className="mt-1 font-black">
                            {sourceLabel(source)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-5 text-amber-200">
                        Esta ação administrativa não cobra o cliente. Planos pagos pelo usuário serão ativados automaticamente pelo fluxo de cobrança quando o ASAAS de assinaturas estiver conectado.
                      </div>

                      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                        <button
                          type="button"
                          disabled={
                            saving === "assign" ||
                            !planId ||
                            !targetId
                          }
                          onClick={() => void assignPlan()}
                          className="rounded-2xl bg-purple-600 px-6 py-4 font-black text-white transition hover:bg-purple-500 disabled:opacity-50"
                        >
                          {saving === "assign"
                            ? "Aplicando plano…"
                            : currentSubscription
                              ? "Confirmar troca / renovação"
                              : "Confirmar e adicionar plano"}
                        </button>

                        {currentSubscription && (
                          <button
                            type="button"
                            disabled={saving === currentSubscription.id}
                            onClick={() =>
                              void cancelSubscription(currentSubscription)
                            }
                            className="rounded-2xl border border-red-800 px-6 py-4 font-black text-red-300 disabled:opacity-50"
                          >
                            Cancelar plano atual
                          </button>
                        )}
                      </div>
                    </section>

                    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
                            ÚLTIMOS MOVIMENTOS
                          </p>
                          <h3 className="mt-1 font-black">
                            Histórico deste perfil
                          </h3>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setHistoryQuery(selectedName);
                            setHistoryAudience(audience);
                            setTab("history");
                          }}
                          className="text-xs font-black text-purple-300"
                        >
                          Ver tudo →
                        </button>
                      </div>

                      {selectedProfileHistory.length === 0 ? (
                        <p className="mt-4 text-sm text-zinc-600">
                          Nenhum movimento de plano ainda.
                        </p>
                      ) : (
                        <div className="mt-4 space-y-2">
                          {selectedProfileHistory.map((item) => (
                            <div
                              key={item.history_id}
                              className="flex flex-col justify-between gap-2 rounded-2xl border border-zinc-800 bg-black/30 p-3 sm:flex-row sm:items-center"
                            >
                              <div>
                                <p className="text-sm font-bold">
                                  {eventLabel(item.event_type)} ·{" "}
                                  {item.plan_name || "Plano"}
                                </p>
                                <p className="mt-1 text-xs text-zinc-600">
                                  {dateTime(item.created_at)} ·{" "}
                                  {sourceLabel(
                                    item.assignment_source,
                                    item.provider,
                                  )}
                                </p>
                              </div>

                              <span className="text-xs font-bold text-zinc-400">
                                {item.unlimited
                                  ? "♾ Ilimitado"
                                  : item.period_end
                                    ? `até ${date(item.period_end)}`
                                    : "--"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {tab === "history" && (
          <section className="space-y-5">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-green-400">
                  HISTÓRICO AUTOMÁTICO
                </p>
                <h2 className="mt-2 text-2xl font-black">
                  Movimentações de planos
                </h2>
                <p className="mt-2 text-sm text-zinc-500">
                  Adições, trocas, cancelamentos, mudanças de prazo e futuras ativações automáticas.
                </p>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_180px_210px]">
                <input
                  value={historyQuery}
                  onChange={(event) =>
                    setHistoryQuery(event.target.value)
                  }
                  placeholder="🔎 Buscar pessoa, Casa, plano ou observação..."
                  className="rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white"
                />

                <select
                  value={historyAudience}
                  onChange={(event) =>
                    setHistoryAudience(
                      event.target.value as "all" | Audience,
                    )
                  }
                  className="rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white"
                >
                  <option value="all">Artistas e Casas</option>
                  <option value="artist">Somente Artistas</option>
                  <option value="venue">Somente Casas</option>
                </select>

                <select
                  value={historyEvent}
                  onChange={(event) =>
                    setHistoryEvent(event.target.value)
                  }
                  className="rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white"
                >
                  <option value="all">Todos os movimentos</option>
                  <option value="created">Planos adicionados</option>
                  <option value="cancelled">Cancelamentos</option>
                  <option value="period_changed">Mudanças de prazo</option>
                  <option value="status_changed">Mudanças de status</option>
                  <option value="updated">Atualizações</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-zinc-500">
                {filteredHistory.length} movimento(s) encontrado(s)
              </p>

              {(historyQuery ||
                historyAudience !== "all" ||
                historyEvent !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setHistoryQuery("");
                    setHistoryAudience("all");
                    setHistoryEvent("all");
                  }}
                  className="text-xs font-black text-zinc-400 hover:text-white"
                >
                  Limpar filtros
                </button>
              )}
            </div>

            {filteredHistory.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-zinc-800 p-12 text-center">
                <div className="text-4xl">🧾</div>
                <h3 className="mt-4 font-black">
                  Nenhum histórico encontrado
                </h3>
                <p className="mt-2 text-sm text-zinc-500">
                  Ao adicionar ou cancelar um plano, o movimento aparecerá automaticamente aqui.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredHistory.map((item) => {
                  const activeSubscription = subscriptions.find(
                    (subscription) =>
                      subscription.id === item.subscription_id &&
                      isSubscriptionCurrent(subscription),
                  );

                  return (
                    <article
                      key={item.history_id}
                      className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5"
                    >
                      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${
                                item.audience === "artist"
                                  ? "border-purple-500/30 bg-purple-500/10 text-purple-300"
                                  : "border-red-500/30 bg-red-500/10 text-red-300"
                              }`}
                            >
                              {item.audience === "artist"
                                ? "Artista"
                                : "Casa"}
                            </span>

                            <span className="rounded-full border border-zinc-700 px-2.5 py-1 text-[10px] font-black uppercase text-zinc-400">
                              {eventLabel(item.event_type)}
                            </span>

                            {item.unlimited && (
                              <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-[10px] font-black text-green-300">
                                ♾ ILIMITADO
                              </span>
                            )}
                          </div>

                          <h3 className="mt-3 truncate text-xl font-black">
                            {item.profile_name}
                          </h3>

                          <p className="mt-1 text-sm text-zinc-400">
                            {item.plan_name || "Plano"} ·{" "}
                            {money(item.monthly_price)}
                          </p>

                          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-600">
                            <span>
                              🕒 {dateTime(item.created_at)}
                            </span>
                            <span>
                              Origem:{" "}
                              <strong className="text-zinc-400">
                                {sourceLabel(
                                  item.assignment_source,
                                  item.provider,
                                )}
                              </strong>
                            </span>
                            <span>
                              Status:{" "}
                              <strong className="text-zinc-400">
                                {statusLabel(item.status)}
                              </strong>
                            </span>
                            <span>
                              Período:{" "}
                              <strong className="text-zinc-400">
                                {item.unlimited
                                  ? "Ilimitado"
                                  : item.period_end
                                    ? `até ${date(item.period_end)}`
                                    : "--"}
                              </strong>
                            </span>
                          </div>

                          {item.note && (
                            <div className="mt-3 rounded-xl border border-zinc-800 bg-black/30 px-3 py-2 text-xs leading-5 text-zinc-400">
                              📝 {item.note}
                            </div>
                          )}
                        </div>

                        <div className="flex shrink-0 flex-col gap-2 sm:flex-row xl:flex-col">
                          <button
                            type="button"
                            onClick={() => {
                              setAudience(item.audience);
                              setTargetId(item.profile_id);
                              setTab("add");
                            }}
                            className="rounded-xl border border-zinc-700 px-4 py-2.5 text-xs font-black text-zinc-300"
                          >
                            Abrir perfil no gerenciador
                          </button>

                          {activeSubscription && (
                            <button
                              type="button"
                              disabled={saving === activeSubscription.id}
                              onClick={() =>
                                void cancelSubscription(activeSubscription)
                              }
                              className="rounded-xl border border-red-800 px-4 py-2.5 text-xs font-black text-red-300 disabled:opacity-50"
                            >
                              Cancelar plano ativo
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {tab === "catalog" && (
          <section className="space-y-5">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-400">
                CATÁLOGO
              </p>
              <h2 className="mt-2 text-2xl font-black">
                Configurar planos
              </h2>
              <p className="mt-2 text-sm text-zinc-500">
                Esta área altera preço, nome, benefícios e disponibilidade do plano. Não atribui plano a ninguém.
              </p>
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
                        {plan.audience === "artist" ? "Artista" : "Casa"} ·{" "}
                        {plan.code}
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

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <p className="text-lg font-black text-green-400">
                        {money(
                          Number(draft.price.replace(",", ".")) || 0,
                        )}
                        /mês
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
        )}
      </div>
    </main>
  );
}
