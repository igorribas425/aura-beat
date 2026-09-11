"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function PerfilArtistaPage() {
  const [stageName, setStageName] = useState("");
  const [bio, setBio] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [instagram, setInstagram] = useState("");
  const [fixedFee, setFixedFee] = useState("");
  const [priceKm, setPriceKm] = useState("");
  const [freeRadius, setFreeRadius] = useState("");
  const [style, setStyle] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function carregarPerfil() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setMessage("❌ Você precisa estar logado.");
        return;
      }

      const { data } = await supabase
        .from("artist_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        setStageName(data.stage_name ?? "");
        setBio(data.bio ?? "");
        setCity(data.base_city ?? "");
        setState(data.base_state ?? "");
        setInstagram(data.instagram_handle ?? "");
        setFixedFee(String(data.fixed_fee ?? ""));
        setPriceKm(String(data.price_per_km ?? ""));
        setFreeRadius(String(data.free_radius_km ?? ""));
      }
    }

    carregarPerfil();
  }, []);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setMessage("❌ Faça login novamente.");
        return;
      }

      const { data: artist, error } = await supabase
        .from("artist_profiles")
        .upsert(
          {
            user_id: user.id,
            stage_name: stageName,
            bio,
            base_city: city,
            base_state: state.toUpperCase(),
            instagram_handle: instagram,
            fixed_fee: Number(fixedFee || 0),
            price_per_km: Number(priceKm || 0),
            free_radius_km: Number(freeRadius || 0),
          },
          { onConflict: "user_id" }
        )
        .select()
        .single();

      if (error) {
        setMessage("❌ " + error.message);
        return;
      }

      if (style.trim()) {
        await supabase
          .from("artist_styles")
          .delete()
          .eq("artist_id", artist.id)
          .eq("is_primary", true);

        const { error: styleError } = await supabase
          .from("artist_styles")
          .insert({
            artist_id: artist.id,
            style_name: style.trim(),
            is_primary: true,
          });

        if (styleError) {
          setMessage("⚠️ Perfil salvo, mas houve erro no estilo.");
          return;
        }
      }

      await supabase
        .from("profiles")
        .update({ default_mode: "artist" })
        .eq("id", user.id);

      setMessage("✅ Perfil de Artista salvo com sucesso!");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#07080b] text-white px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <p className="text-sm font-semibold text-red-500">AURA BEAT</p>
          <h1 className="mt-2 text-3xl font-black">
            Perfil profissional do Artista
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Essas informações serão mostradas para Casas e contratantes.
          </p>
        </div>

        <form
          onSubmit={salvar}
          className="space-y-5 rounded-3xl border border-zinc-800 bg-zinc-950 p-6"
        >
          <div>
            <label className="mb-2 block text-sm font-semibold">
              Nome artístico
            </label>
            <input
              required
              value={stageName}
              onChange={(e) => setStageName(e.target.value)}
              placeholder="Ex.: DJ Oliveira"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">
              Biografia
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Conte um pouco sobre sua carreira..."
              rows={4}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold">Cidade</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Carazinho"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold">Estado</label>
              <input
                value={state}
                onChange={(e) => setState(e.target.value)}
                maxLength={2}
                placeholder="RS"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 uppercase outline-none focus:border-red-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">
              Estilo principal
            </label>
            <input
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="Ex.: Mega Funk"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">
              Instagram
            </label>
            <input
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder="@seuinstagram"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-semibold">
                Cachê fixo
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={fixedFee}
                onChange={(e) => setFixedFee(e.target.value)}
                placeholder="1000"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold">
                Valor por km
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={priceKm}
                onChange={(e) => setPriceKm(e.target.value)}
                placeholder="1.50"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold">
                Raio grátis
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={freeRadius}
                onChange={(e) => setFreeRadius(e.target.value)}
                placeholder="20 km"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
              />
            </div>
          </div>

          <button
            disabled={loading}
            className="w-full rounded-xl bg-red-500 py-4 font-bold transition hover:bg-red-600 disabled:opacity-50"
          >
            {loading ? "Salvando..." : "Salvar perfil"}
          </button>

          {message && (
            <div className="rounded-xl bg-zinc-900 p-4 text-sm">{message}</div>
          )}
        </form>
      </div>
    </main>
  );
}