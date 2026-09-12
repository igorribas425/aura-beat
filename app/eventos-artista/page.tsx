"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { formatBRL } from "../../lib/finance";
import { supabase } from "../../lib/supabase";

type BookingStatus =
  | "awaiting_payment"
  | "confirmed"
  | "in_transit"
  | "arrived"
  | "in_event"
  | "completed"
  | "cancelled"
  | "disputed";

type Artista = {
  id: string;
  stage_name: string;
};

type Booking = {
  id: string;
  offer_id: string | null;
  venue_id: string;
  artist_id: string;
  status: BookingStatus;
  starts_at: string;
  duration_minutes: number;
  event_address_snapshot: string | null;

  event_latitude: number | null;
  event_longitude: number | null;

  agreed_fee: number;
  travel_amount: number;
  toll_amount: number;
  lodging_amount: number;
  platform_fee_artist: number;
};

type Casa = {
  id: string;
  trade_name: string;
  city: string | null;
  state: string | null;
};

type Oferta = {
  id: string;
  title: string | null;
  event_type: string | null;
};

type Avaliacao = {
  id: string;
  booking_id: string;
  overall_rating: number;
  organization_rating: number | null;
  professionalism_rating: number | null;
  quality_rating: number | null;
  comment: string | null;
};

type FormAvaliacao = {
  overall: number;
  organization: number;
  professionalism: number;
  structure: number;
  comment: string;
};

type Coordenadas = {
  lat: number;
  lng: number;
  accuracy: number;
};

const FORM_AVALIACAO_VAZIO: FormAvaliacao = {
  overall: 5,
  organization: 5,
  professionalism: 5,
  structure: 5,
  comment: "",
};

function dinheiro(valor: number) {
  return formatBRL(Number(valor || 0));
}

function dataEvento(valor: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(valor));
}

function duracaoEvento(minutos: number) {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;

  if (horas > 0 && resto > 0) {
    return `${horas}h ${resto}min`;
  }

  if (horas > 0) {
    return `${horas}h`;
  }

  return `${resto} min`;
}

function statusInfo(status: BookingStatus) {
  switch (status) {
    case "awaiting_payment":
      return {
        texto: "Aguardando pagamento",
        classe:
          "border-yellow-800 bg-yellow-950/20 text-yellow-400",
      };

    case "confirmed":
      return {
        texto: "Confirmado",
        classe:
          "border-green-800 bg-green-950/20 text-green-400",
      };

    case "in_transit":
      return {
        texto: "A caminho",
        classe:
          "border-blue-800 bg-blue-950/20 text-blue-400",
      };

    case "arrived":
      return {
        texto: "Cheguei",
        classe:
          "border-purple-800 bg-purple-950/20 text-purple-400",
      };

    case "in_event":
      return {
        texto: "Em evento",
        classe:
          "border-red-800 bg-red-950/20 text-red-400",
      };

    case "completed":
      return {
        texto: "Finalizado",
        classe:
          "border-green-800 bg-green-950/20 text-green-400",
      };

    case "cancelled":
      return {
        texto: "Cancelado",
        classe:
          "border-zinc-700 bg-zinc-900 text-zinc-400",
      };

    case "disputed":
      return {
        texto: "Em análise",
        classe:
          "border-orange-800 bg-orange-950/20 text-orange-400",
      };

    default:
      return {
        texto: status,
        classe:
          "border-zinc-800 bg-zinc-900 text-zinc-400",
      };
  }
}

function botaoProximoStatus(
  status: BookingStatus
) {
  switch (status) {
    case "confirmed":
      return {
        texto: "🚗 Iniciar deslocamento",
        proximo: "in_transit" as BookingStatus,
        eventoTracking: "trip_started",
      };

    case "in_transit":
      return {
        texto: "📍 Cheguei ao local",
        proximo: "arrived" as BookingStatus,
        eventoTracking: "arrived",
      };

    case "arrived":
      return {
        texto: "🎧 Iniciar evento",
        proximo: "in_event" as BookingStatus,
        eventoTracking: "show_started",
      };

    case "in_event":
      return {
        texto: "✅ Finalizar evento",
        proximo: "completed" as BookingStatus,
        eventoTracking: "show_ended",
      };

    default:
      return null;
  }
}

