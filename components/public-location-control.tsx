"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type PublicLocationControlProps = {
  kind: "artist" | "venue";
};

export function PublicLocationControl({ kind }: PublicLocationControlProps) {
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [visibleOnMap, setVisibleOnMap] = useState(false);
  const [message, setMessage] = useState("");
  const isArtist = kind === "artist";

  useEffect(() => {
    let active = true;

    async function loadStatus() {
      setChecking(true);

      const { data, error } = await supabase
        .from("public_profile_locations")
        .select("id,precision_km")
        .eq("profile_kind", kind)
        .maybeSingle();

      if (!active) return;

      if (!error) {
        setVisibleOnMap(Boolean(data));
      }

      setChecking(false);
    }

    void loadStatus();

    return () => {
      active = false;
    };
  }, [kind]);

  function saveCurrentLocation() {
    setMessage("");

    if (!navigator.geolocation) {
      setMessage("Seu navegador não oferece localização.");
      return;
    }

    setBusy(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { error } = await supabase.rpc("set_public_profile_location_v1", {
          p_kind: kind,
          p_lat: position.coords.latitude,
          p_lng: position.coords.longitude,
          p_precision_km: isArtist ? 5 : 0.25,
          p_remove: false,
        });

        setBusy(false);

        if (error) {
          setMessage("Não foi possível salvar a localização no mapa.");
          return;
        }

        setVisibleOnMap(true);
        setMessage(
          isArtist
            ? "Seu perfil está visível no mapa com localização aproximada."
            : "Sua Casa agora está visível no mapa do Explorar.",
        );
      },
      () => {
        setBusy(false);
        setMessage("Não foi possível acessar sua localização.");
      },
      {
        enableHighAccuracy: false,
        timeout: 12000,
        maximumAge: 300000,
      },
    );
  }

  async function removeLocation() {
    setBusy(true);
    setMessage("");

    const { error } = await supabase.rpc("set_public_profile_location_v1", {
      p_kind: kind,
      p_lat: null,
      p_lng: null,
      p_precision_km: null,
      p_remove: true,
    });

    setBusy(false);

    if (error) {
      setMessage("Não foi possível remover a localização pública.");
      return;
    }

    setVisibleOnMap(false);
    setMessage(
      isArtist
        ? "Seu perfil foi removido do mapa."
        : "Sua Casa foi removida do mapa do Explorar.",
    );
  }

  return (
    <section className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-purple-200">
            Localização no Explorar
          </p>
          <p className="mt-2 max-w-xl text-xs leading-5 text-zinc-400">
            {isArtist
              ? "O mapa usa uma posição aproximada do Artista. A localização exata não é entregue aos outros usuários."
              : "Para a Casa aparecer no mapa dos Artistas, salve aqui a localização comercial do estabelecimento."}
          </p>
        </div>

        <span
          className={`rounded-full border px-3 py-1 text-xs font-black ${
            checking
              ? "border-zinc-700 text-zinc-500"
              : visibleOnMap
                ? "border-green-500/30 bg-green-500/10 text-green-300"
                : "border-amber-500/30 bg-amber-500/10 text-amber-200"
          }`}
        >
          {checking
            ? "Verificando…"
            : visibleOnMap
              ? "● Visível no mapa"
              : "○ Fora do mapa"}
        </span>
      </div>

      {!checking && !visibleOnMap && (
        <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-100/80">
          {isArtist
            ? "Seu perfil continua aparecendo na lista, mas não terá marcador no mapa até você salvar uma localização."
            : "Sua Casa aparece na lista do Explorar, mas não terá marcador no mapa até você salvar a localização comercial."}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={saveCurrentLocation}
          className="rounded-xl bg-purple-600 px-4 py-2 text-sm font-bold transition hover:bg-purple-500 disabled:opacity-50"
        >
          {busy
            ? "Atualizando…"
            : visibleOnMap
              ? "Atualizar localização"
              : "Aparecer no mapa"}
        </button>

        {visibleOnMap && (
          <button
            type="button"
            disabled={busy}
            onClick={removeLocation}
            className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-bold text-zinc-300 transition hover:bg-zinc-900 disabled:opacity-50"
          >
            Remover do mapa
          </button>
        )}
      </div>

      {message && (
        <p role="status" className="mt-3 text-xs text-zinc-300">
          {message}
        </p>
      )}
    </section>
  );
}
