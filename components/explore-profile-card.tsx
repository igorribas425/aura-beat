import Link from "next/link";
import { formatBRL } from "../lib/finance";
import { ExploreProfile, isVerified, profilePath } from "../lib/explore";
import { ProfileAvatar } from "./profile-avatar";

type ExploreProfileCardProps = {
  profile: ExploreProfile;
  canSendOffer: boolean;
  favorite: boolean;
  favoriteBusy: boolean;
  onToggleFavorite: (profile: ExploreProfile) => void;
};

export type MiniPressKitMedia = {
  id: string;
  media_type: "photo" | "video" | "flyer";
  public_url: string;
  caption: string | null;
  sort_order: number;
  is_cover: boolean;
};

function ProfileActions({
  profile,
  canSendOffer,
  favorite,
  favoriteBusy,
  onToggleFavorite,
  primaryProfileLink = false,
}: ExploreProfileCardProps & { primaryProfileLink?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={profilePath(profile)}
        className={`${primaryProfileLink ? "bg-white text-black" : "border border-zinc-700"} flex-1 rounded-xl px-4 py-2.5 text-center text-sm font-black transition hover:border-purple-500/50`}
      >
        {profile.kind === "artist" ? "Ver perfil completo" : "Ver perfil"}
      </Link>
      {!profile.isOwnProfile && (
        <>
          <Link
            href={`/chat-direto?targetKind=${profile.kind}&targetId=${profile.id}`}
            className="rounded-xl border border-purple-500/40 bg-purple-500/10 px-4 py-2.5 text-center text-sm font-black text-purple-200 transition hover:bg-purple-500/20"
          >
            Conversar
          </Link>
          <button
            type="button"
            disabled={favoriteBusy}
            aria-pressed={favorite}
            onClick={() => onToggleFavorite(profile)}
            className="rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-bold transition hover:border-red-500 disabled:opacity-50"
          >
            {favorite ? "♥ Salvo" : "♡ Favoritar"}
          </button>
        </>
      )}
      {canSendOffer && profile.kind === "artist" && !profile.isOwnProfile && (
        <Link
          href={`/ofertas?artist=${profile.id}`}
          className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-center text-sm font-black text-white transition hover:bg-red-600"
        >
          Enviar oferta
        </Link>
      )}
    </div>
  );
}

