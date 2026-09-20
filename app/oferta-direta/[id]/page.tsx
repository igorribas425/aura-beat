"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ProfileAvatar } from "../../../components/profile-avatar";
import { formatBRL } from "../../../lib/finance";
import { supabase } from "../../../lib/supabase";

type Artist = {
  id: string;
  user_id: string;
  stage_name: string;
  avatar_url: string | null;
  fixed_fee: number | null;
  base_city: string | null;
  base_state: string | null;
  verification_status: string | null;
  travel_calculation_mode: "fixed" | "vehicle" | "ticket" | null;
  ticket_transport_type: string | null;
  ticket_round_trip_amount: number | null;
  local_transport_default_amount: number | null;
  travel_notes: string | null;
};

type Venue = {
  id: string;
  trade_name: string;
  verification_status: string | null;
  address_line: string | null;
  address_number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
};

type TravelQuote = {
  distanceKm: number;
  roundTripKm: number;
  withinRadius: boolean;
  mode: "fixed" | "vehicle" | "ticket";
  amount: number;
  fuelLiters: number | null;
};

type TransportMode =
  | "auto"
  | "fixed"
  | "vehicle"
  | "ticket"
  | "venue_pickup"
  | "other";

function numberValue(value: string) {
  const normalized = value.trim().replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function venueAddress(venue: Venue) {
  return [
    venue.address_line,
    venue.address_number,
    venue.neighborhood,
    venue.city,
    venue.state,
  ]
    .filter(Boolean)
    .join(", ");
}

export default function DirectOfferPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const artistId = params.id;

  const [artist, setArtist] = useState<Artist | null>(null);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [title, setTitle] = useState("Contratação direta");
  const [eventType, setEventType] = useState("Festa / Club");
  const [startsAt, setStartsAt] = useState("");
  const [hours, setHours] = useState("2");
  const [fee, setFee] = useState("");
  const [address, setAddress] = useState("");
  const [structure, setStructure] = useState("");
  const [notes, setNotes] = useState("");
  const [transportMode, setTransportMode] = useState<TransportMode>("auto");
  const [transportType, setTransportType] = useState("");
  const [ticketAmount, setTicketAmount] = useState("");
  const [localTransportAmount, setLocalTransportAmount] = useState("");
  const [transportNotes, setTransportNotes] = useState("");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [quote, setQuote] = useState<TravelQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const durationHours = Math.max(0, numberValue(hours));
  const suggestedFee = useMemo(
    () => Number(artist?.fixed_fee ?? 0) * durationHours,
    [artist?.fixed_fee, durationHours],
  );

  const contractTravelAmount = useMemo(() => {
    if (transportMode === "venue_pickup") return 0;
    if (transportMode === "ticket") {
      return numberValue(ticketAmount) + numberValue(localTransportAmount);
    }
    if (transportMode === "other") {
      return numberValue(localTransportAmount);
    }
    return quote?.amount ?? 0;
  }, [transportMode, ticketAmount, localTransportAmount, quote]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const [venueResult, artistResult] = await Promise.all([
        supabase
          .from("venue_profiles")
          .select(
            "id,trade_name,verification_status,address_line,address_number,neighborhood,city,state",
          )
          .eq("owner_user_id", user.id)
          .maybeSingle(),
        supabase
          .from("artist_profiles")
          .select(
            "id,user_id,stage_name,avatar_url,fixed_fee,base_city,base_state,verification_status,travel_calculation_mode,ticket_transport_type,ticket_round_trip_amount,local_transport_default_amount,travel_notes",
          )
          .eq("id", artistId)
          .maybeSingle(),
      ]);

      if (!active) return;

      if (venueResult.error) {
        setError(venueResult.error.message);
        setLoading(false);
        return;
      }

      if (!venueResult.data) {
        router.replace("/perfil-casa");
        return;
      }

      if (artistResult.error || !artistResult.data) {
        setError("Artista não encontrado.");
        setLoading(false);
        return;
      }

      const nextVenue = venueResult.data as Venue;
      const nextArtist = artistResult.data as Artist;

      setVenue(nextVenue);
      setArtist(nextArtist);
      setAddress(venueAddress(nextVenue));

      const nextHours = 2;
      setFee((Number(nextArtist.fixed_fee ?? 0) * nextHours).toFixed(2));

      if (nextArtist.travel_calculation_mode === "ticket") {
        setTransportMode("ticket");
        setTransportType(nextArtist.ticket_transport_type ?? "");
        setTicketAmount(String(nextArtist.ticket_round_trip_amount ?? ""));
        setLocalTransportAmount(
          String(nextArtist.local_transport_default_amount ?? ""),
        );
        setTransportNotes(nextArtist.travel_notes ?? "");
      }

      const requestedConversation = new URLSearchParams(window.location.search).get(
        "conversation",
      );

      if (requestedConversation) {
        const { data: conversation } = await supabase
          .from("direct_conversations")
          .select("id,user_a,user_b")
          .eq("id", requestedConversation)
          .maybeSingle();

        if (
          conversation &&
          (conversation.user_a === user.id || conversation.user_b === user.id) &&
          (conversation.user_a === nextArtist.user_id ||
            conversation.user_b === nextArtist.user_id)
        ) {
          setConversationId(conversation.id);
        }
      }

      setLoading(false);
    }

    void load();

    return () => {
      active = false;
    };
  }, [artistId, router]);

  useEffect(() => {
    let active = true;

    async function calculate() {
      if (
        !location ||
        !artist ||
        transportMode === "ticket" ||
        transportMode === "venue_pickup" ||
        transportMode === "other"
      ) {
        setQuote(null);
        return;
      }

      setCalculating(true);

      const { data, error: quoteError } = await supabase.rpc(
        "artist_travel_quote_v1",
        {
          p_artist_id: artist.id,
          p_event_lat: location.lat,
          p_event_lng: location.lng,
        },
      );

      if (!active) return;

      if (!quoteError && Array.isArray(data) && data[0]) {
        const row = data[0];
        setQuote({
          distanceKm: Number(row.distance_km ?? 0),
          roundTripKm: Number(row.round_trip_km ?? 0),
          withinRadius: Boolean(row.within_radius),
          mode:
            row.calculation_mode === "vehicle"
              ? "vehicle"
              : row.calculation_mode === "ticket"
                ? "ticket"
                : "fixed",
          amount: Number(row.estimated_amount ?? 0),
          fuelLiters:
            row.fuel_liters === null || row.fuel_liters === undefined
              ? null
              : Number(row.fuel_liters),
        });
      } else {
        setQuote(null);
      }

      setCalculating(false);
    }

    void calculate();

    return () => {
      active = false;
    };
  }, [artist, location, transportMode]);

  function applySuggestedFee() {
    setFee(suggestedFee.toFixed(2));
  }

  async function requestCurrentLocation() {
    if (!navigator.geolocation) {
      setError("Este navegador não permite obter a localização.");
      return;
    }

    setError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setMessage("Local do evento registrado para o cálculo de deslocamento.");
      },
      () => {
        setError("Não foi possível obter a localização do evento.");
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 },
    );
  }

  async function submit() {
    if (!artist || !venue) return;

    setError("");
    setMessage("");

    if (venue.verification_status !== "verified") {
      setError("A Casa precisa estar verificada para enviar uma contratação.");
      return;
    }

    if (artist.verification_status !== "verified") {
      setError("O Artista precisa estar verificado para receber a contratação.");
      return;
    }

    if (!startsAt) {
      setError("Informe a data e o horário.");
      return;
    }

    if (durationHours <= 0) {
      setError("Informe uma duração válida.");
      return;
    }

    const agreedFee = numberValue(fee);
    if (agreedFee <= 0) {
      setError("Informe o cachê da proposta.");
      return;
    }

    if (new Date(startsAt).getTime() <= Date.now()) {
      setError("A data da contratação precisa estar no futuro.");
      return;
    }

    try {
      setSaving(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const eventLocation = location
        ? `SRID=4326;POINT(${location.lng} ${location.lat})`
        : null;

      const resolvedMode: TransportMode =
        transportMode === "auto"
          ? artist.travel_calculation_mode === "vehicle"
            ? "vehicle"
            : artist.travel_calculation_mode === "ticket"
              ? "ticket"
              : "fixed"
          : transportMode;

      const { data: createdOffer, error: offerError } = await supabase
        .from("offers")
        .insert({
          venue_id: venue.id,
          created_by: user.id,
          offer_kind: "direct",
          target_artist_id: artist.id,
          direct_conversation_id: conversationId,
          title: title.trim() || `Contratação de ${artist.stage_name}`,
          description: notes.trim() || null,
          status: "open",
          is_urgent: false,
          event_type: eventType,
          requested_styles: [],
          starts_at: new Date(startsAt).toISOString(),
          duration_minutes: Math.round(durationHours * 60),
          budget_amount: agreedFee,
          radius_km: 50,
          expected_audience: null,
          structure_details: structure.trim() || null,
          address_text: address.trim() || null,
          event_location: eventLocation,
          transport_mode: resolvedMode,
          transport_type: transportType.trim() || null,
          ticket_amount:
            resolvedMode === "ticket" ? numberValue(ticketAmount) : 0,
          local_transport_amount:
            resolvedMode === "ticket" || resolvedMode === "other"
              ? numberValue(localTransportAmount)
              : 0,
          transport_notes: transportNotes.trim() || null,
          travel_amount: contractTravelAmount,
          expires_at: null,
        })
        .select("id")
        .single();

      if (offerError) throw offerError;

      const { error: inviteError } = await supabase
        .from("offer_responses")
        .insert({
          offer_id: createdOffer.id,
          artist_id: artist.id,
          status: "pending",
          proposed_fee: null,
          message: "Convite direto enviado pela Casa.",
        });

      if (inviteError) {
        await supabase.from("offers").delete().eq("id", createdOffer.id);
        throw inviteError;
      }

      if (conversationId) {
        await supabase.from("direct_messages").insert({
          conversation_id: conversationId,
          sender_user_id: user.id,
          body:
            `📅 Proposta de data enviada para ${artist.stage_name}. ` +
            `${new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "short",
              timeStyle: "short",
            }).format(new Date(startsAt))} · ${durationHours}h · ` +
            `cachê ${formatBRL(agreedFee)}. Abra Ofertas para aceitar ou negociar.`,
        });
      }

      setMessage("Proposta enviada. O DJ precisa aceitar para a data ser fechada.");

      window.setTimeout(() => {
        router.push(
          conversationId
            ? `/chat-direto?id=${conversationId}`
            : "/ofertas",
        );
      }, 700);
    } catch (caught) {
      console.error(caught);
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível enviar a proposta.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="aura-page flex min-h-[70vh] items-center justify-center text-zinc-400">
        Carregando proposta direta…
      </main>
    );
  }

  if (!artist || !venue) {
    return (
      <main className="aura-page mx-auto max-w-3xl p-6 text-red-300">
        {error || "Não foi possível abrir esta contratação."}
      </main>
    );
  }

  return (
    <main className="aura-page px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="aura-hero rounded-3xl p-6 sm:p-8">
          <p className="aura-kicker">Oferta direta · privada</p>
          <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
            <ProfileAvatar
              kind="artist"
              name={artist.stage_name}
              url={artist.avatar_url}
              sizeClassName="h-24 w-24"
              className="rounded-3xl"
            />
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-black">{artist.stage_name}</h1>
              <p className="mt-2 text-zinc-400">
                {[artist.base_city, artist.base_state].filter(Boolean).join(" — ")}
              </p>
              <p className="mt-3 text-sm text-zinc-500">
                Esta proposta só fica visível para sua Casa e para este Artista.
              </p>
            </div>
            <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-4 sm:text-right">
              <p className="text-xs text-zinc-500">Cachê do perfil</p>
              <p className="mt-1 text-xl font-black text-green-300">
                {artist.fixed_fee === null
                  ? "Sob consulta"
                  : `${formatBRL(Number(artist.fixed_fee))}/h`}
              </p>
            </div>
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

        <section className="aura-card rounded-3xl border p-6 sm:p-8">
          <h2 className="text-2xl font-black">📅 Data e cachê</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-bold text-zinc-300">
              Título
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-red-500"
              />
            </label>

            <label className="text-sm font-bold text-zinc-300">
              Tipo de evento
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-red-500"
              >
                {[
                  "Festa / Club",
                  "Festa Privada",
                  "Casamento",
                  "Formatura",
                  "Corporativo",
                  "Festival",
                  "Sunset",
                  "Aniversário",
                  "Outro",
                ].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>

            <label className="text-sm font-bold text-zinc-300">
              Data e horário
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-red-500"
              />
            </label>

            <label className="text-sm font-bold text-zinc-300">
              Duração do set (horas)
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-red-500"
              />
            </label>

            <div className="sm:col-span-2 rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-purple-300">
                    Orçamento do DJ
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {durationHours || 0}h ×{" "}
                    {formatBRL(Number(artist.fixed_fee ?? 0))}/h
                  </p>
                </div>
                <p className="text-xl font-black">{formatBRL(suggestedFee)}</p>
              </div>
              <div className="mt-4 flex gap-3">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3"
                  aria-label="Cachê proposto"
                />
                <button
                  type="button"
                  onClick={applySuggestedFee}
                  className="rounded-xl bg-purple-600 px-4 py-3 text-sm font-black"
                >
                  Usar cachê
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="aura-card rounded-3xl border p-6 sm:p-8">
          <h2 className="text-2xl font-black">🚗 Transporte deste evento</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Aqui vocês definem como o DJ vai para esta data. O valor fica congelado no contrato.
          </p>

          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            {[
              ["auto", "✨ Padrão do DJ"],
              ["vehicle", "⛽ Veículo"],
              ["fixed", "🚗 Valor por km"],
              ["ticket", "🎫 Passagem"],
              ["venue_pickup", "🏠 Casa busca"],
              ["other", "🚐 Outro"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTransportMode(value as TransportMode)}
                className={`rounded-2xl border p-3 text-left text-sm font-black ${
                  transportMode === value
                    ? "border-cyan-500 bg-cyan-500/10 text-cyan-200"
                    : "border-zinc-800 bg-zinc-950 text-zinc-400"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {(transportMode === "ticket" || transportMode === "other") && (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-bold">
                Tipo
                <input
                  value={transportType}
                  onChange={(e) => setTransportType(e.target.value)}
                  placeholder="Ônibus, avião, van..."
                  className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3"
                />
              </label>
              {transportMode === "ticket" && (
                <label className="text-sm font-bold">
                  Passagem ida e volta
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={ticketAmount}
                    onChange={(e) => setTicketAmount(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3"
                  />
                </label>
              )}
              <label className="text-sm font-bold">
                Transporte local
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={localTransportAmount}
                  onChange={(e) => setLocalTransportAmount(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3"
                />
              </label>
              <label className="text-sm font-bold">
                Observação
                <input
                  value={transportNotes}
                  onChange={(e) => setTransportNotes(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3"
                />
              </label>
            </div>
          )}

          {(transportMode === "auto" ||
            transportMode === "vehicle" ||
            transportMode === "fixed") && (
            <div className="mt-5 rounded-2xl border border-zinc-800 bg-black/25 p-4">
              <button
                type="button"
                onClick={() => void requestCurrentLocation()}
                className="rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm font-black text-green-300"
              >
                📍 Usar localização do evento
              </button>

              {calculating ? (
                <p className="mt-3 text-sm text-zinc-500">Calculando…</p>
              ) : quote ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-zinc-500">Distância</p>
                    <p className="font-black">{quote.distanceKm.toFixed(1)} km</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Ida e volta</p>
                    <p className="font-black">{quote.roundTripKm.toFixed(1)} km</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Estimativa</p>
                    <p className="font-black text-green-300">
                      {formatBRL(quote.amount)}
                    </p>
                  </div>
                  {!quote.withinRadius && (
                    <p className="sm:col-span-3 text-xs text-amber-300">
                      ⚠️ Fora do raio padrão informado pelo DJ. Confirme pelo chat antes de enviar.
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-xs text-zinc-500">
                  Registre o local para estimar o deslocamento.
                </p>
              )}
            </div>
          )}

          <div className="mt-5 rounded-2xl border border-green-500/20 bg-green-500/5 p-4">
            <p className="text-xs text-zinc-500">Deslocamento desta proposta</p>
            <p className="mt-1 text-2xl font-black text-green-300">
              {formatBRL(contractTravelAmount)}
            </p>
          </div>
        </section>

        <section className="aura-card rounded-3xl border p-6 sm:p-8">
          <h2 className="text-2xl font-black">📍 Evento</h2>
          <div className="mt-5 space-y-4">
            <label className="block text-sm font-bold">
              Endereço
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3"
              />
            </label>
            <label className="block text-sm font-bold">
              Estrutura
              <textarea
                rows={3}
                value={structure}
                onChange={(e) => setStructure(e.target.value)}
                placeholder="Som, luz, cabine, retorno..."
                className="mt-2 w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3"
              />
            </label>
            <label className="block text-sm font-bold">
              Observação para o DJ
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-2 w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3"
              />
            </label>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-2xl border border-zinc-800 py-4 font-black"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="rounded-2xl bg-red-500 py-4 font-black text-white disabled:opacity-50"
          >
            {saving ? "Enviando…" : "📅 Enviar proposta e fechar data"}
          </button>
        </div>
      </div>
    </main>
  );
}
