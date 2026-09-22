"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArtistMediaGallery, type ArtistMediaItem } from "../../../components/artist-media-gallery";
import { ProfileAvatar } from "../../../components/profile-avatar";
import { formatBRL } from "../../../lib/finance";
import { supabase } from "../../../lib/supabase";

type ArtistRider = {
  technical_summary: string | null;
  hospitality_summary: string | null;
  what_artist_brings: string[];
  what_venue_provides: string[];
};

type ArtistPublic = {
  id: string;
  stage_name: string;
  bio: string | null;
  base_city: string | null;
  base_state: string | null;
  fixed_fee: number | null;
  free_radius_km: number | null;
  verification_status: string | null;
  avatar_url: string | null;
  instagram_handle: string | null;
};

function instagramProfile(handle: string | null) {
  if (!handle) return null;
  const username = handle.trim().replace(/^@/, "");
  return /^[a-zA-Z0-9._]{1,30}$/.test(username)
    ? { username: `@${username}`, url: `https://www.instagram.com/${username}/` }
    : null;
}

export default function PublicArtistPage() {
  const { id } = useParams<{ id: string }>();
  const [artist, setArtist] = useState<ArtistPublic | null>(null);
  const [styles, setStyles] = useState<string[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [media, setMedia] = useState<ArtistMediaItem[]>([]);
  const [rider, setRider] = useState<ArtistRider | null>(null);
  const [available, setAvailable] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [completedEvents, setCompletedEvents] = useState(0);
  const [canSendOffer, setCanSendOffer] = useState(false);
  const [canViewFee, setCanViewFee] = useState(false);
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
      const { data: artistData, error: artistError } = await supabase
        .from("artist_profiles")
        .select("id,stage_name,bio,base_city,base_state,fixed_fee,free_radius_km,verification_status,avatar_url,instagram_handle")
        .eq("id", id)
        .eq("is_active", true)
        .maybeSingle();

      if (!active) return;
      if (artistError || !artistData) {
        setError("Este perfil de Artista não está disponível.");
        setLoading(false);
        return;
      }

      const [stylesResult, reviewsResult, availabilityResult, preferencesResult, bookingsResult, mediaResult, riderResult, planResult, userResult] = await Promise.all([
        supabase.from("artist_styles").select("style_name").eq("artist_id", id),
        supabase.from("reviews").select("overall_rating").eq("reviewee_type", "artist").eq("artist_id", id),
        supabase.from("artist_availability").select("is_available,last_seen_at").eq("artist_id", id).maybeSingle(),
        supabase.from("artist_profiles").select("accepted_event_types").eq("id", id).maybeSingle(),
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("artist_id", id).eq("status", "completed"),
        supabase.from("artist_media").select("id,media_type,public_url,caption,sort_order,is_cover").eq("artist_id", id).order("is_cover", { ascending: false }).order("sort_order", { ascending: true }),
        supabase.from("artist_riders").select("technical_summary,hospitality_summary,what_artist_brings,what_venue_provides").eq("artist_id", id).maybeSingle(),
        supabase.rpc("get_public_plan_levels_v1", {
          p_artist_ids: [id],
          p_venue_ids: [],
        }),
        supabase.auth.getUser(),
      ]);

      if (!active) return;
      setArtist(artistData as ArtistPublic);
      setStyles((stylesResult.data ?? []).map((item) => item.style_name).filter(Boolean));
      if (!preferencesResult.error) setEventTypes(preferencesResult.data?.accepted_event_types ?? []);
      if (!bookingsResult.error) setCompletedEvents(bookingsResult.count ?? 0);
      if (!mediaResult.error) setMedia((mediaResult.data ?? []) as ArtistMediaItem[]);
      if (!riderResult.error && riderResult.data) {
        setRider({
          technical_summary: riderResult.data.technical_summary ?? null,
          hospitality_summary: riderResult.data.hospitality_summary ?? null,
          what_artist_brings: Array.isArray(riderResult.data.what_artist_brings)
            ? riderResult.data.what_artist_brings.filter((item): item is string => typeof item === "string")
            : [],
          what_venue_provides: Array.isArray(riderResult.data.what_venue_provides)
            ? riderResult.data.what_venue_provides.filter((item): item is string => typeof item === "string")
            : [],
        });
      } else {
        setRider(null);
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

      const ratings = (reviewsResult.data ?? [])
        .map((review) => Number(review.overall_rating ?? 0))
        .filter((value) => value > 0);
      setReviewCount(ratings.length);
      setRating(ratings.length ? ratings.reduce((total, value) => total + value, 0) / ratings.length : 0);

      const lastSeen = availabilityResult.data?.last_seen_at
        ? new Date(availabilityResult.data.last_seen_at).getTime()
        : 0;
      setAvailable(Boolean(availabilityResult.data?.is_available && lastSeen >= Date.now() - 30 * 60 * 1000));

      const user = userResult.data.user;
      if (user) {
        const [profileResult, venueResult, ownArtistResult] = await Promise.all([
          supabase.from("profiles").select("default_mode").eq("id", user.id).maybeSingle(),
          supabase.from("venue_profiles").select("id").eq("owner_user_id", user.id).maybeSingle(),
          supabase.from("artist_profiles").select("id").eq("user_id", user.id).maybeSingle(),
        ]);
        if (active) {
          const isVenue =
            profileResult.data?.default_mode === "venue" && Boolean(venueResult.data);
          setCanSendOffer(isVenue);
          setCanViewFee(isVenue || ownArtistResult.data?.id === id);
          setCanChat(isVenue && ownArtistResult.data?.id !== id);
        }
      }

      if (active) setLoading(false);
    }

    void load();
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    async function reloadMedia() {
      const { data, error } = await supabase
        .from("artist_media")
        .select("id,media_type,public_url,caption,sort_order,is_cover")
        .eq("artist_id", id)
        .eq("is_public", true)
        .order("is_cover", { ascending: false })
        .order("sort_order", { ascending: true });

      if (!error) {
        setMedia((data ?? []) as ArtistMediaItem[]);
      }
    }

    const channel = supabase
      .channel(`artist-public-visual-${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "artist_profiles",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const row = payload.new as {
            avatar_url?: string | null;
            stage_name?: string;
            bio?: string | null;
          };

          setArtist((current) =>
            current
              ? {
                  ...current,
                  avatar_url:
                    row.avatar_url === undefined ? current.avatar_url : row.avatar_url,
                  stage_name: row.stage_name ?? current.stage_name,
                  bio: row.bio === undefined ? current.bio : row.bio,
                }
              : current,
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "artist_media",
          filter: `artist_id=eq.${id}`,
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

  if (loading) return <main className="aura-page flex min-h-[70vh] items-center justify-center text-zinc-400">Carregando Press Kit…</main>;

  if (error || !artist) {
    return (
      <main className="aura-page flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-black">Perfil indisponível</h1>
        <p className="mt-2 text-zinc-400">{error}</p>
        <Link href="/buscar" className="mt-5 rounded-xl bg-white px-5 py-2.5 font-bold text-black">Voltar ao Explorar</Link>
      </main>
    );
  }

  const instagram = instagramProfile(artist.instagram_handle);
  const location = [artist.base_city, artist.base_state].filter(Boolean).join(" — ");

  return (
    <main className="aura-page pb-10">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Link href="/buscar" className="text-sm font-bold text-zinc-400 hover:text-white">← Explorar</Link>

        <section
          className={`aura-hero aura-artist-hero mt-5 rounded-[2rem] border p-6 sm:p-9 ${
            planCode === "pro"
              ? "border-amber-400/40 shadow-[0_0_45px_rgba(251,191,36,0.10)]"
              : planCode === "intermediate"
                ? "border-purple-500/40 shadow-[0_0_36px_rgba(168,85,247,0.10)]"
                : "border-transparent"
          }`}
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <ProfileAvatar
              kind="artist"
              name={artist.stage_name}
              url={artist.avatar_url}
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
                <p className="aura-kicker">Press Kit · Artista</p>
                {artist.verification_status === "verified" && <span className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-300">✓ Verificado</span>}
                {planCode === "intermediate" && (
                  <span className="rounded-full border border-purple-400/30 bg-purple-500/10 px-3 py-1 text-xs font-black text-purple-200">
                    ◆ INTERMEDIÁRIO
                  </span>
                )}
                {planCode === "pro" && (
                  <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-black text-amber-200">
                    ✦ PRO · ALTA VISIBILIDADE
                  </span>
                )}
                {available && <span className="rounded-full bg-green-500/15 px-3 py-1 text-xs font-bold text-green-300">● Disponível agora</span>}
              </div>
              <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">{artist.stage_name}</h1>
              <p className="mt-3 text-zinc-400">{location || "Localização não informada"}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {(styles.length ? styles : ["Estilos não informados"]).map((style) => <span key={style} className="rounded-full bg-purple-500/15 px-3 py-1 text-sm text-purple-200">{style}</span>)}
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                {canChat && (
                  <Link
                    href={`/chat-direto?sourceKind=venue&targetKind=artist&targetId=${artist.id}`}
                    className="rounded-xl border border-purple-500/40 bg-purple-500/10 px-6 py-3 font-black text-purple-200 hover:bg-purple-500/20"
                  >
                    Conversar
                  </Link>
                )}
                {canSendOffer && <Link href={`/oferta-direta/${artist.id}`} className="rounded-xl bg-red-500 px-6 py-3 font-black text-white hover:bg-red-600">Enviar oferta</Link>}
                {instagram && <a href={instagram.url} target="_blank" rel="noreferrer" className="rounded-xl border border-purple-500/40 bg-purple-500/10 px-6 py-3 font-bold text-purple-300">Instagram {instagram.username}</a>}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Indicadores profissionais">
          <div className="aura-stat rounded-2xl border p-4">
            <p className="text-xs text-zinc-500">{canViewFee ? "Cachê por hora" : "Contratação"}</p>
            <p className={`mt-2 text-xl font-black ${canViewFee ? "text-red-400" : ""}`}>
              {canViewFee
                ? artist.fixed_fee === null
                  ? "Sob consulta"
                  : `${formatBRL(Number(artist.fixed_fee))}/h`
                : "Valor visível para Casas"}
            </p>
          </div>
          <div className="aura-stat rounded-2xl border p-4"><p className="text-xs text-zinc-500">Avaliação</p><p className="mt-2 text-xl font-black">{rating > 0 ? `★ ${rating.toFixed(1)}` : "Perfil novo"}</p><p className="mt-1 text-xs text-zinc-500">{reviewCount} avaliação(ões)</p></div>
          <div className="aura-stat rounded-2xl border p-4"><p className="text-xs text-zinc-500">Histórico</p><p className="mt-2 text-xl font-black">{completedEvents}</p><p className="mt-1 text-xs text-zinc-500">eventos concluídos</p></div>
          <div className="aura-stat rounded-2xl border p-4"><p className="text-xs text-zinc-500">Raio disponível</p><p className="mt-2 text-xl font-black">{artist.free_radius_km === null ? "Não informado" : `${artist.free_radius_km} km`}</p></div>
        </section>

        <div className="mt-7 grid gap-6 lg:grid-cols-[1.4fr_.6fr]">
          <section className="aura-card rounded-3xl border p-6 sm:p-8">
            <p className="aura-kicker">Sobre o Artista</p><h2 className="mt-2 text-2xl font-black">Biografia</h2>
            <p className="mt-4 whitespace-pre-line leading-7 text-zinc-300">{artist.bio || "Este Artista ainda não publicou uma biografia profissional."}</p>
          </section>
          <section className="aura-card rounded-3xl border p-6">
            <p className="aura-kicker">Disponibilidade</p><h2 className="mt-2 text-xl font-black">{available ? "Aceitando eventos agora" : "Agenda sob consulta"}</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">{available ? "Disponibilidade recente confirmada no Aura Beat. Consulte data, raio e condições na oferta." : "Envie uma oferta para consultar datas futuras e condições de contratação."}</p>
          </section>
        </div>

        <section className="aura-card mt-6 rounded-3xl border p-6 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="aura-kicker">Portfólio</p>
              <h2 className="mt-2 text-2xl font-black">Galeria profissional</h2>
              <p className="mt-2 text-sm text-zinc-500">Fotos, flyers e vídeos publicados pelo Artista.</p>
            </div>
            <span className="text-xs text-zinc-500">{media.length} mídia(s)</span>
          </div>
          <ArtistMediaGallery items={media} />
        </section>

        {rider && (
          <section className="aura-card mt-6 rounded-3xl border p-6">
            <p className="aura-kicker">Produção</p>
            <h2 className="mt-2 text-xl font-black">Rider técnico</h2>

            {rider.technical_summary && (
              <p className="mt-4 whitespace-pre-line text-sm leading-6 text-zinc-300">
                {rider.technical_summary}
              </p>
            )}

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {rider.what_artist_brings.length > 0 && (
                <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4">
                  <p className="font-black text-purple-200">O que o Artista leva</p>
                  <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                    {rider.what_artist_brings.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {rider.what_venue_provides.length > 0 && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
                  <p className="font-black text-red-200">O que a Casa precisa fornecer</p>
                  <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                    {rider.what_venue_provides.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {rider.hospitality_summary && (
              <div className="mt-5">
                <p className="text-xs font-black uppercase tracking-wider text-zinc-500">
                  Hospitalidade / camarim
                </p>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-zinc-300">
                  {rider.hospitality_summary}
                </p>
              </div>
            )}
          </section>
        )}

        {eventTypes.length > 0 && <section className="aura-card mt-6 rounded-3xl border p-6"><p className="aura-kicker">Experiência</p><h2 className="mt-2 text-xl font-black">Tipos de evento</h2><div className="mt-4 flex flex-wrap gap-2">{eventTypes.map((eventType) => <span key={eventType} className="rounded-full border border-purple-500/25 bg-purple-500/10 px-3 py-1.5 text-sm text-purple-200">{eventType}</span>)}</div></section>}

        <p className="mt-7 text-xs leading-5 text-zinc-600">Somente dados profissionais públicos são exibidos. Contato privado, documentos, dados financeiros e localização em tempo real permanecem protegidos.</p>
      </div>
    </main>
  );
}
