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

  if (imageUrl) {
    return (
      <span
        role="img"
        aria-label={`Foto de ${name}`}
        className={`${sizeClassName} ${className} block shrink-0 bg-cover bg-center ring-1 ring-white/10`}
        style={{ backgroundImage: `url(${JSON.stringify(imageUrl)})` }}
      />
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
