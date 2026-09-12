"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ProfileAvatar } from "../../../components/profile-avatar";
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
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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

      const [reviewsResult, bookingsResult, offersResult, visualResult] = await Promise.all([
        supabase.from("reviews").select("overall_rating").eq("reviewee_type", "venue").eq("venue_id", id),
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("venue_id", id).eq("status", "completed"),
        supabase.from("offers").select("id,title,event_type,starts_at,duration_minutes,budget_amount").eq("venue_id", id).eq("status", "open").gte("starts_at", new Date().toISOString()).order("starts_at").limit(6),
        supabase.from("venue_profiles").select("venue_type,avatar_url").eq("id", id).maybeSingle(),
      ]);

      if (!active) return;
      setVenue(venueData as VenuePublic);
      if (!visualResult.error) {
        setVenueType(visualResult.data?.venue_type ?? null);
        setAvatarUrl(visualResult.data?.avatar_url ?? null);
      }

      const ratings = (reviewsResult.data ?? [])
        .map((review) => Number(review.overall_rating ?? 0))
        .filter((value) => value > 0);
      setReviewCount(ratings.length);
      setRating(ratings.length ? ratings.reduce((total, value) => total + value, 0) / ratings.length : 0);
      if (!bookingsResult.error) setCompletedEvents(bookingsResult.count ?? 0);
      if (!offersResult.error) setOffers((offersResult.data ?? []) as PublicOffer[]);
      setLoading(false);
    }

    void load();
    return () => { active = false; };
  }, [id]);

  if (loading) return <main className="aura-page flex min-h-[70vh] items-center justify-center text-zinc-400">Carregando perfil público…</main>;

  if (error || !venue) {
    return (
      <main className="aura-page flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-black">Perfil indisponível</h1>
        <p className="mt-2 text-zinc-400">{error}</p>
        <Link href="/buscar" className="mt-5 rounded-xl bg-white px-5 py-2.5 font-bold text-black">Voltar ao Explorar</Link>
      </main>
    );
  }

  const location = [venue.city, venue.state].filter(Boolean).join(" — ");

  return (
    <main className="aura-page pb-10">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Link href="/buscar" className="text-sm font-bold text-zinc-400 hover:text-white">← Explorar</Link>

        <section className="aura-hero aura-venue-hero mt-5 rounded-[2rem] p-6 sm:p-9">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <ProfileAvatar kind="venue" name={venue.trade_name} url={avatarUrl} sizeClassName="h-32 w-32 sm:h-40 sm:w-40" className="rounded-[2rem] ring-2 ring-white/10 shadow-2xl" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="aura-kicker">Perfil profissional · Casa</p>
                {venue.verification_status === "verified" && <span className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-300">✓ Casa verificada</span>}
              </div>
              <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">{venue.trade_name}</h1>
              <p className="mt-3 text-zinc-400">{location || "Localização não informada"}</p>
              {venueType && <span className="mt-4 inline-flex rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-sm font-bold text-red-300">{venueType}</span>}
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-3" aria-label="Indicadores da Casa">
          <div className="aura-stat rounded-2xl border p-5"><p className="text-xs text-zinc-500">Reputação</p><p className="mt-2 text-2xl font-black">{rating > 0 ? `★ ${rating.toFixed(1)}` : "Perfil novo"}</p><p className="mt-1 text-xs text-zinc-500">{reviewCount} avaliação(ões)</p></div>
          <div className="aura-stat rounded-2xl border p-5"><p className="text-xs text-zinc-500">Eventos concluídos</p><p className="mt-2 text-2xl font-black">{completedEvents}</p><p className="mt-1 text-xs text-zinc-500">histórico no Aura Beat</p></div>
          <div className="aura-stat rounded-2xl border p-5"><p className="text-xs text-zinc-500">Oportunidades abertas</p><p className="mt-2 text-2xl font-black text-red-400">{offers.length}</p><p className="mt-1 text-xs text-zinc-500">eventos futuros visíveis</p></div>
        </section>

        <div className="mt-7 grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
          <section className="aura-card rounded-3xl border p-6 sm:p-8">
            <p className="aura-kicker">Sobre a Casa</p><h2 className="mt-2 text-2xl font-black">Espaço e identidade</h2>
            <p className="mt-4 leading-7 text-zinc-300">{venueType ? `${venue.trade_name} é uma Casa do segmento ${venueType}, localizada em ${location || "região não informada"}.` : `${venue.trade_name} integra a rede de Casas e contratantes do Aura Beat.`}</p>
            <p className="mt-3 text-sm leading-6 text-zinc-500">Informações comerciais públicas ajudam Artistas a avaliar oportunidades sem revelar endereço detalhado ou contatos privados.</p>
          </section>
          <section className="aura-card rounded-3xl border p-6">
            <p className="aura-kicker">Confiança</p><h2 className="mt-2 text-xl font-black">{venue.verification_status === "verified" ? "Identidade comercial verificada" : "Verificação em andamento"}</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">A contratação formal continua sujeita às regras de verificação e CNPJ protegidas do Aura Beat.</p>
          </section>
        </div>

        <section className="aura-card mt-6 rounded-3xl border p-6 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="aura-kicker">Agenda pública</p><h2 className="mt-2 text-2xl font-black">Próximas oportunidades</h2></div><span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-bold text-red-300">{offers.length} aberta(s)</span></div>
          {offers.length === 0 ? (
            <div className="mt-5 rounded-3xl border border-dashed border-zinc-700 p-8 text-center text-zinc-500">Nenhuma oportunidade pública aberta no momento.</div>
          ) : (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {offers.map((offer) => (
                <article key={offer.id} className="rounded-2xl border border-white/10 bg-zinc-950 p-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-purple-300">{offer.event_type || "Evento"}</p>
                  <h3 className="mt-2 text-lg font-black">{offer.title}</h3>
                  <p className="mt-2 text-sm text-zinc-400">{formatDate(offer.starts_at)}</p>
                  <div className="mt-4 flex items-center justify-between gap-3"><span className="text-sm text-zinc-500">{offer.duration_minutes ? `${(offer.duration_minutes / 60).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h` : "Duração a combinar"}</span><strong className="text-red-400">{offer.budget_amount === null ? "Valor a combinar" : formatBRL(Number(offer.budget_amount))}</strong></div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="aura-card mt-6 rounded-3xl border p-6 sm:p-8">
          <p className="aura-kicker">Identidade visual</p><h2 className="mt-2 text-2xl font-black">Galeria do espaço</h2>
          {avatarUrl ? <div className="mt-5 grid gap-4 sm:grid-cols-3"><ProfileAvatar kind="venue" name={venue.trade_name} url={avatarUrl} sizeClassName="h-64 w-full" className="rounded-3xl" /><div className="col-span-2 grid min-h-64 place-items-center rounded-3xl border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-500">Mais imagens públicas do espaço ainda não foram adicionadas.</div></div> : <div className="mt-5 grid min-h-52 place-items-center rounded-3xl border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-500">Galeria ainda não publicada.</div>}
        </section>

        <p className="mt-7 text-xs leading-5 text-zinc-600">Endereço detalhado, telefone, e-mail, documentos, dados financeiros e informações privadas de bookings não são exibidos.</p>
      </div>
    </main>
  );
}
