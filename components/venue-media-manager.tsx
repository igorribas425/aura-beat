"use client";

import { ChangeEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type VenueMedia = {
  id: string;
  venue_id: string;
  media_type: "photo" | "video";
  storage_path: string;
  public_url: string;
  caption: string | null;
  sort_order: number;
  is_cover: boolean;
};

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
]);

function extensionFor(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;

  const byMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/webm": "webm",
  };

  return byMime[file.type] ?? "bin";
}

export function VenueMediaManager({
  venueId,
  onCoverChange,
}: {
  venueId: string;
  onCoverChange?: (url: string) => void;
}) {
  const [media, setMedia] = useState<VenueMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const loadMedia = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("venue_media")
      .select(
        "id,venue_id,media_type,storage_path,public_url,caption,sort_order,is_cover",
      )
      .eq("venue_id", venueId)
      .order("is_cover", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      setMedia([]);
      setMessage(
        error.message.toLowerCase().includes("venue_media")
          ? "A galeria da Casa ainda precisa ser ativada no Supabase."
          : `Não foi possível carregar a galeria: ${error.message}`,
      );
    } else {
      setMedia((data ?? []) as VenueMedia[]);
    }

    setLoading(false);
  }, [venueId]);

  useEffect(() => {
    void loadMedia();
  }, [loadMedia]);

  async function uploadFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.currentTarget.value = "";
    if (!files.length) return;

    setUploading(true);
    setMessage("");

    try {
      let nextOrder =
        media.reduce((max, item) => Math.max(max, item.sort_order), -1) + 1;
      let hasCover = media.some((item) => item.is_cover);

      for (const file of files) {
        if (!ALLOWED_TYPES.has(file.type)) {
          throw new Error(
            `${file.name}: formato não permitido. Use JPG, PNG, WEBP, MP4 ou WEBM.`,
          );
        }

        if (file.size > MAX_FILE_SIZE) {
          throw new Error(`${file.name}: o limite é 25 MB por arquivo.`);
        }

        const storagePath = `${venueId}/${crypto.randomUUID()}.${extensionFor(file)}`;

        const { error: uploadError } = await supabase.storage
          .from("venue-media")
          .upload(storagePath, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type,
          });

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("venue-media").getPublicUrl(storagePath);

        const mediaType: VenueMedia["media_type"] = file.type.startsWith("video/")
          ? "video"
          : "photo";

        const shouldBeCover = mediaType === "photo" && !hasCover;

        const { error: insertError } = await supabase.from("venue_media").insert({
          venue_id: venueId,
          media_type: mediaType,
          storage_path: storagePath,
          public_url: publicUrl,
          caption: null,
          sort_order: nextOrder,
          is_cover: shouldBeCover,
          is_public: true,
        });

        if (insertError) {
          await supabase.storage.from("venue-media").remove([storagePath]);
          throw insertError;
        }

        if (shouldBeCover) {
          const { error: avatarError } = await supabase
            .from("venue_profiles")
            .update({ avatar_url: publicUrl })
            .eq("id", venueId);

          if (avatarError) throw avatarError;

          hasCover = true;
          onCoverChange?.(publicUrl);
        }

        nextOrder += 1;
      }

      setMessage("✅ Galeria da Casa atualizada.");
      await loadMedia();
    } catch (error) {
      setMessage(
        `❌ ${error instanceof Error ? error.message : "Falha ao enviar a mídia."}`,
      );
    } finally {
      setUploading(false);
    }
  }

  async function setCover(item: VenueMedia) {
    if (item.media_type !== "photo") return;

    setMessage("");

    const { error: clearError } = await supabase
      .from("venue_media")
      .update({ is_cover: false })
      .eq("venue_id", venueId)
      .eq("is_cover", true);

    if (clearError) {
      setMessage(`❌ ${clearError.message}`);
      return;
    }

    const { error } = await supabase
      .from("venue_media")
      .update({ is_cover: true })
      .eq("id", item.id)
      .eq("venue_id", venueId);

    if (error) {
      setMessage(`❌ ${error.message}`);
      return;
    }

    const { error: avatarError } = await supabase
      .from("venue_profiles")
      .update({ avatar_url: item.public_url })
      .eq("id", venueId);

    if (avatarError) {
      setMessage(
        `⚠️ Capa salva, mas a foto principal do perfil não foi atualizada: ${avatarError.message}`,
      );
      return;
    }

    onCoverChange?.(item.public_url);
    setMessage("✅ Foto principal da Casa atualizada.");
    await loadMedia();
  }

  async function saveCaption(item: VenueMedia, caption: string) {
    const { error } = await supabase
      .from("venue_media")
      .update({ caption: caption.trim() || null })
      .eq("id", item.id)
      .eq("venue_id", venueId);

    if (error) {
      setMessage(`❌ ${error.message}`);
      return;
    }

    setMessage("✅ Legenda atualizada.");
    await loadMedia();
  }

  async function move(item: VenueMedia, direction: -1 | 1) {
    const ordered = [...media].sort(
      (a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id),
    );
    const currentIndex = ordered.findIndex((candidate) => candidate.id === item.id);
    const targetIndex = currentIndex + direction;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;

    const target = ordered[targetIndex];

    const { error: firstError } = await supabase
      .from("venue_media")
      .update({ sort_order: target.sort_order })
      .eq("id", item.id)
      .eq("venue_id", venueId);

    if (firstError) {
      setMessage(`❌ ${firstError.message}`);
      return;
    }

    const { error: secondError } = await supabase
      .from("venue_media")
      .update({ sort_order: item.sort_order })
      .eq("id", target.id)
      .eq("venue_id", venueId);

    if (secondError) {
      setMessage(`❌ ${secondError.message}`);
      return;
    }

    await loadMedia();
  }

  async function removeMedia(item: VenueMedia) {
    const confirmed = window.confirm("Excluir esta mídia da galeria da Casa?");
    if (!confirmed) return;

    setMessage("");

    const { error: storageError } = await supabase.storage
      .from("venue-media")
      .remove([item.storage_path]);

    if (storageError) {
      setMessage(`❌ Não foi possível excluir o arquivo: ${storageError.message}`);
      return;
    }

    const { error } = await supabase
      .from("venue_media")
      .delete()
      .eq("id", item.id)
      .eq("venue_id", venueId);

    if (error) {
      setMessage(`❌ ${error.message}`);
      return;
    }

    if (item.is_cover) {
      const nextCover = media.find(
        (candidate) => candidate.id !== item.id && candidate.media_type === "photo",
      );

      if (nextCover) {
        const { error: nextCoverError } = await supabase
          .from("venue_media")
          .update({ is_cover: true })
          .eq("id", nextCover.id)
          .eq("venue_id", venueId);

        if (!nextCoverError) {
          await supabase
            .from("venue_profiles")
            .update({ avatar_url: nextCover.public_url })
            .eq("id", venueId);
          onCoverChange?.(nextCover.public_url);
        }
      } else {
        await supabase
          .from("venue_profiles")
          .update({ avatar_url: null })
          .eq("id", venueId);
        onCoverChange?.("");
      }
    }

    setMessage("✅ Mídia removida.");
    await loadMedia();
  }

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-black text-red-500">GALERIA DA CASA</p>
          <h2 className="mt-1 text-2xl font-black">Fotos e vídeos do espaço</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Mostre aos Artistas a estrutura, pista, palco, camarotes e identidade do
            seu espaço. A primeira foto vira a capa automaticamente.
          </p>
        </div>

        <label className="cursor-pointer rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white transition hover:bg-red-500">
          {uploading ? "Enviando..." : "+ Adicionar fotos ou vídeos"}
          <input
            type="file"
            multiple
            disabled={uploading}
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
            onChange={uploadFiles}
            className="hidden"
          />
        </label>
      </div>

      <p className="mt-3 text-xs text-zinc-500">
        JPG, PNG, WEBP, MP4 ou WEBM · máximo 25 MB por arquivo.
      </p>

      {message && (
        <div className="mt-4 rounded-2xl border border-zinc-800 bg-black/30 p-4 text-sm text-zinc-300">
          {message}
        </div>
      )}

      {loading ? (
        <p className="mt-5 text-sm text-zinc-500">Carregando galeria...</p>
      ) : media.length === 0 ? (
        <div className="mt-5 rounded-3xl border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-500">
          Nenhuma mídia publicada ainda.
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {media.map((item, index) => (
            <article
              key={item.id}
              className="overflow-hidden rounded-2xl border border-zinc-800 bg-black"
            >
              <div className="relative h-44">
                {item.media_type === "video" ? (
                  <video
                    src={item.public_url}
                    muted
                    controls
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div
                    className="h-full w-full bg-cover bg-center"
                    style={{ backgroundImage: `url(${item.public_url})` }}
                  />
                )}

                <div className="absolute left-2 top-2 flex gap-2">
                  <span className="rounded-full bg-black/80 px-2.5 py-1 text-[10px] font-black uppercase text-white">
                    {item.media_type === "video" ? "Vídeo" : "Foto"}
                  </span>
                  {item.is_cover && (
                    <span className="rounded-full bg-red-500/90 px-2.5 py-1 text-[10px] font-black uppercase text-white">
                      Capa
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2 p-3">
                <input
                  type="text"
                  defaultValue={item.caption ?? ""}
                  placeholder="Legenda opcional"
                  maxLength={120}
                  onBlur={(event) => {
                    if (event.target.value.trim() !== (item.caption ?? "").trim()) {
                      void saveCaption(item, event.target.value);
                    }
                  }}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-red-500"
                />

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void move(item, -1)}
                    disabled={index === 0}
                    className="rounded-lg border border-zinc-800 px-3 py-2 text-xs font-bold text-zinc-300 disabled:opacity-40"
                  >
                    ← Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => void move(item, 1)}
                    disabled={index === media.length - 1}
                    className="rounded-lg border border-zinc-800 px-3 py-2 text-xs font-bold text-zinc-300 disabled:opacity-40"
                  >
                    Próxima →
                  </button>
                </div>

                {item.media_type === "photo" && (
                  <button
                    type="button"
                    onClick={() => void setCover(item)}
                    disabled={item.is_cover}
                    className="w-full rounded-lg border border-red-500/30 px-3 py-2 text-xs font-bold text-red-200 disabled:opacity-50"
                  >
                    {item.is_cover ? "Foto principal" : "Usar como foto principal"}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => void removeMedia(item)}
                  className="w-full rounded-lg border border-red-500/20 px-3 py-2 text-xs font-bold text-red-300"
                >
                  Excluir
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
