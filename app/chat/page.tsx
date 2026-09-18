"use client";

import {
  FormEvent,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";

import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type ModoPerfil = "artist" | "venue";

type Artista = {
  id: string;
  user_id: string;
  stage_name: string;
};

type Casa = {
  id: string;
  owner_user_id: string;
  trade_name: string;
};

type Booking = {
  id: string;
  offer_id: string | null;
  venue_id: string;
  artist_id: string;
  status: string;
  starts_at: string;
  event_address_snapshot: string | null;
  contact_unlocked: boolean;
};

type Conversa = {
  id: string;
  offer_id: string | null;
  booking_id: string | null;
  venue_id: string;
  artist_id: string;
  created_at: string;
};

type MetadataMensagem = {
  sender_role?: ModoPerfil;
  [key: string]: unknown;
};

type Mensagem = {
  id: string;
  conversation_id: string;
  sender_user_id: string;

  message_type:
    | "text"
    | "audio"
    | "image"
    | "file"
    | "system"
    | "proposal"
    | "counterproposal"
    | "schedule_change";

  body: string | null;
  attachment_path: string | null;
  metadata: MetadataMensagem | null;
  read_at: string | null;
  created_at: string;
};

type ConversaVisual = Conversa & {
  nomeOutro: string;
  booking: Booking | null;
  ultimaMensagem: Mensagem | null;
};

function dataHora(valor: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(valor));
}

function somenteHora(valor: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(valor));
}

function statusBooking(status: string) {
  switch (status) {
    case "awaiting_payment":
      return "Aguardando pagamento";

    case "confirmed":
      return "Confirmado";

    case "in_transit":
      return "DJ a caminho";

    case "arrived":
      return "DJ no local";

    case "in_event":
      return "Evento acontecendo";

    case "completed":
      return "Finalizado";

    case "cancelled":
      return "Cancelado";

    case "disputed":
      return "Em análise";

    default:
      return status;
  }
}

function temContatoExterno(texto: string) {
  const email =
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

  const telefone =
    /(?:\+?55\s*)?(?:\(?\d{2}\)?[\s.-]*)?(?:9?\d{4})[\s.-]?\d{4}/;

  const whatsapp =
    /\b(?:whats|whatsapp|zap)\b/i;

  const instagram =
    /(?:instagram\.com|@\w{3,})/i;

  return (
    email.test(texto) ||
    telefone.test(texto) ||
    whatsapp.test(texto) ||
    instagram.test(texto)
  );
}

