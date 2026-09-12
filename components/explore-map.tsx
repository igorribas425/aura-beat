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

function markerIcon(
  leaflet: typeof import("leaflet"),
  kind: ExploreProfile["kind"] | "self",
  available = false,
) {
  const appearance =
    kind === "self"
      ? { background: "#22c55e", symbol: "●", label: "Sua localização" }
      : kind === "artist"
        ? {
            background: available ? "#16a34a" : "linear-gradient(135deg,#ef4444,#7e22ce)",
            symbol: "♫",
            label: available ? "Artista disponível agora" : "Artista",
          }
        : { background: "linear-gradient(135deg,#2563eb,#06b6d4)", symbol: "⌂", label: "Casa" };

  return leaflet.divIcon({
    className: "",
    html: `<div title="${appearance.label}" style="width:42px;height:42px;border-radius:14px;background:${appearance.background};border:3px solid white;display:flex;align-items:center;justify-content:center;color:white;font-size:20px;font-weight:900;box-shadow:0 6px 22px rgba(0,0,0,.48)">${appearance.symbol}</div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
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
        mapRef.current = leaflet.map(elementRef.current, { zoomControl: true }).setView(
          DEFAULT_CENTER,
          4,
        );
        leaflet
          .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
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
          .marker(point, { icon: markerIcon(leaflet, "self"), zIndexOffset: 1000 })
          .bindTooltip("Sua localização", { direction: "top" })
          .addTo(layer);
        leaflet
          .circle(point, {
            radius: Math.max(userLocation.accuracy, 50),
            color: "#22c55e",
            fillColor: "#22c55e",
            fillOpacity: 0.08,
            weight: 1,
          })
          .addTo(layer);
      }

      profiles.forEach((profile) => {
        if (profile.latitude === null || profile.longitude === null) return;
        const point: [number, number] = [profile.latitude, profile.longitude];
        bounds.push(point);
        leaflet
          .marker(point, {
            icon: markerIcon(
              leaflet,
              profile.isOwnProfile ? "self" : profile.kind,
              profile.availableNow,
            ),
          })
          .bindTooltip(
            profile.isOwnProfile ? `${profile.name} (seu perfil)` : profile.name,
            { direction: "top" },
          )
          .on("click", () => onSelectRef.current(profile))
          .addTo(layer);
      });

      if (bounds.length === 1) map.setView(bounds[0], 12);
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [48, 48], maxZoom: 13 });
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

  const mappableProfiles = profiles.filter(
    (profile) => profile.latitude !== null && profile.longitude !== null,
  );

  return (
    <div>
      <div
        ref={elementRef}
        className="h-[58vh] min-h-[420px] w-full bg-zinc-900"
        aria-label="Mapa de Artistas e Casas"
      />
      <div className="sr-only" aria-label="Perfis no mapa">
        {mappableProfiles.map((profile) => (
          <button key={`${profile.kind}-${profile.id}`} onClick={() => onSelect(profile)}>
            Abrir {profile.name}
          </button>
        ))}
      </div>
    </div>
  );
}
