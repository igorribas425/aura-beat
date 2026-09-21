import Link from "next/link";
import { formatBRL } from "../lib/finance";
import { ExploreProfile, isVerified, profilePath } from "../lib/explore";
import { ProfileAvatar } from "./profile-avatar";

function planAppearance(profile: ExploreProfile) {
  if (profile.planCode === "pro") {
    return {
      card:
        "border-amber-400/45 bg-gradient-to-br from-amber-500/10 via-zinc-950 to-purple-500/10 shadow-[0_0_40px_rgba(251,191,36,0.10)]",
      avatar:
        "rounded-3xl ring-2 ring-amber-300/80 shadow-[0_0_24px_rgba(251,191,36,0.28)]",
      primary:
        "bg-gradient-to-r from-amber-400 to-yellow-300 text-black",
    };
  }

  if (profile.planCode === "intermediate") {
    return {
      card:
        "border-purple-500/45 bg-gradient-to-br from-purple-500/10 via-zinc-950 to-blue-500/5 shadow-[0_0_32px_rgba(168,85,247,0.10)]",
      avatar:
        "rounded-3xl ring-2 ring-purple-400/70 shadow-[0_0_20px_rgba(168,85,247,0.24)]",
      primary:
        "bg-purple-500 text-white",
    };
  }

  return {
    card: "",
    avatar: "rounded-3xl",
    primary: "bg-white text-black",
  };
}

