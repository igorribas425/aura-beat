"use client";

import "leaflet/dist/leaflet.css";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import { useRouter } from "next/navigation";
import {
  createLeafletLifecycle,
  createTrackingRealtimeLifecycle,
} from "../../lib/eventos-casa-lifecycle.mjs";
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

type Casa = {
  id: string;
  trade_name: string;
};

type Artista = {
  id: string;
  stage_name: string;
  base_city: string | null;
  base_state: string | null;
  verification_status: string | null;
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

  platform_fee_venue: number;
  platform_fee_artist: number;
};

type Oferta = {
  id: string;
  title: string | null;
  event_type: string | null;
};

type Tracking = {
  id: number;
  booking_id: string;
  artist_id: string;

  event_type:
    | "location"
    | "trip_started"
    | "arrived"
    | "show_started"
    | "show_ended"
    | "left_venue"
    | "availability_reenabled";

  latitude: number | null;
  longitude: number | null;

  accuracy_m: number | null;

  metadata: Record<string, unknown> | null;

  recorded_at: string;
};

type Avaliacao = {
  id: string;
  booking_id: string;

  overall_rating: number;
  punctuality_rating: number | null;
  professionalism_rating: number | null;
  quality_rating: number | null;

  comment: string | null;
};

type FormAvaliacao = {
  overall: number;
  punctuality: number;
  professionalism: number;
  quality: number;
  comment: string;
};

