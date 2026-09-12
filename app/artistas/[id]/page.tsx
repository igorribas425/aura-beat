"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatBRL } from "../../../lib/finance";
import { supabase } from "../../../lib/supabase";

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
};

export default function PublicArtistPage() {
  const { id } = useParams<{ id: string }>();
  const [artist, setArtist] = useState<ArtistPublic | null>(null);
  const [styles, setStyles] = useState<string[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [available, setAvailable] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [canSendOffer, setCanSendOffer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      const { data: artistData, error: artistError } = await supabase
        .from("artist_profiles")
        .select("id,stage_name,bio,base_city,base_state,fixed_fee,free_radius_km,verification_status,avatar_url")
        .eq("id", id)
        .eq("is_active", true)
        .maybeSingle();
      if (!active) return;
      if (artistError || !artistData) {
        setError("Este perfil de Artista não está disponível.");
        setLoading(false);
        return;
      }

      const [stylesResult, reviewsResult, availabilityResult, preferencesResult, userResult] = await Promise.all([
        supabase.from("artist_styles").select("style_name").eq("artist_id", id),
        supabase.from("reviews").select("overall_rating").eq("reviewee_type", "artist").eq("artist_id", id),
        supabase.from("artist_availability").select("is_available,last_seen_at").eq("artist_id", id).maybeSingle(),
        supabase.from("artist_profiles").select("accepted_event_types").eq("id", id).maybeSingle(),
        supabase.auth.getUser(),
      ]);
      if (!active) return;

      setArtist(artistData as ArtistPublic);
      setStyles((stylesResult.data ?? []).map((item) => item.style_name).filter(Boolean));
      if (!preferencesResult.error) setEventTypes(preferencesResult.data?.accepted_event_types ?? []);
      const ratings = (reviewsResult.data ?? []).map((review) => Number(review.overall_rating ?? 0)).filter((value) => value > 0);
      setReviewCount(ratings.length);
      setRating(ratings.length ? ratings.reduce((total, value) => total + value, 0) / ratings.length : 0);
      const lastSeen = availabilityResult.data?.last_seen_at ? new Date(availabilityResult.data.last_seen_at).getTime() : 0;
      setAvailable(Boolean(availabilityResult.data?.is_available && lastSeen >= Date.now() - 30 * 60 * 1000));

      const user = userResult.data.user;
      if (user) {
        const [profileResult, venueResult] = await Promise.all([
          supabase.from("profiles").select("default_mode").eq("id", user.id).maybeSingle(),
          supabase.from("venue_profiles").select("id").eq("owner_user_id", user.id).maybeSingle(),
        ]);
        if (active) setCanSendOffer(profileResult.data?.default_mode === "venue" && Boolean(venueResult.data));
      }
      if (active) setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [id]);

  if (loading) return <main className="flex min-h-[70vh] items-center justify-center bg-[#050507] text-zinc-400">Carregando perfil público…</main>;
  if (error || !artist) return <main className="flex min-h-[70vh] flex-col items-center justify-center bg-[#050507] px-4 text-center text-white"><h1 className="text-2xl font-black">Perfil indisponível</h1><p className="mt-2 text-zinc-400">{error}</p><Link href="/buscar" className="mt-5 rounded-xl bg-white px-5 py-2.5 font-bold text-black">Voltar ao Explorar</Link></main>;

  return (
    <main className="min-h-screen bg-[#050507] pb-28 text-white">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Link href="/buscar" className="text-sm font-bold text-zinc-400 hover:text-white">← Explorar</Link>
        <section className="mt-5 overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-zinc-950 via-zinc-950 to-purple-950/40 p-6 sm:p-9">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            {artist.avatar_url ? <div role="img" aria-label={`Foto de ${artist.stage_name}`} className="h-28 w-28 shrink-0 rounded-[2rem] bg-cover bg-center ring-2 ring-white/10" style={{ backgroundImage: `url(${JSON.stringify(artist.avatar_url).slice(1, -1)})` }} /> : <div aria-hidden="true" className="flex h-28 w-28 shrink-0 items-center justify-center rounded-[2rem] bg-gradient-to-br from-red-500 to-purple-700 text-4xl font-black">{artist.stage_name.charAt(0).toUpperCase()}</div>}
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-black uppercase tracking-[0.2em] text-red-400">Artista</p>{artist.verification_status === "verified" && <span className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-300">✓ Verificado</span>}{available && <span className="rounded-full bg-green-500/15 px-3 py-1 text-xs font-bold text-green-300">● Disponível agora</span>}</div><h1 className="mt-3 text-4xl font-black tracking-tight">{artist.stage_name}</h1><p className="mt-2 text-zinc-400">{[artist.base_city, artist.base_state].filter(Boolean).join(" — ") || "Localização não informada"}</p><div className="mt-4 flex flex-wrap gap-2">{(styles.length ? styles : ["Estilos diversos"]).map((style) => <span key={style} className="rounded-full bg-purple-500/15 px-3 py-1 text-sm text-purple-200">{style}</span>)}</div></div>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-white/10 bg-black/30 p-4"><p className="text-xs text-zinc-500">Cachê por hora</p><p className="mt-2 text-xl font-black text-red-400">{artist.fixed_fee === null ? "Sob consulta" : `${formatBRL(Number(artist.fixed_fee))}/h`}</p></div><div className="rounded-2xl border border-white/10 bg-black/30 p-4"><p className="text-xs text-zinc-500">Avaliação</p><p className="mt-2 text-xl font-black">{rating > 0 ? `★ ${rating.toFixed(1)}` : "—"}</p><p className="mt-1 text-xs text-zinc-500">{reviewCount} avaliação(ões)</p></div><div className="rounded-2xl border border-white/10 bg-black/30 p-4"><p className="text-xs text-zinc-500">Raio disponível</p><p className="mt-2 text-xl font-black">{artist.free_radius_km === null ? "Não informado" : `${artist.free_radius_km} km`}</p></div></div>
          {artist.bio && <div className="mt-8"><h2 className="text-lg font-black">Sobre</h2><p className="mt-3 max-w-3xl whitespace-pre-line leading-7 text-zinc-300">{artist.bio}</p></div>}
          {eventTypes.length > 0 && <div className="mt-7"><h2 className="text-sm font-black uppercase tracking-wider text-zinc-500">Tipos de evento aceitos</h2><p className="mt-2 text-zinc-300">{eventTypes.join(" • ")}</p></div>}
          {canSendOffer && <Link href={`/ofertas?artist=${artist.id}`} className="mt-8 inline-flex rounded-xl bg-red-500 px-6 py-3 font-black transition hover:bg-red-600">Enviar oferta</Link>}
        </section>
        <p className="mt-5 text-xs leading-5 text-zinc-600">Este perfil mostra somente dados profissionais públicos. Contato privado, documentos, dados financeiros e localização em tempo real não são exibidos.</p>
      </div>
    </main>
  );
}
