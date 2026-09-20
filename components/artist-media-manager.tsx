"use client";

import { ChangeEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type ArtistMedia = {
  id: string;
  artist_id: string;
  media_type: "photo" | "video" | "flyer";
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

function mediaName(item: ArtistMedia) {
  if (item.media_type === "video") return "Vídeo";
  if (item.media_type === "flyer") return "Flyer";
  return "Foto";
}

export function ArtistMediaManager({
  artistId,
  onCoverChange,
}: {
  artistId: string;
  onCoverChange?: (url: string) => void;
}) {
  const [media, setMedia] = useState<ArtistMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const loadMedia = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("artist_media")
      .select(
        "id,artist_id,media_type,storage_path,public_url,caption,sort_order,is_cover",
      )
      .eq("artist_id", artistId)
      .order("is_cover", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      setMessage(
        error.message.includes("artist_media")
          ? "A galeria ainda precisa ser ativada no Supabase."
          : `Não foi possível carregar as mídias: ${error.message}`,
      );
      setMedia([]);
    } else {
      setMedia((data ?? []) as ArtistMedia[]);
    }
    setLoading(false);
  }, [artistId]);

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

        const storagePath = `${artistId}/${crypto.randomUUID()}.${extensionFor(file)}`;
        const { error: uploadError } = await supabase.storage
          .from("artist-media")
          .upload(storagePath, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type,
          });

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("artist-media").getPublicUrl(storagePath);

        const mediaType: ArtistMedia["media_type"] = file.type.startsWith(
          "video/",
        )
          ? "video"
          : "photo";
        const shouldBeCover = mediaType !== "video" && !hasCover;

        const { error: insertError } = await supabase
          .from("artist_media")
          .insert({
            artist_id: artistId,
            media_type: mediaType,
            storage_path: storagePath,
            public_url: publicUrl,
            caption: null,
            sort_order: nextOrder,
            is_cover: shouldBeCover,
          });

        if (insertError) {
          await supabase.storage.from("artist-media").remove([storagePath]);
          throw insertError;
        }

        if (shouldBeCover) {
          const { error: avatarError } = await supabase
            .from("artist_profiles")
            .update({ avatar_url: publicUrl })
            .eq("id", artistId);

          if (avatarError) throw avatarError;

          hasCover = true;
          onCoverChange?.(publicUrl);
        }

        nextOrder += 1;
      }

      setMessage("✅ Mídias publicadas no Press Kit.");
      await loadMedia();
    } catch (error) {
      setMessage(
        `❌ ${error instanceof Error ? error.message : "Falha ao enviar a mídia."}`,
      );
    } finally {
      setUploading(false);
    }
  }

  async function setCover(item: ArtistMedia) {
    if (item.media_type === "video") return;
    setMessage("");

    const { error: clearError } = await supabase
      .from("artist_media")
      .update({ is_cover: false })
      .eq("artist_id", artistId)
      .eq("is_cover", true);

    if (clearError) {
      setMessage(`❌ ${clearError.message}`);
      return;
    }

    const { error } = await supabase
      .from("artist_media")
      .update({ is_cover: true })
      .eq("id", item.id)
      .eq("artist_id", artistId);

    if (error) {
      setMessage(`❌ ${error.message}`);
      return;
    }

    const { error: avatarError } = await supabase
      .from("artist_profiles")
      .update({ avatar_url: item.public_url })
      .eq("id", artistId);

    if (avatarError) {
      setMessage(`⚠️ Destaque salvo, mas a foto principal não foi atualizada: ${avatarError.message}`);
      return;
    }

    onCoverChange?.(item.public_url);
    setMessage("✅ Foto principal do Mídia Kit atualizada.");
    await loadMedia();
  }

  async function toggleImageType(item: ArtistMedia) {
    if (item.media_type === "video") return;

    const nextType = item.media_type === "flyer" ? "photo" : "flyer";
    const { error } = await supabase
      .from("artist_media")
      .update({ media_type: nextType })
      .eq("id", item.id)
      .eq("artist_id", artistId);

    if (error) {
      setMessage(`❌ ${error.message}`);
      return;
    }

    await loadMedia();
  }

  async function removeMedia(item: ArtistMedia) {
    const confirmed = window.confirm(
      `Excluir esta mídia (${mediaName(item)}) do Press Kit?`,
    );
    if (!confirmed) return;

    setMessage("");
    const { error: storageError } = await supabase.storage
      .from("artist-media")
      .remove([item.storage_path]);

    if (storageError) {
      setMessage(`❌ Não foi possível excluir o arquivo: ${storageError.message}`);
      return;
    }

    const { error } = await supabase
      .from("artist_media")
      .delete()
      .eq("id", item.id)
      .eq("artist_id", artistId);

    if (error) {
      setMessage(`❌ ${error.message}`);
      return;
    }

    if (item.is_cover) {
      const nextCover = media.find(
        (candidate) =>
          candidate.id !== item.id && candidate.media_type !== "video",
      );

      if (nextCover) {
        const { error: nextCoverError } = await supabase
          .from("artist_media")
          .update({ is_cover: true })
          .eq("id", nextCover.id)
          .eq("artist_id", artistId);

        if (!nextCoverError) {
          await supabase
            .from("artist_profiles")
            .update({ avatar_url: nextCover.public_url })
            .eq("id", artistId);
          onCoverChange?.(nextCover.public_url);
        }
      } else {
        await supabase
          .from("artist_profiles")
          .update({ avatar_url: null })
          .eq("id", artistId);
        onCoverChange?.("");
      }
    }

    setMessage("✅ Mídia removida.");
    await loadMedia();
  }

  return (
    <section className="aura-card mt-6 rounded-3xl border p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="aura-kicker">Mídia Kit</p>
          <h2 className="mt-2 text-2xl font-black">Fotos, flyers e vídeos</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Escolha direto da galeria do celular o material profissional que Casas e
            contratantes verão no seu perfil.
          </p>
        </div>

        <label className="cursor-pointer rounded-xl bg-purple-600 px-5 py-3 text-sm font-black text-white transition hover:bg-purple-500">
          {uploading ? "Enviando..." : "Adicionar da galeria"}
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
          Você ainda não publicou nenhuma mídia.
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {media.map((item) => (
            <article
              key={item.id}
              className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950"
            >
              <div className="relative h-40">
                {item.media_type === "video" ? (
                  <video
                    src={item.public_url}
                    muted
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
                  <span className="rounded-full bg-black/75 px-2.5 py-1 text-[10px] font-black uppercase text-white">
                    {mediaName(item)}
                  </span>
                  {item.is_cover && (
                    <span className="rounded-full bg-purple-500/90 px-2.5 py-1 text-[10px] font-black uppercase text-white">
                      Destaque
                    </span>
                  )}
                </div>
              </div>

              <div className="grid gap-2 p-3">
                {item.media_type !== "video" && (
                  <>
                    <button
                      type="button"
                      onClick={() => setCover(item)}
                      disabled={item.is_cover}
                      className="rounded-lg border border-purple-500/30 px-3 py-2 text-xs font-bold text-purple-200 disabled:cursor-default disabled:opacity-50"
                    >
                      {item.is_cover ? "Foto principal" : "Usar como principal"}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleImageType(item)}
                      className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-300"
                    >
                      {item.media_type === "flyer"
                        ? "Marcar como foto"
                        : "Marcar como flyer"}
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => removeMedia(item)}
                  className="rounded-lg border border-red-500/25 px-3 py-2 text-xs font-bold text-red-300"
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