type ExploreProfileCardProps = {
  profile: ExploreProfile;
  sourceKind: "artist" | "venue";
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

export type MiniPressKitTravelQuote = {
  distanceKm: number;
  roundTripKm: number;
  withinRadius: boolean;
  calculationMode: "fixed" | "vehicle" | "ticket";
  fuelLiters: number | null;
  estimatedAmount: number;
};

function ProfileActions({
  profile,
  canSendOffer,
  sourceKind,
  favorite,
  favoriteBusy,
  onToggleFavorite,
  primaryProfileLink = false,
}: ExploreProfileCardProps & { primaryProfileLink?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={profilePath(profile)}
        className={`${primaryProfileLink ? planAppearance(profile).primary : "border border-zinc-700"} flex-1 rounded-xl px-4 py-2.5 text-center text-sm font-black transition hover:border-purple-500/50`}
      >
        {profile.kind === "artist" ? "Ver perfil completo" : "Ver perfil"}
      </Link>
      {!profile.isOwnProfile && profile.kind !== sourceKind && (
        <>
          <Link
            href={`/chat-direto?sourceKind=${sourceKind}&targetKind=${profile.kind}&targetId=${profile.id}`}
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
          href={`/oferta-direta/${profile.id}`}
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
      {profile.planCode === "intermediate" && (
        <span className="rounded-full border border-purple-400/30 bg-purple-500/10 px-2.5 py-1 text-[10px] font-black text-purple-200">
          ◆ INTERMEDIÁRIO
        </span>
      )}
      {profile.planCode === "pro" && (
        <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[10px] font-black text-amber-200">
          ✦ PRO
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
      className={`aura-profile-card aura-card flex h-full flex-col overflow-hidden rounded-3xl border p-5 ${planAppearance(profile).card}`}
      data-kind={profile.kind}
      data-plan={profile.planCode || "none"}
    >
      <div className="flex items-start gap-4">
        <ProfileAvatar
          kind={profile.kind}
          name={profile.name}
          url={profile.avatarUrl}
          sizeClassName="h-20 w-20"
          className={planAppearance(profile).avatar}
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
    travelQuote?: MiniPressKitTravelQuote | null;
    travelQuoteLoading?: boolean;
  },
) {
  const {
    profile,
    canSendOffer,
    media = [],
    mediaLoading = false,
    travelQuote = null,
    travelQuoteLoading = false,
  } = props;
  const isArtist = profile.kind === "artist";

  return (
    <article
      className={`aura-mini-presskit w-full min-w-0 max-w-full overflow-hidden rounded-3xl border bg-zinc-950 shadow-2xl ${
        profile.planCode === "pro"
          ? "border-amber-400/50 shadow-[0_0_42px_rgba(251,191,36,0.16)]"
          : profile.planCode === "intermediate"
            ? "border-purple-500/45 shadow-[0_0_34px_rgba(168,85,247,0.14)]"
            : "border-white/10"
      }`}
      data-kind={profile.kind}
      data-plan={profile.planCode || "none"}
    >
      <div className="aura-mini-presskit-cover p-5 pb-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/70">
            {isArtist ? "Mini Press Kit" : "Perfil da Casa"}
          </p>
          {profile.planCode === "pro" && (
            <span className="rounded-full border border-amber-300/40 bg-black/30 px-3 py-1 text-[10px] font-black text-amber-200">
              ✦ EXPERIÊNCIA PRO
            </span>
          )}
          {profile.planCode === "intermediate" && (
            <span className="rounded-full border border-purple-300/40 bg-black/30 px-3 py-1 text-[10px] font-black text-purple-200">
              ◆ EM DESTAQUE
            </span>
          )}
        </div>
        <div className="mt-5 flex items-end gap-4">
          <ProfileAvatar
            kind={profile.kind}
            name={profile.name}
            url={profile.avatarUrl}
            sizeClassName="h-24 w-24"
            className={`${planAppearance(profile).avatar} shadow-2xl`}
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
        {profile.planCode === "pro" && (
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-xs font-bold text-amber-200">
            ✦ Perfil Pro com alta visibilidade no Aura Beat.
          </div>
        )}
        {profile.planCode === "intermediate" && (
          <div className="rounded-2xl border border-purple-400/20 bg-purple-400/5 px-4 py-3 text-xs font-bold text-purple-200">
            ◆ Perfil Intermediário em destaque.
          </div>
        )}
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
              <div
                className={`mt-3 grid gap-2 ${
                  media.length === 1
                    ? "grid-cols-1"
                    : media.length === 2
                      ? "grid-cols-2"
                      : "grid-cols-3"
                }`}
              >
                {media.slice(0, 3).map((item, index) => {
                  const single = media.length === 1;

                  return (
                    <div
                      key={item.id}
                      className={`relative overflow-hidden rounded-xl border border-white/10 bg-black ${
                        single
                          ? "h-52"
                          : media.length === 2
                            ? "h-36"
                            : index === 0
                              ? "col-span-2 h-32"
                              : "h-32"
                      }`}
                    >
                      <div
                        className="absolute inset-0 scale-110 bg-cover bg-center opacity-25 blur-xl"
                        style={{ backgroundImage: `url(${item.public_url})` }}
                        aria-hidden="true"
                      />

                      {item.media_type === "video" ? (
                        <>
                          <video
                            src={item.public_url}
                            muted
                            playsInline
                            preload="metadata"
                            className="relative z-[1] h-full w-full object-contain"
                          />
                          <span className="absolute inset-0 z-[2] grid place-items-center text-xl text-white">
                            ▶
                          </span>
                        </>
                      ) : (
                        <img
                          src={item.public_url}
                          alt={item.caption || "Mídia profissional do Artista"}
                          className="relative z-[1] h-full w-full object-contain"
                        />
                      )}

                      {item.is_cover && (
                        <span className="absolute left-2 top-2 z-[3] rounded-full bg-purple-500/90 px-2 py-0.5 text-[9px] font-black uppercase text-white">
                          Principal
                        </span>
                      )}
                    </div>
                  );
                })}
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

        {isArtist && canSendOffer && !profile.isOwnProfile && (
          <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-emerald-300">
                  Deslocamento estimado
                </p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  Calculado a partir da sua localização atual no Explorar.
                </p>
              </div>
              <span className="text-lg">🚗</span>
            </div>

            {travelQuoteLoading ? (
              <div className="mt-4 h-20 animate-pulse rounded-xl bg-zinc-900" />
            ) : travelQuote ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl bg-zinc-900 p-3">
                    <p className="text-[11px] text-zinc-500">Até o Artista</p>
                    <p className="mt-1 font-black">{travelQuote.distanceKm.toFixed(1)} km</p>
                  </div>
                  <div className="rounded-xl bg-zinc-900 p-3">
                    <p className="text-[11px] text-zinc-500">Ida e volta</p>
                    <p className="mt-1 font-black">{travelQuote.roundTripKm.toFixed(1)} km</p>
                  </div>
                  <div className="rounded-xl bg-zinc-900 p-3">
                    <p className="text-[11px] text-zinc-500">Estimativa</p>
                    <p className="mt-1 font-black text-emerald-300">
                      {formatBRL(travelQuote.estimatedAmount)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-zinc-900 p-3">
                    <p className="text-[11px] text-zinc-500">
                      {travelQuote.calculationMode === "vehicle" ? "Combustível" : "Cálculo"}
                    </p>
                    <p className="mt-1 font-black">
                      {travelQuote.calculationMode === "vehicle" && travelQuote.fuelLiters !== null
                        ? `~${travelQuote.fuelLiters.toFixed(1)} L`
                        : "Valor por km"}
                    </p>
                  </div>
                </div>

                {!travelQuote.withinRadius && (
                  <p className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-200">
                    ⚠️ Esta distância está acima do raio que o Artista informou que costuma atender.
                  </p>
                )}

                <p className="mt-3 text-[11px] leading-5 text-zinc-600">
                  Estimativa aproximada. Pedágios e hospedagem ficam separados do cachê e do deslocamento.
                </p>
              </>
            ) : (
              <p className="mt-3 text-xs leading-5 text-zinc-500">
                Ative sua localização no Explorar para calcular uma estimativa de deslocamento.
              </p>
            )}
          </section>
        )}

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
