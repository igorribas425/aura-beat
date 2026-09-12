"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ProfileAvatar } from "../../components/profile-avatar";
import { PublicLocationControl } from "../../components/public-location-control";
import { supabase } from "../../lib/supabase";

type VerificationStatus = "pending" | "verified" | "rejected" | "suspended" | null;

function verificationInfo(status: VerificationStatus) {
  switch (status) {
    case "verified":
      return {
        title: "Artista Verificado",
        description:
          "Sua identidade foi aprovada. O selo de Artista Verificado pode aparecer nas áreas públicas do Aura Beat.",
        icon: "✓",
        className:
          "border-green-500/30 bg-green-500/10 text-green-300",
      };

    case "pending":
      return {
        title: "Verificação pendente",
        description:
          "Seu perfil ainda está aguardando análise. Contratações formais só serão liberadas quando os dois lados estiverem verificados.",
        icon: "⌛",
        className:
          "border-amber-500/30 bg-amber-500/10 text-amber-200",
      };

    case "rejected":
      return {
        title: "Verificação recusada",
        description:
          "Será necessário revisar os dados de identidade antes de solicitar uma nova análise.",
        icon: "!",
        className:
          "border-red-500/30 bg-red-500/10 text-red-300",
      };

    case "suspended":
      return {
        title: "Verificação suspensa",
        description:
          "Este perfil está temporariamente impedido de formalizar novas contratações.",
        icon: "!",
        className:
          "border-red-500/30 bg-red-500/10 text-red-300",
      };

    default:
      return {
        title: "Verificação de identidade necessária",
        description:
          "Para proteger Artista e Casa, a identidade precisa ser confirmada antes de uma contratação formal.",
        icon: "🔒",
        className:
          "border-purple-500/30 bg-purple-500/10 text-purple-200",
      };
  }
}

export default function PerfilArtistaPage() {
  const [stageName, setStageName] = useState("");
  const [bio, setBio] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [instagram, setInstagram] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [fixedFee, setFixedFee] = useState("");
  const [priceKm, setPriceKm] = useState("");
  const [freeRadius, setFreeRadius] = useState("");
  const [availabilityRadius, setAvailabilityRadius] = useState("");
  const [acceptedEventTypes, setAcceptedEventTypes] = useState("");
  const [style, setStyle] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [profileExists, setProfileExists] = useState(false);
  const [verificationStatus, setVerificationStatus] =
    useState<VerificationStatus>(null);

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
        setProfileExists(true);
        setStageName(data.stage_name ?? "");
        setBio(data.bio ?? "");
        setCity(data.base_city ?? "");
        setState(data.base_state ?? "");
        setInstagram(data.instagram_handle ?? "");
        setAvatarUrl(data.avatar_url ?? "");
        setFixedFee(String(data.fixed_fee ?? ""));
        setPriceKm(String(data.price_per_km ?? ""));
        setFreeRadius(String(data.free_radius_km ?? ""));
        setAvailabilityRadius(String(data.availability_radius_km ?? ""));
        setAcceptedEventTypes((data.accepted_event_types ?? []).join(", "));
        setVerificationStatus(
          (data.verification_status ?? null) as VerificationStatus,
        );
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
            avatar_url: avatarUrl.trim() || null,
            fixed_fee: Number(fixedFee || 0),
            price_per_km: Number(priceKm || 0),
            free_radius_km: Number(freeRadius || 0),
            availability_radius_km: availabilityRadius
              ? Number(availabilityRadius)
              : null,
            accepted_event_types: acceptedEventTypes
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
          },
          { onConflict: "user_id" }
        )
        .select()
        .single();

      if (error) {
        setMessage("❌ " + error.message);
        return;
      }

      setProfileExists(true);
      setVerificationStatus(
        (artist.verification_status ?? verificationStatus ?? null) as VerificationStatus,
      );

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

  const verification = verificationInfo(verificationStatus);

  return (
    <main className="aura-page px-4 py-8">
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

        <section
          className={`mb-5 rounded-3xl border p-5 ${verification.className}`}
        >
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-current/20 bg-black/10 text-xl font-black">
              {verification.icon}
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] opacity-80">
                Segurança da conta
              </p>
              <h2 className="mt-1 text-xl font-black">{verification.title}</h2>
              <p className="mt-2 text-sm leading-6 opacity-90">
                {verification.description}
              </p>
              <p className="mt-3 text-xs opacity-70">
                Documentos pessoais, CPF e imagens de verificação nunca devem aparecer no perfil público.
              </p>
              <Link
                href="/verificacao-artista"
                className="mt-4 inline-flex rounded-xl border border-current/30 bg-black/10 px-4 py-2 text-sm font-black"
              >
                {verificationStatus === "verified" ? "Ver verificação" : "Verificar identidade"}
              </Link>
            </div>
          </div>
        </section>

        <form
          onSubmit={salvar}
          className="aura-card space-y-5 rounded-3xl border p-6"
        >
          <div className="flex items-center gap-4 rounded-2xl border border-zinc-800 bg-black/30 p-4">
            <ProfileAvatar kind="artist" name={stageName || "Artista"} url={avatarUrl} sizeClassName="h-20 w-20" className="rounded-2xl" />
            <div><p className="font-black">Prévia do Press Kit</p><p className="mt-1 text-xs leading-5 text-zinc-500">A imagem principal também aparece no Explorar e nos marcadores do mapa.</p></div>
          </div>
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

          <div>
            <label className="mb-2 block text-sm font-semibold">
              URL da foto profissional
            </label>
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-purple-500"
            />
            <p className="mt-2 text-xs text-zinc-500">
              Use uma imagem pública em HTTPS. E-mail, telefone e documentos nunca aparecem no perfil público.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-semibold">
                Cachê por hora
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold">
                Raio de disponibilidade
              </label>
              <input
                type="number"
                min="1"
                max="500"
                step="1"
                value={availabilityRadius}
                onChange={(e) => setAvailabilityRadius(e.target.value)}
                placeholder="Ex.: 80 km"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
              />
              <p className="mt-2 text-xs text-zinc-500">
                Exibido no Explorar quando você estiver disponível.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold">
                Tipos de evento aceitos
              </label>
              <input
                value={acceptedEventTypes}
                onChange={(e) => setAcceptedEventTypes(e.target.value)}
                placeholder="Casamento, festival, corporativo"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
              />
              <p className="mt-2 text-xs text-zinc-500">
                Separe os tipos por vírgula.
              </p>
            </div>
          </div>

          {profileExists && <PublicLocationControl kind="artist" />}

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
