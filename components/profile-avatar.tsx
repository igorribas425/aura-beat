"use client";

import { useEffect, useState } from "react";

type ProfileAvatarProps = {
  kind: "artist" | "venue";
  name: string;
  url?: string | null;
  sizeClassName?: string;
  className?: string;
};

function safePublicImageUrl(value: string | null | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function ProfileAvatar({
  kind,
  name,
  url,
  sizeClassName = "h-20 w-20",
  className = "rounded-3xl",
}: ProfileAvatarProps) {
  const imageUrl = safePublicImageUrl(url);
  const initial = name.trim().charAt(0).toUpperCase() || (kind === "artist" ? "A" : "C");
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  if (imageUrl && !imageFailed) {
    return (
      <span
        role="img"
        aria-label={`Foto de ${name}`}
        className={`${sizeClassName} ${className} block shrink-0 overflow-hidden bg-zinc-900 ring-1 ring-white/10`}
      >
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${sizeClassName} ${className} flex shrink-0 items-center justify-center bg-gradient-to-br ${
        kind === "artist"
          ? "from-purple-500 to-fuchsia-800"
          : "from-red-500 to-red-800"
      } text-2xl font-black text-white`}
    >
      {initial}
    </span>
  );
}
