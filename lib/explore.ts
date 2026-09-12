export type ExploreKind = "all" | "artist" | "venue";

export type ExploreProfile = {
  kind: Exclude<ExploreKind, "all">;
  id: string;
  name: string;
  avatarUrl: string | null;
  city: string | null;
  state: string | null;
  description: string | null;
  styles: string[];
  eventTypes: string[];
  venueType: string | null;
  verificationStatus: string | null;
  rating: number;
  reviewCount: number;
  hourlyFee: number | null;
  availableNow: boolean;
  radiusKm: number | null;
  latitude: number | null;
  longitude: number | null;
  locationPrecisionKm: number | null;
  distanceKm: number | null;
  isOwnProfile: boolean;
};

export type ExploreFilters = {
  kind: ExploreKind;
  query: string;
  city: string;
  style: string;
  eventType: string;
  availableNow: boolean;
  verifiedOnly: boolean;
  minimumRating: number;
  maximumHourlyFee: number | null;
  maximumDistanceKm: number | null;
};

export const EXPLORE_PAGE_SIZE = 24;

export const INITIAL_EXPLORE_FILTERS: ExploreFilters = {
  kind: "all",
  query: "",
  city: "",
  style: "",
  eventType: "",
  availableNow: false,
  verifiedOnly: false,
  minimumRating: 0,
  maximumHourlyFee: null,
  maximumDistanceKm: null,
};

export function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

export function distanceInKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
) {
  const earthRadiusKm = 6371;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(to.lat - from.lat);
  const longitudeDelta = toRadians(to.lng - from.lng);
  const fromLatitude = toRadians(from.lat);
  const toLatitude = toRadians(to.lat);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function withDistances(
  profiles: ExploreProfile[],
  location: { lat: number; lng: number } | null,
) {
  return profiles.map((profile) => ({
    ...profile,
    distanceKm:
      location && profile.latitude !== null && profile.longitude !== null
        ? distanceInKm(location, {
            lat: profile.latitude,
            lng: profile.longitude,
          })
        : null,
  }));
}

export function matchesExploreFilters(profile: ExploreProfile, filters: ExploreFilters) {
  const query = normalizeSearch(filters.query);
  const city = normalizeSearch(filters.city);
  const style = normalizeSearch(filters.style);
  const eventType = normalizeSearch(filters.eventType);
  const searchable = normalizeSearch(
    [
      profile.name,
      profile.city,
      profile.state,
      profile.venueType,
      ...profile.styles,
      ...profile.eventTypes,
    ]
      .filter(Boolean)
      .join(" "),
  );

  return (
    (filters.kind === "all" || profile.kind === filters.kind) &&
    (!query || searchable.includes(query)) &&
    (!city || normalizeSearch(profile.city ?? "").includes(city)) &&
    (!style || profile.styles.some((item) => normalizeSearch(item).includes(style))) &&
    (!eventType ||
      profile.eventTypes.some((item) => normalizeSearch(item).includes(eventType))) &&
    (!filters.availableNow || (profile.kind === "artist" && profile.availableNow)) &&
    (!filters.verifiedOnly || profile.verificationStatus === "verified") &&
    profile.rating >= filters.minimumRating &&
    (filters.maximumHourlyFee === null ||
      profile.kind === "venue" ||
      (profile.hourlyFee !== null && profile.hourlyFee <= filters.maximumHourlyFee)) &&
    (filters.maximumDistanceKm === null ||
      (profile.distanceKm !== null && profile.distanceKm <= filters.maximumDistanceKm))
  );
}

export function profilePath(profile: Pick<ExploreProfile, "kind" | "id">) {
  return profile.kind === "artist" ? `/artistas/${profile.id}` : `/casas/${profile.id}`;
}

export function isVerified(status: string | null) {
  return status === "verified";
}