export default function ChatPage() {
  const router = useRouter();

  const fimMensagensRef =
    useRef<HTMLDivElement | null>(null);

  const [userId, setUserId] =
    useState("");

  const [artista, setArtista] =
    useState<Artista | null>(null);

  const [casa, setCasa] =
    useState<Casa | null>(null);

  const [modo, setModo] =
    useState<ModoPerfil>("artist");

  const [conversas, setConversas] =
    useState<ConversaVisual[]>([]);

  const [
    conversaSelecionadaId,
    setConversaSelecionadaId,
  ] = useState<string | null>(null);

  const [mensagens, setMensagens] =
    useState<Mensagem[]>([]);

  const [texto, setTexto] =
    useState("");

  const [carregando, setCarregando] =
    useState(true);

  const [
    carregandoMensagens,
    setCarregandoMensagens,
  ] = useState(false);

  const [enviando, setEnviando] =
    useState(false);

  const [erro, setErro] =
    useState("");

  const [busca, setBusca] =
    useState("");

  const [
    outroDigitando,
    setOutroDigitando,
  ] = useState(false);

  const canalDigitandoRef =
    useRef<
      ReturnType<
        typeof supabase.channel
      > | null
    >(null);

  const pararDigitandoRef =
    useRef<
      ReturnType<
        typeof setTimeout
      > | null
    >(null);

  const ocultarDigitandoRef =
    useRef<
      ReturnType<
        typeof setTimeout
      > | null
    >(null);

  const ultimoAvisoDigitandoRef =
    useRef(0);

  const iniciarEffect = useEffectEvent(() => {
    void iniciar();
  });

  const carregarConversasEffect = useEffectEvent(
    (modoAtual: ModoPerfil) => {
      void carregarConversas(modoAtual);
    }
  );

  useEffect(() => {
    iniciarEffect();
  }, []);

  useEffect(() => {
    if (!userId) return;

    if (
      modo === "artist" &&
      !artista?.id
    ) {
      return;
    }

    if (
      modo === "venue" &&
      !casa?.id
    ) {
      return;
    }

    carregarConversasEffect(modo);
  }, [
    modo,
    userId,
    artista?.id,
    casa?.id,
  ]);

  useEffect(() => {
    if (!conversaSelecionadaId) {
      setMensagens([]);
      setOutroDigitando(false);
      canalDigitandoRef.current =
        null;
      return;
    }

    void carregarMensagens(
      conversaSelecionadaId
    );

    const canal = supabase
      .channel(
        `chat-${conversaSelecionadaId}`,
        {
          config: {
            broadcast: {
              self: false,
            },
          },
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversaSelecionadaId}`,
        },
        (payload) => {
          const nova =
            payload.new as Mensagem;

          setMensagens(
            (anteriores) => {
              const existe =
                anteriores.some(
                  (mensagem) =>
                    mensagem.id ===
                    nova.id
                );

              if (existe) {
                return anteriores;
              }

              return [
                ...anteriores,
                nova,
              ];
            }
          );

          setConversas(
            (anteriores) =>
              anteriores.map(
                (conversa) =>
                  conversa.id ===
                  conversaSelecionadaId
                    ? {
                        ...conversa,
                        ultimaMensagem:
                          nova,
                      }
                    : conversa
              )
          );

          if (
            nova.sender_user_id !==
            userId
          ) {
            void marcarConversaComoLida(
              conversaSelecionadaId
            );
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversaSelecionadaId}`,
        },
        (payload) => {
          const atualizada =
            payload.new as Mensagem;

          setMensagens(
            (anteriores) =>
              anteriores.map(
                (mensagem) =>
                  mensagem.id ===
                  atualizada.id
                    ? atualizada
                    : mensagem
              )
          );

          setConversas(
            (anteriores) =>
              anteriores.map(
                (conversa) =>
                  conversa.id ===
                    conversaSelecionadaId &&
                  conversa
                    .ultimaMensagem
                    ?.id ===
                    atualizada.id
                    ? {
                        ...conversa,
                        ultimaMensagem:
                          atualizada,
                      }
                    : conversa
              )
          );
        }
      )
      .on(
        "broadcast",
        {
          event: "typing",
        },
        ({ payload }) => {
          const status =
            payload as {
              user_id?: string;
              typing?: boolean;
            };

          if (
            !status.user_id ||
            status.user_id === userId
          ) {
            return;
          }

          if (
            ocultarDigitandoRef.current
          ) {
            clearTimeout(
              ocultarDigitandoRef.current
            );
          }

          setOutroDigitando(
            Boolean(status.typing)
          );

          if (status.typing) {
            ocultarDigitandoRef.current =
              setTimeout(() => {
                setOutroDigitando(false);
              }, 2600);
          }
        }
      );

    canalDigitandoRef.current =
      canal;

    canal.subscribe();

    return () => {
      if (
        pararDigitandoRef.current
      ) {
        clearTimeout(
          pararDigitandoRef.current
        );
      }

      if (
        ocultarDigitandoRef.current
      ) {
        clearTimeout(
          ocultarDigitandoRef.current
        );
      }

      canalDigitandoRef.current =
        null;
      setOutroDigitando(false);
      void supabase.removeChannel(
        canal
      );
    };
  }, [
    conversaSelecionadaId,
    userId,
  ]);

  useEffect(() => {
    fimMensagensRef.current?.scrollIntoView(
      {
        behavior: "smooth",
      }
    );
  }, [mensagens]);

  async function iniciar() {
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

      setUserId(user.id);

      const [
        respostaArtista,
        respostaCasa,
        respostaPerfil,
      ] = await Promise.all([
        supabase
          .from("artist_profiles")
          .select(
            "id, user_id, stage_name"
          )
          .eq("user_id", user.id)
          .maybeSingle(),

        supabase
          .from("venue_profiles")
          .select(
            "id, owner_user_id, trade_name"
          )
          .eq(
            "owner_user_id",
            user.id
          )
          .maybeSingle(),

        supabase
          .from("profiles")
          .select("default_mode")
          .eq("id", user.id)
          .maybeSingle(),
      ]);

      if (respostaArtista.error) {
        console.error(
          respostaArtista.error
        );
      }

      if (respostaCasa.error) {
        console.error(
          respostaCasa.error
        );
      }

      const artistaEncontrado =
        respostaArtista.data as
          | Artista
          | null;

      const casaEncontrada =
        respostaCasa.data as
          | Casa
          | null;

      setArtista(
        artistaEncontrado
      );

      setCasa(casaEncontrada);

      const params =
        new URLSearchParams(
          window.location.search
        );

      const modoUrl =
        params.get("mode");

      let modoInicial:
        | ModoPerfil
        | null = null;

      if (
        modoUrl === "artist" &&
        artistaEncontrado
      ) {
        modoInicial = "artist";
      }

      if (
        modoUrl === "venue" &&
        casaEncontrada
      ) {
        modoInicial = "venue";
      }

      if (!modoInicial) {
        if (
          respostaPerfil.data?.default_mode === "venue" &&
          casaEncontrada
        ) {
          modoInicial = "venue";
        } else if (
          respostaPerfil.data?.default_mode === "artist" &&
          artistaEncontrado
        ) {
          modoInicial = "artist";
        } else if (
          casaEncontrada
        ) {
          modoInicial = "venue";
        } else if (artistaEncontrado) {
          modoInicial = "artist";
        }
      }

      if (!modoInicial) {
        setErro(
          "Você ainda não possui perfil de Artista ou Casa."
        );

        return;
      }

      setModo(modoInicial);
    } catch (error) {
      console.error(error);

      setErro(
        "Não foi possível carregar o Chat."
      );
    } finally {
      setCarregando(false);
    }
  }

  async function garantirConversas(
    modoAtual: ModoPerfil
  ) {
    const perfilId =
      modoAtual === "artist"
        ? artista?.id
        : casa?.id;

    if (!perfilId) return;

    let consulta = supabase
      .from("bookings")
      .select(`
        id,
        offer_id,
        venue_id,
        artist_id,
        status,
        starts_at,
        event_address_snapshot,
        contact_unlocked
      `);

    if (
      modoAtual === "artist"
    ) {
      consulta =
        consulta.eq(
          "artist_id",
          perfilId
        );
    } else {
      consulta =
        consulta.eq(
          "venue_id",
          perfilId
        );
    }

    const {
      data: bookingsData,
      error: erroBookings,
    } = await consulta;

    if (erroBookings) {
      console.error(
        erroBookings
      );

      return;
    }

    const listaBookings =
      (bookingsData ||
        []) as Booking[];

    if (
      listaBookings.length === 0
    ) {
      return;
    }

    const {
      data: conversasExistentes,
      error: erroConversas,
    } = await supabase
      .from("conversations")
      .select(
        "id, booking_id, offer_id, venue_id, artist_id"
      );

    if (erroConversas) {
      console.error(
        erroConversas
      );

      return;
    }

    for (
      const booking of
      listaBookings
    ) {
      const jaExiste =
        (
          conversasExistentes ||
          []
        ).some(
          (conversa) =>
            conversa.booking_id ===
              booking.id ||
            (
              booking.offer_id &&
              conversa.offer_id ===
                booking.offer_id &&
              conversa.artist_id ===
                booking.artist_id
            )
        );

      if (jaExiste) {
        continue;
      }

      const {
        error: erroCriacao,
      } = await supabase
        .from("conversations")
        .insert({
          offer_id:
            booking.offer_id,

          booking_id:
            booking.id,

          venue_id:
            booking.venue_id,

          artist_id:
            booking.artist_id,
        });

      if (erroCriacao) {
        console.error(
          "Não foi possível criar conversa:",
          erroCriacao
        );
      }
    }
  }

  async function carregarConversas(
    modoAtual: ModoPerfil
  ) {
    try {
      setErro("");

      await garantirConversas(
        modoAtual
      );

      const perfilId =
        modoAtual === "artist"
          ? artista?.id
          : casa?.id;

      if (!perfilId) {
        setConversas([]);
        return;
      }

      let consulta = supabase
        .from("conversations")
        .select(`
          id,
          offer_id,
          booking_id,
          venue_id,
          artist_id,
          created_at
        `)
        .order("created_at", {
          ascending: false,
        });

      if (
        modoAtual === "artist"
      ) {
        consulta =
          consulta.eq(
            "artist_id",
            perfilId
          );
      } else {
        consulta =
          consulta.eq(
            "venue_id",
            perfilId
          );
      }

      const {
        data,
        error,
      } = await consulta;

      if (error) {
        throw error;
      }

      const lista =
        (data ||
          []) as Conversa[];

      if (lista.length === 0) {
        setConversas([]);
        setConversaSelecionadaId(
          null
        );

        return;
      }

      const idsArtistas = [
        ...new Set(
          lista.map(
            (conversa) =>
              conversa.artist_id
          )
        ),
      ];

      const idsCasas = [
        ...new Set(
          lista.map(
            (conversa) =>
              conversa.venue_id
          )
        ),
      ];

      const idsBookings =
        lista
          .map(
            (conversa) =>
              conversa.booking_id
          )
          .filter(
            Boolean
          ) as string[];

      const [
        respostaArtistas,
        respostaCasas,
        respostaBookings,
      ] = await Promise.all([
        idsArtistas.length
          ? supabase
              .from(
                "artist_profiles"
              )
              .select(
                "id, stage_name"
              )
              .in(
                "id",
                idsArtistas
              )
          : Promise.resolve({
              data: [],
              error: null,
            }),

        idsCasas.length
          ? supabase
              .from(
                "venue_profiles"
              )
              .select(
                "id, trade_name"
              )
              .in(
                "id",
                idsCasas
              )
          : Promise.resolve({
              data: [],
              error: null,
            }),

        idsBookings.length
          ? supabase
              .from("bookings")
              .select(`
                id,
                offer_id,
                venue_id,
                artist_id,
                status,
                starts_at,
                event_address_snapshot,
                contact_unlocked
              `)
              .in(
                "id",
                idsBookings
              )
          : Promise.resolve({
              data: [],
              error: null,
            }),
      ]);

      const mapaArtistas:
        Record<
          string,
          string
        > = {};

      (
        respostaArtistas.data ||
        []
      ).forEach((item) => {
        mapaArtistas[
          item.id
        ] = item.stage_name;
      });

      const mapaCasas:
        Record<
          string,
          string
        > = {};

      (
        respostaCasas.data ||
        []
      ).forEach((item) => {
        mapaCasas[
          item.id
        ] = item.trade_name;
      });

      const mapaBookings:
        Record<
          string,
          Booking
        > = {};

      (
        respostaBookings.data ||
        []
      ).forEach((item) => {
        mapaBookings[
          item.id
        ] = item as Booking;
      });

      const conversasComUltima =
        await Promise.all(
          lista.map(
            async (
              conversa
            ) => {
              const {
                data: ultima,
              } = await supabase
                .from("messages")
                .select(`
                  id,
                  conversation_id,
                  sender_user_id,
                  message_type,
                  body,
                  attachment_path,
                  metadata,
                  read_at,
                  created_at
                `)
                .eq(
                  "conversation_id",
                  conversa.id
                )
                .order(
                  "created_at",
                  {
                    ascending:
                      false,
                  }
                )
                .limit(1)
                .maybeSingle();

              return {
                ...conversa,

                nomeOutro:
                  modoAtual ===
                  "artist"
                    ? mapaCasas[
                        conversa.venue_id
                      ] ||
                      "Casa"
                    : mapaArtistas[
                        conversa.artist_id
                      ] ||
                      "Artista",

                booking:
                  conversa.booking_id
                    ? mapaBookings[
                        conversa.booking_id
                      ] ||
                      null
                    : null,

                ultimaMensagem:
                  (ultima as
                    | Mensagem
                    | null) ||
                  null,
              };
            }
          )
        );

      conversasComUltima.sort(
        (a, b) => {
          const dataA =
            a.ultimaMensagem
              ?.created_at ||
            a.created_at;

          const dataB =
            b.ultimaMensagem
              ?.created_at ||
            b.created_at;

          return (
            new Date(
              dataB
            ).getTime() -
            new Date(
              dataA
            ).getTime()
          );
        }
      );

      setConversas(
        conversasComUltima
      );

      setConversaSelecionadaId(
        (atual) => {
          if (
            atual &&
            conversasComUltima.some(
              (conversa) =>
                conversa.id ===
                atual
            )
          ) {
            return atual;
          }

          return (
            conversasComUltima[
              0
            ]?.id ||
            null
          );
        }
      );
    } catch (error) {
      console.error(error);

      setErro(
        "Não foi possível carregar as conversas."
      );
    }
  }

  async function carregarMensagens(
    conversaId: string
  ) {
    try {
      setCarregandoMensagens(
        true
      );

      const {
        data,
        error,
      } = await supabase
        .from("messages")
        .select(`
          id,
          conversation_id,
          sender_user_id,
          message_type,
          body,
          attachment_path,
          metadata,
          read_at,
          created_at
        `)
        .eq(
          "conversation_id",
          conversaId
        )
        .order(
          "created_at",
          {
            ascending: true,
          }
        );

      if (error) {
        throw error;
      }

      setMensagens(
        (data ||
          []) as Mensagem[]
      );

      void marcarConversaComoLida(
        conversaId
      );
    } catch (error) {
      console.error(error);

      setErro(
        "Não foi possível carregar as mensagens."
      );
    } finally {
      setCarregandoMensagens(
        false
      );
    }
  }

  async function marcarConversaComoLida(
    conversaId: string
  ) {
    if (!userId) return;

    const { error } =
      await supabase.rpc(
        "mark_conversation_read",
        {
          p_conversation_id:
            conversaId,
        }
      );

    if (error) {
      console.error(
        "Não foi possível marcar mensagens como visualizadas:",
        error
      );
    }
  }

  function enviarStatusDigitando(
    digitando: boolean
  ) {
    if (
      !userId ||
      !canalDigitandoRef.current
    ) {
      return;
    }

    void canalDigitandoRef.current.send(
      {
        type: "broadcast",
        event: "typing",
        payload: {
          user_id: userId,
          typing: digitando,
        },
      }
    );
  }

  function avisarDigitando(
    valor: string
  ) {
    if (
      pararDigitandoRef.current
    ) {
      clearTimeout(
        pararDigitandoRef.current
      );
    }

    if (!valor.trim()) {
      enviarStatusDigitando(false);
      return;
    }

    const agora = Date.now();

    if (
      agora -
        ultimoAvisoDigitandoRef.current >
      700
    ) {
      ultimoAvisoDigitandoRef.current =
        agora;
      enviarStatusDigitando(true);
    }

    pararDigitandoRef.current =
      setTimeout(() => {
        enviarStatusDigitando(false);
      }, 1400);
  }

  function descobrirPapelMensagem(
    mensagem: Mensagem
  ): ModoPerfil | null {
    const papel =
      mensagem.metadata
        ?.sender_role;

    if (
      papel === "artist" ||
      papel === "venue"
    ) {
      return papel;
    }

    const mesmaContaTemDoisPerfis =
      artista &&
      casa &&
      artista.user_id ===
        casa.owner_user_id &&
      artista.user_id ===
        userId;

    if (
      mesmaContaTemDoisPerfis
    ) {
      // Mensagens antigas foram criadas
      // antes de existir sender_role.
      // Nos testes atuais elas vieram
      // originalmente do perfil Artista.
      return "artist";
    }

    if (
      mensagem.sender_user_id ===
      userId
    ) {
      return modo;
    }

    return null;
  }

  async function enviarMensagem(
    event?: FormEvent
  ) {
    event?.preventDefault();

    const corpo =
      texto.trim();

    if (
      !corpo ||
      !conversaSelecionadaId ||
      !userId
    ) {
      return;
    }

    const conversa =
      conversas.find(
        (item) =>
          item.id ===
          conversaSelecionadaId
      );

    if (!conversa) {
      return;
    }

    if (
      !conversa.booking
        ?.contact_unlocked &&
      temContatoExterno(
        corpo
      )
    ) {
      setErro(
        "Telefone, WhatsApp, Instagram e e-mail ficam protegidos até a contratação liberar o contato."
      );

      return;
    }

    try {
      setEnviando(true);
      setErro("");

      const {
        data,
        error,
      } = await supabase
        .from("messages")
        .insert({
          conversation_id:
            conversaSelecionadaId,

          sender_user_id:
            userId,

          message_type:
            "text",

          body: corpo,

          attachment_path:
            null,

          metadata: {
            sender_role:
              modo,
          },
        })
        .select(`
          id,
          conversation_id,
          sender_user_id,
          message_type,
          body,
          attachment_path,
          metadata,
          read_at,
          created_at
        `)
        .single();

      if (error) {
        throw error;
      }

      const nova =
        data as Mensagem;

      setMensagens(
        (anteriores) => {
          const existe =
            anteriores.some(
              (mensagem) =>
                mensagem.id ===
                nova.id
            );

          if (existe) {
            return anteriores;
          }

          return [
            ...anteriores,
            nova,
          ];
        }
      );

      setConversas(
        (anteriores) =>
          anteriores.map(
            (item) =>
              item.id ===
              conversaSelecionadaId
                ? {
                    ...item,
                    ultimaMensagem:
                      nova,
                  }
                : item
          )
      );

      setTexto("");
      enviarStatusDigitando(false);
    } catch (error) {
      console.error(error);

      setErro(
        "Não foi possível enviar a mensagem."
      );
    } finally {
      setEnviando(false);
    }
  }

  async function trocarModo(
    novoModo: ModoPerfil
  ) {
    setModo(novoModo);

    setConversaSelecionadaId(
      null
    );

    setMensagens([]);

    window.history.replaceState(
      {},
      "",
      `/chat?mode=${novoModo}`
    );

    if (userId) {
      const { error } = await supabase
        .from("profiles")
        .update({ default_mode: novoModo })
        .eq("id", userId);

      if (error) {
        console.error(error);
        setErro("O modo foi alterado no Chat, mas não foi possível salvá-lo como padrão.");
      }
    }
  }

  const conversaSelecionada =
    useMemo(
      () =>
        conversas.find(
          (item) =>
            item.id ===
            conversaSelecionadaId
        ) || null,
      [
        conversas,
        conversaSelecionadaId,
      ]
    );

  const conversasFiltradas =
    useMemo(() => {
      const termo =
        busca
          .trim()
          .toLowerCase();

      if (!termo) {
        return conversas;
      }

      return conversas.filter(
        (conversa) =>
          conversa.nomeOutro
            .toLowerCase()
            .includes(termo) ||
          conversa.ultimaMensagem
            ?.body?.toLowerCase()
            .includes(termo)
      );
    }, [
      busca,
      conversas,
    ]);

  if (carregando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050507] text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-zinc-800 border-t-red-500" />

          <p className="text-zinc-400">
            Carregando Chat...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="aura-page">
      <header className="border-b border-zinc-900 bg-black/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-xl font-black">
              AURA{" "}
              <span className="text-red-500">
                BEAT
              </span>
            </p>

            <p className="text-xs text-zinc-500">
              Chat seguro
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              router.push(
                modo === "artist"
                  ? "/home-artista"
                  : "/home-casa"
              )
            }
            className="rounded-xl border border-zinc-800 px-4 py-2 text-sm font-bold text-zinc-300 hover:bg-zinc-900"
          >
            ← Home
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6">
        {erro && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300" role="alert">
            <span>{erro}</span>
            <button type="button" onClick={() => void iniciar()} className="rounded-lg border border-red-700 px-3 py-1.5 font-bold">
              Tentar novamente
            </button>
          </div>
        )}

        <section className="aura-card overflow-hidden rounded-3xl border lg:grid lg:min-h-[720px] lg:grid-cols-[360px_1fr]">
          <aside className="border-b border-zinc-800 lg:border-b-0 lg:border-r">
            <div className="border-b border-zinc-900 p-5">
              <p className="text-xs font-black text-red-500">
                CONVERSAS
              </p>

              <h1 className="mt-1 text-2xl font-black">
                Mensagens
              </h1>

              <input
                type="text"
                value={busca}
                onChange={(event) =>
                  setBusca(
                    event.target.value
                  )
                }
                placeholder="Buscar conversa..."
                className="mt-4 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm outline-none focus:border-red-500"
              />
            </div>

            <div className="max-h-[320px] overflow-y-auto lg:max-h-[650px]">
              {conversasFiltradas.length ===
              0 ? (
                <div className="p-6 text-sm text-zinc-500">
                  Nenhuma conversa encontrada.

                  <p className="mt-2 text-xs leading-5 text-zinc-600">
                    Quando houver uma contratação, o Chat será criado automaticamente.
                  </p>
                </div>
              ) : (
                conversasFiltradas.map(
                  (conversa) => {
                    const ativa =
                      conversa.id ===
                      conversaSelecionadaId;

                    return (
                      <button
                        key={
                          conversa.id
                        }
                        type="button"
                        onClick={() =>
                          setConversaSelecionadaId(
                            conversa.id
                          )
                        }
                        className={`w-full border-b border-zinc-900 p-4 text-left transition ${
                          ativa
                            ? "bg-red-950/20"
                            : "hover:bg-zinc-900/60"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 font-black text-red-400">
                            {conversa.nomeOutro
                              .charAt(
                                0
                              )
                              .toUpperCase()}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate font-black">
                                {
                                  conversa.nomeOutro
                                }
                              </p>

                              <span className="shrink-0 text-[10px] text-zinc-600">
                                {dataHora(
                                  conversa
                                    .ultimaMensagem
                                    ?.created_at ||
                                    conversa.created_at
                                )}
                              </span>
                            </div>

                            <p className="mt-1 truncate text-xs text-zinc-500">
                              {conversa
                                .ultimaMensagem
                                ?.body ||
                                "Conversa iniciada"}
                            </p>

                            {conversa.booking && (
                              <p className="mt-2 text-[10px] font-bold text-green-500">
                                {statusBooking(
                                  conversa
                                    .booking
                                    .status
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  }
                )
              )}
            </div>
          </aside>

          <section className="flex min-h-[600px] flex-col">
            {!conversaSelecionada ? (
              <div className="flex flex-1 items-center justify-center p-8 text-center">
                <div>
                  <div className="text-5xl">
                    💬
                  </div>

                  <h2 className="mt-4 text-xl font-black">
                    Chat Aura Beat
                  </h2>

                  <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">
                    Selecione uma conversa para falar com a outra parte da contratação.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="border-b border-zinc-900 p-5">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div>
                      <p className="text-xl font-black">
                        {
                          conversaSelecionada.nomeOutro
                        }
                      </p>

                      {outroDigitando ? (
                        <p className="mt-1 text-xs font-semibold text-sky-400">
                          Digitando...
                        </p>
                      ) : (
                        conversaSelecionada.booking && (
                          <p className="mt-1 text-xs text-green-500">
                            ●{" "}
                            {statusBooking(
                              conversaSelecionada
                                .booking
                                .status
                            )}
                          </p>
                        )
                      )}
                    </div>

                    {conversaSelecionada.booking && (
                      <button
                        type="button"
                        onClick={() =>
                          router.push(
                            modo ===
                              "artist"
                              ? "/eventos-artista"
                              : "/eventos-casa"
                          )
                        }
                        className="rounded-xl border border-zinc-800 px-4 py-2 text-xs font-black hover:bg-zinc-900"
                      >
                        Ver evento →
                      </button>
                    )}
                  </div>

                  {conversaSelecionada.booking &&
                    !conversaSelecionada
                      .booking
                      .contact_unlocked && (
                      <div className="mt-4 rounded-xl border border-yellow-900/60 bg-yellow-950/10 px-4 py-3 text-xs text-yellow-400">
                        🔒 Contatos externos protegidos. Telefone, WhatsApp, Instagram e e-mail serão liberados conforme a contratação.
                      </div>
                    )}
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto bg-black/30 p-4 sm:p-6">
                  {carregandoMensagens ? (
                    <div className="py-10 text-center text-sm text-zinc-500">
                      Carregando mensagens...
                    </div>
                  ) : mensagens.length ===
                    0 ? (
                    <div className="py-10 text-center">
                      <p className="text-3xl">
                        👋
                      </p>

                      <p className="mt-3 font-black">
                        Conversa iniciada
                      </p>

                      <p className="mt-1 text-sm text-zinc-600">
                        Envie a primeira mensagem.
                      </p>
                    </div>
                  ) : (
                    mensagens.map(
                      (mensagem) => {
                        const papel =
                          descobrirPapelMensagem(
                            mensagem
                          );

                        const minha =
                          papel
                            ? papel ===
                              modo
                            : mensagem.sender_user_id ===
                              userId;

                        const nomePapel =
                          papel ===
                          "venue"
                            ? "CASA"
                            : papel ===
                                "artist"
                              ? "ARTISTA"
                              : "";

                        return (
                          <div
                            key={
                              mensagem.id
                            }
                            className={`flex ${
                              minha
                                ? "justify-end"
                                : "justify-start"
                            }`}
                          >
                            <div
                              className={`max-w-[85%] rounded-2xl px-4 py-3 sm:max-w-[70%] ${
                                minha
                                  ? "rounded-br-md bg-red-500 text-white"
                                  : "rounded-bl-md border border-zinc-800 bg-zinc-900 text-zinc-200"
                              }`}
                            >
                              {nomePapel && (
                                <p
                                  className={`mb-1 text-[9px] font-black ${
                                    minha
                                      ? "text-red-100"
                                      : "text-zinc-500"
                                  }`}
                                >
                                  {
                                    nomePapel
                                  }
                                </p>
                              )}

                              {mensagem.message_type !==
                                "text" && (
                                <p className="mb-1 text-[10px] font-black uppercase opacity-70">
                                  {
                                    mensagem.message_type
                                  }
                                </p>
                              )}

                              <p className="whitespace-pre-wrap break-words text-sm leading-6">
                                {mensagem.body ||
                                  "Mensagem"}
                              </p>

                              <div
                                className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                                  minha
                                    ? "text-red-100"
                                    : "text-zinc-600"
                                }`}
                              >
                                <span>
                                  {somenteHora(
                                    mensagem.created_at
                                  )}
                                </span>

                                {minha && (
                                  <span
                                    className={
                                      mensagem.read_at
                                        ? "font-black text-sky-300"
                                        : "font-black text-red-100/70"
                                    }
                                    title={
                                      mensagem.read_at
                                        ? "Visualizada"
                                        : "Enviada"
                                    }
                                  >
                                    {mensagem.read_at
                                      ? "✓✓"
                                      : "✓"}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      }
                    )
                  )}

                  <div
                    ref={
                      fimMensagensRef
                    }
                  />
                </div>

                <form
                  onSubmit={
                    enviarMensagem
                  }
                  className="border-t border-zinc-900 bg-zinc-950 p-4"
                >
                  <div className="flex gap-3">
                    <textarea
                      rows={1}
                      value={texto}
                      onChange={(event) => {
                        const valor =
                          event.target.value;

                        setTexto(valor);
                        avisarDigitando(
                          valor
                        );
                      }}
                      onKeyDown={(event) => {
                        if (
                          event.key ===
                            "Enter" &&
                          !event.shiftKey
                        ) {
                          event.preventDefault();

                          enviarMensagem();
                        }
                      }}
                      placeholder={
                        modo ===
                        "artist"
                          ? "Mensagem como Artista..."
                          : "Mensagem como Casa..."
                      }
                      className="max-h-32 min-h-12 flex-1 resize-none rounded-2xl border border-zinc-800 bg-black px-4 py-3 text-sm outline-none focus:border-red-500"
                    />

                    <button
                      type="submit"
                      disabled={
                        enviando ||
                        !texto.trim()
                      }
                      className="rounded-2xl bg-red-500 px-5 font-black hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {enviando
                        ? "..."
                        : "➤"}
                    </button>
                  </div>

                  <p className="mt-2 text-[10px] text-zinc-600">
                    Você está enviando como{" "}
                    <strong className="text-zinc-400">
                      {modo ===
                      "artist"
                        ? "Artista"
                        : "Casa"}
                    </strong>
                    {" • "}
                    Enter envia • Shift + Enter quebra linha
                  </p>
                </form>
              </>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
