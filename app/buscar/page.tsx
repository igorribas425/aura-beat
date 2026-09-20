"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ExploreMap } from "../../components/explore-map";
import {
  ExploreProfileCard,
  MiniPressKit,
  type MiniPressKitMedia,
  type MiniPressKitTravelQuote,
} from "../../components/explore-profile-card";
import {
  EXPLORE_PAGE_SIZE,
  ExploreFilters,
  ExploreKind,
  ExploreProfile,
  INITIAL_EXPLORE_FILTERS,
  matchesExploreFilters,
  withDistances,
} from "../../lib/explore";
import { supabase } from "../../lib/supabase";

type Mode = "artist" | "venue";
type ViewMode = "list" | "map";
type FavoriteRow = { id: string; artist_id: string | null; venue_id: string | null };

type RpcProfile = {
  profile_kind: "artist" | "venue";
  profile_id: string;
  display_name: string;
  avatar_url: string | null;
  city: string | null;
  state: string | null;
  description: string | null;
  styles: string[] | null;
  event_types: string[] | null;
  venue_type: string | null;
  verification_status: string | null;
  rating: number | string | null;
  review_count: number | string | null;
  hourly_fee: number | string | null;
  available_now: boolean | null;
  radius_km: number | string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  location_precision_km: number | string | null;
  total_count: number | string;
};

