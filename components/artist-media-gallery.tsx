"use client";

import { useEffect, useMemo, useState } from "react";

export type ArtistMediaItem = {
  id: string;
  media_type: "photo" | "video" | "flyer";
  public_url: string;
  caption: string | null;
  sort_order: number;
  is_cover: boolean;
};

function mediaLabel(type: ArtistMediaItem["media_type"]) {
  if (type === "video") return "Vídeo";
  if (type === "flyer") return "Flyer";
  return "Foto";
}

export function ArtistMediaGallery({ items }: { items: ArtistMediaItem[] }) {
  const ordered = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          Number(b.is_cover) - Number(a.is_cover) ||
          a.sort_order - b.sort_order,
      ),
    [items],
  );
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    if (openIndex === null) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenIndex(null);
      if (event.key === "ArrowRight") {
        setOpenIndex((current) =>
          current === null ? null : (current + 1) % ordered.length,
        );
      }
      if (event.key === "ArrowLeft") {
        setOpenIndex((current) =>
          current === null
            ? null
            : (current - 1 + ordered.length) % ordered.length,
        );
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openIndex, ordered.length]);

  if (!ordered.length) {
    return (
      <div className="mt-5 grid min-h-52 place-items-center rounded-3xl border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-500">
        O Artista ainda não publicou fotos ou vídeos profissionais.
      </div>
    );
  }

  const current = openIndex === null ? null : ordered[openIndex];

  return (
    <>
      <div className="mt-5 grid auto-rows-[180px] grid-cols-2 gap-3 sm:auto-rows-[220px] sm:grid-cols-3">
        {ordered.map((item, index) => {
          const featured = index === 0 && ordered.length > 2;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setOpenIndex(index)}
              className={`group relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 text-left shadow-xl ${featured ? "col-span-2 row-span-2" : ""}`}
              aria-label={`Abrir ${mediaLabel(item.media_type)} ${index + 1}`}
            >
              {item.media_type === "video" ? (
                <video
                  src={item.public_url}
                  muted
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                />
              ) : (
                <div
                  className="absolute inset-0 bg-cover bg-center transition duration-300 group-hover:scale-105"
                  style={{ backgroundImage: `url(${item.public_url})` }}
                />
              )}

              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
              <div className="absolute left-3 top-3 flex gap-2">
                <span className="rounded-full bg-black/70 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-white backdrop-blur">
                  {mediaLabel(item.media_type)}
                </span>
                {item.is_cover && (
                  <span className="rounded-full bg-purple-500/80 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-white">
                    Destaque
                  </span>
                )}
              </div>

              {item.caption && (
                <p className="absolute bottom-3 left-3 right-3 line-clamp-2 text-sm font-semibold text-white">
                  {item.caption}
                </p>
              )}

              {item.media_type === "video" && (
                <div className="absolute inset-0 grid place-items-center">
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-white/90 text-xl text-black shadow-2xl">
                    ▶
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {current && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Visualizador de mídia do Artista"
          onClick={() => setOpenIndex(null)}
        >
          <button
            type="button"
            onClick={() => setOpenIndex(null)}
            className="absolute right-4 top-4 z-20 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-xl font-black text-white backdrop-blur hover:bg-white/20"
            aria-label="Fechar"
          >
            ×
          </button>

          {ordered.length > 1 && (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpenIndex((index) =>
                    index === null
                      ? null
                      : (index - 1 + ordered.length) % ordered.length,
                  );
                }}
                className="absolute left-3 z-20 grid h-12 w-12 place-items-center rounded-full bg-white/10 text-3xl text-white backdrop-blur hover:bg-white/20 sm:left-6"
                aria-label="Mídia anterior"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpenIndex((index) =>
                    index === null ? null : (index + 1) % ordered.length,
                  );
                }}
                className="absolute right-3 z-20 grid h-12 w-12 place-items-center rounded-full bg-white/10 text-3xl text-white backdrop-blur hover:bg-white/20 sm:right-6"
                aria-label="Próxima mídia"
              >
                ›
              </button>
            </>
          )}

          <div
            className="flex h-[86vh] w-full max-w-6xl flex-col items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            {current.media_type === "video" ? (
              <video
                key={current.id}
                src={current.public_url}
                controls
                autoPlay
                playsInline
                className="max-h-[78vh] max-w-full rounded-2xl bg-black shadow-2xl"
              />
            ) : (
              <div
                className="h-[78vh] w-full rounded-2xl bg-contain bg-center bg-no-repeat"
                style={{ backgroundImage: `url(${current.public_url})` }}
              />
            )}

            <div className="mt-3 flex items-center gap-3 text-sm text-zinc-300">
              <span className="rounded-full bg-white/10 px-3 py-1 font-bold">
                {mediaLabel(current.media_type)}
              </span>
              <span>
                {(openIndex ?? 0) + 1} de {ordered.length}
              </span>
              {current.caption && <span>· {current.caption}</span>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
