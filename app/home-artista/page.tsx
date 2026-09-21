"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PlanStatusCard } from "../../components/plan-status-card";
import { ProfileAvatar } from "../../components/profile-avatar";
import { formatBRL } from "../../lib/finance";
import {
  getMyPlanAccess,
  hasPlanBenefit,
  planBenefitText,
  type PlanAccess,
} from "../../lib/plan-access";
import { supabase } from "../../lib/supabase";

type Artista = {
  id: string;
  stage_name: string;
  base_city: string | null;
  base_state: string | null;
  fixed_fee: number | null;
  verification_status: string | null;
  avatar_url: string | null;
};

type Oferta = {
  id: string;
  title: string;
  budget_amount: number;
  starts_at: string;
  duration_minutes: number;
  address_text: string | null;
  event_type: string | null;
  is_urgent: boolean;
};

function dinheiro(valor: number) {
  return formatBRL(Number(valor || 0));
}

function dataEvento(data: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(data));
}

function mensagemErroGPS(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error
  ) {
    const codigo = Number(
      (error as { code?: number }).code
    );

    if (codigo === 1) {
      return "Permissão de localização negada. Libere o GPS para o Aura Beat no navegador.";
    }

    if (codigo === 2) {
      return "Não foi possível identificar sua localização.";
    }

    if (codigo === 3) {
      return "O GPS demorou demais para responder. Tente novamente.";
    }
  }

  return "Não foi possível acessar sua localização.";
}