type ArtistRow = {
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

type VenueRow = {
  id: string;
  trade_name: string;
  city: string | null;
  state: string | null;
  verification_status: string | null;
};

type ReviewRow = {
  artist_id: string | null;
  venue_id: string | null;
  overall_rating: number | string | null;
};

const FALLBACK_LIMIT_PER_KIND = 48;
function defaultExploreKind(mode: Mode): ExploreKind {
  return mode === "venue" ? "artist" : "all";
}

function optionalNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function averageReviews(reviews: ReviewRow[], kind: "artist" | "venue", id: string) {
  const values = reviews
    .filter((review) => (kind === "artist" ? review.artist_id === id : review.venue_id === id))
    .map((review) => Number(review.overall_rating ?? 0))
    .filter((value) => value > 0);

  return {
    rating: values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0,
    reviewCount: values.length,
  };
}

function fromRpc(row: RpcProfile, ownArtistId: string | null, ownVenueId: string | null) {
  const kind = row.profile_kind;

  return {
    kind,
    id: row.profile_id,
    name: row.display_name,
    avatarUrl: row.avatar_url,
    city: row.city,
    state: row.state,
    description: row.description,
    styles: row.styles ?? [],
    eventTypes: row.event_types ?? [],
    venueType: row.venue_type,
    verificationStatus: row.verification_status,
    rating: Number(row.rating ?? 0),
    reviewCount: Number(row.review_count ?? 0),
    hourlyFee: optionalNumber(row.hourly_fee),
    availableNow: Boolean(row.available_now),
    radiusKm: optionalNumber(row.radius_km),
    latitude: optionalNumber(row.latitude),
    longitude: optionalNumber(row.longitude),
    locationPrecisionKm: optionalNumber(row.location_precision_km),
    distanceKm: null,
    isOwnProfile:
      (kind === "artist" && row.profile_id === ownArtistId) ||
      (kind === "venue" && row.profile_id === ownVenueId),
  } satisfies ExploreProfile;
}

async function loadFallbackProfiles(
  filters: ExploreFilters,
  page: number,
  ownArtistId: string | null,
  ownVenueId: string | null,
) {
  const [artistsResult, venuesResult] = await Promise.all([
    filters.kind === "venue"
      ? Promise.resolve({ data: [] as ArtistRow[], error: null })
      : supabase
          .from("artist_profiles")
          .select("id,stage_name,bio,base_city,base_state,fixed_fee,free_radius_km,verification_status,avatar_url")
          .eq("is_active", true)
          .order("stage_name")
          .limit(FALLBACK_LIMIT_PER_KIND),
    filters.kind === "artist"
      ? Promise.resolve({ data: [] as VenueRow[], error: null })
      : supabase
          .from("venue_profiles")
          .select("id,trade_name,city,state,verification_status")
          .eq("is_active", true)
          .order("trade_name")
          .limit(FALLBACK_LIMIT_PER_KIND),
  ]);

  if (artistsResult.error) throw artistsResult.error;
  if (venuesResult.error) throw venuesResult.error;

  const artists = (artistsResult.data ?? []) as ArtistRow[];
  const venues = (venuesResult.data ?? []) as VenueRow[];
  const artistIds = artists.map((artist) => artist.id);
  const venueIds = venues.map((venue) => venue.id);

  const [stylesResult, availabilityResult, artistReviewsResult, venueReviewsResult] = await Promise.all([
    artistIds.length
      ? supabase.from("artist_styles").select("artist_id,style_name").in("artist_id", artistIds)
      : Promise.resolve({ data: [], error: null }),
    artistIds.length
      ? supabase.from("artist_availability").select("artist_id,is_available,last_seen_at").in("artist_id", artistIds)
      : Promise.resolve({ data: [], error: null }),
    artistIds.length
      ? supabase
          .from("reviews")
          .select("artist_id,venue_id,overall_rating")
          .eq("reviewee_type", "artist")
          .in("artist_id", artistIds)
      : Promise.resolve({ data: [], error: null }),
    venueIds.length
      ? supabase
          .from("reviews")
          .select("artist_id,venue_id,overall_rating")
          .eq("reviewee_type", "venue")
          .in("venue_id", venueIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const secondaryError =
    stylesResult.error || availabilityResult.error || artistReviewsResult.error || venueReviewsResult.error;
  if (secondaryError) throw secondaryError;

  const styles = (stylesResult.data ?? []) as Array<{ artist_id: string; style_name: string }>;
  const availability = (availabilityResult.data ?? []) as Array<{
    artist_id: string;
    is_available: boolean;
    last_seen_at: string | null;
  }>;
  const reviews = [
    ...((artistReviewsResult.data ?? []) as ReviewRow[]),
    ...((venueReviewsResult.data ?? []) as ReviewRow[]),
  ];
  const freshnessThreshold = Date.now() - 30 * 60 * 1000;

  const artistProfiles: ExploreProfile[] = artists.map((artist) => {
    const status = availability.find((item) => item.artist_id === artist.id);
    const lastSeen = status?.last_seen_at ? new Date(status.last_seen_at).getTime() : 0;

    return {
      kind: "artist",
      id: artist.id,
      name: artist.stage_name,
      avatarUrl: artist.avatar_url,
      city: artist.base_city,
      state: artist.base_state,
      description: artist.bio,
      styles: styles.filter((item) => item.artist_id === artist.id).map((item) => item.style_name),
      eventTypes: [],
      venueType: null,
      verificationStatus: artist.verification_status,
      ...averageReviews(reviews, "artist", artist.id),
      hourlyFee: optionalNumber(artist.fixed_fee),
      availableNow: Boolean(status?.is_available && lastSeen >= freshnessThreshold),
      radiusKm: optionalNumber(artist.free_radius_km),
      latitude: null,
      longitude: null,
      locationPrecisionKm: null,
      distanceKm: null,
      isOwnProfile: artist.id === ownArtistId,
    };
  });

  const venueProfiles: ExploreProfile[] = venues.map((venue) => ({
    kind: "venue",
    id: venue.id,
    name: venue.trade_name,
    avatarUrl: null,
    city: venue.city,
    state: venue.state,
    description: null,
    styles: [],
    eventTypes: [],
    venueType: null,
    verificationStatus: venue.verification_status,
    ...averageReviews(reviews, "venue", venue.id),
    hourlyFee: null,
    availableNow: false,
    radiusKm: null,
    latitude: null,
    longitude: null,
    locationPrecisionKm: null,
    distanceKm: null,
    isOwnProfile: venue.id === ownVenueId,
  }));

  const filtered = [...artistProfiles, ...venueProfiles]
    .filter((profile) => matchesExploreFilters(profile, filters))
    .sort((left, right) =>
      left.availableNow !== right.availableNow
        ? left.availableNow
          ? -1
          : 1
        : left.name.localeCompare(right.name, "pt-BR"),
    );

  const offset = (page - 1) * EXPLORE_PAGE_SIZE;
  return {
    profiles: filtered.slice(offset, offset + EXPLORE_PAGE_SIZE),
    totalCount: filtered.length,
  };
}

export default function ExplorePage() {
  const router = useRouter();
  const [filters, setFilters] = useState<ExploreFilters>(INITIAL_EXPLORE_FILTERS);
  const [profiles, setProfiles] = useState<ExploreProfile[]>([]);
  const [favorites, setFavorites] = useState<FavoriteRow[]>([]);
  const [favoriteBusy, setFavoriteBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("artist");
  const [ownArtistId, setOwnArtistId] = useState<string | null>(null);
  const [ownVenueId, setOwnVenueId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("list");
  const [selectedProfile, setSelectedProfile] = useState<ExploreProfile | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<MiniPressKitMedia[]>([]);
  const [selectedMediaLoading, setSelectedMediaLoading] = useState(false);
  const [selectedTravelQuote, setSelectedTravelQuote] =
    useState<MiniPressKitTravelQuote | null>(null);
  const [selectedTravelQuoteLoading, setSelectedTravelQuoteLoading] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [locationMessage, setLocationMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [contextLoading, setContextLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [usingFallback, setUsingFallback] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadContext() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;
      if (!user) {
        router.replace("/login");
        return;
      }

      const [profileResult, artistResult, venueResult, favoritesResult] = await Promise.all([
        supabase.from("profiles").select("default_mode").eq("id", user.id).maybeSingle(),
        supabase.from("artist_profiles").select("id").eq("user_id", user.id).maybeSingle(),
        supabase.from("venue_profiles").select("id").eq("owner_user_id", user.id).maybeSingle(),
        supabase.from("favorites").select("id,artist_id,venue_id").eq("user_id", user.id),
      ]);

      if (!active) return;

      const preferredMode: Mode = profileResult.data?.default_mode === "venue" ? "venue" : "artist";
      const resolvedMode: Mode =
        preferredMode === "venue" && venueResult.data
          ? "venue"
          : preferredMode === "artist" && artistResult.data
            ? "artist"
            : venueResult.data
              ? "venue"
              : "artist";

      setUserId(user.id);
      setOwnArtistId(artistResult.data?.id ?? null);
      setOwnVenueId(venueResult.data?.id ?? null);
      setMode(resolvedMode);
      setFilters((current) => ({
        ...current,
        kind: defaultExploreKind(resolvedMode),
        maximumDistanceKm: null,
      }));
      setPage(1);

      if (!favoritesResult.error) {
        setFavorites((favoritesResult.data ?? []) as FavoriteRow[]);
      }

      setContextLoading(false);
    }

    void loadContext();
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    let active = true;

    async function loadSelectedProfileExtras() {
      setSelectedMedia([]);
      setSelectedTravelQuote(null);

      if (!selectedProfile || selectedProfile.kind !== "artist") {
        setSelectedMediaLoading(false);
        setSelectedTravelQuoteLoading(false);
        return;
      }

      setSelectedMediaLoading(true);

      const mediaResult = await supabase
        .from("artist_media")
        .select("id,media_type,public_url,caption,sort_order,is_cover")
        .eq("artist_id", selectedProfile.id)
        .eq("is_public", true)
        .order("is_cover", { ascending: false })
        .order("sort_order", { ascending: true });

      if (!active) return;

      if (!mediaResult.error) {
        setSelectedMedia(
          ((mediaResult.data ?? []) as MiniPressKitMedia[]).filter(
            (item) => Boolean(item.public_url),
          ),
        );
      }

      setSelectedMediaLoading(false);

      if (!canSendOffer || !location || selectedProfile.isOwnProfile) {
        setSelectedTravelQuoteLoading(false);
        return;
      }

      setSelectedTravelQuoteLoading(true);

      const { data: quoteData, error: quoteError } = await supabase.rpc(
        "artist_travel_quote_v1",
        {
          p_artist_id: selectedProfile.id,
          p_event_lat: location.lat,
          p_event_lng: location.lng,
        },
      );

      if (!active) return;

      if (!quoteError) {
        const row = Array.isArray(quoteData) ? quoteData[0] : null;

        if (row) {
          setSelectedTravelQuote({
            distanceKm: Number(row.distance_km ?? 0),
            roundTripKm: Number(row.round_trip_km ?? 0),
            withinRadius: Boolean(row.within_radius),
            calculationMode:
              row.calculation_mode === "vehicle" ? "vehicle" : "fixed",
            fuelLiters:
              row.fuel_liters === null || row.fuel_liters === undefined
                ? null
                : Number(row.fuel_liters),
            estimatedAmount: Number(row.estimated_amount ?? 0),
          });
        }
      }

      setSelectedTravelQuoteLoading(false);
    }

    void loadSelectedProfileExtras();

    return () => {
      active = false;
    };
  }, [canSendOffer, location, selectedProfile]);

  useEffect(() => {
    if (contextLoading) return;

    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      setSelectedProfile(null);

      try {
        const effectiveDistanceKm = filters.maximumDistanceKm;
        const requestLimit = EXPLORE_PAGE_SIZE;
        const requestOffset = (page - 1) * EXPLORE_PAGE_SIZE;

        const { data, error: rpcError } = await supabase.rpc("explore_profiles_v1", {
          p_kind: filters.kind,
          p_query: filters.query || null,
          p_city: filters.city || null,
          p_style: filters.style || null,
          p_event_type: filters.eventType || null,
          p_available_now: filters.availableNow,
          p_verified_only: filters.verifiedOnly,
          p_min_rating: filters.minimumRating,
          p_max_hourly_fee: filters.maximumHourlyFee,
          p_origin_lat: location?.lat ?? null,
          p_origin_lng: location?.lng ?? null,
          p_max_distance_km: effectiveDistanceKm,
          p_limit: requestLimit,
          p_offset: requestOffset,
        });

        let nextProfiles: ExploreProfile[];
        let nextTotal: number;

        if (!rpcError) {
          const rows = (data ?? []) as RpcProfile[];
          nextProfiles = rows.map((row) => fromRpc(row, ownArtistId, ownVenueId));
          nextTotal = Number(rows[0]?.total_count ?? 0);
          setUsingFallback(false);
        } else {
          const fallback = await loadFallbackProfiles(
            filters,
            page,
            ownArtistId,
            ownVenueId,
          );
          nextProfiles = fallback.profiles;
          nextTotal = fallback.totalCount;
          setUsingFallback(true);
        }

        const located = withDistances(nextProfiles, location);
        const effectiveFilters: ExploreFilters = {
          ...filters,
          maximumDistanceKm: effectiveDistanceKm,
        };
        let visibleProfiles = located.filter((profile) =>
          matchesExploreFilters(profile, effectiveFilters),
        );

        if (!active) return;
        setProfiles(visibleProfiles);
        setTotalCount(nextTotal);
      } catch (loadError) {
        console.error(loadError);
        if (active) setError("Não foi possível carregar o Explorar. Tente novamente.");
      } finally {
        if (active) setLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [contextLoading, filters, location, ownArtistId, ownVenueId, page, reloadKey]);

  const favoriteKeys = useMemo(
    () =>
      new Set(
        favorites.map((favorite) =>
          favorite.artist_id ? `artist:${favorite.artist_id}` : `venue:${favorite.venue_id}`,
        ),
      ),
    [favorites],
  );
  const canSendOffer = mode === "venue" && Boolean(ownVenueId);
  const totalPages = Math.max(1, Math.ceil(totalCount / EXPLORE_PAGE_SIZE));
  const mappableCount = profiles.filter(
    (profile) => profile.latitude !== null && profile.longitude !== null,
  ).length;
  const updateFilter = useCallback(
    <Key extends keyof ExploreFilters>(key: Key, value: ExploreFilters[Key]) => {
      setFilters((current) => ({ ...current, [key]: value }));
      setPage(1);
    },
    [],
  );

  const focusTitle = mode === "venue" ? "Encontre DJs" : "Explore a comunidade";
  const focusDescription =
    mode === "venue"
      ? "No modo Casa, o Explorar é o lugar para descobrir DJs, abrir perfis e iniciar conversas."
      : "No modo Artista, você pode descobrir Casas e outros Artistas, abrir perfis e iniciar conversas.";

  function changeView(nextView: ViewMode) {
    setView(nextView);

    if (nextView === "map") {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          document.getElementById("explore-results")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      });
    }
  }

  async function toggleFavorite(profile: ExploreProfile) {
    if (!userId) return;

    const key = `${profile.kind}:${profile.id}`;
    const existing = favorites.find((favorite) =>
      profile.kind === "artist"
        ? favorite.artist_id === profile.id
        : favorite.venue_id === profile.id,
    );

    setFavoriteBusy(key);
    setError("");

    try {
      if (existing) {
        const { error: deleteError } = await supabase.from("favorites").delete().eq("id", existing.id);
        if (deleteError) throw deleteError;
        setFavorites((current) => current.filter((favorite) => favorite.id !== existing.id));
      } else {
        const { data, error: insertError } = await supabase
          .from("favorites")
          .insert({
            user_id: userId,
            artist_id: profile.kind === "artist" ? profile.id : null,
            venue_id: profile.kind === "venue" ? profile.id : null,
          })
          .select("id,artist_id,venue_id")
          .single();

        if (insertError) throw insertError;
        setFavorites((current) => [...current, data as FavoriteRow]);
      }
    } catch (favoriteError) {
      console.error(favoriteError);
      setError("Não foi possível atualizar o favorito. Tente novamente.");
    } finally {
      setFavoriteBusy(null);
    }
  }

  function requestLocation() {
    setLocationMessage("");

    if (!navigator.geolocation) {
      setLocationMessage("Este navegador não oferece localização.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setLocationMessage("Localização usada somente nesta sessão para calcular distâncias.");
      },
      () => setLocationMessage("Não foi possível acessar sua localização. A lista continua disponível."),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
    );
  }

  function clearFilters(event?: FormEvent) {
    event?.preventDefault();
    setFilters({
      ...INITIAL_EXPLORE_FILTERS,
      kind: defaultExploreKind(mode),
      maximumDistanceKm: null,
    });
    setPage(1);
  }

  if (contextLoading) {
    return (
      <main className="aura-page flex min-h-[70vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-zinc-800 border-t-red-500" />
          <p className="mt-4 text-zinc-400">Preparando o Explorar…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="aura-page pb-8">
      <div className="mx-auto max-w-7xl px-4 py-7 sm:py-10">
        <header className="aura-hero aura-artist-hero flex flex-col gap-6 rounded-3xl p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="aura-kicker">Descoberta inteligente</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">{focusTitle}</h1>
            <p className="mt-3 max-w-2xl text-zinc-400">{focusDescription}</p>
          </div>

          <div className="flex rounded-2xl border border-white/10 bg-zinc-950 p-1" role="group" aria-label="Visualização">
            {(["list", "map"] as ViewMode[]).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={view === item}
                onClick={() => changeView(item)}
                className={`rounded-xl px-5 py-2 text-sm font-bold transition ${
                  view === item ? "bg-white text-black" : "text-zinc-400 hover:text-white"
                }`}
              >
                {item === "list" ? "Lista" : "Mapa"}
              </button>
            ))}
          </div>
        </header>

        <section className="aura-card mt-6 rounded-3xl border p-4 sm:p-6" aria-label="Filtros do Explorar">
          <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Tipos de perfil">
            {(mode === "venue"
              ? ([["artist", "Artistas"]] as Array<[ExploreKind, string]>)
              : ([
                  ["all", "Todos"],
                  ["artist", "Artistas"],
                  ["venue", "Casas"],
                ] as Array<[ExploreKind, string]>)
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={filters.kind === kind}
                onClick={() => updateFilter("kind", kind)}
                className={`rounded-full px-5 py-2 text-sm font-bold transition ${
                  filters.kind === kind
                    ? "bg-red-500 text-white"
                    : "border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="mt-3 text-xs text-zinc-500">
            {mode === "venue"
              ? "Casas encontram DJs aqui. A busca começa sem limite de distância."
              : "Artistas podem explorar Casas e outros Artistas. A busca começa sem limite de distância."}
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="xl:col-span-2">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">Nome</span>
              <input
                value={filters.query}
                onChange={(event) => updateFilter("query", event.target.value)}
                placeholder="Nome de Artista ou Casa"
                className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none transition focus:border-red-500"
              />
            </label>

            <label>
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">Cidade</span>
              <input
                value={filters.city}
                onChange={(event) => updateFilter("city", event.target.value)}
                placeholder="Ex.: Porto Alegre"
                className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none transition focus:border-red-500"
              />
            </label>

            <label>
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">Distância</span>
              <select
                value={filters.maximumDistanceKm ?? ""}
                disabled={!location}
                onChange={(event) =>
                  updateFilter(
                    "maximumDistanceKm",
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
                className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Qualquer distância</option>
                {[10, 25, 50, 100, 250].map((distance) => (
                  <option key={distance} value={distance}>{`Até ${distance} km`}</option>
                ))}
              </select>
            </label>
          </div>

          <details className="mt-4 rounded-2xl border border-zinc-800 bg-black/40 p-4">
            <summary className="cursor-pointer text-sm font-bold text-zinc-300">Mais filtros</summary>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label>
                <span className="mb-2 block text-xs text-zinc-500">Estilo musical</span>
                <input
                  value={filters.style}
                  onChange={(event) => updateFilter("style", event.target.value)}
                  placeholder="Ex.: Sertanejo"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5"
                />
              </label>

              <label>
                <span className="mb-2 block text-xs text-zinc-500">Tipo de evento</span>
                <input
                  value={filters.eventType}
                  onChange={(event) => updateFilter("eventType", event.target.value)}
                  placeholder="Ex.: Casamento"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5"
                />
              </label>

              <label>
                <span className="mb-2 block text-xs text-zinc-500">Avaliação mínima</span>
                <select
                  value={filters.minimumRating}
                  onChange={(event) => updateFilter("minimumRating", Number(event.target.value))}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5"
                >
                  <option value={0}>Qualquer avaliação</option>
                  {[3, 4, 4.5].map((rating) => (
                    <option key={rating} value={rating}>
                      {rating}+ estrelas
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="mb-2 block text-xs text-zinc-500">Cachê máximo por hora</span>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={filters.maximumHourlyFee ?? ""}
                  onChange={(event) =>
                    updateFilter(
                      "maximumHourlyFee",
                      event.target.value ? Number(event.target.value) : null,
                    )
                  }
                  placeholder="R$"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={filters.availableNow}
                  onChange={(event) => updateFilter("availableNow", event.target.checked)}
                  className="h-4 w-4 accent-green-500"
                />
                Disponível agora
              </label>

              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={filters.verifiedOnly}
                  onChange={(event) => updateFilter("verifiedOnly", event.target.checked)}
                  className="h-4 w-4 accent-blue-500"
                />
                Somente verificados
              </label>
            </div>
          </details>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <button
                type="button"
                onClick={requestLocation}
                className="rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-2 text-sm font-bold text-green-300 hover:bg-green-500/20"
              >
                {location ? "✓ Localização desta sessão" : "Usar minha localização"}
              </button>
              {locationMessage && <p className="mt-2 text-xs text-zinc-500">{locationMessage}</p>}
            </div>

            <button
              type="button"
              onClick={() => clearFilters()}
              className="text-sm font-bold text-zinc-400 hover:text-white"
            >
              Limpar filtros
            </button>
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-200"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
              className="rounded-lg border border-red-700 px-3 py-1.5 font-bold"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {usingFallback && view === "map" && (
          <p className="mt-5 rounded-2xl border border-yellow-800/50 bg-yellow-950/20 p-4 text-sm text-yellow-200">
            Os perfis continuam disponíveis na lista. Os marcadores públicos aparecem após aplicar a migration de descoberta segura, sem revelar GPS exato.
          </p>
        )}

        <div id="explore-results" className="mt-7 scroll-mt-4 flex items-center justify-between gap-4">
          <p className="text-sm text-zinc-400" aria-live="polite">
            {loading ? "Atualizando resultados…" : `${totalCount} perfil(is) encontrado(s)`}
          </p>
          {view === "map" && !loading && (
            <p className="text-xs text-zinc-500">{mappableCount} marcador(es) nesta página</p>
          )}
        </div>

        {loading ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Carregando perfis">
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className="h-72 animate-pulse rounded-3xl border border-zinc-800 bg-zinc-950"
              />
            ))}
          </div>
        ) : profiles.length === 0 ? (
          <section className="aura-card mt-5 rounded-3xl border border-dashed p-10 text-center">
            <p className="text-4xl" aria-hidden="true">⌕</p>
            <h2 className="mt-3 text-xl font-black">Nenhum perfil encontrado</h2>
            <p className="mt-2 text-sm text-zinc-500">Ajuste os filtros ou procure outra cidade.</p>
            <button
              type="button"
              onClick={() => clearFilters()}
              className="mt-5 rounded-xl bg-white px-5 py-2.5 text-sm font-black text-black"
            >
              Limpar filtros
            </button>
          </section>
        ) : view === "list" ? (
          <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Resultados em lista">
            {profiles.map((profile) => (
              <ExploreProfileCard
                key={`${profile.kind}-${profile.id}`}
                profile={profile}
                canSendOffer={canSendOffer}
                favorite={favoriteKeys.has(`${profile.kind}:${profile.id}`)}
                favoriteBusy={favoriteBusy === `${profile.kind}:${profile.id}`}
                onToggleFavorite={toggleFavorite}
              />
            ))}
          </section>
        ) : (
          <section className="aura-card relative mt-5 overflow-hidden rounded-3xl border" aria-label="Resultados no mapa">
            <ExploreMap profiles={profiles} userLocation={location} onSelect={setSelectedProfile} />
            {selectedProfile && (
              <aside
                className="absolute inset-x-3 bottom-3 z-[500] max-h-[78%] overflow-y-auto rounded-3xl sm:left-auto sm:w-[460px]"
                aria-label={`Perfil selecionado: ${selectedProfile.name}`}
              >
                <button
                  type="button"
                  aria-label="Fechar perfil selecionado"
                  onClick={() => setSelectedProfile(null)}
                  className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-black/60 text-lg text-white backdrop-blur"
                >
                  ×
                </button>
                <MiniPressKit
                  profile={selectedProfile}
                  canSendOffer={canSendOffer}
                  favorite={favoriteKeys.has(`${selectedProfile.kind}:${selectedProfile.id}`)}
                  favoriteBusy={favoriteBusy === `${selectedProfile.kind}:${selectedProfile.id}`}
                  onToggleFavorite={toggleFavorite}
                  media={selectedMedia}
                  mediaLoading={selectedMediaLoading}
                  travelQuote={selectedTravelQuote}
                  travelQuoteLoading={selectedTravelQuoteLoading}
                />
              </aside>
            )}
          </section>
        )}

        {!loading && totalPages > 1 && (
          <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Paginação dos perfis">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="rounded-xl border border-zinc-800 px-4 py-2 text-sm font-bold disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="text-sm text-zinc-400">
              Página {page} de {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
              className="rounded-xl border border-zinc-800 px-4 py-2 text-sm font-bold disabled:opacity-40"
            >
              Próxima
            </button>
          </nav>
        )}

        <p className="mt-8 text-center text-xs leading-5 text-zinc-600">
          A localização de Artistas no mapa é aproximada. O GPS de acompanhamento de bookings nunca é consultado pelo Explorar.
        </p>
      </div>
    </main>
  );
}
