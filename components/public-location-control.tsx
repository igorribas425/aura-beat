"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";

type PublicLocationControlProps = {
  kind: "artist" | "venue";
};

export function PublicLocationControl({ kind }: PublicLocationControlProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const isArtist = kind === "artist";

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
        setMessage(
          error
            ? "Não foi possível salvar. Verifique se a migration do Explorar foi aplicada."
            : isArtist
              ? "Base pública salva. O mapa sempre reduz a precisão para pelo menos 5 km."
              : "Localização comercial pública salva.",
        );
      },
      () => {
        setBusy(false);
        setMessage("Não foi possível acessar sua localização.");
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
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
    setMessage(error ? "Não foi possível remover a localização pública." : "Localização pública removida.");
  }

  return (
    <section className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4">
      <p className="text-sm font-black text-purple-200">Localização no Explorar</p>
      <p className="mt-2 text-xs leading-5 text-zinc-400">
        {isArtist
          ? "Salve uma base aproximada. O ponto exato fica protegido e nunca é retornado pelo Explorar."
          : "Use somente a localização comercial que pode ser mostrada publicamente."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={saveCurrentLocation} className="rounded-xl bg-purple-600 px-4 py-2 text-sm font-bold transition hover:bg-purple-500 disabled:opacity-50">
          {busy ? "Atualizando…" : "Usar localização atual"}
        </button>
        <button type="button" disabled={busy} onClick={removeLocation} className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-bold text-zinc-300 transition hover:bg-zinc-900 disabled:opacity-50">
          Remover do mapa
        </button>
      </div>
      {message && <p role="status" className="mt-3 text-xs text-zinc-300">{message}</p>}
    </section>
  );
}
