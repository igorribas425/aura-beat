"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatBRL } from "../../../lib/finance";
import { supabase } from "../../../lib/supabase";

type ResponseRow = {
  id: string;
  offer_id: string;
  artist_id: string;
  status: string;
  proposed_fee: number | null;
  message: string | null;
};

type OfferRow = {
  id: string;
  venue_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  duration_minutes: number;
  budget_amount: number;
  direct_conversation_id: string | null;
  status: string;
};

type ArtistRow = {
  id: string;
  stage_name: string;
  avatar_url: string | null;
};

type VenueRow = {
  id: string;
  trade_name: string;
};

function dataHora(valor: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(valor));
}

export default function CounterproposalPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const responseId = params.id;

  const [response, setResponse] = useState<ResponseRow | null>(null);
  const [offer, setOffer] = useState<OfferRow | null>(null);
  const [artist, setArtist] = useState<ArtistRow | null>(null);
  const [venue, setVenue] = useState<VenueRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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

      const { data: responseData, error: responseError } = await supabase
        .from("offer_responses")
        .select("id,offer_id,artist_id,status,proposed_fee,message")
        .eq("id", responseId)
        .maybeSingle();

      if (responseError) throw responseError;
      if (!responseData) {
        setError("Contraproposta não encontrada.");
        return;
      }

      const responseRow = responseData as ResponseRow;
      setResponse(responseRow);

      const [{ data: offerData, error: offerError }, { data: artistData }] =
        await Promise.all([
          supabase
            .from("offers")
            .select(
              "id,venue_id,title,description,starts_at,duration_minutes,budget_amount,direct_conversation_id,status",
            )
            .eq("id", responseRow.offer_id)
            .maybeSingle(),
          supabase
            .from("artist_profiles")
            .select("id,stage_name,avatar_url")
            .eq("id", responseRow.artist_id)
            .maybeSingle(),
        ]);

      if (offerError) throw offerError;
      if (!offerData) {
        setError("Oferta vinculada não encontrada.");
        return;
      }

      const offerRow = offerData as OfferRow;
      setOffer(offerRow);
      setArtist((artistData as ArtistRow | null) ?? null);

      const { data: venueData } = await supabase
        .from("venue_profiles")
        .select("id,trade_name,owner_user_id")
        .eq("id", offerRow.venue_id)
        .maybeSingle();

      if (!venueData || venueData.owner_user_id !== user.id) {
        setError("Esta contraproposta não pertence à sua Casa.");
        return;
      }

      setVenue({
        id: venueData.id,
        trade_name: venueData.trade_name,
      });
    } catch (caught) {
      console.error(caught);
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível abrir a contraproposta.",
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
  }, [responseId]);

  async function responder(action: "accepted" | "declined") {
    if (!response) return;

    try {
      setProcessing(true);
      setError("");
      setMessage("");

      const { error: updateError } = await supabase
        .from("offer_responses")
        .update({
          status: action,
          updated_at: new Date().toISOString(),
        })
        .eq("id", response.id);

      if (updateError) throw updateError;

      setMessage(
        action === "accepted"
          ? "Contraproposta aceita. A contratação foi criada e já aparece nos eventos."
          : "Contraproposta recusada.",
      );

      await load();

      if (action === "accepted") {
        window.setTimeout(() => {
          router.push("/eventos-casa");
        }, 700);
      }
    } catch (caught) {
      console.error(caught);
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível responder à contraproposta.",
      );
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <main className="aura-page flex min-h-[70vh] items-center justify-center text-zinc-400">
        Carregando contraproposta…
      </main>
    );
  }

  if (!response || !offer) {
    return (
      <main className="aura-page mx-auto max-w-3xl p-6 text-red-300">
        {error || "Contraproposta não encontrada."}
      </main>
    );
  }

  const newValue = Number(response.proposed_fee ?? offer.budget_amount);
  const canRespond = response.status === "countered";
  const descricaoContraproposta =
    response.message &&
    ![
      "Convite direto enviado pela Casa.",
      "Oferta aceita pelo artista.",
      "Oferta recusada pelo artista.",
      "Contraproposta enviada pelo artista.",
    ].includes(response.message.trim())
      ? response.message
      : null;

  return (
    <main className="aura-page px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="aura-hero rounded-3xl p-6 sm:p-8">
          <p className="aura-kicker">Negociação privada</p>
          <h1 className="mt-2 text-3xl font-black">Contraproposta recebida</h1>
          <p className="mt-2 text-zinc-400">
            {artist?.stage_name || "Artista"} enviou um novo valor para {venue?.trade_name || "sua Casa"}.
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

        <section className="aura-card rounded-3xl border p-6 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase text-zinc-500">Evento</p>
              <h2 className="mt-1 text-2xl font-black">{offer.title}</h2>
              <p className="mt-2 text-sm text-zinc-500">
                {dataHora(offer.starts_at)} · {Math.round((offer.duration_minutes / 60) * 10) / 10}h
              </p>
            </div>

            <span className="h-fit rounded-full border border-purple-700 bg-purple-950/30 px-3 py-1 text-xs font-black text-purple-300">
              {response.status === "countered"
                ? "AGUARDANDO SUA RESPOSTA"
                : response.status.toUpperCase()}
            </span>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-800 bg-black p-5">
              <p className="text-xs text-zinc-500">Valor original da Casa</p>
              <p className="mt-2 text-2xl font-black">
                {formatBRL(Number(offer.budget_amount || 0))}
              </p>
            </div>

            <div className="rounded-2xl border border-purple-500/30 bg-purple-500/5 p-5">
              <p className="text-xs text-purple-300">Novo valor do DJ</p>
              <p className="mt-2 text-3xl font-black text-purple-200">
                {formatBRL(newValue)}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-zinc-800 bg-black p-5">
            <p className="text-xs font-black uppercase text-zinc-500">
              Descrição da contraproposta
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
              {descricaoContraproposta || "O DJ não informou uma descrição para esta contraproposta."}
            </p>
          </div>

          {offer.description && (
            <div className="mt-4 rounded-2xl border border-zinc-900 p-4 text-sm text-zinc-500">
              {offer.description}
            </div>
          )}

          {canRespond && (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={processing}
                onClick={() => void responder("declined")}
                className="rounded-2xl border border-zinc-700 py-4 font-black text-zinc-300 disabled:opacity-50"
              >
                Recusar
              </button>
              <button
                type="button"
                disabled={processing}
                onClick={() => void responder("accepted")}
                className="rounded-2xl bg-green-600 py-4 font-black text-white disabled:opacity-50"
              >
                ✓ Aceitar contraproposta
              </button>
            </div>
          )}

          {offer.direct_conversation_id && (
            <button
              type="button"
              onClick={() =>
                router.push(`/chat-direto?id=${offer.direct_conversation_id}`)
              }
              className="mt-4 w-full rounded-xl border border-zinc-800 py-3 font-bold text-zinc-300"
            >
              💬 Abrir conversa com o DJ
            </button>
          )}
        </section>
      </div>
    </main>
  );
}