export default function HomeArtistaPage() {
  const router = useRouter();

  const watchIdRef = useRef<number | null>(null);
  const ultimaGravacaoGPSRef = useRef(0);

  const [artista, setArtista] =
    useState<Artista | null>(null);

  const [disponivel, setDisponivel] =
    useState(false);

  const [gpsAtivo, setGpsAtivo] =
    useState(false);

  const [precisaoGps, setPrecisaoGps] =
    useState<number | null>(null);

  const [
    ultimaAtualizacaoGps,
    setUltimaAtualizacaoGps,
  ] = useState<Date | null>(null);

  const [plano, setPlano] =
    useState("Sem plano ativo");

  const [planAccess, setPlanAccess] =
    useState<PlanAccess | null>(null);

  const [avaliacao, setAvaliacao] =
    useState(0);

  const [
    quantidadeAvaliacoes,
    setQuantidadeAvaliacoes,
  ] = useState(0);

  const [
    eventosConcluidos,
    setEventosConcluidos,
  ] = useState(0);

  const [ganhos, setGanhos] =
    useState(0);

  const [ofertas, setOfertas] =
    useState<Oferta[]>([]);

  const [carregando, setCarregando] =
    useState(true);

  const [
    salvandoDisponibilidade,
    setSalvandoDisponibilidade,
  ] = useState(false);

  const [erro, setErro] =
    useState("");

  const carregarHomeEffect = useEffectEvent(() => {
    void carregarHome();
  });

  const pararMonitoramentoEffect = useEffectEvent(() => {
    pararMonitoramentoGPS();
  });

  useEffect(() => {
    carregarHomeEffect();

    return () => {
      pararMonitoramentoEffect();
    };
  }, []);

  function pararMonitoramentoGPS() {
    if (
      watchIdRef.current !== null &&
      typeof navigator !== "undefined" &&
      navigator.geolocation
    ) {
      navigator.geolocation.clearWatch(
        watchIdRef.current
      );

      watchIdRef.current = null;
    }

    setGpsAtivo(false);
  }

  async function salvarLocalizacao(
    artistaId: string,
    posicao: GeolocationPosition,
    primeiraLocalizacao = false
  ) {
    const latitude =
      posicao.coords.latitude;

    const longitude =
      posicao.coords.longitude;

    const precisao =
      posicao.coords.accuracy;

    const ponto =
      `POINT(${longitude} ${latitude})`;

    const agora =
      new Date().toISOString();

    const dados: Record<string, unknown> = {
      artist_id: artistaId,
      is_available: true,
      sharing_consent: true,
      current_location: ponto,
      accuracy_m: precisao,
      radius_km: 50,
      last_seen_at: agora,
    };

    if (primeiraLocalizacao) {
      dados.available_since = agora;
    }

    const { error } = await supabase
      .from("artist_availability")
      .upsert(dados, {
        onConflict: "artist_id",
      });

    if (error) {
      throw error;
    }

    setPrecisaoGps(precisao);
    setUltimaAtualizacaoGps(new Date());
  }

  function iniciarMonitoramentoGPS(
    artistaId: string
  ) {
    if (
      typeof navigator === "undefined" ||
      !navigator.geolocation
    ) {
      setErro(
        "Seu dispositivo não possui suporte a localização."
      );

      return;
    }

    pararMonitoramentoGPS();

    const watchId =
      navigator.geolocation.watchPosition(
        async (posicao) => {
          try {
            const agora = Date.now();

            if (
              agora -
                ultimaGravacaoGPSRef.current <
              15000
            ) {
              return;
            }

            ultimaGravacaoGPSRef.current =
              agora;

            await salvarLocalizacao(
              artistaId,
              posicao
            );

            setGpsAtivo(true);
          } catch (error) {
            console.error(
              "Erro atualizando GPS:",
              error
            );
          }
        },
        (error) => {
          console.error(
            "Erro monitorando GPS:",
            error
          );

          setGpsAtivo(false);

          setErro(
            mensagemErroGPS(error)
          );
        },
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 5000,
        }
      );

    watchIdRef.current = watchId;
    setGpsAtivo(true);
  }

  async function obterLocalizacaoAtual() {
    return new Promise<GeolocationPosition>(
      (resolve, reject) => {
        if (
          typeof navigator === "undefined" ||
          !navigator.geolocation
        ) {
          reject(
            new Error(
              "Geolocalização não disponível."
            )
          );

          return;
        }

        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          {
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 0,
          }
        );
      }
    );
  }

  async function carregarHome() {
    try {
      setCarregando(true);
      setErro("");

      const {
        data: { user },
      } =
        await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const {
        data: perfil,
        error: erroPerfil,
      } = await supabase
        .from("artist_profiles")
        .select(
          `
          id,
          stage_name,
          base_city,
          base_state,
          fixed_fee,
          verification_status,
          avatar_url
          `
        )
        .eq("user_id", user.id)
        .maybeSingle();

      if (erroPerfil) {
        throw erroPerfil;
      }

      if (!perfil) {
        router.replace(
          "/perfil-artista"
        );

        return;
      }

      setArtista(perfil);

      const {
        data: disponibilidade,
      } = await supabase
        .from("artist_availability")
        .select(
          `
          is_available,
          accuracy_m,
          last_seen_at
          `
        )
        .eq(
          "artist_id",
          perfil.id
        )
        .maybeSingle();

      if (
        disponibilidade?.is_available
      ) {
        setDisponivel(true);

        if (
          disponibilidade.accuracy_m
        ) {
          setPrecisaoGps(
            Number(
              disponibilidade.accuracy_m
            )
          );
        }

        if (
          disponibilidade.last_seen_at
        ) {
          setUltimaAtualizacaoGps(
            new Date(
              disponibilidade.last_seen_at
            )
          );
        }

        try {
          if (
            navigator.permissions
          ) {
            const permissao =
              await navigator.permissions.query(
                {
                  name: "geolocation",
                }
              );

            if (
              permissao.state ===
              "granted"
            ) {
              iniciarMonitoramentoGPS(
                perfil.id
              );
            }
          }
        } catch {
          // navegador sem suporte
        }
      }

      const { data: reviews } =
        await supabase
          .from("reviews")
          .select(
            "overall_rating"
          )
          .eq(
            "artist_id",
            perfil.id
          )
          .eq(
            "reviewee_type",
            "artist"
          );

      if (
        reviews &&
        reviews.length > 0
      ) {
        const total =
          reviews.reduce(
            (soma, item) =>
              soma +
              Number(
                item.overall_rating ||
                  0
              ),
            0
          );

        setQuantidadeAvaliacoes(
          reviews.length
        );

        setAvaliacao(
          total / reviews.length
        );
      }

      const { data: bookings } =
        await supabase
          .from("bookings")
          .select(
            `
            status,
            agreed_fee,
            platform_fee_artist
            `
          )
          .eq(
            "artist_id",
            perfil.id
          );

      if (bookings) {
        const concluidos =
          bookings.filter(
            (booking) =>
              booking.status ===
              "completed"
          );

        setEventosConcluidos(
          concluidos.length
        );

        const totalGanhos =
          concluidos.reduce(
            (total, booking) => {
              const cache =
                Number(
                  booking.agreed_fee ||
                    0
                );

              const taxa =
                Number(
                  booking.platform_fee_artist ||
                    0
                );

              return (
                total +
                (cache - taxa)
              );
            },
            0
          );

        setGanhos(totalGanhos);
      }

      try {
        const acessoPlano =
          await getMyPlanAccess(
            "artist"
          );

        setPlanAccess(
          acessoPlano
        );

        if (
          acessoPlano.active &&
          acessoPlano.planName
        ) {
          setPlano(
            acessoPlano.unlimited
              ? `${acessoPlano.planName} · Ilimitado`
              : acessoPlano.planName
          );
        } else {
          setPlano(
            "Sem plano ativo"
          );
        }
      } catch (planError) {
        console.warn(
          "Não foi possível carregar o plano do Artista:",
          planError
        );

        setPlanAccess(null);
        setPlano(
          "Sem plano ativo"
        );
      }

      const {
        data: ofertasAbertas,
      } = await supabase
        .from("offers")
        .select(
          `
          id,
          title,
          budget_amount,
          starts_at,
          duration_minutes,
          address_text,
          event_type,
          is_urgent
          `
        )
        .eq("status", "open")
        .gte(
          "starts_at",
          new Date().toISOString()
        )
        .order("starts_at", {
          ascending: true,
        })
        .limit(3);

      if (ofertasAbertas) {
        setOfertas(
          ofertasAbertas
        );
      }
    } catch (error) {
      console.error(error);

      setErro(
        "Não foi possível carregar a Home do Artista."
      );
    } finally {
      setCarregando(false);
    }
  }

  async function alternarDisponibilidade() {
    if (!artista) return;

    try {
      setSalvandoDisponibilidade(
        true
      );

      setErro("");

      if (disponivel) {
        pararMonitoramentoGPS();

        const { error } =
          await supabase
            .from(
              "artist_availability"
            )
            .update({
              is_available: false,
              sharing_consent: false,
              current_location: null,
              accuracy_m: null,
              available_since: null,
              last_seen_at:
                new Date().toISOString(),
            })
            .eq(
              "artist_id",
              artista.id
            );

        if (error) {
          throw error;
        }

        setDisponivel(false);
        setPrecisaoGps(null);
        setUltimaAtualizacaoGps(
          null
        );

        return;
      }

      if (
        !navigator.geolocation
      ) {
        setErro(
          "Seu navegador não possui suporte ao GPS."
        );

        return;
      }

      const posicao =
        await obterLocalizacaoAtual();

      await salvarLocalizacao(
        artista.id,
        posicao,
        true
      );

      setDisponivel(true);

      iniciarMonitoramentoGPS(
        artista.id
      );
    } catch (error) {
      console.error(
        "Erro ao ativar disponibilidade:",
        error
      );

      setDisponivel(false);
      setGpsAtivo(false);

      setErro(
        mensagemErroGPS(error)
      );
    } finally {
      setSalvandoDisponibilidade(
        false
      );
    }
  }

  async function atualizarGpsAgora() {
    if (
      !artista ||
      !disponivel
    ) {
      return;
    }

    try {
      setErro("");

      const posicao =
        await obterLocalizacaoAtual();

      await salvarLocalizacao(
        artista.id,
        posicao
      );

      iniciarMonitoramentoGPS(
        artista.id
      );
    } catch (error) {
      console.error(error);

      setErro(
        mensagemErroGPS(error)
      );
    }
  }

  if (carregando) {
    return (
      <main className="aura-page flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-zinc-800 border-t-red-500" />

          <p className="text-zinc-400">
            Carregando Aura Beat...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="aura-page pb-8">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {erro && (
          <div className="rounded-2xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
            {erro}
          </div>
        )}

        <section className="aura-hero aura-artist-hero rounded-3xl p-6 sm:p-8">
          <p className="aura-kicker">
            Painel do Artista
          </p>

          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">

            <div className="flex items-center gap-4">

              <ProfileAvatar
                kind="artist"
                name={
                  artista?.stage_name ||
                  "Artista"
                }
                url={
                  artista?.avatar_url
                }
                sizeClassName="h-20 w-20 sm:h-24 sm:w-24"
                className="rounded-3xl shadow-[0_0_35px_rgba(168,85,247,0.24)]"
              />

              <div>

                <div className="flex flex-wrap items-center gap-2">

                  <h1 className="text-2xl font-black">
                    {
                      artista?.stage_name
                    }
                  </h1>

                  {artista?.verification_status ===
                    "verified" && (
                    <span className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-semibold text-blue-400">
                      ✓ Verificado
                    </span>
                  )}

                  {hasPlanBenefit(
                    planAccess,
                    "pro_badge"
                  ) && (
                    <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-black text-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.15)]">
                      ✦ PRO
                    </span>
                  )}

                </div>

                <p className="mt-1 text-sm text-zinc-400">

                  {artista?.base_city ||
                    "Cidade não informada"}

                  {artista?.base_state
                    ? ` - ${artista.base_state}`
                    : ""}

                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="inline-block rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-xs font-bold text-purple-300">
                    Plano {plano}
                  </span>

                  {hasPlanBenefit(
                    planAccess,
                    "priority_support"
                  ) && (
                    <span className="inline-block rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-bold text-green-300">
                      ⚡ Suporte prioritário
                    </span>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">

                  {artista?.id && (
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/artistas/${artista.id}`
                        )
                      }
                      className="rounded-xl border border-purple-500/40 bg-purple-500/10 px-4 py-2 text-sm font-bold text-purple-300"
                    >
                      Ver Press Kit
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      router.push(
                        "/buscar"
                      )
                    }
                    className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-bold"
                  >
                    Explorar perfis
                  </button>

                </div>

              </div>

            </div>

            <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4 md:min-w-[320px]">

              <div className="flex items-center justify-between gap-4">

                <div>

                  <p className="text-xs uppercase tracking-wider text-zinc-500">
                    Status
                  </p>

                  <div className="mt-1 flex items-center gap-2">

                    <span
                      className={`h-3 w-3 rounded-full ${
                        disponivel
                          ? "bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.9)]"
                          : "bg-zinc-600"
                      }`}
                    />

                    <p className="font-bold">
                      {disponivel
                        ? "Disponível para eventos"
                        : "Indisponível"}
                    </p>

                  </div>

                </div>

                <button
                  type="button"
                  onClick={
                    alternarDisponibilidade
                  }
                  disabled={
                    salvandoDisponibilidade
                  }
                  className={`relative h-8 w-14 rounded-full transition ${
                    disponivel
                      ? "bg-green-500"
                      : "bg-zinc-700"
                  } disabled:opacity-50`}
                >
                  <span
                    className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${
                      disponivel
                        ? "left-7"
                        : "left-1"
                    }`}
                  />
                </button>

              </div>

              {salvandoDisponibilidade && (
                <p className="mt-3 text-xs text-zinc-400">
                  Obtendo localização...
                </p>
              )}

              {disponivel && (
                <div className="mt-4 border-t border-zinc-800 pt-4">

                  <div className="flex items-center gap-2">

                    <span
                      className={`h-2 w-2 rounded-full ${
                        gpsAtivo
                          ? "bg-green-500"
                          : "bg-yellow-500"
                      }`}
                    />

                    <p className="text-sm font-semibold">
                      {gpsAtivo
                        ? "GPS em tempo real"
                        : "GPS aguardando atualização"}
                    </p>

                  </div>

                  {precisaoGps !==
                    null && (
                    <p className="mt-2 text-xs text-zinc-500">
                      Precisão aproximada: ±
                      {precisaoGps.toFixed(
                        0
                      )}{" "}
                      metros
                    </p>
                  )}

                  {ultimaAtualizacaoGps && (
                    <p className="mt-1 text-xs text-zinc-500">
                      Atualizado às{" "}
                      {ultimaAtualizacaoGps.toLocaleTimeString(
                        "pt-BR",
                        {
                          hour: "2-digit",
                          minute:
                            "2-digit",
                          second:
                            "2-digit",
                        }
                      )}
                    </p>
                  )}

                  {!gpsAtivo && (
                    <button
                      type="button"
                      onClick={
                        atualizarGpsAgora
                      }
                      className="mt-3 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-900"
                    >
                      Atualizar GPS
                    </button>
                  )}

                </div>
              )}

            </div>

          </div>

          {disponivel && (
            <div className="mt-5 rounded-2xl border border-green-900/40 bg-green-950/20 p-4">

              <div className="flex gap-3">

                <span>
                  📍
                </span>

                <div>

                  <p className="text-sm font-semibold text-green-300">
                    Localização compartilhada
                  </p>

                  <p className="mt-1 text-xs leading-5 text-zinc-400">
                    Sua localização é compartilhada enquanto
                    você estiver disponível. Ao desligar a
                    disponibilidade, a localização é removida.
                  </p>

                </div>

              </div>

            </div>
          )}

        </section>

        <PlanStatusCard
          audience="artist"
          access={planAccess}
          onViewPlans={() => router.push("/planos-artista")}
        />

        <section
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
          aria-label="Resumo do Artista"
        >

          <div className="aura-stat rounded-2xl border p-4">

            <p className="text-sm text-zinc-500">
              Avaliação
            </p>

            <p className="mt-2 text-2xl font-black">
              ⭐{" "}
              {avaliacao > 0
                ? avaliacao.toFixed(1)
                : "--"}
            </p>

            <p className="mt-1 text-xs text-zinc-600">
              {quantidadeAvaliacoes} avaliações
            </p>

          </div>

          <div className="aura-stat rounded-2xl border p-4">

            <p className="text-sm text-zinc-500">
              Eventos concluídos
            </p>

            <p className="mt-2 text-2xl font-black">
              {eventosConcluidos}
            </p>

          </div>

          <div className="aura-stat rounded-2xl border p-4">

            <p className="text-sm text-zinc-500">
              Cachês líquidos
            </p>

            <p className="mt-2 text-xl font-black text-green-400">
              {dinheiro(ganhos)}
            </p>

            <p className="mt-1 text-xs text-zinc-600">
              eventos concluídos
            </p>

          </div>

          <div className="aura-stat rounded-2xl border p-4">

            <p className="text-sm text-zinc-500">
              Cachê por hora
            </p>

            <p className="mt-2 text-xl font-black text-red-400">
              {dinheiro(
                Number(
                  artista?.fixed_fee ||
                    0
                )
              )}
              /h
            </p>

          </div>

        </section>

        {hasPlanBenefit(
          planAccess,
          "analytics"
        ) ? (
          <section className="rounded-3xl border border-purple-500/20 bg-purple-500/5 p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-purple-300">
                  ANALYTICS
                </p>
                <h2 className="mt-2 text-xl font-black">
                  Análise de desempenho
                </h2>
              </div>

              <span className="w-fit rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-black text-green-300">
                ✓ Liberado pelo plano {planAccess?.planName}
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-zinc-800 bg-black/30 p-4">
                <p className="text-xs text-zinc-500">
                  Líquido médio por evento
                </p>
                <p className="mt-2 text-xl font-black text-green-400">
                  {dinheiro(
                    eventosConcluidos > 0
                      ? ganhos / eventosConcluidos
                      : 0
                  )}
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-black/30 p-4">
                <p className="text-xs text-zinc-500">
                  Avaliações por evento
                </p>
                <p className="mt-2 text-xl font-black">
                  {eventosConcluidos > 0
                    ? `${Math.min(
                        100,
                        (quantidadeAvaliacoes /
                          eventosConcluidos) *
                          100
                      ).toFixed(0)}%`
                    : "--"}
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-black/30 p-4">
                <p className="text-xs text-zinc-500">
                  Nível de visibilidade
                </p>
                <p className="mt-2 text-xl font-black text-purple-300">
                  {(() => {
                    const visibility =
                      planBenefitText(
                        planAccess,
                        "visibility"
                      );

                    if (
                      visibility === "high"
                    ) {
                      return "Alta";
                    }

                    if (
                      visibility === "enhanced"
                    ) {
                      return "Ampliada";
                    }

                    return "Padrão";
                  })()}
                </p>
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
            <div className="flex gap-4">
              <div className="text-3xl">
                🔒
              </div>

              <div>
                <h2 className="font-black">
                  Analytics avançado
                </h2>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  Disponível nos planos Intermediário e Pro.
                  O painel básico continua funcionando normalmente.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      "/planos-artista"
                    )
                  }
                  className="mt-4 rounded-xl border border-purple-500/40 bg-purple-500/10 px-4 py-2 text-sm font-black text-purple-300"
                >
                  Ver planos
                </button>
              </div>
            </div>
          </section>
        )}

        <section>

          <h2 className="mb-3 text-lg font-black">
            Acesso rápido
          </h2>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/disponibilidade-artista"
                )
              }
              className="group relative overflow-hidden rounded-2xl border border-amber-400/50 bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-red-500/10 p-5 text-left shadow-[0_0_28px_rgba(245,158,11,0.18)] transition duration-300 hover:-translate-y-1 hover:border-amber-300/80 hover:shadow-[0_0_42px_rgba(245,158,11,0.30)]"
            >
              <span className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-amber-300/30" />
              <span className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full bg-amber-400/20 blur-2xl" />

              <div className="relative z-10 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-400/15 text-2xl shadow-[0_0_22px_rgba(251,191,36,0.25)] ring-1 ring-amber-300/30">
                <span className="absolute inset-0 animate-ping rounded-xl bg-amber-400/10" />
                <span className="relative">⚡</span>
              </div>

              <p className="relative z-10 mt-3 font-black text-amber-200">
                Disponibilidade urgente
              </p>

              <p className="relative z-10 mt-1 text-xs text-zinc-500">
                Publicar que está livre para show
              </p>

              <span className="relative z-10 mt-3 inline-flex rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-300">
                Destaque
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/buscar"
                )
              }
              className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-left transition hover:border-purple-500/50"
            >
              <div className="text-2xl">⌕</div>
              <p className="mt-3 font-bold">Explorar</p>
              <p className="mt-1 text-xs text-zinc-500">Artistas e Casas</p>
            </button>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/ofertas-artista"
                )
              }
              className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-left transition hover:border-red-500/50"
            >
              <div className="text-2xl">🔥</div>
              <p className="mt-3 font-bold">Ofertas</p>
              <p className="mt-1 text-xs text-zinc-500">Ver oportunidades</p>
            </button>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/solicitacoes-artista"
                )
              }
              className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-left transition hover:border-green-500/50"
            >
              <div className="text-2xl">📩</div>
              <p className="mt-3 font-bold">Solicitações</p>
              <p className="mt-1 text-xs text-zinc-500">Casas interessadas</p>
            </button>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/financeiro-artista"
                )
              }
              className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-left transition hover:border-green-500/50"
            >
              <div className="text-2xl">💰</div>
              <p className="mt-3 font-bold">Financeiro</p>
              <p className="mt-1 text-xs text-zinc-500">Cachês e repasses</p>
            </button>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/planos-artista"
                )
              }
              className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-left transition hover:border-purple-500/50"
            >
              <div className="text-2xl">💎</div>
              <p className="mt-3 font-bold">Meu plano</p>
              <p className="mt-1 text-xs text-zinc-500">Plano, benefícios e validade</p>
            </button>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/agenda"
                )
              }
              className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-left transition hover:border-red-500/50"
            >
              <div className="text-2xl">📅</div>
              <p className="mt-3 font-bold">Agenda</p>
              <p className="mt-1 text-xs text-zinc-500">Datas e eventos</p>
            </button>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/chat-direto"
                )
              }
              className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-left transition hover:border-red-500/50"
            >
              <div className="text-2xl">💬</div>
              <p className="mt-3 font-bold">Chat</p>
              <p className="mt-1 text-xs text-zinc-500">Contratantes</p>
            </button>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/perfil-artista"
                )
              }
              className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-left transition hover:border-red-500/50"
            >
              <div className="text-2xl">🎧</div>
              <p className="mt-3 font-bold">Meu perfil</p>
              <p className="mt-1 text-xs text-zinc-500">Editar informações</p>
            </button>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/configuracoes"
                )
              }
              className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-left transition hover:border-red-500/50"
            >
              <div className="text-2xl">⚙️</div>
              <p className="mt-3 font-bold">Configurações</p>
              <p className="mt-1 text-xs text-zinc-500">Conta e preferências</p>
            </button>

          </div>

        </section>
        <section>

          <div className="mb-3 flex items-center justify-between">

            <div>

              <h2 className="text-lg font-black">
                Ofertas disponíveis
              </h2>

              <p className="text-sm text-zinc-500">
                Novas oportunidades para artistas
              </p>

            </div>

            <button
              onClick={() =>
                router.push(
                  "/ofertas-artista"
                )
              }
              className="text-sm font-semibold text-red-500"
            >
              Ver todas
            </button>

          </div>

          {ofertas.length === 0 ? (

            <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-950/50 p-8 text-center">

              <div className="text-4xl">
                🎶
              </div>

              <p className="mt-4 font-bold">
                Nenhuma oferta aberta no momento
              </p>

              <p className="mt-2 text-sm text-zinc-500">
                Novas oportunidades aparecerão aqui.
              </p>

            </div>

          ) : (

            <div className="grid gap-3">

              {ofertas.map(
                (oferta) => {

                  const horas =
                    oferta.duration_minutes /
                    60;

                  const cacheEstimado =
                    Number(
                      artista?.fixed_fee ||
                        0
                    ) * horas;

                  return (
                    <button
                      key={
                        oferta.id
                      }
                      onClick={() =>
                        router.push(
                          "/ofertas-artista"
                        )
                      }
                      className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-left transition hover:border-red-500/50"
                    >

                      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">

                        <div>

                          <div className="flex flex-wrap items-center gap-2">

                            <h3 className="font-bold">
                              {
                                oferta.title
                              }
                            </h3>

                            {oferta.is_urgent && (
                              <span className="rounded-full bg-red-500/15 px-2 py-1 text-xs font-bold text-red-400">
                                URGENTE
                              </span>
                            )}

                          </div>

                          <p className="mt-2 text-sm text-zinc-500">
                            {oferta.event_type ||
                              "Evento"}{" "}
                            •{" "}
                            {dataEvento(
                              oferta.starts_at
                            )}
                          </p>

                          <p className="mt-1 text-sm text-zinc-500">
                            ⏱{" "}
                            {horas.toLocaleString(
                              "pt-BR",
                              {
                                maximumFractionDigits: 1,
                              }
                            )}{" "}
                            hora(s)
                          </p>

                          {oferta.address_text && (
                            <p className="mt-1 text-sm text-zinc-500">
                              📍{" "}
                              {
                                oferta.address_text
                              }
                            </p>
                          )}

                        </div>

                        <div className="sm:text-right">

                          <p className="text-xs text-zinc-500">
                            Orçamento da Casa
                          </p>

                          <p className="text-xl font-black text-green-400">
                            {dinheiro(
                              Number(
                                oferta.budget_amount
                              )
                            )}
                          </p>

                          <p className="mt-2 text-xs text-zinc-500">
                            Seu cachê calculado
                          </p>

                          <p className="font-bold text-red-400">
                            {dinheiro(
                              cacheEstimado
                            )}
                          </p>

                        </div>

                      </div>

                    </button>
                  );
                }
              )}

            </div>
          )}

        </section>

      </div>
    </main>
  );
}