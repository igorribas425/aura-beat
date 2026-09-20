"use client";

import { ChangeEvent, useRef, useState } from "react";
import { ProfileAvatar } from "./profile-avatar";
import { supabase } from "../lib/supabase";

type ProfileKind = "artist" | "venue";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function extensionFor(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;

  const byMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };

  return byMime[file.type] ?? "jpg";
}

export function ProfilePhotoEditor({
  kind,
  profileId,
  name,
  url,
  onChange,
}: {
  kind: ProfileKind;
  profileId: string;
  name: string;
  url: string | null;
  onChange: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  async function uploadPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) return;

    setMessage("");

    if (!ALLOWED_TYPES.has(file.type)) {
      setMessage("Use uma imagem JPG, PNG ou WEBP.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setMessage("A foto pode ter no máximo 25 MB.");
      return;
    }

    setUploading(true);

    const isArtist = kind === "artist";
    const bucket = isArtist ? "artist-media" : "venue-media";
    const mediaTable = isArtist ? "artist_media" : "venue_media";
    const profileTable = isArtist ? "artist_profiles" : "venue_profiles";
    const foreignKey = isArtist ? "artist_id" : "venue_id";

    const storagePath =
      `${profileId}/profile-${crypto.randomUUID()}.${extensionFor(file)}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from(bucket).getPublicUrl(storagePath);

      const { data: currentCover, error: currentCoverError } = await supabase
        .from(mediaTable)
        .select("id,storage_path")
        .eq(foreignKey, profileId)
        .eq("is_cover", true)
        .maybeSingle();

      if (currentCoverError) throw currentCoverError;

      if (currentCover) {
        const { error: mediaError } = await supabase
          .from(mediaTable)
          .update({
            media_type: "photo",
            storage_path: storagePath,
            public_url: publicUrl,
            is_public: true,
            is_cover: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", currentCover.id)
          .eq(foreignKey, profileId);

        if (mediaError) throw mediaError;
      } else {
        const { data: lastMedia, error: lastMediaError } = await supabase
          .from(mediaTable)
          .select("sort_order")
          .eq(foreignKey, profileId)
          .order("sort_order", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastMediaError) throw lastMediaError;

        const { error: mediaError } = await supabase.from(mediaTable).insert({
          [foreignKey]: profileId,
          media_type: "photo",
          storage_path: storagePath,
          public_url: publicUrl,
          caption: null,
          sort_order: Number(lastMedia?.sort_order ?? -1) + 1,
          is_public: true,
          is_cover: true,
        });

        if (mediaError) throw mediaError;
      }

      const { error: profileError } = await supabase
        .from(profileTable)
        .update({ avatar_url: publicUrl })
        .eq("id", profileId);

      if (profileError) throw profileError;

      if (currentCover?.storage_path && currentCover.storage_path !== storagePath) {
        await supabase.storage.from(bucket).remove([currentCover.storage_path]);
      }

      onChange(publicUrl);
      setMessage("Foto do perfil atualizada.");
    } catch (error) {
      await supabase.storage.from(bucket).remove([storagePath]);

      const detail =
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar a foto.";

      setMessage(detail);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <ProfileAvatar
          kind={kind}
          name={name}
          url={url}
          sizeClassName="h-24 w-24"
          className="rounded-full"
        />

        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          aria-label="Alterar foto do perfil"
          title="Alterar foto do perfil"
          className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full border-2 border-zinc-950 bg-white text-lg font-black text-black shadow-lg transition hover:scale-105 disabled:cursor-wait disabled:opacity-60"
        >
          {uploading ? "…" : "✎"}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={uploadPhoto}
          className="hidden"
        />
      </div>

      <p className="text-center text-[11px] text-zinc-500">
        {uploading ? "Enviando foto..." : "Toque no lápis para alterar"}
      </p>

      {message && (
        <p
          className={`max-w-52 text-center text-xs ${
            message === "Foto do perfil atualizada."
              ? "text-green-400"
              : "text-red-300"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
