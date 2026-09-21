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

type VenueMediaPublic = {
  id: string;
  media_type: "photo" | "video";
  public_url: string;
  caption: string | null;
  is_cover: boolean;
  sort_order: number;
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
  const [media, setMedia] = useState<VenueMediaPublic[]>([]);
  const [canChat, setCanChat] = useState(false);
  const [planCode, setPlanCode] =
    useState<"normal" | "intermediate" | "pro" | null>(null);
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

      const [reviewsResult, bookingsResult, offersResult, visualResult, mediaResult, planResult, userResult] = await Promise.all([
        supabase.from("reviews").select("overall_rating").eq("reviewee_type", "venue").eq("venue_id", id),
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("venue_id", id).eq("status", "completed"),
        supabase.from("offers").select("id,title,event_type,starts_at,duration_minutes,budget_amount").eq("venue_id", id).eq("status", "open").gte("starts_at", new Date().toISOString()).order("starts_at").limit(6),
        supabase.from("venue_profiles").select("venue_type,avatar_url").eq("id", id).maybeSingle(),
        supabase
          .from("venue_media")
          .select("id,media_type,public_url,caption,is_cover,sort_order")
          .eq("venue_id", id)
          .eq("is_public", true)
          .order("is_cover", { ascending: false })
          .order("sort_order", { ascending: true }),
        supabase.rpc("get_public_plan_levels_v1", {
          p_artist_ids: [],
          p_venue_ids: [id],
        }),
        supabase.auth.getUser(),
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
      if (!mediaResult.error) {
        setMedia((mediaResult.data ?? []) as VenueMediaPublic[]);
      } else {
        setMedia([]);
      }

      if (!planResult.error) {
        const row = Array.isArray(planResult.data) ? planResult.data[0] : null;
        setPlanCode(
          row?.plan_code === "pro" ||
          row?.plan_code === "intermediate" ||
          row?.plan_code === "normal"
            ? row.plan_code
            : null,
        );
      }

      const currentUser = userResult.data.user;
      if (currentUser) {
        const [profileResult, ownArtistResult, ownVenueResult] =
          await Promise.all([
            supabase
              .from("profiles")
              .select("default_mode")
              .eq("id", currentUser.id)
              .maybeSingle(),
            supabase
              .from("artist_profiles")
              .select("id")
              .eq("user_id", currentUser.id)
              .eq("is_active", true)
              .maybeSingle(),
            supabase
              .from("venue_profiles")
              .select("id")
              .eq("owner_user_id", currentUser.id)
              .eq("is_active", true)
              .maybeSingle(),
          ]);

        const isArtist =
          profileResult.data?.default_mode !== "venue" &&
          Boolean(ownArtistResult.data);

        if (active) {
          setCanChat(
            isArtist &&
              ownVenueResult.data?.id !== id
          );
        }
      }

      setLoading(false);
    }

    void load();
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    async function reloadMedia() {
      const { data, error } = await supabase
        .from("venue_media")
        .select("id,media_type,public_url,caption,is_cover,sort_order")
        .eq("venue_id", id)
        .eq("is_public", true)
        .order("is_cover", { ascending: false })
        .order("sort_order", { ascending: true });

      if (!error) {
        setMedia((data ?? []) as VenueMediaPublic[]);
      }
    }

    const channel = supabase
      .channel(`venue-public-visual-${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "venue_profiles",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const row = payload.new as {
            avatar_url?: string | null;
            venue_type?: string | null;
            trade_name?: string;
          };

          if (row.avatar_url !== undefined) setAvatarUrl(row.avatar_url);
          if (row.venue_type !== undefined) setVenueType(row.venue_type);
          setVenue((current) =>
            current && row.trade_name
              ? { ...current, trade_name: row.trade_name }
              : current,
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "venue_media",
          filter: `venue_id=eq.${id}`,
        },
        () => {
          void reloadMedia();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
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

        <section
          className={`aura-hero aura-venue-hero mt-5 rounded-[2rem] border p-6 sm:p-9 ${
            planCode === "pro"
              ? "border-amber-400/40 shadow-[0_0_45px_rgba(251,191,36,0.10)]"
              : planCode === "intermediate"
                ? "border-purple-500/40 shadow-[0_0_36px_rgba(168,85,247,0.10)]"
                : "border-transparent"
          }`}
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <ProfileAvatar
              kind="venue"
              name={venue.trade_name}
              url={avatarUrl}
              sizeClassName="h-32 w-32 sm:h-40 sm:w-40"
              className={`rounded-[2rem] ring-2 shadow-2xl ${
                planCode === "pro"
                  ? "ring-amber-300/80 shadow-[0_0_32px_rgba(251,191,36,0.24)]"
                  : planCode === "intermediate"
                    ? "ring-purple-400/70 shadow-[0_0_26px_rgba(168,85,247,0.20)]"
                    : "ring-white/10"
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="aura-kicker">Perfil profissional · Casa</p>
                {venue.verification_status === "verified" && <span className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-300">✓ Casa verificada</span>}
                {planCode === "intermediate" && (
                  <span className="rounded-full border border-purple-400/30 bg-purple-500/10 px-3 py-1 text-xs font-black text-purple-200">
                    ◆ INTERMEDIÁRIO
                  </span>
                )}
                {planCode === "pro" && (
                  <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-black text-amber-200">
                    ✦ PRO · EXPERIÊNCIA PREMIUM
                  </span>
                )}
              </div>
              <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">{venue.trade_name}</h1>
              <p className="mt-3 text-zinc-400">{location || "Localização não informada"}</p>
              {venueType && <span className="mt-4 inline-flex rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-sm font-bold text-red-300">{venueType}</span>}
              {canChat && (
                <div className="mt-5">
                  <Link
                    href={`/chat-direto?sourceKind=artist&targetKind=venue&targetId=${venue.id}`}
                    className="inline-flex rounded-xl border border-purple-500/40 bg-purple-500/10 px-6 py-3 font-black text-purple-200 hover:bg-purple-500/20"
                  >
                    Conversar
                  </Link>
                </div>
              )}
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
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="aura-kicker">Identidade visual</p>
              <h2 className="mt-2 text-2xl font-black">Galeria do espaço</h2>
            </div>
            {media.length > 0 && (
              <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-bold text-red-300">
                {media.length} mídia(s)
              </span>
            )}
          </div>

          {media.length > 0 ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {media.map((item) => (
                <article
                  key={item.id}
                  className={`overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 ${item.is_cover ? "sm:col-span-2" : ""}`}
                >
                  <div className={item.is_cover ? "h-72" : "h-56"}>
                    {item.media_type === "video" ? (
                      <video
                        src={item.public_url}
                        controls
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div
                        className="h-full w-full bg-cover bg-center"
                        style={{ backgroundImage: `url(${item.public_url})` }}
                      />
                    )}
                  </div>

                  {(item.caption || item.is_cover) && (
                    <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
                      <p className="text-sm text-zinc-300">
                        {item.caption || "Foto principal do espaço"}
                      </p>
                      {item.is_cover && (
                        <span className="shrink-0 rounded-full bg-red-500/15 px-2.5 py-1 text-[10px] font-black uppercase text-red-200">
                          Principal
                        </span>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : avatarUrl ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <ProfileAvatar
                kind="venue"
                name={venue.trade_name}
                url={avatarUrl}
                sizeClassName="h-64 w-full"
                className="rounded-3xl"
              />
              <div className="col-span-2 grid min-h-64 place-items-center rounded-3xl border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-500">
                A Casa ainda não adicionou outras fotos ou vídeos públicos.
              </div>
            </div>
          ) : (
            <div className="mt-5 grid min-h-52 place-items-center rounded-3xl border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-500">
              Galeria ainda não publicada.
            </div>
          )}
        </section>

        <p className="mt-7 text-xs leading-5 text-zinc-600">Endereço detalhado, telefone, e-mail, documentos, dados financeiros e informações privadas de bookings não são exibidos.</p>
      </div>
    </main>
  );
}
