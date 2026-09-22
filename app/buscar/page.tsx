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
import {
  getMyPlanAccess,
  hasPlanBenefit,
  type PlanAccess,
} from "../../lib/plan-access";
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
    planCode: null,
    planName: null,
  } satisfies ExploreProfile;
}

type PublicPlanLevelRow = {
  profile_kind: "artist" | "venue";
  profile_id: string;
  plan_code: "normal" | "intermediate" | "pro" | null;
  plan_name: string | null;
};

async function attachPublicPlanLevels(
  profiles: ExploreProfile[],
): Promise<ExploreProfile[]> {
  if (profiles.length === 0) return profiles;

  const artistIds = profiles
    .filter((profile) => profile.kind === "artist")
    .map((profile) => profile.id);
  const venueIds = profiles
    .filter((profile) => profile.kind === "venue")
    .map((profile) => profile.id);

  const { data, error } = await supabase.rpc(
    "get_public_plan_levels_v1",
    {
      p_artist_ids: artistIds,
      p_venue_ids: venueIds,
    },
  );

  if (error) {
    console.warn("Não foi possível carregar níveis públicos dos planos:", error);
    return profiles;
  }

  const levels = new Map(
    ((data || []) as PublicPlanLevelRow[]).map((row) => [
      `${row.profile_kind}:${row.profile_id}`,
      row,
    ]),
  );

  return profiles.map((profile) => {
    const level = levels.get(`${profile.kind}:${profile.id}`);

    return {
      ...profile,
      planCode:
        level?.plan_code === "normal" ||
        level?.plan_code === "intermediate" ||
        level?.plan_code === "pro"
          ? level.plan_code
          : null,
      planName: level?.plan_name ?? null,
    };
  });
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
      planCode: null,
      planName: null,
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
    planCode: null,
    planName: null,
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
  const [planAccess, setPlanAccess] = useState<PlanAccess | null>(null);
  const [ownArtistId, setOwnArtistId] = useState<string | null>(null);
  const [ownVenueId, setOwnVenueId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("list");
  const [selectedProfile, setSelectedProfile] = useState<ExploreProfile | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<MiniPressKitMedia[]>([]);
  const [selectedMediaLoading, setSelectedMediaLoading] = useState(false);
  const [selectedMediaReloadKey, setSelectedMediaReloadKey] = useState(0);
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

  const canSendOffer = mode === "venue" && Boolean(ownVenueId);
  const canUseAdvancedFilters =
    mode !== "venue" ||
    hasPlanBenefit(planAccess, "advanced_filters");

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

      let nextPlanAccess: PlanAccess | null = null;

      try {
        nextPlanAccess = await getMyPlanAccess(resolvedMode);
      } catch (planError) {
        console.warn("Não foi possível carregar o plano atual:", planError);
      }

      if (!active) return;

      setUserId(user.id);
      setOwnArtistId(artistResult.data?.id ?? null);
      setOwnVenueId(venueResult.data?.id ?? null);
      setMode(resolvedMode);
      setPlanAccess(nextPlanAccess);
      setFilters((current) => ({
        ...current,
        kind: defaultExploreKind(resolvedMode),
        maximumDistanceKm: null,
        ...(resolvedMode === "venue" &&
        !hasPlanBenefit(nextPlanAccess, "advanced_filters")
          ? {
              style: "",
              eventType: "",
              availableNow: false,
              verifiedOnly: false,
              minimumRating: 0,
              maximumHourlyFee: null,
            }
          : {}),
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
              row.calculation_mode === "vehicle"
                ? "vehicle"
                : row.calculation_mode === "ticket"
                  ? "ticket"
                  : "fixed",
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
  }, [canSendOffer, location, selectedProfile, selectedMediaReloadKey]);

  useEffect(() => {
    const channel = supabase
      .channel("explore-profile-visuals")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "artist_profiles" },
        (payload) => {
          const row = payload.new as { id?: string; avatar_url?: string | null };
          if (!row.id) return;

          setProfiles((current) =>
            current.map((profile) =>
              profile.kind === "artist" && profile.id === row.id
                ? { ...profile, avatarUrl: row.avatar_url ?? null }
                : profile,
            ),
          );

          setSelectedProfile((current) =>
            current?.kind === "artist" && current.id === row.id
              ? { ...current, avatarUrl: row.avatar_url ?? null }
              : current,
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "venue_profiles" },
        (payload) => {
          const row = payload.new as { id?: string; avatar_url?: string | null };
          if (!row.id) return;

          setProfiles((current) =>
            current.map((profile) =>
              profile.kind === "venue" && profile.id === row.id
                ? { ...profile, avatarUrl: row.avatar_url ?? null }
                : profile,
            ),
          );

          setSelectedProfile((current) =>
            current?.kind === "venue" && current.id === row.id
              ? { ...current, avatarUrl: row.avatar_url ?? null }
              : current,
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "artist_media" },
        (payload) => {
          const row = (payload.new ?? payload.old) as { artist_id?: string };
          if (!row.artist_id) return;

          setSelectedProfile((current) => {
            if (current?.kind === "artist" && current.id === row.artist_id) {
              setSelectedMediaReloadKey((value) => value + 1);
            }
            return current;
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (contextLoading) return;

    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");

      try {
        const planAwareFilters: ExploreFilters =
          mode === "venue" && !canUseAdvancedFilters
            ? {
                ...filters,
                style: "",
                eventType: "",
                availableNow: false,
                verifiedOnly: false,
                minimumRating: 0,
                maximumHourlyFee: null,
              }
            : filters;

        const effectiveDistanceKm =
          planAwareFilters.maximumDistanceKm;
        const requestLimit = view === "map" ? 48 : EXPLORE_PAGE_SIZE;
        const requestOffset = view === "map" ? 0 : (page - 1) * EXPLORE_PAGE_SIZE;

        const { data, error: rpcError } = await supabase.rpc("explore_profiles_v1", {
          p_kind: planAwareFilters.kind,
          p_query: planAwareFilters.query || null,
          p_city: planAwareFilters.city || null,
          p_style: planAwareFilters.style || null,
          p_event_type: planAwareFilters.eventType || null,
          p_available_now: planAwareFilters.availableNow,
          p_verified_only: planAwareFilters.verifiedOnly,
          p_min_rating: planAwareFilters.minimumRating,
          p_max_hourly_fee: planAwareFilters.maximumHourlyFee,
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
            planAwareFilters,
            page,
            ownArtistId,
            ownVenueId,
          );
          nextProfiles = fallback.profiles;
          nextTotal = fallback.totalCount;
          setUsingFallback(true);
        }

        nextProfiles = await attachPublicPlanLevels(nextProfiles);

        const located = withDistances(nextProfiles, location);
        const effectiveFilters: ExploreFilters = {
          ...planAwareFilters,
          maximumDistanceKm: effectiveDistanceKm,
        };
        const visibleProfiles = located
          .filter((profile) =>
            matchesExploreFilters(profile, effectiveFilters),
          )
          .sort((left, right) => {
            if (left.availableNow !== right.availableNow) {
              return left.availableNow ? -1 : 1;
            }

            const priority = (code: ExploreProfile["planCode"]) =>
              code === "pro" ? 2 : code === "intermediate" ? 1 : 0;

            const planDifference =
              priority(right.planCode) - priority(left.planCode);

            if (planDifference !== 0) return planDifference;
            if (right.rating !== left.rating) return right.rating - left.rating;

            return left.name.localeCompare(right.name, "pt-BR");
          });

        if (!active) return;
        setProfiles(visibleProfiles);
        setSelectedProfile((current) => {
          if (!current) return null;

          return (
            visibleProfiles.find(
              (profile) =>
                profile.kind === current.kind &&
                profile.id === current.id,
            ) ?? null
          );
        });
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
  }, [
    canUseAdvancedFilters,
    contextLoading,
    filters,
    location,
    mode,
    ownArtistId,
    ownVenueId,
    page,
    reloadKey,
    view,
  ]);

  useEffect(() => {
    if (view !== "map" || contextLoading) {
      return;
    }

    const interval = window.setInterval(() => {
      setReloadKey((value) => value + 1);
    }, 10000);

    return () => {
      window.clearInterval(interval);
    };
  }, [contextLoading, view]);

  const favoriteKeys = useMemo(
    () =>
      new Set(
        favorites.map((favorite) =>
          favorite.artist_id ? `artist:${favorite.artist_id}` : `venue:${favorite.venue_id}`,
        ),
      ),
    [favorites],
  );
  const totalPages = Math.max(1, Math.ceil(totalCount / EXPLORE_PAGE_SIZE));
  const mappableCount = profiles.filter(
    (profile) => profile.latitude !== null && profile.longitude !== null,
  ).length;
  const nameSuggestions = useMemo(() => {
    const term = filters.query.trim().toLocaleLowerCase("pt-BR");

    if (!term) return [];

    return profiles
      .filter((profile) =>
        profile.name.toLocaleLowerCase("pt-BR").includes(term),
      )
      .slice(0, 7);
  }, [filters.query, profiles]);
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
      setPage(1);
      setReloadKey((value) => value + 1);
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
            <label className="relative xl:col-span-2">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-zinc-500">Nome</span>
              <input
                value={filters.query}
                onChange={(event) => updateFilter("query", event.target.value)}
                placeholder="Nome de Artista ou Casa"
                autoComplete="off"
                className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none transition focus:border-red-500"
              />

              {filters.query.trim() && nameSuggestions.length > 0 && (
                <div className="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
                  {nameSuggestions.map((profile) => (
                    <button
                      key={`${profile.kind}:${profile.id}`}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        updateFilter("query", profile.name);
                        setSelectedProfile(profile);
                      }}
                      className="flex w-full items-center justify-between gap-3 border-b border-zinc-900 px-4 py-3 text-left last:border-b-0 hover:bg-zinc-900"
                    >
                      <span>
                        <span className="block font-bold text-white">{profile.name}</span>
                        <span className="text-xs text-zinc-500">
                          {profile.kind === "artist" ? "Artista" : "Casa"}
                          {profile.city ? ` · ${profile.city}` : ""}
                        </span>
                      </span>
                      <span className="text-zinc-600">↗</span>
                    </button>
                  ))}
                </div>
              )}
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
            <summary className="cursor-pointer text-sm font-bold text-zinc-300">
              Mais filtros
              {mode === "venue" && !canUseAdvancedFilters && (
                <span className="ml-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-black text-amber-200">
                  🔒 INTERMEDIÁRIO / PRO
                </span>
              )}
            </summary>

            {mode === "venue" && !canUseAdvancedFilters ? (
              <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
                <p className="font-black text-amber-200">
                  Filtros avançados bloqueados neste plano
                </p>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  {planAccess?.active
                    ? `Seu plano atual é ${planAccess.planName || "Normal"}.`
                    : "Esta Casa ainda não possui um plano ativo."}
                  {" "}Os planos Intermediário e Pro liberam estilo musical,
                  tipo de evento, avaliação mínima, cachê máximo,
                  disponibilidade imediata e somente verificados.
                </p>
              </div>
            ) : (
              <>
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
              </>
            )}
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

        {view === "map" && !loading && profiles.length > 0 && mappableCount === 0 && (
          <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm leading-6 text-amber-100/80">
            Nenhum perfil compartilhou localização pública ainda. Os perfis continuam disponíveis na lista e só aparecem no mapa depois que o próprio Artista ou a Casa autorizar a localização.
          </div>
        )}

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
                sourceKind={mode}
                canSendOffer={canSendOffer}
                favorite={favoriteKeys.has(`${profile.kind}:${profile.id}`)}
                favoriteBusy={favoriteBusy === `${profile.kind}:${profile.id}`}
                onToggleFavorite={toggleFavorite}
              />
            ))}
          </section>
        ) : (
          <section
            className={`aura-card mt-5 overflow-hidden rounded-3xl border ${
              selectedProfile
                ? "lg:grid lg:grid-cols-[minmax(0,1fr)_420px]"
                : ""
            }`}
            aria-label="Resultados no mapa"
          >
            <div className="min-w-0">
              <ExploreMap
                profiles={profiles}
                userLocation={location}
                onSelect={setSelectedProfile}
              />
            </div>

            {selectedProfile && (
              <aside
                className="relative min-w-0 max-w-full overflow-hidden border-t border-white/10 bg-[#08080c] lg:max-h-[64vh] lg:min-h-[460px] lg:overflow-y-auto lg:border-l lg:border-t-0"
                aria-label={`Perfil selecionado: ${selectedProfile.name}`}
              >
                <div className="sticky top-0 z-20 flex justify-end border-b border-white/10 bg-black/75 p-3 backdrop-blur">
                  <button
                    type="button"
                    aria-label="Fechar perfil selecionado"
                    onClick={() => setSelectedProfile(null)}
                    className="grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-black/70 text-lg text-white"
                  >
                    ×
                  </button>
                </div>

                <div className="min-w-0 max-w-full p-3">
                  <MiniPressKit
                    profile={selectedProfile}
                    sourceKind={mode}
                    canSendOffer={canSendOffer}
                    favorite={favoriteKeys.has(`${selectedProfile.kind}:${selectedProfile.id}`)}
                    favoriteBusy={favoriteBusy === `${selectedProfile.kind}:${selectedProfile.id}`}
                    onToggleFavorite={toggleFavorite}
                    media={selectedMedia}
                    mediaLoading={selectedMediaLoading}
                    travelQuote={selectedTravelQuote}
                    travelQuoteLoading={selectedTravelQuoteLoading}
                  />
                </div>
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
