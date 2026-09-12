"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProfileAvatar } from "../../components/profile-avatar";
import { formatBRL } from "../../lib/finance";
import { supabase } from "../../lib/supabase";

type Casa = {
  id: string;
  trade_name: string;
  city: string | null;
  state: string | null;
  verification_status: string;
  avatar_url: string | null;
};

type ArtistaProximo = {
  artist_id: string;
  stage_name: string;
  avatar_url: string | null;
  fixed_fee: number | null;
  primary_style: string | null;
  distance_km: number | null;
  lat: number | null;
  lng: number | null;
  verification_status: string | null;
  rating?: number;
  reviews?: number;
};

type Localizacao = {
  lat: number;
  lng: number;
  accuracy: number;
};

function dinheiro(valor: number) {
  return formatBRL(Number(valor || 0));
}

export default function HomeCasaPage() {
  const router = useRouter();

  const mapaElementoRef = useRef<HTMLDivElement | null>(null);

  const mapaRef =
    useRef<import("leaflet").Map | null>(null);

  const camadaMarcadoresRef =
    useRef<import("leaflet").LayerGroup | null>(null);

  const [casa, setCasa] =
    useState<Casa | null>(null);

  const [localizacao, setLocalizacao] =
    useState<Localizacao | null>(null);

  const [artistas, setArtistas] =
    useState<ArtistaProximo[]>([]);

  const [raio, setRaio] =
    useState(50);

  const [carregando, setCarregando] =
    useState(true);

  const [buscando, setBuscando] =
    useState(false);

  const [erro, setErro] =
    useState("");

  const [mensagem, setMensagem] =
    useState("");

  const [avaliacaoCasa, setAvaliacaoCasa] =
    useState(0);

  const [
    quantidadeAvaliacoesCasa,
    setQuantidadeAvaliacoesCasa,
  ] = useState(0);

  const [
    eventosConcluidos,
    setEventosConcluidos,
  ] = useState(0);

  const carregarCasaEffect = useEffectEvent(() => {
    void carregarCasa();
  });

  const montarMapaEffect = useEffectEvent(() => {
    void montarMapa();
  });

  useEffect(() => {
    carregarCasaEffect();

    return () => {
      if (mapaRef.current) {
        mapaRef.current.remove();
        mapaRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!localizacao) return;

    montarMapaEffect();
  }, [localizacao, artistas]);

  async function carregarCasa() {
    try {
      setCarregando(true);
      setErro("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const {
        data: perfil,
        error: erroPerfil,
      } = await supabase
        .from("venue_profiles")
        .select(
          `
          id,
          trade_name,
          city,
          state,
          verification_status,
          avatar_url
          `
        )
        .eq("owner_user_id", user.id)
        .maybeSingle();

      if (erroPerfil) {
        throw erroPerfil;
      }

      if (!perfil) {
        router.replace("/perfil-casa");
        return;
      }

      setCasa(perfil);

      await carregarEstatisticasCasa(
        perfil.id
      );

      if (
        perfil.verification_status ===
        "verified"
      ) {
        await obterLocalizacao();
      }
    } catch (error) {
      console.error(error);

      setErro(
        "Não foi possível carregar a Home da Casa."
      );
    } finally {
      setCarregando(false);
    }
  }

  async function carregarEstatisticasCasa(
    venueId: string
  ) {
    try {
      const {
        data: avaliacoes,
        error: erroAvaliacoes,
      } = await supabase
        .from("reviews")
        .select("overall_rating")
        .eq(
          "reviewee_type",
          "venue"
        )
        .eq(
          "venue_id",
          venueId
        );

      if (erroAvaliacoes) {
        throw erroAvaliacoes;
      }

      const notas =
        (avaliacoes || [])
          .map((review) =>
            Number(
              review.overall_rating ||
                0
            )
          )
          .filter(
            (nota) =>
              nota > 0
          );

      const media =
        notas.length > 0
          ? notas.reduce(
              (soma, nota) =>
                soma + nota,
              0
            ) / notas.length
          : 0;

      setAvaliacaoCasa(
        media
      );

      setQuantidadeAvaliacoesCasa(
        notas.length
      );

      const {
        count,
        error: erroEventos,
      } = await supabase
        .from("bookings")
        .select(
          "id",
          {
            count: "exact",
            head: true,
          }
        )
        .eq(
          "venue_id",
          venueId
        )
        .eq(
          "status",
          "completed"
        );

      if (erroEventos) {
        throw erroEventos;
      }

      setEventosConcluidos(
        count || 0
      );
    } catch (error) {
      console.error(
        "Erro ao carregar estatísticas da Casa:",
        error
      );

      setAvaliacaoCasa(0);
      setQuantidadeAvaliacoesCasa(0);
      setEventosConcluidos(0);
    }
  }

  function mensagemErroGps(
    error: GeolocationPositionError
  ) {
    if (error.code === 1) {
      return "Permissão de localização negada. Permita o GPS no navegador.";
    }

    if (error.code === 2) {
      return "Não foi possível identificar sua localização.";
    }

    if (error.code === 3) {
      return "O GPS demorou demais para responder.";
    }

    return "Erro ao acessar sua localização.";
  }

  async function obterLocalizacao() {
    setErro("");
    setMensagem("");

    if (!navigator.geolocation) {
      setErro(
        "Seu navegador não possui suporte à localização."
      );

      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (posicao) => {
        const novaLocalizacao = {
          lat: posicao.coords.latitude,
          lng: posicao.coords.longitude,
          accuracy: posicao.coords.accuracy,
        };

        setLocalizacao(novaLocalizacao);

        await buscarArtistas(
          novaLocalizacao,
          raio
        );
      },

      (error) => {
        console.error(error);

        setErro(
          mensagemErroGps(error)
        );
      },

      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 5000,
      }
    );
  }

  async function buscarArtistas(
    coordenadas = localizacao,
    raioBusca = raio
  ) {
    if (!coordenadas) {
      setErro(
        "Ative sua localização para procurar artistas."
      );

      return;
    }

    if (
      casa?.verification_status !==
      "verified"
    ) {
      setErro(
        "A Casa precisa estar verificada para visualizar artistas disponíveis."
      );

      return;
    }

    try {
      setBuscando(true);
      setErro("");
      setMensagem("");

      const {
        data,
        error,
      } = await supabase.rpc(
        "find_available_artists",
        {
          p_lat: coordenadas.lat,
          p_lng: coordenadas.lng,
          p_radius_km: raioBusca,
        }
      );

      if (error) {
        throw error;
      }

      const encontrados =
        (data || []) as ArtistaProximo[];

      if (encontrados.length === 0) {
        setArtistas([]);

        setMensagem(
          `Nenhum artista disponível em um raio de ${raioBusca} km.`
        );

        return;
      }

      const ids = encontrados.map(
        (artista) =>
          artista.artist_id
      );

      const {
        data: avaliacoes,
      } = await supabase
        .from("reviews")
        .select(
          "artist_id, overall_rating"
        )
        .eq(
          "reviewee_type",
          "artist"
        )
        .in("artist_id", ids);

      const artistasComAvaliacao =
        encontrados.map(
          (artista) => {
            const reviewsArtista =
              (avaliacoes || []).filter(
                (review) =>
                  review.artist_id ===
                  artista.artist_id
              );

            let media = 0;

            if (
              reviewsArtista.length > 0
            ) {
              const total =
                reviewsArtista.reduce(
                  (soma, review) =>
                    soma +
                    Number(
                      review.overall_rating ||
                        0
                    ),
                  0
                );

              media =
                total /
                reviewsArtista.length;
            }

            return {
              ...artista,
              rating: media,
              reviews:
                reviewsArtista.length,
            };
          }
        );

      setArtistas(
        artistasComAvaliacao
      );

      setMensagem(
        `${artistasComAvaliacao.length} artista(s) disponível(is) encontrado(s).`
      );
    } catch (error: unknown) {
      console.error(error);

      let texto =
        "Não foi possível buscar artistas.";

      if (
        typeof error === "object" &&
        error !== null &&
        "message" in error
      ) {
        const mensagemErro =
          String(
            (
              error as {
                message?: string;
              }
            ).message || ""
          );

        if (
          mensagemErro.includes(
            "verified venue required"
          )
        ) {
          texto =
            "Sua Casa ainda precisa ser verificada para visualizar a localização dos DJs.";
        }
      }

      setErro(texto);
    } finally {
      setBuscando(false);
    }
  }

  async function montarMapa() {
    if (
      !mapaElementoRef.current ||
      !localizacao
    ) {
      return;
    }

    const L =
      await import("leaflet");

    if (!mapaRef.current) {
      mapaRef.current = L.map(
        mapaElementoRef.current,
        {
          zoomControl: true,
        }
      ).setView(
        [
          localizacao.lat,
          localizacao.lng,
        ],
        12
      );

      L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }
      ).addTo(
        mapaRef.current
      );

      camadaMarcadoresRef.current =
        L.layerGroup().addTo(
          mapaRef.current
        );
    }

    const mapa = mapaRef.current;

    if (!mapa) return;

    mapa.setView(
      [
        localizacao.lat,
        localizacao.lng,
      ],
      12
    );

    if (
      camadaMarcadoresRef.current
    ) {
      camadaMarcadoresRef.current.clearLayers();
    }

    const camada =
      camadaMarcadoresRef.current;

    if (!camada) return;

    const iconeCasa =
      L.divIcon({
        className: "",
        html: `
          <div style="
            width:42px;
            height:42px;
            border-radius:14px;
            background:#ef4444;
            border:3px solid white;
            display:flex;
            align-items:center;
            justify-content:center;
            color:white;
            font-size:20px;
            box-shadow:0 4px 15px rgba(0,0,0,.45);
          ">
            🏠
          </div>
        `,
        iconSize: [42, 42],
        iconAnchor: [21, 21],
      });

    L.marker(
      [
        localizacao.lat,
        localizacao.lng,
      ],
      {
        icon: iconeCasa,
      }
    )
      .addTo(camada)
      .bindPopup(`
        <div style="min-width:160px">
          <strong>
            ${
              casa?.trade_name ||
              "Sua Casa"
            }
          </strong>
          <br />
          Sua localização
        </div>
      `);

    artistas.forEach(
      (artista) => {
        if (
          artista.lat === null ||
          artista.lng === null
        ) {
          return;
        }

        const inicial =
          artista.stage_name
            ?.charAt(0)
            ?.toUpperCase() ||
          "DJ";

        const iconeDj =
          L.divIcon({
            className: "",
            html: `
              <div style="
                width:46px;
                height:46px;
                border-radius:50%;
                background:linear-gradient(135deg,#7c3aed,#ef4444);
                border:3px solid white;
                display:flex;
                align-items:center;
                justify-content:center;
                color:white;
                font-size:16px;
                font-weight:900;
                box-shadow:0 4px 18px rgba(239,68,68,.45);
              ">
                ${inicial}
              </div>
            `,
            iconSize: [46, 46],
            iconAnchor: [23, 23],
          });

        const marker =
          L.marker(
            [
              Number(
                artista.lat
              ),
              Number(
                artista.lng
              ),
            ],
            {
              icon: iconeDj,
            }
          );

        marker
          .addTo(camada)
          .bindPopup(`
            <div style="
              min-width:210px;
              font-family:Arial,sans-serif;
            ">
              <strong style="font-size:16px">
                ${artista.stage_name}
              </strong>

              <br />

              ${
                artista.primary_style ||
                "Estilo não informado"
              }

              <br />

              📍 ${
                artista.distance_km ??
                "--"
              } km

              <br />

              💰 ${dinheiro(
                Number(
                  artista.fixed_fee ||
                    0
                )
              )}/h

              <br />

              ⭐ ${
                artista.rating &&
                artista.rating > 0
                  ? artista.rating.toFixed(
                      1
                    )
                  : "Novo"
              }
            </div>
          `);
      }
    );

    if (
      artistas.length > 0
    ) {
      const pontos: [
        number,
        number
      ][] = [
        [
          localizacao.lat,
          localizacao.lng,
        ],
      ];

      artistas.forEach(
        (artista) => {
          if (
            artista.lat !== null &&
            artista.lng !== null
          ) {
            pontos.push([
              Number(
                artista.lat
              ),
              Number(
                artista.lng
              ),
            ]);
          }
        }
      );

      mapa.fitBounds(
        pontos,
        {
          padding: [40, 40],
          maxZoom: 13,
        }
      );
    }
  }

  async function alterarRaio(
    novoRaio: number
  ) {
    setRaio(novoRaio);

    if (localizacao) {
      await buscarArtistas(
        localizacao,
        novoRaio
      );
    }
  }

  function focarArtista(
    artista: ArtistaProximo
  ) {
    if (
      !mapaRef.current ||
      artista.lat === null ||
      artista.lng === null
    ) {
      return;
    }

    mapaRef.current.setView(
      [
        Number(artista.lat),
        Number(artista.lng),
      ],
      15,
      {
        animate: true,
      }
    );

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function enviarOferta(
    artistaId: string
  ) {
    router.push(
      `/ofertas?artist=${artistaId}`
    );
  }

  function statusCasa() {
    if (
      casa?.verification_status ===
      "verified"
    ) {
      return {
        texto: "Casa Verificada",
        classe:
          "bg-green-500/10 border-green-800 text-green-400",
      };
    }

    if (
      casa?.verification_status ===
      "rejected"
    ) {
      return {
        texto:
          "Verificação recusada",
        classe:
          "bg-red-500/10 border-red-800 text-red-400",
      };
    }

    if (
      casa?.verification_status ===
      "suspended"
    ) {
      return {
        texto: "Casa suspensa",
        classe:
          "bg-red-500/10 border-red-800 text-red-400",
      };
    }

    return {
      texto:
        "Verificação pendente",
      classe:
        "bg-yellow-500/10 border-yellow-800 text-yellow-400",
    };
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

  const status =
    statusCasa();

  const casaVerificada =
    casa?.verification_status ===
    "verified";

  return (
    <main className="aura-page pb-8">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <section className="aura-hero aura-venue-hero rounded-3xl p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
            <div className="flex items-center gap-4">
              <ProfileAvatar
                kind="venue"
                name={casa?.trade_name || "Casa"}
                url={casa?.avatar_url}
                sizeClassName="h-20 w-20 sm:h-24 sm:w-24"
                className="rounded-3xl shadow-[0_0_35px_rgba(239,68,68,0.22)]"
              />
              <div>
                <p className="aura-kicker">Painel da Casa</p>
                <h1 className="mt-2 text-3xl font-black">
                  {casa?.trade_name}
                </h1>
                <p className="mt-2 text-zinc-400">
                  {casa?.city || "Cidade não informada"}
                  {casa?.state ? ` — ${casa.state}` : ""}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-start gap-3 md:items-end">
              <div
                className={`rounded-full border px-4 py-2 text-sm font-bold ${status.classe}`}
              >
                {status.texto}
              </div>
              <div className="flex flex-wrap gap-2">
                {casa?.id && (
                  <button
                    type="button"
                    onClick={() => router.push(`/casas/${casa.id}`)}
                    className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-300"
                  >
                    Ver perfil público
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => router.push("/ofertas")}
                  className="rounded-xl bg-red-500 px-4 py-2 text-sm font-black text-white"
                >
                  Criar oferta
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2" aria-label="Resumo da Casa">
          <div className="aura-stat rounded-2xl border p-5">
            <p className="text-sm text-zinc-500">
              Avaliação da Casa
            </p>

            <p className="mt-2 text-2xl font-black">
              ⭐{" "}
              {avaliacaoCasa > 0
                ? avaliacaoCasa.toFixed(1)
                : "--"}
            </p>

            <p className="mt-1 text-xs text-zinc-600">
              {quantidadeAvaliacoesCasa}{" "}
              {quantidadeAvaliacoesCasa === 1
                ? "avaliação"
                : "avaliações"}
            </p>
          </div>

          <div className="aura-stat rounded-2xl border p-5">
            <p className="text-sm text-zinc-500">
              Eventos concluídos
            </p>

            <p className="mt-2 text-2xl font-black">
              {eventosConcluidos}
            </p>

            <p className="mt-1 text-xs text-zinc-600">
              Contratações finalizadas
            </p>
          </div>
        </section>

        {erro && (
          <div className="rounded-2xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
            {erro}
          </div>
        )}

        {mensagem && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-300">
            {mensagem}
          </div>
        )}

        {!casaVerificada ? (
          <section className="rounded-3xl border border-yellow-900/50 bg-yellow-950/10 p-8 text-center">
            <div className="text-5xl">
              🔐
            </div>

            <h2 className="mt-4 text-2xl font-black">
              Mapa protegido
            </h2>

            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-400">
              Para proteger a
              localização dos artistas,
              somente Casas verificadas
              podem visualizar DJs
              disponíveis no mapa.
            </p>

            <button
              onClick={() =>
                router.push(
                  "/perfil-casa"
                )
              }
              className="mt-6 rounded-xl bg-red-500 px-6 py-3 font-bold transition hover:bg-red-600"
            >
              Ver perfil da Casa
            </button>
          </section>
        ) : (
          <>
            <section className="grid gap-4 lg:grid-cols-[1fr_300px]">
              <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950">
                <div
                  ref={
                    mapaElementoRef
                  }
                  className="h-[480px] w-full"
                />
              </div>

              <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
                <h2 className="text-lg font-black">
                  Buscar DJs
                </h2>

                <p className="mt-1 text-sm text-zinc-500">
                  Defina o raio da
                  procura.
                </p>

                <div className="mt-5 grid grid-cols-2 gap-2">
                  {[10, 25, 50, 100].map(
                    (valor) => (
                      <button
                        key={
                          valor
                        }
                        onClick={() =>
                          alterarRaio(
                            valor
                          )
                        }
                        className={`rounded-xl border px-3 py-3 text-sm font-bold transition ${
                          raio ===
                          valor
                            ? "border-red-500 bg-red-500 text-white"
                            : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600"
                        }`}
                      >
                        {valor} km
                      </button>
                    )
                  )}
                </div>

                <button
                  onClick={
                    obterLocalizacao
                  }
                  disabled={
                    buscando
                  }
                  className="mt-4 w-full rounded-xl bg-red-500 py-3 font-bold transition hover:bg-red-600 disabled:opacity-50"
                >
                  {buscando
                    ? "Buscando..."
                    : "Atualizar DJs próximos"}
                </button>

                {localizacao && (
                  <div className="mt-5 rounded-xl bg-zinc-900 p-4">
                    <p className="text-xs text-zinc-500">
                      GPS da Casa
                    </p>

                    <p className="mt-1 text-sm font-bold text-green-400">
                      ● Localização ativa
                    </p>

                    <p className="mt-2 text-xs text-zinc-500">
                      Precisão aproximada:
                      ±
                      {localizacao.accuracy.toFixed(
                        0
                      )}{" "}
                      metros
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-end justify-between">
                <div>
                  <h2 className="text-xl font-black">
                    DJs disponíveis
                  </h2>

                  <p className="mt-1 text-sm text-zinc-500">
                    Até {raio} km da
                    sua localização
                  </p>
                </div>

                <span className="rounded-full bg-zinc-900 px-3 py-1 text-sm font-bold text-zinc-400">
                  {artistas.length} DJ(s)
                </span>
              </div>

              {artistas.length ===
              0 ? (
                <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-950/50 p-10 text-center">
                  <div className="text-5xl">
                    🎧
                  </div>

                  <p className="mt-4 font-bold">
                    Nenhum DJ disponível
                    nesse raio
                  </p>

                  <p className="mt-2 text-sm text-zinc-500">
                    Tente aumentar a
                    distância ou
                    atualizar a busca.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {artistas.map(
                    (artista) => (
                      <article
                        key={
                          artista.artist_id
                        }
                        className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 transition hover:border-red-500/50"
                      >
                        <div className="flex items-start gap-4">
                          <ProfileAvatar
                            kind="artist"
                            name={artista.stage_name}
                            url={artista.avatar_url}
                            sizeClassName="h-16 w-16"
                            className="rounded-2xl"
                          />

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="truncate text-lg font-black">
                                {
                                  artista.stage_name
                                }
                              </h3>

                              {artista.verification_status ===
                                "verified" && (
                                <span className="rounded-full bg-blue-500/10 px-2 py-1 text-[10px] font-bold text-blue-400">
                                  ✓ Verificado
                                </span>
                              )}
                            </div>

                            <p className="mt-1 text-sm text-zinc-500">
                              {artista.primary_style ||
                                "Estilo não informado"}
                            </p>
                          </div>
                        </div>

                        <div className="mt-5 grid grid-cols-3 gap-2">
                          <div className="rounded-xl bg-zinc-900 p-3">
                            <p className="text-[10px] uppercase text-zinc-600">
                              Distância
                            </p>

                            <p className="mt-1 text-sm font-bold">
                              {artista.distance_km ??
                                "--"}{" "}
                              km
                            </p>
                          </div>

                          <div className="rounded-xl bg-zinc-900 p-3">
                            <p className="text-[10px] uppercase text-zinc-600">
                              Cachê por hora
                            </p>

                            <p className="mt-1 text-sm font-bold text-green-400">
                              {dinheiro(
                                Number(
                                  artista.fixed_fee ||
                                    0
                                )
                              )}
                              /h
                            </p>
                          </div>

                          <div className="rounded-xl bg-zinc-900 p-3">
                            <p className="text-[10px] uppercase text-zinc-600">
                              Avaliação
                            </p>

                            <p className="mt-1 text-sm font-bold">
                              ⭐{" "}
                              {artista.rating &&
                              artista.rating >
                                0
                                ? artista.rating.toFixed(
                                    1
                                  )
                                : "Novo"}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <button
                            onClick={() =>
                              focarArtista(
                                artista
                              )
                            }
                            className="rounded-xl border border-zinc-700 py-3 text-sm font-bold text-zinc-300 transition hover:bg-zinc-900"
                          >
                            Ver no mapa
                          </button>

                          <button
                            onClick={() =>
                              enviarOferta(
                                artista.artist_id
                              )
                            }
                            className="rounded-xl bg-red-500 py-3 text-sm font-bold transition hover:bg-red-600"
                          >
                            Enviar oferta
                          </button>
                        </div>
                      </article>
                    )
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </div>

    </main>
  );
}