const FORM_AVALIACAO_VAZIO: FormAvaliacao = {
  overall: 5,
  punctuality: 5,
  professionalism: 5,
  quality: 5,
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

function dataHora(valor: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
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
        texto: "DJ a caminho",
        classe:
          "border-blue-800 bg-blue-950/20 text-blue-400",
      };

    case "arrived":
      return {
        texto: "DJ chegou",
        classe:
          "border-purple-800 bg-purple-950/20 text-purple-400",
      };

    case "in_event":
      return {
        texto: "Evento acontecendo",
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

function trackingTexto(
  eventType: Tracking["event_type"]
) {
  switch (eventType) {
    case "trip_started":
      return "🚗 Deslocamento iniciado";

    case "arrived":
      return "📍 DJ chegou ao local";

    case "show_started":
      return "🎧 Evento iniciado";

    case "show_ended":
      return "✅ Evento finalizado";

    case "location":
      return "📡 Localização atualizada";

    case "left_venue":
      return "🚪 Artista saiu do local";

    case "availability_reenabled":
      return "🟢 Disponibilidade reativada";

    default:
      return eventType;
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

export default function EventosCasaPage() {
  const router = useRouter();

  const mapaElementoRef =
    useRef<HTMLDivElement | null>(null);

  const mapaRef =
    useRef<import("leaflet").Map | null>(
      null
    );

  const camadaRef =
    useRef<import("leaflet").LayerGroup | null>(
      null
    );

  const rotaRef =
    useRef<import("leaflet").Polyline | null>(
      null
    );

  const mapaBookingRef =
    useRef<string | null>(null);

  const mapaGpsEnquadradoRef =
    useRef<string | null>(null);

  const [mapaLifecycle] = useState(() =>
    createLeafletLifecycle({
      getCurrentMap: () => mapaRef.current,
      getCurrentContainer: () =>
        mapaElementoRef.current,
      schedule: (
        callback,
        delay
      ): ReturnType<typeof setTimeout> =>
        setTimeout(callback, delay),
      cancel: (
        timer: ReturnType<
          typeof setTimeout
        >
      ) =>
        clearTimeout(timer),
    })
  );

  const [realtimeLifecycle] = useState(() =>
    createTrackingRealtimeLifecycle({
      createChannel: (topic) =>
        supabase.channel(topic),
      removeChannel: (channel) =>
        supabase.removeChannel(channel),
      onRemoveError: (error) => {
        console.error(
          "Não foi possível remover o canal Realtime:",
          error
        );
      },
    })
  );

  const [casa, setCasa] =
    useState<Casa | null>(null);

  const [bookings, setBookings] = useState<
    Booking[]
  >([]);

  const [artistas, setArtistas] = useState<
    Record<string, Artista>
  >({});

  const [ofertas, setOfertas] = useState<
    Record<string, Oferta>
  >({});

  const [avaliacoes, setAvaliacoes] =
    useState<Record<string, Avaliacao>>(
      {}
    );

  const [formularios, setFormularios] =
    useState<
      Record<string, FormAvaliacao>
    >({});

  const [bookingSelecionado, setBookingSelecionado] =
    useState<string | null>(null);

  const [trackings, setTrackings] = useState<
    Record<string, Tracking[]>
  >({});

  const [carregando, setCarregando] =
    useState(true);

  const [
    enviandoAvaliacao,
    setEnviandoAvaliacao,
  ] = useState<string | null>(null);

  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] =
    useState("");

  const carregarPaginaEffect = useEffectEvent(() => {
    void carregarPagina();
  });

  const limparEventosEffect = useEffectEvent(() => {
    limparMapa();
    limparRealtime();
  });

  const montarMapaEffect = useEffectEvent((booking: Booking) => {
    void montarMapa(booking);
  });

  useEffect(() => {
    carregarPaginaEffect();

    return () => {
      limparEventosEffect();
    };
  }, []);

  useEffect(() => {
    const booking = bookings.find(
      (item) =>
        item.id === bookingSelecionado
    );

    if (!booking) {
      return;
    }

    montarMapaEffect(booking);
  }, [
    bookingSelecionado,
    bookings,
    trackings,
  ]);

  async function carregarPagina() {
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
        data: perfilCasa,
        error: erroCasa,
      } = await supabase
        .from("venue_profiles")
        .select("id, trade_name")
        .eq("owner_user_id", user.id)
        .maybeSingle();

      if (erroCasa) {
        throw erroCasa;
      }

      if (!perfilCasa) {
        router.replace("/perfil-casa");
        return;
      }

      setCasa(perfilCasa);

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
          platform_fee_venue,
          platform_fee_artist
        `)
        .eq("venue_id", perfilCasa.id)
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
        carregarArtistas(lista),
        carregarOfertas(lista),
        carregarAvaliacoes(lista),
        carregarTrackings(lista),
      ]);

      const ativo = lista.find(
        (booking) =>
          [
            "in_transit",
            "arrived",
            "in_event",
          ].includes(booking.status)
      );

      const selecionado =
        ativo ||
        lista.find(
          (booking) =>
            booking.status ===
            "confirmed"
        ) ||
        lista[0];

      if (selecionado) {
        setBookingSelecionado(
          selecionado.id
        );

        ligarRealtime(
          selecionado.id
        );
      }
    } catch (error) {
      console.error(error);

      setErro(
        "Não foi possível carregar os eventos da Casa."
      );
    } finally {
      setCarregando(false);
    }
  }

  async function carregarArtistas(
    lista: Booking[]
  ) {
    const ids = [
      ...new Set(
        lista.map(
          (booking) =>
            booking.artist_id
        )
      ),
    ];

    if (ids.length === 0) {
      setArtistas({});
      return;
    }

    const { data, error } =
      await supabase
        .from("artist_profiles")
        .select(`
          id,
          stage_name,
          base_city,
          base_state,
          verification_status
        `)
        .in("id", ids);

    if (error) {
      console.error(error);
      return;
    }

    const mapa: Record<
      string,
      Artista
    > = {};

    (data || []).forEach(
      (artista) => {
        mapa[artista.id] =
          artista as Artista;
      }
    );

    setArtistas(mapa);
  }

  async function carregarOfertas(
    lista: Booking[]
  ) {
    const ids = [
      ...new Set(
        lista
          .map(
            (booking) =>
              booking.offer_id
          )
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

    const { data, error } =
      await supabase
        .from("offers")
        .select(
          "id, title, event_type"
        )
        .in("id", ids);

    if (error) {
      console.error(error);
      return;
    }

    const mapa: Record<
      string,
      Oferta
    > = {};

    (data || []).forEach(
      (oferta) => {
        mapa[oferta.id] =
          oferta as Oferta;
      }
    );

    setOfertas(mapa);
  }

  async function carregarAvaliacoes(
    lista: Booking[]
  ) {
    const concluidos = lista
      .filter(
        (booking) =>
          booking.status ===
          "completed"
      )
      .map(
        (booking) =>
          booking.id
      );

    if (concluidos.length === 0) {
      setAvaliacoes({});
      return;
    }

    const { data, error } =
      await supabase
        .from("reviews")
        .select(`
          id,
          booking_id,
          overall_rating,
          punctuality_rating,
          professionalism_rating,
          quality_rating,
          comment
        `)
        .eq(
          "reviewee_type",
          "artist"
        )
        .in(
          "booking_id",
          concluidos
        );

    if (error) {
      console.error(error);
      return;
    }

    const mapa: Record<
      string,
      Avaliacao
    > = {};

    (data || []).forEach(
      (avaliacao) => {
        mapa[
          avaliacao.booking_id
        ] =
          avaliacao as Avaliacao;
      }
    );

    setAvaliacoes(mapa);
  }

  async function carregarTrackings(
    lista: Booking[]
  ) {
    const ids = lista.map(
      (booking) =>
        booking.id
    );

    if (ids.length === 0) {
      setTrackings({});
      return;
    }

    const { data, error } =
      await supabase
        .from("booking_tracking")
        .select(`
          id,
          booking_id,
          artist_id,
          event_type,
          latitude,
          longitude,
          accuracy_m,
          metadata,
          recorded_at
        `)
        .in("booking_id", ids)
        .order("recorded_at", {
          ascending: true,
        });

    if (error) {
      console.error(
        "Erro ao carregar GPS:",
        error
      );

      return;
    }

    const mapa: Record<
      string,
      Tracking[]
    > = {};

    (data || []).forEach(
      (tracking) => {
        if (
          !mapa[
            tracking.booking_id
          ]
        ) {
          mapa[
            tracking.booking_id
          ] = [];
        }

        mapa[
          tracking.booking_id
        ].push(
          tracking as Tracking
        );
      }
    );

    setTrackings(mapa);
  }

  async function atualizarTracking(
    bookingId: string
  ) {
    const { data, error } =
      await supabase
        .from("booking_tracking")
        .select(`
          id,
          booking_id,
          artist_id,
          event_type,
          latitude,
          longitude,
          accuracy_m,
          metadata,
          recorded_at
        `)
        .eq(
          "booking_id",
          bookingId
        )
        .order("recorded_at", {
          ascending: true,
        });

    if (error) {
      console.error(error);
      return;
    }

    setTrackings(
      (anterior) => ({
        ...anterior,

        [bookingId]:
          (data ||
            []) as Tracking[],
      })
    );
  }

  async function atualizarStatusBooking(
    bookingId: string
  ) {
    const { data, error } =
      await supabase
        .from("bookings")
        .select("id, status")
        .eq("id", bookingId)
        .maybeSingle();

    if (error) {
      console.error(
        "Erro ao atualizar status do evento:",
        error
      );
      return;
    }

    if (!data) {
      return;
    }

    setBookings((anteriores) =>
      anteriores.map((booking) =>
        booking.id === data.id
          ? {
              ...booking,
              status:
                data.status as BookingStatus,
            }
          : booking
      )
    );
  }

  function limparRealtime() {
    realtimeLifecycle.clear();
  }

  function ligarRealtime(
    bookingId: string
  ) {
    realtimeLifecycle.subscribe(
      bookingId,
      async () => {
        await Promise.all([
          atualizarTracking(
            bookingId
          ),
          atualizarStatusBooking(
            bookingId
          ),
        ]);
      }
    );
  }

  async function selecionarBooking(
    bookingId: string
  ) {
    setBookingSelecionado(
      bookingId
    );

    ligarRealtime(
      bookingId
    );

    await atualizarTracking(
      bookingId
    );
  }

  function limparMapa() {
    mapaLifecycle.reset();

    const mapa = mapaRef.current;

    mapaRef.current = null;

    camadaRef.current =
      null;

    rotaRef.current =
      null;

    mapaBookingRef.current =
      null;

    mapaGpsEnquadradoRef.current =
      null;

    mapa?.remove();
  }

  async function buscarRota(
    origem: {
      lat: number;
      lng: number;
    },
    destino: {
      lat: number;
      lng: number;
    }
  ) {
    try {
      const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${origem.lng},${origem.lat};` +
        `${destino.lng},${destino.lat}` +
        `?overview=full&geometries=geojson`;

      const resposta =
        await fetch(url);

      if (!resposta.ok) {
        return null;
      }

      const json =
        await resposta.json();

      const rota =
        json?.routes?.[0];

      if (!rota?.geometry?.coordinates) {
        return null;
      }

      const pontos = rota.geometry.coordinates.map(
        (
          ponto: [
            number,
            number
          ]
        ) => [
          ponto[1],
          ponto[0],
        ] as [
          number,
          number
        ]
      );

      return {
        pontos,
        distanciaMetros:
          Number(
            rota.distance || 0
          ),

        duracaoSegundos:
          Number(
            rota.duration || 0
          ),
      };
    } catch (error) {
      console.error(
        "Rota indisponível:",
        error
      );

      return null;
    }
  }

  async function montarMapa(
    booking: Booking
  ) {
    const bookingMudou =
      mapaBookingRef.current !==
      booking.id;

    if (bookingMudou) {
      mapaBookingRef.current =
        booking.id;

      mapaGpsEnquadradoRef.current =
        null;
    }

    const elementoMapa =
      mapaElementoRef.current;

    if (!elementoMapa?.isConnected) {
      return;
    }

    if (
      mapaRef.current &&
      mapaRef.current.getContainer() !==
        elementoMapa
    ) {
      limparMapa();
    }

    const renderId =
      mapaLifecycle.begin();

    const L =
      await import("leaflet");

    if (
      !mapaLifecycle.isCurrentContainer(
        renderId,
        elementoMapa
      )
    ) {
      return;
    }

    if (!mapaRef.current) {
      mapaRef.current = L.map(
        elementoMapa,
        {
          zoomControl: true,
        }
      );

      L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution:
            "&copy; OpenStreetMap",
        }
      ).addTo(
        mapaRef.current
      );

      camadaRef.current =
        L.layerGroup().addTo(
          mapaRef.current
        );
    }

    const mapa =
      mapaRef.current;

    const camada =
      camadaRef.current;

    if (
      !mapa ||
      !camada ||
      !mapaLifecycle.isCurrentMap(
        renderId,
        mapa,
        elementoMapa
      )
    ) {
      return;
    }

    camada.clearLayers();

    if (rotaRef.current) {
      rotaRef.current.remove();
      rotaRef.current =
        null;
    }

    const listaTracking =
      trackings[
        booking.id
      ] || [];

    const pontosComGps =
      listaTracking.filter(
        (tracking) =>
          tracking.latitude !==
            null &&
          tracking.longitude !==
            null
      );

    const ultimo =
      pontosComGps[
        pontosComGps.length - 1
      ];

    const destinoValido =
      booking.event_latitude !==
        null &&
      booking.event_longitude !==
        null;

    const pontosMapa: [
      number,
      number
    ][] = [];

    if (destinoValido) {
      const destino: [
        number,
        number
      ] = [
        Number(
          booking.event_latitude
        ),
        Number(
          booking.event_longitude
        ),
      ];

      pontosMapa.push(
        destino
      );

      const iconeEvento =
        L.divIcon({
          html: `
            <div style="
              width:42px;
              height:42px;
              display:flex;
              align-items:center;
              justify-content:center;
              border-radius:14px;
              background:#ef233c;
              border:3px solid white;
              box-shadow:0 8px 25px rgba(0,0,0,.4);
              font-size:20px;
            ">
              🏢
            </div>
          `,
          className: "",
          iconSize: [42, 42],
          iconAnchor: [
            21,
            21,
          ],
        });

      L.marker(
        destino,
        {
          icon: iconeEvento,
        }
      )
        .addTo(camada)
        .bindPopup(
          `<strong>Local do evento</strong><br>${booking.event_address_snapshot || ""}`
        );
    }

    if (ultimo) {
      const origem: [
        number,
        number
      ] = [
        Number(
          ultimo.latitude
        ),
        Number(
          ultimo.longitude
        ),
      ];

      pontosMapa.push(
        origem
      );

      const iconeDj =
        L.divIcon({
          html: `
            <div style="
              width:46px;
              height:46px;
              display:flex;
              align-items:center;
              justify-content:center;
              border-radius:50%;
              background:linear-gradient(135deg,#ef233c,#7c3aed);
              border:3px solid white;
              box-shadow:0 8px 25px rgba(0,0,0,.45);
              color:white;
              font-size:17px;
              font-weight:900;
            ">
              DJ
            </div>
          `,
          className: "",
          iconSize: [
            46,
            46,
          ],
          iconAnchor: [
            23,
            23,
          ],
        });

      L.marker(
        origem,
        {
          icon: iconeDj,
        }
      )
        .addTo(camada)
        .bindPopup(
          `<strong>Localização do DJ</strong><br>${dataHora(
            ultimo.recorded_at
          )}`
        );

      if (destinoValido) {
        const resultado =
          await buscarRota(
            {
              lat:
                origem[0],
              lng:
                origem[1],
            },
            {
              lat: Number(
                booking.event_latitude
              ),
              lng: Number(
                booking.event_longitude
              ),
            }
          );

        if (
          !mapaLifecycle.isCurrentMap(
            renderId,
            mapa,
            elementoMapa
          )
        ) {
          return;
        }

        if (
          resultado &&
          resultado.pontos.length >
            0
        ) {
          rotaRef.current =
            L.polyline(
              resultado.pontos,
              {
                weight: 5,
                opacity: 0.9,
              }
            ).addTo(mapa);
        } else {
          rotaRef.current =
            L.polyline(
              [
                origem,

                [
                  Number(
                    booking.event_latitude
                  ),

                  Number(
                    booking.event_longitude
                  ),
                ],
              ],

              {
                weight: 4,
                dashArray: "8 8",
                opacity: 0.7,
              }
            ).addTo(mapa);
        }
      }
    }

    const deveEnquadrarPrimeiroGps =
      Boolean(ultimo) &&
      mapaGpsEnquadradoRef.current !==
        booking.id;

    if (
      deveEnquadrarPrimeiroGps
    ) {
      if (
        pontosMapa.length >= 2
      ) {
        mapa.fitBounds(
          pontosMapa,
          {
            padding: [
              50,
              50,
            ],
            maxZoom: 14,
          }
        );
      } else if (
        pontosMapa.length === 1
      ) {
        mapa.setView(
          pontosMapa[0],
          14
        );
      }

      mapaGpsEnquadradoRef.current =
        booking.id;
    } else if (
      bookingMudou &&
      !ultimo
    ) {
      if (
        pontosMapa.length === 1
      ) {
        mapa.setView(
          pontosMapa[0],
          14
        );
      } else if (
        pontosMapa.length === 0
      ) {
        mapa.setView(
          [
            -28.2834,
            -52.7864,
          ],
          11
        );
      }
    }

    mapaLifecycle.scheduleInvalidate(
      renderId,
      mapa,
      elementoMapa,
      100
    );
  }

  function recentrarMapa(
    booking: Booking
  ) {
    const mapa =
      mapaRef.current;

    if (!mapa) {
      return;
    }

    const listaTracking =
      trackings[
        booking.id
      ] || [];

    const ultimo =
      [...listaTracking]
        .reverse()
        .find(
          (tracking) =>
            tracking.latitude !==
              null &&
            tracking.longitude !==
              null
        );

    const pontos: [
      number,
      number
    ][] = [];

    if (
      booking.event_latitude !==
        null &&
      booking.event_longitude !==
        null
    ) {
      pontos.push([
        Number(
          booking.event_latitude
        ),
        Number(
          booking.event_longitude
        ),
      ]);
    }

    if (ultimo) {
      pontos.push([
        Number(
          ultimo.latitude
        ),
        Number(
          ultimo.longitude
        ),
      ]);
    }

    if (pontos.length >= 2) {
      mapa.fitBounds(
        pontos,
        {
          padding: [
            50,
            50,
          ],
          maxZoom: 14,
        }
      );
    } else if (
      pontos.length === 1
    ) {
      mapa.setView(
        pontos[0],
        14
      );
    }

    if (ultimo) {
      mapaGpsEnquadradoRef.current =
        booking.id;
    }
  }

  function formularioAvaliacao(
    bookingId: string
  ) {
    return (
      formularios[
        bookingId
      ] || {
        ...FORM_AVALIACAO_VAZIO,
      }
    );
  }

  function atualizarFormulario(
    bookingId: string,
    campo: keyof FormAvaliacao,
    valor: string | number
  ) {
    setFormularios(
      (anterior) => ({
        ...anterior,

        [bookingId]: {
          ...(
            anterior[
              bookingId
            ] || {
              ...FORM_AVALIACAO_VAZIO,
            }
          ),

          [campo]: valor,
        },
      })
    );
  }

  async function enviarAvaliacao(
    booking: Booking
  ) {
    const form =
      formularioAvaliacao(
        booking.id
      );

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
              "artist",

            p_overall_rating:
              form.overall,

            p_punctuality_rating:
              form.punctuality,

            p_professionalism_rating:
              form.professionalism,

            p_quality_rating:
              form.quality,

            p_organization_rating:
              null,

            p_comment:
              form.comment.trim() ||
              null,
          }
        );

      if (error) {
        throw error;
      }

      setMensagem(
        "Avaliação do artista enviada com sucesso."
      );

      await carregarAvaliacoes(
        bookings
      );
    } catch (error) {
      console.error(error);

      setErro(
        "Não foi possível enviar a avaliação."
      );
    } finally {
      setEnviandoAvaliacao(
        null
      );
    }
  }

  function abrirWaze(
    booking: Booking
  ) {
    if (
      booking.event_latitude !==
        null &&
      booking.event_longitude !==
        null
    ) {
      window.open(
        `https://waze.com/ul?ll=${booking.event_latitude},${booking.event_longitude}&navigate=yes`,
        "_blank",
        "noopener,noreferrer"
      );

      return;
    }

    window.open(
      `https://waze.com/ul?q=${encodeURIComponent(
        booking.event_address_snapshot ||
          ""
      )}&navigate=yes`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  function abrirMaps(
    booking: Booking
  ) {
    let destino =
      booking.event_address_snapshot ||
      "";

    if (
      booking.event_latitude !==
        null &&
      booking.event_longitude !==
        null
    ) {
      destino =
        `${booking.event_latitude},${booking.event_longitude}`;
    }

    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
        destino
      )}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  if (carregando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050507] text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-zinc-800 border-t-red-500" />

          <p className="text-zinc-400">
            Carregando eventos...
          </p>
        </div>
      </main>
    );
  }

  const selecionado =
    bookings.find(
      (booking) =>
        booking.id ===
        bookingSelecionado
    ) || null;

  const trackingsSelecionado =
    selecionado
      ? trackings[
          selecionado.id
        ] || []
      : [];

  const ultimoGps =
    [...trackingsSelecionado]
      .reverse()
      .find(
        (tracking) =>
          tracking.latitude !==
            null &&
          tracking.longitude !==
            null
      ) || null;

  return (
    <main className="min-h-screen bg-[#050507] pb-24 text-white">
      <header className="border-b border-zinc-900 bg-black/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xl font-black">
              AURA{" "}
              <span className="text-red-500">
                BEAT
              </span>
            </p>

            <p className="text-xs text-zinc-500">
              Eventos da Casa
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              router.push(
                "/home-casa"
              )
            }
            className="rounded-xl border border-zinc-800 px-4 py-2 text-sm font-bold text-zinc-300 hover:bg-zinc-900"
          >
            ← Home
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-7">
        <section className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-950 via-zinc-950 to-red-950/20 p-6">
          <p className="text-sm font-black text-red-500">
            CONTRATAÇÕES
          </p>

          <h1 className="mt-2 text-3xl font-black">
            {casa?.trade_name ||
              "Sua Casa"}
          </h1>

          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            Acompanhe os artistas
            contratados, o deslocamento
            em tempo real e os eventos
            finalizados.
          </p>
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
              Nenhuma contratação
            </h2>

            <p className="mt-2 text-sm text-zinc-500">
              Quando uma oferta for
              aceita e virar
              contratação, ela aparecerá
              aqui.
            </p>
          </section>
        ) : (
          <>
            <section className="grid gap-4 lg:grid-cols-3">
              {bookings.map(
                (booking) => {
                  const artista =
                    artistas[
                      booking.artist_id
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

                  const ativo =
                    booking.id ===
                    bookingSelecionado;

                  return (
                    <button
                      key={
                        booking.id
                      }
                      type="button"
                      onClick={() =>
                        selecionarBooking(
                          booking.id
                        )
                      }
                      className={`rounded-2xl border p-5 text-left transition ${
                        ativo
                          ? "border-red-500 bg-red-950/20"
                          : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
                      }`}
                    >
                      <div
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${status.classe}`}
                      >
                        {
                          status.texto
                        }
                      </div>

                      <h2 className="mt-4 text-xl font-black">
                        {artista?.stage_name ||
                          "Artista"}
                      </h2>

                      <p className="mt-1 text-sm text-zinc-400">
                        {oferta?.title ||
                          oferta?.event_type ||
                          "Evento Aura Beat"}
                      </p>

                      <p className="mt-3 text-xs text-zinc-600">
                        📅{" "}
                        {dataEvento(
                          booking.starts_at
                        )}
                      </p>
                    </button>
                  );
                }
              )}
            </section>

            {selecionado && (
              <>
                <section className="grid gap-6 xl:grid-cols-[1.6fr_0.8fr]">
                  <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950">
                    <div className="border-b border-zinc-900 p-5">
                      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                        <div>
                          <p className="text-sm font-black text-red-500">
                            GPS DO ARTISTA
                          </p>

                          <h2 className="mt-1 text-xl font-black">
                            {
                              artistas[
                                selecionado.artist_id
                              ]?.stage_name
                            }
                          </h2>
                        </div>

                        {ultimoGps ? (
                          <div className="rounded-xl border border-green-900 bg-green-950/20 px-4 py-2 text-xs text-green-400">
                            ● Última posição{" "}
                            {dataHora(
                              ultimoGps.recorded_at
                            )}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-zinc-800 bg-black px-4 py-2 text-xs text-zinc-500">
                            GPS ainda sem
                            posição
                          </div>
                        )}
                      </div>
                    </div>

                    <div
                      ref={
                        mapaElementoRef
                      }
                      className="h-[420px] w-full"
                    />

                    <div className="grid gap-3 border-t border-zinc-900 p-5 sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={() =>
                          recentrarMapa(
                            selecionado
                          )
                        }
                        disabled={!ultimoGps}
                        className="rounded-xl border border-zinc-700 py-3 text-sm font-bold hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        🎯 Recentrar no DJ
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          abrirWaze(
                            selecionado
                          )
                        }
                        className="rounded-xl border border-zinc-700 py-3 text-sm font-bold hover:bg-zinc-900"
                      >
                        🚙 Abrir Waze
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          abrirMaps(
                            selecionado
                          )
                        }
                        className="rounded-xl border border-zinc-700 py-3 text-sm font-bold hover:bg-zinc-900"
                      >
                        🗺️ Google Maps
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
                      <p className="text-xs font-black text-zinc-600">
                        EVENTO
                      </p>

                      <h2 className="mt-2 text-xl font-black">
                        {ofertas[
                          selecionado.offer_id ||
                            ""
                        ]?.title ||
                          ofertas[
                            selecionado.offer_id ||
                              ""
                          ]?.event_type ||
                          "Contratação"}
                      </h2>

                      <div className="mt-4 space-y-3 text-sm">
                        <div>
                          <span className="text-zinc-600">
                            Artista
                          </span>

                          <p className="font-bold">
                            {artistas[
                              selecionado.artist_id
                            ]?.stage_name ||
                              "Artista"}
                          </p>
                        </div>

                        <div>
                          <span className="text-zinc-600">
                            Data
                          </span>

                          <p className="font-bold">
                            {dataEvento(
                              selecionado.starts_at
                            )}
                          </p>
                        </div>

                        <div>
                          <span className="text-zinc-600">
                            Duração
                          </span>

                          <p className="font-bold">
                            {duracaoEvento(
                              selecionado.duration_minutes
                            )}
                          </p>
                        </div>

                        <div>
                          <span className="text-zinc-600">
                            Endereço
                          </span>

                          <p className="font-bold">
                            {selecionado.event_address_snapshot ||
                              "Não informado"}
                          </p>
                        </div>
                      </div>
                    </section>

                    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
                      <p className="text-xs font-black text-zinc-600">
                        STATUS
                      </p>

                      <div
                        className={`mt-3 inline-flex rounded-full border px-3 py-2 text-sm font-black ${
                          statusInfo(
                            selecionado.status
                          ).classe
                        }`}
                      >
                        {
                          statusInfo(
                            selecionado.status
                          ).texto
                        }
                      </div>

                      <div className="mt-5 space-y-3">
                        {[
                          "confirmed",
                          "in_transit",
                          "arrived",
                          "in_event",
                          "completed",
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
                                selecionado.status
                              );

                            const posicao =
                              ordem.indexOf(
                                etapa as BookingStatus
                              );

                            const concluida =
                              atual >=
                              posicao;

                            const nomes: Record<
                              string,
                              string
                            > = {
                              confirmed:
                                "Confirmado",

                              in_transit:
                                "A caminho",

                              arrived:
                                "Chegou",

                              in_event:
                                "Em evento",

                              completed:
                                "Finalizado",
                            };

                            return (
                              <div
                                key={
                                  etapa
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
                                    nomes[
                                      etapa
                                    ]
                                  }
                                </span>
                              </div>
                            );
                          }
                        )}
                      </div>
                    </section>
                  </div>
                </section>

                <section className="grid gap-6 lg:grid-cols-2">
                  <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
                    <p className="text-xs font-black text-zinc-600">
                      HISTÓRICO DO EVENTO
                    </p>

                    <div className="mt-5 space-y-3">
                      {trackingsSelecionado.length ===
                      0 ? (
                        <div className="rounded-2xl border border-zinc-800 bg-black/40 p-5 text-sm text-zinc-500">
                          Nenhuma atualização de
                          GPS recebida ainda.
                        </div>
                      ) : (
                        [...trackingsSelecionado]
                          .reverse()
                          .slice(0, 10)
                          .map(
                            (
                              tracking
                            ) => (
                              <div
                                key={
                                  tracking.id
                                }
                                className="rounded-2xl border border-zinc-800 bg-black/40 p-4"
                              >
                                <p className="font-bold">
                                  {trackingTexto(
                                    tracking.event_type
                                  )}
                                </p>

                                <p className="mt-1 text-xs text-zinc-600">
                                  {dataHora(
                                    tracking.recorded_at
                                  )}
                                </p>
                              </div>
                            )
                          )
                      )}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
                    <p className="text-xs font-black text-zinc-600">
                      RESUMO FINANCEIRO
                    </p>

                    <div className="mt-5 space-y-4 text-sm">
                      <div className="flex justify-between">
                        <span className="text-zinc-500">
                          Cachê
                        </span>

                        <strong>
                          {dinheiro(
                            selecionado.agreed_fee
                          )}
                        </strong>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-zinc-500">
                          Deslocamento
                        </span>

                        <strong>
                          {dinheiro(
                            selecionado.travel_amount
                          )}
                        </strong>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-zinc-500">
                          Pedágios
                        </span>

                        <strong>
                          {dinheiro(
                            selecionado.toll_amount
                          )}
                        </strong>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-zinc-500">
                          Hospedagem
                        </span>

                        <strong>
                          {dinheiro(
                            selecionado.lodging_amount
                          )}
                        </strong>
                      </div>

                      <div className="flex justify-between text-red-400">
                        <span>
                          Taxa Aura Beat
                        </span>

                        <strong>
                          {dinheiro(
                            selecionado.platform_fee_venue
                          )}
                        </strong>
                      </div>

                      <div className="border-t border-zinc-800 pt-4">
                        <div className="flex items-end justify-between gap-4">
                          <span className="font-bold">
                            Total da Casa
                          </span>

                          <strong className="text-2xl text-green-400">
                            {dinheiro(
                              Number(
                                selecionado.agreed_fee ||
                                  0
                              ) +
                                Number(
                                  selecionado.travel_amount ||
                                    0
                                ) +
                                Number(
                                  selecionado.toll_amount ||
                                    0
                                ) +
                                Number(
                                  selecionado.lodging_amount ||
                                    0
                                ) +
                                Number(
                                  selecionado.platform_fee_venue ||
                                    0
                                )
                            )}
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {selecionado.status ===
                  "awaiting_payment" && (
                  <section className="rounded-3xl border border-green-900/60 bg-green-950/10 p-6">
                    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                      <div>
                        <p className="text-sm font-black uppercase tracking-wider text-green-400">
                          Pagamento pendente
                        </p>

                        <h2 className="mt-2 text-xl font-black">
                          Finalize a contratação com Pix
                        </h2>

                        <p className="mt-2 text-sm text-zinc-400">
                          O valor final, incluindo a Taxa Aura Beat, aparece antes de gerar o QR Code.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          router.push(
                            `/pagamento/${selecionado.id}`
                          )
                        }
                        className="rounded-2xl bg-green-600 px-6 py-3 font-black text-white transition hover:bg-green-500"
                      >
                        Pagar com Pix
                      </button>
                    </div>
                  </section>
                )}

                {selecionado.status ===
                  "completed" && (
                  <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
                    {avaliacoes[
                      selecionado.id
                    ] ? (
                      <div className="rounded-2xl border border-green-900 bg-green-950/20 p-5">
                        <p className="font-black text-green-400">
                          ✓ AVALIAÇÃO ENVIADA
                        </p>

                        <p className="mt-2 text-sm text-zinc-400">
                          Nota geral:{" "}
                          <strong className="text-white">
                            {
                              avaliacoes[
                                selecionado.id
                              ]
                                .overall_rating
                            }
                            /5
                          </strong>
                        </p>

                        {avaliacoes[
                          selecionado.id
                        ].comment && (
                          <p className="mt-3 text-sm italic text-zinc-500">
                            “
                            {
                              avaliacoes[
                                selecionado.id
                              ].comment
                            }
                            ”
                          </p>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="mb-5 rounded-2xl border border-yellow-800 bg-yellow-950/20 p-4">
                          <p className="font-black text-yellow-300">
                            ⭐ Evento finalizado!
                          </p>
                          <p className="mt-1 text-sm text-yellow-100/80">
                            Lembre-se de avaliar o Artista. A avaliação dos dois lados ajuda a manter a confiança e a qualidade na Aura Beat.
                          </p>
                        </div>

                        <p className="text-sm font-black text-red-500">
                          AVALIAR ARTISTA
                        </p>

                        <h2 className="mt-1 text-2xl font-black">
                          Como foi trabalhar com{" "}
                          {artistas[
                            selecionado.artist_id
                          ]?.stage_name ||
                            "este artista"}
                          ?
                        </h2>

                        <p className="mt-2 text-sm text-zinc-500">
                          Sua avaliação ajuda a
                          manter a qualidade dos
                          profissionais da Aura
                          Beat.
                        </p>

                        <div className="mt-6 grid gap-6 md:grid-cols-2">
                          <CampoNota
                            titulo="⭐ Nota geral"
                            valor={
                              formularioAvaliacao(
                                selecionado.id
                              ).overall
                            }
                            onChange={(
                              nota
                            ) =>
                              atualizarFormulario(
                                selecionado.id,
                                "overall",
                                nota
                              )
                            }
                          />

                          <CampoNota
                            titulo="⏱️ Pontualidade"
                            valor={
                              formularioAvaliacao(
                                selecionado.id
                              ).punctuality
                            }
                            onChange={(
                              nota
                            ) =>
                              atualizarFormulario(
                                selecionado.id,
                                "punctuality",
                                nota
                              )
                            }
                          />

                          <CampoNota
                            titulo="🤝 Profissionalismo"
                            valor={
                              formularioAvaliacao(
                                selecionado.id
                              )
                                .professionalism
                            }
                            onChange={(
                              nota
                            ) =>
                              atualizarFormulario(
                                selecionado.id,
                                "professionalism",
                                nota
                              )
                            }
                          />

                          <CampoNota
                            titulo="🎧 Qualidade da apresentação"
                            valor={
                              formularioAvaliacao(
                                selecionado.id
                              ).quality
                            }
                            onChange={(
                              nota
                            ) =>
                              atualizarFormulario(
                                selecionado.id,
                                "quality",
                                nota
                              )
                            }
                          />
                        </div>

                        <div className="mt-6">
                          <label className="mb-2 block text-sm font-bold text-zinc-300">
                            Comentário
                          </label>

                          <textarea
                            rows={4}
                            value={
                              formularioAvaliacao(
                                selecionado.id
                              ).comment
                            }
                            onChange={(
                              event
                            ) =>
                              atualizarFormulario(
                                selecionado.id,
                                "comment",
                                event.target
                                  .value
                              )
                            }
                            placeholder="Conte como foi o trabalho do artista..."
                            className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm outline-none focus:border-red-500"
                          />
                        </div>

                        <button
                          type="button"
                          disabled={
                            enviandoAvaliacao ===
                            selecionado.id
                          }
                          onClick={() =>
                            enviarAvaliacao(
                              selecionado
                            )
                          }
                          className="mt-5 w-full rounded-xl bg-red-500 py-4 font-black hover:bg-red-600 disabled:opacity-50"
                        >
                          {enviandoAvaliacao ===
                          selecionado.id
                            ? "Enviando..."
                            : "⭐ Enviar avaliação"}
                        </button>
                      </>
                    )}
                  </section>
                )}
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
