"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useRef } from "react";
import type { ExploreProfile } from "../lib/explore";

type UserLocation = { lat: number; lng: number; accuracy: number };

type ExploreMapProps = {
  profiles: ExploreProfile[];
  userLocation: UserLocation | null;
  onSelect: (profile: ExploreProfile) => void;
};

const DEFAULT_CENTER: [number, number] = [-14.235, -51.9253];

function isValidMapPoint(lat: number | null, lng: number | null): lat is number {
  return (
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function spreadCoincidentPoints(profiles: ExploreProfile[]) {
  const groups = new Map<string, ExploreProfile[]>();

  for (const profile of profiles) {
    if (!isValidMapPoint(profile.latitude, profile.longitude)) continue;

    const key = `${profile.latitude!.toFixed(8)}:${profile.longitude!.toFixed(8)}`;
    const current = groups.get(key) ?? [];
    current.push(profile);
    groups.set(key, current);
  }

  const points = new Map<string, [number, number]>();

  for (const group of groups.values()) {
    if (group.length === 1) {
      const profile = group[0];
      points.set(
        `${profile.kind}:${profile.id}`,
        [profile.latitude!, profile.longitude!],
      );
      continue;
    }

    const spreadDegrees = 0.0032;

    group
      .slice()
      .sort((a, b) =>
        `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`),
      )
      .forEach((profile, index) => {
        const angle = (Math.PI * 2 * index) / group.length - Math.PI / 2;
        const latitude = profile.latitude! + Math.sin(angle) * spreadDegrees;
        const longitude = profile.longitude! + Math.cos(angle) * spreadDegrees;

        points.set(
          `${profile.kind}:${profile.id}`,
          [latitude, longitude],
        );
      });
  }

  return points;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeImageUrl(value: string | null) {
  if (!value) return null;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;

    const path = parsed.pathname.toLowerCase();
    const isSupabaseStorage =
      parsed.hostname.endsWith(".supabase.co") &&
      path.includes("/storage/v1/object/public/");
    const isImageFile = /\.(?:jpe?g|png|webp|gif|avif)$/i.test(path);

    return isSupabaseStorage || isImageFile ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function selfLocationIcon(leaflet: typeof import("leaflet")) {
  return leaflet.divIcon({
    className: "",
    html: `
      <div class="aura-self-location-marker" title="Sua localização">
        <span></span>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function profileMarkerIcon(
  leaflet: typeof import("leaflet"),
  profile: ExploreProfile,
) {
  const imageUrl = safeImageUrl(profile.avatarUrl);
  const isArtist = profile.kind === "artist";
  const markerColor = isArtist ? "#a855f7" : "#ff244f";
  const fallback = isArtist ? "♫" : "⌂";
  const name = escapeHtml(profile.name);
  const distance =
    profile.distanceKm === null
      ? ""
      : `<span class="aura-profile-marker-distance">${escapeHtml(
          profile.distanceKm < 1
            ? `${Math.max(1, Math.round(profile.distanceKm * 1000))} m`
            : `${profile.distanceKm.toFixed(1)} km`,
        )}</span>`;
  const availability =
    isArtist && profile.availableNow
      ? '<span class="aura-profile-marker-online" title="Disponível agora"></span>'
      : "";
  const ownBadge = profile.isOwnProfile
    ? '<span class="aura-profile-marker-own">VOCÊ</span>'
    : "";
  const media = imageUrl
    ? `<span
        class="aura-profile-marker-image"
        aria-hidden="true"
        style="background-image:url(&quot;${escapeHtml(imageUrl)}&quot;)"
      ></span>`
    : `<span class="aura-profile-marker-fallback">${fallback}</span>`;

  return leaflet.divIcon({
    className: "",
    html: `
      <div class="aura-profile-marker" title="${name}" style="--aura-marker:${markerColor}">
        <div class="aura-profile-marker-photo">
          ${media}
          ${availability}
          ${ownBadge}
        </div>
        ${distance}
      </div>
    `,
    iconSize: [80, 82],
    iconAnchor: [40, 31],
  });
}

export function ExploreMap({ profiles, userLocation, onSelect }: ExploreMapProps) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markersRef = useRef<import("leaflet").LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let cancelled = false;

    async function renderMap() {
      if (!elementRef.current) return;

      const leaflet = await import("leaflet");
      if (cancelled || !elementRef.current) return;

      if (!mapRef.current) {
        mapRef.current = leaflet
          .map(elementRef.current, {
            zoomControl: false,
            attributionControl: true,
          })
          .setView(DEFAULT_CENTER, 4);

        leaflet.control.zoom({ position: "bottomright" }).addTo(mapRef.current);

        leaflet
          .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            className: "aura-map-tiles",
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          })
          .addTo(mapRef.current);

        markersRef.current = leaflet.layerGroup().addTo(mapRef.current);
      }

      const map = mapRef.current;
      const layer = markersRef.current;
      if (!map || !layer) return;

      layer.clearLayers();

      const bounds: Array<[number, number]> = [];

      if (userLocation) {
        const point: [number, number] = [userLocation.lat, userLocation.lng];
        bounds.push(point);

        leaflet
          .circle(point, {
            radius: Math.max(userLocation.accuracy, 80),
            color: "#8b5cf6",
            fillColor: "#8b5cf6",
            fillOpacity: 0.08,
            weight: 1.25,
          })
          .addTo(layer);

        leaflet
          .marker(point, {
            icon: selfLocationIcon(leaflet),
            zIndexOffset: 1200,
          })
          .bindTooltip("Sua localização", {
            direction: "top",
            className: "aura-map-tooltip",
          })
          .addTo(layer);
      }

      const displayPoints = spreadCoincidentPoints(profiles);

      profiles.forEach((profile) => {
        if (!isValidMapPoint(profile.latitude, profile.longitude)) return;

        const point =
          displayPoints.get(`${profile.kind}:${profile.id}`) ??
          ([profile.latitude, profile.longitude!] as [number, number]);

        bounds.push(point);

        const marker = leaflet
          .marker(point, {
            icon: profileMarkerIcon(leaflet, profile),
            zIndexOffset: profile.availableNow ? 500 : 100,
          })
          .bindTooltip(
            profile.isOwnProfile ? `${profile.name} · seu perfil` : profile.name,
            {
              direction: "top",
              offset: [0, -26],
              className: "aura-map-tooltip",
            },
          )
          .on("click", () => onSelectRef.current(profile))
          .addTo(layer);

        if (profile.kind === "artist" && profile.availableNow) {
          leaflet
            .circleMarker(point, {
              radius: 31,
              color: "#22c55e",
              fillColor: "#22c55e",
              fillOpacity: 0.035,
              opacity: 0.45,
              weight: 1.5,
            })
            .on("click", () => marker.fire("click"))
            .addTo(layer);
        }
      });

      if (bounds.length === 1) {
        map.setView(bounds[0], 12);
      } else if (bounds.length > 1) {
        map.fitBounds(bounds, {
          paddingTopLeft: [54, 88],
          paddingBottomRight: [54, 118],
          maxZoom: 13,
        });
      }

      window.requestAnimationFrame(() => map.invalidateSize());
    }

    void renderMap();

    return () => {
      cancelled = true;
    };
  }, [profiles, userLocation]);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = null;
    },
    [],
  );

  const mappableProfiles = profiles.filter((profile) =>
    isValidMapPoint(profile.latitude, profile.longitude),
  );

  return (
    <div className="aura-explore-map relative overflow-hidden bg-[#15131d]">
      <div className="pointer-events-none absolute left-3 top-3 z-[450] flex flex-wrap gap-2">
        <span className="rounded-full border border-purple-400/30 bg-[#0b0b13]/88 px-3 py-1.5 text-[11px] font-bold text-purple-100 shadow-lg backdrop-blur">
          <span className="mr-1.5 text-purple-400">●</span>
          Artistas
        </span>
        <span className="rounded-full border border-red-400/30 bg-[#0b0b13]/88 px-3 py-1.5 text-[11px] font-bold text-red-100 shadow-lg backdrop-blur">
          <span className="mr-1.5 text-red-400">●</span>
          Casas
        </span>
        <span className="rounded-full border border-green-400/30 bg-[#0b0b13]/88 px-3 py-1.5 text-[11px] font-bold text-green-100 shadow-lg backdrop-blur">
          <span className="mr-1.5 text-green-400">●</span>
          Disponível
        </span>
      </div>

      <div
        ref={elementRef}
        className="h-[64vh] min-h-[460px] w-full bg-[#15131d]"
        aria-label="Mapa universal de Artistas e Casas"
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[400] h-20 bg-gradient-to-t from-[#050507]/32 to-transparent" />

      <div className="sr-only" aria-label="Perfis no mapa">
        {mappableProfiles.map((profile) => (
          <button
            key={`${profile.kind}-${profile.id}`}
            onClick={() => onSelect(profile)}
          >
            Abrir {profile.name}
          </button>
        ))}
      </div>
    </div>
  );
}