function IdentityBadges({ profile }: { profile: ExploreProfile }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
          profile.kind === "artist"
            ? "bg-purple-500/15 text-purple-300"
            : "bg-red-500/15 text-red-300"
        }`}
      >
        {profile.kind === "artist" ? "Artista" : "Casa"}
      </span>
      {isVerified(profile.verificationStatus) && (
        <span className="rounded-full bg-blue-500/15 px-2.5 py-1 text-[10px] font-bold text-blue-300">
          ✓ Verificad{profile.kind === "artist" ? "o" : "a"}
        </span>
      )}
      {profile.isOwnProfile && (
        <span className="rounded-full bg-zinc-500/15 px-2.5 py-1 text-[10px] font-bold text-zinc-300">
          Seu perfil
        </span>
      )}
    </div>
  );
}

function LocationLine({ profile }: { profile: ExploreProfile }) {
  const location = [profile.city, profile.state].filter(Boolean).join(" — ");
  return (
    <p className="mt-1 text-sm text-zinc-400">
      {location || "Localização não informada"}
      {profile.distanceKm !== null && ` · ${profile.distanceKm.toFixed(1)} km`}
    </p>
  );
}

export function ExploreProfileCard(props: ExploreProfileCardProps) {
  const { profile, canSendOffer } = props;

  return (
    <article
      className="aura-profile-card aura-card flex h-full flex-col overflow-hidden rounded-3xl border p-5"
      data-kind={profile.kind}
    >
      <div className="flex items-start gap-4">
        <ProfileAvatar
          kind={profile.kind}
          name={profile.name}
          url={profile.avatarUrl}
          sizeClassName="h-20 w-20"
          className="rounded-3xl"
        />
        <div className="min-w-0 flex-1">
          <IdentityBadges profile={profile} />
          <h2 className="mt-2 truncate text-xl font-black">{profile.name}</h2>
          <LocationLine profile={profile} />
          {profile.kind === "venue" && profile.venueType && (
            <p className="mt-1 text-xs font-semibold text-red-300">{profile.venueType}</p>
          )}
        </div>
      </div>

      {profile.kind === "artist" && (
        <div className="mt-4 flex min-h-7 flex-wrap gap-2">
          {profile.availableNow && (
            <span className="rounded-full bg-green-500/15 px-3 py-1 text-xs font-bold text-green-300">
              ● Disponível agora
            </span>
          )}
          {(profile.styles.length ? profile.styles : ["Estilos diversos"])
            .slice(0, 3)
            .map((style) => (
              <span
                key={style}
                className="rounded-full bg-purple-500/10 px-3 py-1 text-xs text-purple-200"
              >
                {style}
              </span>
            ))}
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 text-sm">
        <div className="bg-zinc-950 p-3">
          <p className="text-[11px] text-zinc-500">Avaliação</p>
          <p className="mt-1 font-bold">
            {profile.rating > 0 ? `★ ${profile.rating.toFixed(1)}` : "Perfil novo"}
            {profile.reviewCount > 0 && (
              <span className="ml-1 text-xs font-normal text-zinc-500">
                ({profile.reviewCount})
              </span>
            )}
          </p>
        </div>
        <div className="bg-zinc-950 p-3">
          <p className="text-[11px] text-zinc-500">
            {profile.kind === "artist"
              ? canSendOffer || profile.isOwnProfile
                ? "Cachê por hora"
                : "Contratação"
              : "Reputação"}
          </p>
          <p className={`mt-1 font-black ${profile.kind === "artist" && (canSendOffer || profile.isOwnProfile) ? "text-red-400" : ""}`}>
            {profile.kind === "artist"
              ? canSendOffer || profile.isOwnProfile
                ? profile.hourlyFee === null
                  ? "Sob consulta"
                  : `${formatBRL(profile.hourlyFee)}/h`
                : "Valor visível para Casas"
              : profile.reviewCount > 0
                ? `${profile.reviewCount} avaliação(ões)`
                : "Em construção"}
          </p>
        </div>
      </div>

      {profile.description && (
        <p className="mt-4 line-clamp-2 text-sm leading-6 text-zinc-400">
          {profile.description}
        </p>
      )}

      <div className="mt-auto pt-5">
        <ProfileActions {...props} />
      </div>
    </article>
  );
}

export function MiniPressKit(
  props: ExploreProfileCardProps & {
    media?: MiniPressKitMedia[];
    mediaLoading?: boolean;
  },
) {
  const {
    profile,
    canSendOffer,
    media = [],
    mediaLoading = false,
  } = props;
  const isArtist = profile.kind === "artist";

  return (
    <article
      className="aura-mini-presskit overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 shadow-2xl"
      data-kind={profile.kind}
    >
      <div className="aura-mini-presskit-cover p-5 pb-6">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/70">
          {isArtist ? "Mini Press Kit" : "Perfil da Casa"}
        </p>
        <div className="mt-5 flex items-end gap-4">
          <ProfileAvatar
            kind={profile.kind}
            name={profile.name}
            url={profile.avatarUrl}
            sizeClassName="h-24 w-24"
            className="rounded-3xl ring-2 ring-white/20 shadow-2xl"
          />
          <div className="min-w-0 flex-1 pb-1">
            <IdentityBadges profile={profile} />
            <h2 className="mt-2 truncate text-2xl font-black text-white">{profile.name}</h2>
            <p className="mt-1 text-sm text-white/70">
              {[profile.city, profile.state].filter(Boolean).join(" — ") ||
                "Localização não informada"}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        {isArtist && (
          <div className="flex flex-wrap gap-2">
            {profile.availableNow ? (
              <span className="rounded-full bg-green-500/15 px-3 py-1 text-xs font-black text-green-300">
                ● Disponível agora
              </span>
            ) : (
              <span className="rounded-full bg-zinc-500/15 px-3 py-1 text-xs font-bold text-zinc-400">
                Indisponível agora
              </span>
            )}
            {profile.styles.slice(0, 4).map((style) => (
              <span key={style} className="rounded-full bg-purple-500/10 px-3 py-1 text-xs text-purple-200">
                {style}
              </span>
            ))}
          </div>
        )}

        {isArtist && (
          <section className="rounded-2xl border border-white/10 bg-black/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-zinc-500">
                  Mídia Kit
                </p>
                <p className="mt-1 text-sm font-bold text-zinc-200">
                  Fotos, flyers e vídeos
                </p>
              </div>
              {!mediaLoading && (
                <span className="text-xs text-zinc-500">{media.length} mídia(s)</span>
              )}
            </div>

            {mediaLoading ? (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {Array.from({ length: 3 }, (_, index) => (
                  <div
                    key={index}
                    className="h-24 animate-pulse rounded-xl bg-zinc-900"
                  />
                ))}
              </div>
            ) : media.length > 0 ? (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {media.slice(0, 3).map((item, index) => (
                  <div
                    key={item.id}
                    className={`relative h-24 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 ${index === 0 ? "col-span-2" : ""}`}
                  >
                    {item.media_type === "video" ? (
                      <>
                        <video
                          src={item.public_url}
                          muted
                          playsInline
                          preload="metadata"
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute inset-0 grid place-items-center text-xl text-white">
                          ▶
                        </span>
                      </>
                    ) : (
                      <div
                        className="h-full w-full bg-cover bg-center"
                        style={{ backgroundImage: `url(${item.public_url})` }}
                      />
                    )}
                    {item.is_cover && (
                      <span className="absolute left-2 top-2 rounded-full bg-purple-500/90 px-2 py-0.5 text-[9px] font-black uppercase text-white">
                        Principal
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs leading-5 text-zinc-500">
                Este Artista ainda não publicou mídia profissional.
              </p>
            )}
          </section>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-zinc-900 p-3">
            <p className="text-[11px] text-zinc-500">Avaliação</p>
            <p className="mt-1 font-black">
              {profile.rating > 0 ? `★ ${profile.rating.toFixed(1)}` : "Perfil novo"}
            </p>
          </div>
          <div className="rounded-2xl bg-zinc-900 p-3">
            <p className="text-[11px] text-zinc-500">Distância</p>
            <p className="mt-1 font-black">
              {profile.distanceKm === null ? "Não calculada" : `${profile.distanceKm.toFixed(1)} km`}
            </p>
          </div>
          {isArtist && (
            <>
              <div className="rounded-2xl bg-zinc-900 p-3">
                <p className="text-[11px] text-zinc-500">
                  {canSendOffer || profile.isOwnProfile ? "Cachê por hora" : "Contratação"}
                </p>
                <p className={`mt-1 font-black ${canSendOffer || profile.isOwnProfile ? "text-red-400" : ""}`}>
                  {canSendOffer || profile.isOwnProfile
                    ? profile.hourlyFee === null
                      ? "Sob consulta"
                      : `${formatBRL(profile.hourlyFee)}/h`
                    : "Valor visível para Casas"}
                </p>
              </div>
              <div className="rounded-2xl bg-zinc-900 p-3">
                <p className="text-[11px] text-zinc-500">Raio disponível</p>
                <p className="mt-1 font-black">
                  {profile.radiusKm === null ? "Não informado" : `${profile.radiusKm} km`}
                </p>
              </div>
            </>
          )}
        </div>

        {isArtist && profile.eventTypes.length > 0 && (
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-zinc-500">
              Eventos aceitos
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              {profile.eventTypes.join(" • ")}
            </p>
          </div>
        )}

        {profile.description && (
          <p className="line-clamp-3 text-sm leading-6 text-zinc-400">{profile.description}</p>
        )}

        {profile.locationPrecisionKm !== null && (
          <p className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3 text-xs leading-5 text-zinc-500">
            Localização pública aproximada com precisão de {profile.locationPrecisionKm} km.
          </p>
        )}

        <ProfileActions {...props} primaryProfileLink />
      </div>
    </article>
  );
}