function CampoNota({
  titulo,
  valor,
  onChange,
}: {
  titulo: string;
  valor: number;
  onChange: (nota: number) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-bold text-zinc-300">
        {titulo}
      </p>

      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((nota) => (
          <button
            key={nota}
            type="button"
            onClick={() => onChange(nota)}
            className={`h-10 w-10 rounded-xl border text-sm font-black transition ${
              valor === nota
                ? "border-yellow-500 bg-yellow-500 text-black"
                : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-yellow-600"
            }`}
          >
            {nota}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function EventosArtistaPage() {
  const router = useRouter();

  const gpsIntervalRef =
    useRef<ReturnType<typeof setInterval> | null>(
      null
    );

  const simulacaoIntervalRef =
    useRef<ReturnType<typeof setInterval> | null>(
      null
    );

  const [artista, setArtista] =
    useState<Artista | null>(null);

  const [bookings, setBookings] = useState<
    Booking[]
  >([]);

  const [casas, setCasas] = useState<
    Record<string, Casa>
  >({});

  const [ofertas, setOfertas] = useState<
    Record<string, Oferta>
  >({});

  const [avaliacoes, setAvaliacoes] = useState<
    Record<string, Avaliacao>
  >({});

  const [formularios, setFormularios] = useState<
    Record<string, FormAvaliacao>
  >({});

  const [carregando, setCarregando] =
    useState(true);

  const [alterandoStatus, setAlterandoStatus] =
    useState<string | null>(null);

  const [enviandoAvaliacao, setEnviandoAvaliacao] =
    useState<string | null>(null);

  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  const [gpsAtivo, setGpsAtivo] =
    useState(false);

  const [ultimaLocalizacao, setUltimaLocalizacao] =
    useState<Coordenadas | null>(null);

  const [simulando, setSimulando] =
    useState(false);

  const carregarPaginaEffect = useEffectEvent(() => {
    void carregarPagina();
  });

  const limparMonitoramentoEffect = useEffectEvent(() => {
    pararGpsContinuo();
    pararSimulacao();
  });

  useEffect(() => {
    carregarPaginaEffect();

    return () => {
      limparMonitoramentoEffect();
    };
  }, []);

  async function carregarPagina(
    mostrarCarregamento = true
  ) {
    try {
      if (mostrarCarregamento) {
        setCarregando(true);
      }

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
        .from("artist_profiles")
        .select("id, stage_name")
        .eq("user_id", user.id)
        .maybeSingle();

      if (erroPerfil) {
        throw erroPerfil;
      }

      if (!perfil) {
        router.replace("/perfil-artista");
        return;
      }

      setArtista(perfil);

      const {
        data: listaBookings,
        error: erroBookings,
      } = await supabase
        .from("bookings")
        .select(`
          id,
          offer_id,
          venue_id,
          artist_id,
          status,
          starts_at,
          duration_minutes,
          event_address_snapshot,
          event_latitude,
          event_longitude,
          agreed_fee,
          travel_amount,
          toll_amount,
          lodging_amount,
          platform_fee_artist
        `)
        .eq("artist_id", perfil.id)
        .order("starts_at", {
          ascending: false,
        });

      if (erroBookings) {
        throw erroBookings;
      }

      const lista =
        (listaBookings || []) as Booking[];

      setBookings(lista);

      await Promise.all([
        carregarCasas(lista),
        carregarOfertas(lista),
        carregarAvaliacoes(lista),
      ]);

      const ativo = lista.find((booking) =>
        [
          "in_transit",
          "arrived",
          "in_event",
        ].includes(booking.status)
      );

      if (ativo) {
        iniciarGpsContinuo(ativo);
      }
    } catch (error) {
      console.error(error);

      setErro(
        "Não foi possível carregar seus eventos."
      );
    } finally {
      if (mostrarCarregamento) {
        setCarregando(false);
      }
    }
  }

  async function carregarCasas(
    lista: Booking[]
  ) {
    const ids = [
      ...new Set(
        lista.map((booking) => booking.venue_id)
      ),
    ];

    if (ids.length === 0) {
      setCasas({});
      return;
    }

    const { data, error } = await supabase
      .from("venue_profiles")
      .select(
        "id, trade_name, city, state"
      )
      .in("id", ids);

    if (error) {
      console.error(error);
      return;
    }

    const mapa: Record<string, Casa> = {};

    (data || []).forEach((casa) => {
      mapa[casa.id] = casa as Casa;
    });

    setCasas(mapa);
  }

  async function carregarOfertas(
    lista: Booking[]
  ) {
    const ids = [
      ...new Set(
        lista
          .map((booking) => booking.offer_id)
          .filter(
            (id): id is string =>
              typeof id === "string"
          )
      ),
    ];

    if (ids.length === 0) {
      setOfertas({});
      return;
    }

    const { data, error } = await supabase
      .from("offers")
      .select("id, title, event_type")
      .in("id", ids);

    if (error) {
      console.error(error);
      return;
    }

    const mapa: Record<string, Oferta> = {};

    (data || []).forEach((oferta) => {
      mapa[oferta.id] = oferta as Oferta;
    });

    setOfertas(mapa);
  }

  async function carregarAvaliacoes(
    lista: Booking[]
  ) {
    const concluidos = lista
      .filter(
        (booking) =>
          booking.status === "completed"
      )
      .map((booking) => booking.id);

    if (concluidos.length === 0) {
      setAvaliacoes({});
      return;
    }

    const { data, error } = await supabase
      .from("reviews")
      .select(`
        id,
        booking_id,
        overall_rating,
        organization_rating,
        professionalism_rating,
        quality_rating,
        comment
      `)
      .eq("reviewee_type", "venue")
      .in("booking_id", concluidos);

    if (error) {
      console.error(error);
      return;
    }

    const mapa: Record<string, Avaliacao> = {};

    (data || []).forEach((avaliacao) => {
      mapa[avaliacao.booking_id] =
        avaliacao as Avaliacao;
    });

    setAvaliacoes(mapa);
  }

  function obterLocalizacaoAtual() {
    return new Promise<Coordenadas>(
      (resolve, reject) => {
        if (!navigator.geolocation) {
          reject(
            new Error(
              "Seu navegador não possui GPS."
            )
          );
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (posicao) => {
            resolve({
              lat: posicao.coords.latitude,
              lng: posicao.coords.longitude,
              accuracy:
                posicao.coords.accuracy,
            });
          },

          (error) => {
            reject(error);
          },

          {
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 5000,
          }
        );
      }
    );
  }

  async function tentarLocalizacao() {
    try {
      const local =
        await obterLocalizacaoAtual();

      setUltimaLocalizacao(local);

      return local;
    } catch (error) {
      console.error(
        "GPS indisponível:",
        error
      );

      return null;
    }
  }

  async function gravarTracking(
    booking: Booking,
    eventType:
      | "location"
      | "trip_started"
      | "arrived"
      | "show_started"
      | "show_ended",
    coordenadas: Coordenadas | null,
    metadata: Record<string, unknown> = {}
  ) {
    const payloadComLatLng = {
      booking_id: booking.id,
      artist_id: booking.artist_id,
      event_type: eventType,

      latitude:
        coordenadas?.lat ?? null,

      longitude:
        coordenadas?.lng ?? null,

      accuracy_m:
        coordenadas?.accuracy ?? null,

      metadata,
    };

    const {
      error: erroPrimeiraTentativa,
    } = await supabase
      .from("booking_tracking")
      .insert(payloadComLatLng);

    if (!erroPrimeiraTentativa) {
      return;
    }

    console.warn(
      "Tentando formato compatível de GPS:",
      erroPrimeiraTentativa
    );

    const payloadCompatibilidade = {
      booking_id: booking.id,
      artist_id: booking.artist_id,
      event_type: eventType,

      location: coordenadas
        ? `SRID=4326;POINT(${coordenadas.lng} ${coordenadas.lat})`
        : null,

      accuracy_m:
        coordenadas?.accuracy ?? null,

      metadata,
    };

    const { error } = await supabase
      .from("booking_tracking")
      .insert(payloadCompatibilidade);

    if (error) {
      throw error;
    }
  }

  async function enviarLocalizacao(
    booking: Booking
  ) {
    try {
      const coordenadas =
        await obterLocalizacaoAtual();

      setUltimaLocalizacao(coordenadas);

      await gravarTracking(
        booking,
        "location",
        coordenadas,
        {
          source: "browser",
        }
      );
    } catch (error) {
      console.error(error);
    }
  }

  function iniciarGpsContinuo(
    booking: Booking
  ) {
    pararGpsContinuo();

    setGpsAtivo(true);

    enviarLocalizacao(booking);

    gpsIntervalRef.current = setInterval(
      () => {
        enviarLocalizacao(booking);
      },
      12000
    );
  }

  function pararGpsContinuo() {
    if (gpsIntervalRef.current) {
      clearInterval(
        gpsIntervalRef.current
      );

      gpsIntervalRef.current = null;
    }

    setGpsAtivo(false);
  }

  async function alterarStatusEvento(
    booking: Booking
  ) {
    const acao =
      botaoProximoStatus(booking.status);

    if (!acao) {
      return;
    }

    try {
      setAlterandoStatus(booking.id);
      setErro("");
      setMensagem("");

      const coordenadas =
        await tentarLocalizacao();

      const { error } = await supabase
        .from("bookings")
        .update({
          status: acao.proximo,
        })
        .eq("id", booking.id);

      if (error) {
        throw error;
      }

      await gravarTracking(
        booking,
        acao.eventoTracking as
          | "trip_started"
          | "arrived"
          | "show_started"
          | "show_ended",
        coordenadas,
        {
          previous_status:
            booking.status,
          new_status:
            acao.proximo,
        }
      );

      if (
        acao.proximo === "in_transit"
      ) {
        iniciarGpsContinuo({
          ...booking,
          status: "in_transit",
        });
      }

      if (
        acao.proximo === "completed"
      ) {
        pararGpsContinuo();
        pararSimulacao();
      }

      setBookings((anteriores) =>
        anteriores.map((item) =>
          item.id === booking.id
            ? {
                ...item,
                status: acao.proximo,
              }
            : item
        )
      );

      setMensagem(
        `Status atualizado: ${
          statusInfo(acao.proximo).texto
        }.`
      );
    } catch (error) {
      console.error(error);

      setErro(
        "Não foi possível atualizar o status do evento."
      );
    } finally {
      setAlterandoStatus(null);
    }
  }

  function abrirWaze(
    booking: Booking
  ) {
    if (
      booking.event_latitude !== null &&
      booking.event_longitude !== null
    ) {
      window.open(
        `https://waze.com/ul?ll=${booking.event_latitude},${booking.event_longitude}&navigate=yes`,
        "_blank",
        "noopener,noreferrer"
      );

      return;
    }

    const endereco =
      booking.event_address_snapshot || "";

    window.open(
      `https://waze.com/ul?q=${encodeURIComponent(
        endereco
      )}&navigate=yes`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  function abrirGoogleMaps(
    booking: Booking
  ) {
    let destino =
      booking.event_address_snapshot || "";

    if (
      booking.event_latitude !== null &&
      booking.event_longitude !== null
    ) {
      destino = `${booking.event_latitude},${booking.event_longitude}`;
    }

    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
        destino
      )}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  function formularioAvaliacao(
    bookingId: string
  ) {
    return (
      formularios[bookingId] || {
        ...FORM_AVALIACAO_VAZIO,
      }
    );
  }

  function atualizarFormulario(
    bookingId: string,
    campo: keyof FormAvaliacao,
    valor: string | number
  ) {
    setFormularios((anterior) => ({
      ...anterior,

      [bookingId]: {
        ...(
          anterior[bookingId] || {
            ...FORM_AVALIACAO_VAZIO,
          }
        ),

        [campo]: valor,
      },
    }));
  }

  async function enviarAvaliacao(
    booking: Booking
  ) {
    const form =
      formularioAvaliacao(booking.id);

    try {
      setEnviandoAvaliacao(
        booking.id
      );

      setErro("");
      setMensagem("");

      const { error } =
        await supabase.rpc(
          "submit_review",
          {
            p_booking_id:
              booking.id,

            p_reviewee_type:
              "venue",

            p_overall_rating:
              form.overall,

            p_punctuality_rating:
              null,

            p_professionalism_rating:
              form.professionalism,

            p_quality_rating:
              form.structure,

            p_organization_rating:
              form.organization,

            p_comment:
              form.comment.trim() ||
              null,
          }
        );

      if (error) {
        throw error;
      }

      setMensagem(
        "Avaliação da Casa enviada com sucesso."
      );

      await carregarPagina(false);
    } catch (error) {
      console.error(error);

      setErro(
        "Não foi possível enviar a avaliação."
      );
    } finally {
      setEnviandoAvaliacao(null);
    }
  }

  function pararSimulacao() {
    if (
      simulacaoIntervalRef.current
    ) {
      clearInterval(
        simulacaoIntervalRef.current
      );

      simulacaoIntervalRef.current =
        null;
    }

    setSimulando(false);
  }

  function simularTrajeto(
    booking: Booking
  ) {
    pararSimulacao();

    const inicio = {
      lat: -28.2834,
      lng: -52.7864,
    };

    const destino = {
      lat: -28.2628,
      lng: -52.4066,
    };

    const totalPassos = 12;

    let passo = 0;

    setSimulando(true);

    async function enviarPonto() {
      const progresso =
        passo / totalPassos;

      const lat =
        inicio.lat +
        (destino.lat - inicio.lat) *
          progresso;

      const lng =
        inicio.lng +
        (destino.lng - inicio.lng) *
          progresso;

      const coordenadas = {
        lat,
        lng,
        accuracy: 8,
      };

      setUltimaLocalizacao(
        coordenadas
      );

      try {
        await gravarTracking(
          booking,
          "location",
          coordenadas,
          {
            source:
              "simulation",
            step: passo,
            total_steps:
              totalPassos,
          }
        );
      } catch (error) {
        console.error(error);
      }

      passo += 1;

      if (
        passo >
        totalPassos
      ) {
        pararSimulacao();

        setMensagem(
          "Simulação de trajeto concluída."
        );
      }
    }

    enviarPonto();

    simulacaoIntervalRef.current =
      setInterval(
        enviarPonto,
        2500
      );
  }

  if (carregando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050507] text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-zinc-800 border-t-red-500" />

          <p className="text-zinc-400">
            Carregando seus eventos...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050507] pb-24 text-white">
      <header className="border-b border-zinc-900 bg-black/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xl font-black">
              AURA{" "}
              <span className="text-red-500">
                BEAT
              </span>
            </p>

            <p className="text-xs text-zinc-500">
              Eventos do Artista
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              router.push(
                "/home-artista"
              )
            }
            className="rounded-xl border border-zinc-800 px-4 py-2 text-sm font-bold text-zinc-300 hover:bg-zinc-900"
          >
            ← Home
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-7">
        <section className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-950 via-zinc-950 to-red-950/20 p-6">
          <p className="text-sm font-black text-red-500">
            MEUS EVENTOS
          </p>

          <h1 className="mt-2 text-3xl font-black">
            {artista?.stage_name ||
              "Artista"}
          </h1>

          <p className="mt-2 text-sm text-zinc-400">
            Acompanhe seus contratos,
            deslocamento, GPS e eventos
            concluídos.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <div
              className={`rounded-xl border px-4 py-2 text-sm font-bold ${
                gpsAtivo
                  ? "border-green-800 bg-green-950/20 text-green-400"
                  : "border-zinc-800 bg-black text-zinc-500"
              }`}
            >
              {gpsAtivo
                ? "● GPS ativo"
                : "○ GPS aguardando"}
            </div>

            {ultimaLocalizacao && (
              <div className="rounded-xl border border-zinc-800 bg-black px-4 py-2 text-xs text-zinc-500">
                Último ponto:{" "}
                {ultimaLocalizacao.lat.toFixed(
                  5
                )}
                ,{" "}
                {ultimaLocalizacao.lng.toFixed(
                  5
                )}
              </div>
            )}
          </div>
        </section>

        {erro && (
          <div className="rounded-2xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
            {erro}
          </div>
        )}

        {mensagem && (
          <div className="rounded-2xl border border-green-900 bg-green-950/30 p-4 text-sm text-green-300">
            {mensagem}
          </div>
        )}

        {bookings.length === 0 ? (
          <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8 text-center">
            <div className="text-4xl">
              🎧
            </div>

            <h2 className="mt-4 text-xl font-black">
              Nenhum evento encontrado
            </h2>

            <p className="mt-2 text-sm text-zinc-500">
              Quando uma contratação for
              confirmada, ela aparecerá
              aqui.
            </p>
          </section>
        ) : (
          <div className="space-y-6">
            {bookings.map((booking) => {
              const casa =
                casas[
                  booking.venue_id
                ];

              const oferta =
                booking.offer_id
                  ? ofertas[
                      booking.offer_id
                    ]
                  : null;

              const status =
                statusInfo(
                  booking.status
                );

              const proximaAcao =
                botaoProximoStatus(
                  booking.status
                );

              const avaliacao =
                avaliacoes[
                  booking.id
                ];

              const form =
                formularioAvaliacao(
                  booking.id
                );

              const cache =
                Number(
                  booking.agreed_fee ||
                    0
                );

              const deslocamento =
                Number(
                  booking.travel_amount ||
                    0
                );

              const pedagios =
                Number(
                  booking.toll_amount ||
                    0
                );

              const hospedagem =
                Number(
                  booking.lodging_amount ||
                    0
                );

              const taxa =
                Number(
                  booking.platform_fee_artist ||
                    0
                );

              const liquido =
                cache -
                taxa +
                deslocamento +
                pedagios +
                hospedagem;

              return (
                <article
                  key={booking.id}
                  className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950"
                >
                  <div className="border-b border-zinc-900 p-6">
                    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                      <div>
                        <div
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${status.classe}`}
                        >
                          {status.texto}
                        </div>

                        <h2 className="mt-4 text-2xl font-black">
                          {oferta?.title ||
                            oferta?.event_type ||
                            "Evento Aura Beat"}
                        </h2>

                        <p className="mt-1 text-sm text-zinc-400">
                          🏢{" "}
                          {casa?.trade_name ||
                            "Casa contratante"}
                        </p>

                        {(casa?.city ||
                          casa?.state) && (
                          <p className="mt-1 text-sm text-zinc-600">
                            {casa?.city}
                            {casa?.city &&
                            casa?.state
                              ? " / "
                              : ""}
                            {casa?.state}
                          </p>
                        )}
                      </div>

                      <div className="text-left md:text-right">
                        <p className="text-xs font-bold text-zinc-600">
                          DATA DO EVENTO
                        </p>

                        <p className="mt-1 font-black">
                          {dataEvento(
                            booking.starts_at
                          )}
                        </p>

                        <p className="mt-1 text-sm text-zinc-500">
                          Duração:{" "}
                          {duracaoEvento(
                            booking.duration_minutes
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-6 p-6 lg:grid-cols-2">
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-zinc-800 bg-black/40 p-5">
                        <p className="text-xs font-black text-zinc-600">
                          LOCAL
                        </p>

                        <p className="mt-2 font-bold text-zinc-200">
                          📍{" "}
                          {booking.event_address_snapshot ||
                            "Endereço não informado"}
                        </p>

                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              abrirWaze(
                                booking
                              )
                            }
                            className="rounded-xl border border-zinc-700 px-3 py-3 text-sm font-bold hover:bg-zinc-900"
                          >
                            🚙 Waze
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              abrirGoogleMaps(
                                booking
                              )
                            }
                            className="rounded-xl border border-zinc-700 px-3 py-3 text-sm font-bold hover:bg-zinc-900"
                          >
                            🗺️ Maps
                          </button>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-zinc-800 bg-black/40 p-5">
                        <p className="text-xs font-black text-zinc-600">
                          ANDAMENTO
                        </p>

                        <div className="mt-4 space-y-3">
                          {[
                            {
                              status:
                                "confirmed",
                              texto:
                                "Confirmado",
                            },
                            {
                              status:
                                "in_transit",
                              texto:
                                "A caminho",
                            },
                            {
                              status:
                                "arrived",
                              texto:
                                "Cheguei",
                            },
                            {
                              status:
                                "in_event",
                              texto:
                                "Em evento",
                            },
                            {
                              status:
                                "completed",
                              texto:
                                "Finalizado",
                            },
                          ].map(
                            (
                              etapa,
                              index
                            ) => {
                              const ordem: BookingStatus[] =
                                [
                                  "confirmed",
                                  "in_transit",
                                  "arrived",
                                  "in_event",
                                  "completed",
                                ];

                              const atual =
                                ordem.indexOf(
                                  booking.status
                                );

                              const posicao =
                                ordem.indexOf(
                                  etapa.status as BookingStatus
                                );

                              const concluida =
                                atual >=
                                posicao;

                              return (
                                <div
                                  key={
                                    etapa.status
                                  }
                                  className="flex items-center gap-3"
                                >
                                  <div
                                    className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-black ${
                                      concluida
                                        ? "border-green-700 bg-green-950 text-green-400"
                                        : "border-zinc-800 bg-zinc-900 text-zinc-600"
                                    }`}
                                  >
                                    {concluida
                                      ? "✓"
                                      : index +
                                        1}
                                  </div>

                                  <span
                                    className={
                                      concluida
                                        ? "font-bold text-zinc-200"
                                        : "text-zinc-600"
                                    }
                                  >
                                    {
                                      etapa.texto
                                    }
                                  </span>
                                </div>
                              );
                            }
                          )}
                        </div>

                        {proximaAcao && (
                          <button
                            type="button"
                            disabled={
                              alterandoStatus ===
                              booking.id
                            }
                            onClick={() =>
                              alterarStatusEvento(
                                booking
                              )
                            }
                            className="mt-5 w-full rounded-xl bg-red-500 py-4 font-black transition hover:bg-red-600 disabled:opacity-50"
                          >
                            {alterandoStatus ===
                            booking.id
                              ? "Atualizando..."
                              : proximaAcao.texto}
                          </button>
                        )}

                        {[
                          "in_transit",
                          "arrived",
                          "in_event",
                        ].includes(
                          booking.status
                        ) && (
                          <button
                            type="button"
                            onClick={() =>
                              enviarLocalizacao(
                                booking
                              )
                            }
                            className="mt-2 w-full rounded-xl border border-zinc-700 py-3 text-sm font-bold hover:bg-zinc-900"
                          >
                            📡 Enviar GPS agora
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-2xl border border-zinc-800 bg-black/40 p-5">
                        <p className="text-xs font-black text-zinc-600">
                          RESUMO FINANCEIRO
                        </p>

                        <div className="mt-4 space-y-3 text-sm">
                          <div className="flex justify-between">
                            <span className="text-zinc-500">
                              Cachê
                            </span>

                            <strong>
                              {dinheiro(
                                cache
                              )}
                            </strong>
                          </div>

                          <div className="flex justify-between">
                            <span className="text-zinc-500">
                              Deslocamento
                            </span>

                            <strong>
                              {dinheiro(
                                deslocamento
                              )}
                            </strong>
                          </div>

                          <div className="flex justify-between">
                            <span className="text-zinc-500">
                              Pedágios
                            </span>

                            <strong>
                              {dinheiro(
                                pedagios
                              )}
                            </strong>
                          </div>

                          <div className="flex justify-between">
                            <span className="text-zinc-500">
                              Hospedagem
                            </span>

                            <strong>
                              {dinheiro(
                                hospedagem
                              )}
                            </strong>
                          </div>

                          <div className="flex justify-between text-red-400">
                            <span>
                              Taxa Aura Beat
                            </span>

                            <strong>
                              -{" "}
                              {dinheiro(
                                taxa
                              )}
                            </strong>
                          </div>

                          <div className="border-t border-zinc-800 pt-3">
                            <div className="flex items-end justify-between">
                              <span className="font-bold">
                                Líquido previsto
                              </span>

                              <strong className="text-xl text-green-400">
                                {dinheiro(
                                  liquido
                                )}
                              </strong>
                            </div>
                          </div>
                        </div>
                      </div>

                      {[
                        "confirmed",
                        "in_transit",
                        "arrived",
                        "in_event",
                      ].includes(
                        booking.status
                      ) && (
                        <div className="rounded-2xl border border-purple-900/50 bg-purple-950/10 p-5">
                          <p className="text-xs font-black text-purple-400">
                            TESTE DE GPS
                          </p>

                          <p className="mt-2 text-sm leading-6 text-zinc-500">
                            Simula um trajeto
                            Carazinho →
                            Passo Fundo para
                            testar o mapa da
                            Casa.
                          </p>

                          {!simulando ? (
                            <button
                              type="button"
                              onClick={() =>
                                simularTrajeto(
                                  booking
                                )
                              }
                              className="mt-4 w-full rounded-xl border border-purple-800 py-3 text-sm font-bold text-purple-300 hover:bg-purple-950/30"
                            >
                              🧪 Simular trajeto
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={
                                pararSimulacao
                              }
                              className="mt-4 w-full rounded-xl border border-red-800 py-3 text-sm font-bold text-red-400"
                            >
                              Parar simulação
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {booking.status ===
                    "awaiting_payment" && (
                    <div className="border-t border-zinc-900 bg-yellow-950/10 p-5 text-sm text-yellow-400">
                      ⏳ O evento será
                      liberado quando a Casa
                      confirmar o pagamento.
                    </div>
                  )}

                  {booking.status ===
                    "completed" && (
                    <div className="border-t border-zinc-900 p-6">
                      {avaliacao ? (
                        <div className="rounded-2xl border border-green-900 bg-green-950/20 p-5">
                          <p className="font-black text-green-400">
                            ✓ AVALIAÇÃO ENVIADA
                          </p>

                          <p className="mt-2 text-sm text-zinc-400">
                            Nota geral:{" "}
                            <strong className="text-white">
                              {
                                avaliacao.overall_rating
                              }
                              /5
                            </strong>
                          </p>

                          {avaliacao.comment && (
                            <p className="mt-3 text-sm italic text-zinc-500">
                              “
                              {
                                avaliacao.comment
                              }
                              ”
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-zinc-800 bg-black/40 p-5">
                          <p className="text-xs font-black text-red-500">
                            AVALIAR A CASA
                          </p>

                          <h3 className="mt-1 text-xl font-black">
                            Como foi o evento?
                          </h3>

                          <p className="mt-2 text-sm text-zinc-500">
                            Sua avaliação ajuda
                            outros artistas da
                            Aura Beat.
                          </p>

                          <div className="mt-5 grid gap-5 md:grid-cols-2">
                            <CampoNota
                              titulo="⭐ Nota geral"
                              valor={
                                form.overall
                              }
                              onChange={(
                                nota
                              ) =>
                                atualizarFormulario(
                                  booking.id,
                                  "overall",
                                  nota
                                )
                              }
                            />

                            <CampoNota
                              titulo="📋 Organização"
                              valor={
                                form.organization
                              }
                              onChange={(
                                nota
                              ) =>
                                atualizarFormulario(
                                  booking.id,
                                  "organization",
                                  nota
                                )
                              }
                            />

                            <CampoNota
                              titulo="🤝 Profissionalismo"
                              valor={
                                form.professionalism
                              }
                              onChange={(
                                nota
                              ) =>
                                atualizarFormulario(
                                  booking.id,
                                  "professionalism",
                                  nota
                                )
                              }
                            />

                            <CampoNota
                              titulo="🏢 Estrutura da Casa"
                              valor={
                                form.structure
                              }
                              onChange={(
                                nota
                              ) =>
                                atualizarFormulario(
                                  booking.id,
                                  "structure",
                                  nota
                                )
                              }
                            />
                          </div>

                          <div className="mt-5">
                            <label className="mb-2 block text-sm font-bold text-zinc-300">
                              Comentário
                            </label>

                            <textarea
                              rows={4}
                              value={
                                form.comment
                              }
                              onChange={(
                                event
                              ) =>
                                atualizarFormulario(
                                  booking.id,
                                  "comment",
                                  event
                                    .target
                                    .value
                                )
                              }
                              placeholder="Conte como foi trabalhar com esta Casa..."
                              className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm outline-none focus:border-red-500"
                            />
                          </div>

                          <button
                            type="button"
                            disabled={
                              enviandoAvaliacao ===
                              booking.id
                            }
                            onClick={() =>
                              enviarAvaliacao(
                                booking
                              )
                            }
                            className="mt-4 w-full rounded-xl bg-red-500 py-4 font-black hover:bg-red-600 disabled:opacity-50"
                          >
                            {enviandoAvaliacao ===
                            booking.id
                              ? "Enviando..."
                              : "⭐ Enviar avaliação"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
