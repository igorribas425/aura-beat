"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatBRL } from "../../../lib/finance";
import { supabase } from "../../../lib/supabase";

type VenuePublic = {
  id: string;
  trade_name: string;
  city: string | null;
  state: string | null;
  verification_status: string | null;
};

type PublicOffer = {
  id: string;
  title: string;
  event_type: string | null;
  starts_at: string;
  duration_minutes: number | null;
  budget_amount: number | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function PublicVenuePage() {
  const { id } = useParams<{ id: string }>();
  const [venue, setVenue] = useState<VenuePublic | null>(null);
  const [venueType, setVenueType] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [completedEvents, setCompletedEvents] = useState(0);
  const [offers, setOffers] = useState<PublicOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      const { data: venueData, error: venueError } = await supabase
        .from("venue_profiles")
        .select("id,trade_name,city,state,verification_status")
        .eq("id", id)
        .eq("is_active", true)
        .maybeSingle();
      if (!active) return;
      if (venueError || !venueData) {
        setError("Este perfil de Casa não está disponível.");
        setLoading(false);
        return;
      }

      const [reviewsResult, bookingsResult, offersResult, typeResult] = await Promise.all([
        supabase.from("reviews").select("overall_rating").eq("reviewee_type", "venue").eq("venue_id", id),
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("venue_id", id).eq("status", "completed"),
        supabase.from("offers").select("id,title,event_type,starts_at,duration_minutes,budget_amount").eq("venue_id", id).eq("status", "open").gte("starts_at", new Date().toISOString()).order("starts_at").limit(6),
        supabase.from("venue_profiles").select("venue_type,avatar_url").eq("id", id).maybeSingle(),
      ]);
      if (!active) return;
      setVenue(venueData as VenuePublic);
      if (!typeResult.error) {
        setVenueType(typeResult.data?.venue_type ?? null);
        setAvatarUrl(typeResult.data?.avatar_url ?? null);
      }
      const ratings = (reviewsResult.data ?? []).map((review) => Number(review.overall_rating ?? 0)).filter((value) => value > 0);
      setReviewCount(ratings.length);
      setRating(ratings.length ? ratings.reduce((total, value) => total + value, 0) / ratings.length : 0);
      if (!bookingsResult.error) setCompletedEvents(bookingsResult.count ?? 0);
      if (!offersResult.error) setOffers((offersResult.data ?? []) as PublicOffer[]);
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [id]);

  if (loading) return <main className="flex min-h-[70vh] items-center justify-center bg-[#050507] text-zinc-400">Carregando perfil público…</main>;
  if (error || !venue) return <main className="flex min-h-[70vh] flex-col items-center justify-center bg-[#050507] px-4 text-center text-white"><h1 className="text-2xl font-black">Perfil indisponível</h1><p className="mt-2 text-zinc-400">{error}</p><Link href="/buscar" className="mt-5 rounded-xl bg-white px-5 py-2.5 font-bold text-black">Voltar ao Explorar</Link></main>;

  return (
    <main className="min-h-screen bg-[#050507] pb-28 text-white">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Link href="/buscar" className="text-sm font-bold text-zinc-400 hover:text-white">← Explorar</Link>
        <section className="mt-5 overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-zinc-950 via-zinc-950 to-blue-950/40 p-6 sm:p-9">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            {avatarUrl ? <div role="img" aria-label={`Foto de ${venue.trade_name}`} className="h-28 w-28 shrink-0 rounded-[2rem] bg-cover bg-center ring-2 ring-white/10" style={{ backgroundImage: `url(${JSON.stringify(avatarUrl).slice(1, -1)})` }} /> : <div aria-hidden="true" className="flex h-28 w-28 shrink-0 items-center justify-center rounded-[2rem] bg-gradient-to-br from-blue-600 to-cyan-500 text-4xl font-black">{venue.trade_name.charAt(0).toUpperCase()}</div>}
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-black uppercase tracking-[0.2em] text-blue-400">Casa</p>{venue.verification_status === "verified" && <span className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-300">✓ Verificada</span>}</div><h1 className="mt-3 text-4xl font-black tracking-tight">{venue.trade_name}</h1><p className="mt-2 text-zinc-400">{[venue.city, venue.state].filter(Boolean).join(" — ") || "Localização não informada"}</p>{venueType && <p className="mt-2 text-sm text-cyan-200">{venueType}</p>}</div>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-black/30 p-4"><p className="text-xs text-zinc-500">Reputação</p><p className="mt-2 text-xl font-black">{rating > 0 ? `★ ${rating.toFixed(1)}` : "—"}</p><p className="mt-1 text-xs text-zinc-500">{reviewCount} avaliação(ões)</p></div><div className="rounded-2xl border border-white/10 bg-black/30 p-4"><p className="text-xs text-zinc-500">Eventos concluídos</p><p className="mt-2 text-xl font-black">{completedEvents}</p><p className="mt-1 text-xs text-zinc-500">Histórico registrado no Aura Beat</p></div></div>
        </section>

        <section className="mt-7"><div className="flex items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-purple-400">Oportunidades públicas</p><h2 className="mt-2 text-2xl font-black">Próximas ofertas</h2></div></div>
          {offers.length === 0 ? <div className="mt-4 rounded-3xl border border-dashed border-zinc-800 bg-zinc-950 p-8 text-center text-zinc-500">Nenhuma oportunidade pública aberta no momento.</div> : <div className="mt-4 grid gap-3 sm:grid-cols-2">{offers.map((offer) => <article key={offer.id} className="rounded-2xl border border-white/10 bg-zinc-950 p-5"><p className="text-xs font-bold uppercase tracking-wider text-purple-300">{offer.event_type || "Evento"}</p><h3 className="mt-2 text-lg font-black">{offer.title}</h3><p className="mt-2 text-sm text-zinc-400">{formatDate(offer.starts_at)}</p><div className="mt-4 flex items-center justify-between gap-3"><span className="text-sm text-zinc-500">{offer.duration_minutes ? `${Math.round(offer.duration_minutes / 60)}h` : "Duração a combinar"}</span><strong className="text-red-400">{offer.budget_amount === null ? "Valor a combinar" : formatBRL(Number(offer.budget_amount))}</strong></div></article>)}</div>}
        </section>
        <p className="mt-7 text-xs leading-5 text-zinc-600">Endereço detalhado, telefone, e-mail, documentos, dados financeiros e informações privadas de bookings não são exibidos.</p>
      </div>
    </main>
  );
}
