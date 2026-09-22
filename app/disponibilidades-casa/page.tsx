"use client";

import {
  FormEvent,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation";
import { ProfileAvatar } from "../../components/profile-avatar";
import { supabase } from "../../lib/supabase";

type Casa = {
  id: string;
  trade_name: string;
  verification_status: string | null;

  address_line: string | null;
  address_number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
};

type Artista = {
  id: string;
  stage_name: string;
  verification_status: string | null;
  base_city: string | null;
  base_state: string | null;
};

type OfertaArtista = {
  id: string;
  artist_id: string;

  title: string;
  description: string | null;

  styles: string[];

  available_from: string;
  available_until: string;

  fee_amount: number;
  radius_km: number;

  base_city: string | null;
  base_state: string | null;

  is_urgent: boolean;

  status:
    | "draft"
    | "open"
    | "filled"
    | "closed"
    | "cancelled";

  expires_at: string | null;

  created_at: string;
  transport_mode: string | null;
  transport_type: string | null;
  ticket_amount: number | null;
  local_transport_amount: number | null;
  transport_notes: string | null;
};

type OfertaVisual = OfertaArtista & {
  artista: Artista | null;
};

type DisponivelAgora = {
  artist_id: string;
  stage_name: string;
  avatar_url: string | null;
  base_city: string | null;
  base_state: string | null;
  verification_status: string | null;
  radius_km: number;
  last_seen_at: string | null;
};

type Solicitacao = {
  id: string;
  artist_offer_id: string;

  status:
    | "pending"
    | "accepted"
    | "declined"
    | "cancelled";

  requested_starts_at: string;
  agreed_fee: number;
};

function dinheiro(valor: number) {
  return new Intl.NumberFormat(
    "pt-BR",
    {
      style: "currency",
      currency: "BRL",
    }
  ).format(Number(valor || 0));
}

function dataHora(valor: string) {
  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  ).format(new Date(valor));
}

function converterNumero(
  valor: string
) {
  const tratado = valor
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");

  return Number(tratado);
}

function paraInputData(
  valor: string
) {
  const data = new Date(valor);

  const offset =
    data.getTimezoneOffset();

  const local = new Date(
    data.getTime() -
      offset * 60 * 1000
  );

  return local
    .toISOString()
    .slice(0, 16);
}

function enderecoCasa(
  casa: Casa
) {
  return [
    casa.address_line,
    casa.address_number,
    casa.neighborhood,
    casa.city,
    casa.state,
  ]
    .filter(Boolean)
    .join(", ");
}

function textoSolicitacao(
  status: Solicitacao["status"]
) {
  switch (status) {
    case "pending":
      return "Aguardando DJ";

    case "accepted":
      return "Aceita";

    case "declined":
      return "Recusada";

    case "cancelled":
      return "Cancelada";

    default:
      return status;
  }
}

export default function DisponibilidadesCasaPage() {
  const router = useRouter();

  const [casa, setCasa] =
    useState<Casa | null>(null);

  const [ofertas, setOfertas] =
    useState<OfertaVisual[]>([]);

  const [disponiveisAgora, setDisponiveisAgora] =
    useState<DisponivelAgora[]>([]);

  const [
    solicitacoes,
    setSolicitacoes,
  ] = useState<
    Record<string, Solicitacao>
  >({});

  const [
    ofertaSelecionada,
    setOfertaSelecionada,
  ] =
    useState<OfertaVisual | null>(
      null
    );

  const [inicio, setInicio] =
    useState("");

  const [duracao, setDuracao] =
    useState("2");

  const [endereco, setEndereco] =
    useState("");

  const [deslocamento, setDeslocamento] =
    useState("0");

  const [pedagio, setPedagio] =
    useState("0");

  const [hospedagem, setHospedagem] =
    useState("0");

  const [mensagemSolicitacao, setMensagemSolicitacao] =
    useState("");

  const [busca, setBusca] =
    useState("");

  const [carregando, setCarregando] =
    useState(true);

  const [enviando, setEnviando] =
    useState(false);

  const [erro, setErro] =
    useState("");

  const [mensagem, setMensagem] =
    useState("");

  const carregarPaginaEffect = useEffectEvent(() => {
    void carregarPagina();
  });

  useEffect(() => {
    carregarPaginaEffect();
  }, []);

  async function carregarPagina() {
    try {
      setCarregando(true);
      setErro("");

      const {
        data: authData,
        error: authError,
      } =
        await supabase.auth.getUser();

      if (
        authError ||
        !authData.user
      ) {
        router.replace("/login");
        return;
      }

      const {
        data: casaData,
        error: casaError,
      } = await supabase
        .from("venue_profiles")
        .select(`
          id,
          trade_name,
          verification_status,
          address_line,
          address_number,
          neighborhood,
          city,
          state
        `)
        .eq(
          "owner_user_id",
          authData.user.id
        )
        .maybeSingle();

      if (casaError) {
        throw casaError;
      }

      if (!casaData) {
        setErro(
          "Você ainda não possui perfil de Casa."
        );

        return;
      }

      const perfilCasa =
        casaData as Casa;

      setCasa(perfilCasa);

      setEndereco(
        enderecoCasa(perfilCasa)
      );

      await Promise.all([
        carregarOfertas(),
        carregarDisponiveisAgora(),
        carregarSolicitacoes(
          perfilCasa.id
        ),
      ]);
    } catch (error) {
      console.error(error);

      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar as disponibilidades."
      );
    } finally {
      setCarregando(false);
    }
  }

  async function carregarOfertas() {
    const {
      data,
      error,
    } = await supabase
      .from("artist_offers")
      .select(`
        id,
        artist_id,
        title,
        description,
        styles,
        available_from,
        available_until,
        fee_amount,
        radius_km,
        base_city,
        base_state,
        is_urgent,
        status,
        expires_at,
        created_at,
        transport_mode,
        transport_type,
        ticket_amount,
        local_transport_amount,
        transport_notes
      `)
      .eq(
        "status",
        "open"
      )
      .order(
        "available_from",
        {
          ascending: true,
        }
      );

    if (error) {
      throw error;
    }

    const lista =
      (data ||
        []) as OfertaArtista[];

    const agora = new Date();

    const validas =
      lista.filter(
        (oferta) => {
          const terminou =
            new Date(
              oferta.available_until
            ) <= agora;

          const expirou =
            oferta.expires_at
              ? new Date(
                  oferta.expires_at
                ) <= agora
              : false;

          return (
            !terminou &&
            !expirou
          );
        }
      );

    if (
      validas.length === 0
    ) {
      setOfertas([]);
      return;
    }

    const idsArtistas = [
      ...new Set(
        validas.map(
          (oferta) =>
            oferta.artist_id
        )
      ),
    ];

    const {
      data: artistasData,
      error: artistasError,
    } = await supabase
      .from("artist_profiles")
      .select(`
        id,
        stage_name,
        verification_status,
        base_city,
        base_state
      `)
      .in(
        "id",
        idsArtistas
      );

    if (artistasError) {
      throw artistasError;
    }

    const artistas =
      (artistasData ||
        []) as Artista[];

    const mapaArtistas =
      new Map(
        artistas.map(
          (artista) => [
            artista.id,
            artista,
          ]
        )
      );

    setOfertas(
      validas.map(
        (oferta) => ({
          ...oferta,

          artista:
            mapaArtistas.get(
              oferta.artist_id
            ) || null,
        })
      )
    );
  }

  async function carregarDisponiveisAgora() {
    const { data, error } = await supabase.rpc(
      "available_artists_for_venue_v1",
      {
        p_search: null,
      }
    );

    if (error) {
      throw error;
    }

    setDisponiveisAgora(
      ((data || []) as Array<{
        artist_id: string;
        stage_name: string | null;
        avatar_url: string | null;
        base_city: string | null;
        base_state: string | null;
        verification_status: string | null;
        radius_km: number | null;
        last_seen_at: string | null;
      }>).map((item) => ({
        artist_id: String(item.artist_id),
        stage_name: String(item.stage_name || "Artista"),
        avatar_url: item.avatar_url ? String(item.avatar_url) : null,
        base_city: item.base_city ? String(item.base_city) : null,
        base_state: item.base_state ? String(item.base_state) : null,
        verification_status: item.verification_status
          ? String(item.verification_status)
          : null,
        radius_km: Number(item.radius_km || 0),
        last_seen_at: item.last_seen_at
          ? String(item.last_seen_at)
          : null,
      }))
    );
  }

  async function carregarSolicitacoes(
    venueId: string
  ) {
    const {
      data,
      error,
    } = await supabase
      .from(
        "artist_offer_requests"
      )
      .select(`
        id,
        artist_offer_id,
        status,
        requested_starts_at,
        agreed_fee
      `)
      .eq(
        "venue_id",
        venueId
      );

    if (error) {
      throw error;
    }

    const lista =
      (data ||
        []) as Solicitacao[];

    const mapa:
      Record<
        string,
        Solicitacao
      > = {};

    for (
      const solicitacao of lista
    ) {
      mapa[
        solicitacao.artist_offer_id
      ] = solicitacao;
    }

    setSolicitacoes(mapa);
  }

  function abrirSolicitacao(
    oferta: OfertaVisual
  ) {
    setOfertaSelecionada(
      oferta
    );

    setInicio(
      paraInputData(
        oferta.available_from
      )
    );

    setDuracao("2");

    const deslocamentoPadrao =
      oferta.transport_mode === "ticket"
        ? Number(oferta.ticket_amount || 0) +
          Number(oferta.local_transport_amount || 0)
        : oferta.transport_mode === "venue_pickup"
          ? 0
          : oferta.transport_mode === "other"
            ? Number(oferta.local_transport_amount || 0)
            : 0;

    setDeslocamento(
      String(
        deslocamentoPadrao
      )
    );
    setPedagio("0");
    setHospedagem("0");

    setMensagemSolicitacao("");

    if (casa) {
      setEndereco(
        enderecoCasa(casa)
      );
    }

    setErro("");
    setMensagem("");
  }

  function fecharSolicitacao() {
    if (enviando) {
      return;
    }

    setOfertaSelecionada(null);
  }

  const horas =
    useMemo(() => {
      const valor =
        converterNumero(
          duracao
        );

      if (
        !Number.isFinite(valor) ||
        valor <= 0
      ) {
        return 0;
      }

      return valor;
    }, [duracao]);

  const cache =
    ofertaSelecionada
      ? Number(
          ofertaSelecionada.fee_amount ||
            0
        )
      : 0;

  const taxaCasa =
    Number(
      (cache * 0.03).toFixed(2)
    );

  const taxaArtista =
    Number(
      (cache * 0.03).toFixed(2)
    );

  const valorDeslocamento =
    converterNumero(
      deslocamento
    ) || 0;

  const valorPedagio =
    converterNumero(
      pedagio
    ) || 0;

  const valorHospedagem =
    converterNumero(
      hospedagem
    ) || 0;

  const totalCasa =
    cache +
    taxaCasa +
    valorDeslocamento +
    valorPedagio +
    valorHospedagem;

  const liquidoArtista =
    cache -
    taxaArtista +
    valorDeslocamento +
    valorPedagio +
    valorHospedagem;

  async function enviarSolicitacao(
    event: FormEvent
  ) {
    event.preventDefault();

    if (
      !casa ||
      !ofertaSelecionada
    ) {
      return;
    }

    setErro("");
    setMensagem("");

    if (
      casa.verification_status !==
      "verified"
    ) {
      setErro(
        "Sua Casa precisa estar verificada para solicitar uma contratação."
      );

      return;
    }

    const inicioEvento =
      new Date(inicio);

    if (
      Number.isNaN(
        inicioEvento.getTime()
      )
    ) {
      setErro(
        "Informe uma data e horário válidos."
      );

      return;
    }

    if (horas <= 0) {
      setErro(
        "Informe uma duração válida."
      );

      return;
    }

    const minutos =
      Math.round(
        horas * 60
      );

    const fimEvento =
      new Date(
        inicioEvento.getTime() +
          minutos *
            60 *
            1000
      );

    const inicioOferta =
      new Date(
        ofertaSelecionada.available_from
      );

    const fimOferta =
      new Date(
        ofertaSelecionada.available_until
      );

    if (
      inicioEvento <
        inicioOferta ||
      fimEvento >
        fimOferta
    ) {
      setErro(
        "O horário solicitado precisa estar dentro da disponibilidade publicada pelo DJ."
      );

      return;
    }

    if (!endereco.trim()) {
      setErro(
        "Informe o endereço do evento."
      );

      return;
    }

    try {
      setEnviando(true);

      const {
        error,
      } = await supabase
        .from(
          "artist_offer_requests"
        )
        .insert({
          artist_offer_id:
            ofertaSelecionada.id,

          venue_id:
            casa.id,

          requested_starts_at:
            inicioEvento.toISOString(),

          duration_minutes:
            minutos,

          agreed_fee:
            cache,

          travel_amount:
            valorDeslocamento,

          transport_mode:
            ofertaSelecionada.transport_mode,

          transport_type:
            ofertaSelecionada.transport_type,

          ticket_amount:
            Number(
              ofertaSelecionada.ticket_amount ||
                0
            ),

          local_transport_amount:
            Number(
              ofertaSelecionada.local_transport_amount ||
                0
            ),

          transport_notes:
            ofertaSelecionada.transport_notes,

          toll_amount:
            valorPedagio,

          lodging_amount:
            valorHospedagem,

          event_address:
            endereco.trim(),

          message:
            mensagemSolicitacao.trim() ||
            null,

          status:
            "pending",
        });

      if (error) {
        throw error;
      }

      setMensagem(
        `Solicitação enviada para ${
          ofertaSelecionada
            .artista?.stage_name ||
          "o artista"
        }.`
      );

      await carregarSolicitacoes(
        casa.id
      );

      setOfertaSelecionada(null);
    } catch (error) {
      console.error(error);

      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível enviar a solicitação."
      );
    } finally {
      setEnviando(false);
    }
  }

  const ofertasFiltradas =
    useMemo(() => {
      const termo =
        busca
          .trim()
          .toLowerCase();

      if (!termo) {
        return ofertas;
      }

      return ofertas.filter(
        (oferta) => {
          const texto = [
            oferta.title,
            oferta.description,
            oferta.base_city,
            oferta.base_state,
            oferta.artista
              ?.stage_name,
            ...(oferta.styles ||
              []),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return texto.includes(
            termo
          );
        }
      );
    }, [busca, ofertas]);

  const disponiveisFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const idsComOfertaUrgente = new Set(
      ofertas.map((oferta) => oferta.artist_id)
    );

    return disponiveisAgora.filter((artista) => {
      if (idsComOfertaUrgente.has(artista.artist_id)) {
        return false;
      }

      if (!termo) {
        return true;
      }

      const texto = [
        artista.stage_name,
        artista.base_city,
        artista.base_state,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return texto.includes(termo);
    });
  }, [busca, disponiveisAgora, ofertas]);

  if (carregando) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        Carregando...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <div className="mx-auto max-w-6xl">

        <div className="mb-8">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-purple-400">
            Aura Beat
          </p>

          <h1 className="text-3xl font-bold">
            ⚡ Disponibilidade urgente
          </h1>

          <p className="mt-2 max-w-3xl text-zinc-400">
            Encontre artistas que publicaram
            disponibilidade urgente e envie uma
            solicitação de contratação.
          </p>
        </div>

        {erro && (
          <div className="mb-5 rounded-xl border border-red-900 bg-red-950/30 p-4 text-red-300">
            {erro}
          </div>
        )}

        {mensagem && (
          <div className="mb-5 rounded-xl border border-green-900 bg-green-950/30 p-4 text-green-300">
            {mensagem}
          </div>
        )}

        <div className="mb-6">
          <input
            value={busca}
            onChange={(e) =>
              setBusca(
                e.target.value
              )
            }
            placeholder="Buscar DJ, cidade, estado ou estilo..."
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-purple-600"
          />
        </div>

        <div className="mb-6 rounded-xl border border-amber-800/50 bg-amber-950/20 p-4">
          <div className="font-semibold text-amber-300">
            ⚡ Contratação por Oferta Urgente
          </div>

          <p className="mt-1 text-sm text-amber-100/70">
            Neste tipo de contratação, a comissão Aura Beat é de
            3% da Casa e 3% do artista, somente sobre o cachê.
            Deslocamento, pedágio e hospedagem não recebem comissão.
            A taxa de processamento do ASAAS é adicionada separadamente
            no pagamento.
          </p>
        </div>

        {ofertasFiltradas.length === 0 &&
        disponiveisFiltrados.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 p-12 text-center text-zinc-500">
            Nenhum DJ disponível encontrado para esta busca.
          </div>
        ) : ofertasFiltradas.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">

            {ofertasFiltradas.map(
              (oferta) => {
                const solicitacao =
                  solicitacoes[
                    oferta.id
                  ];

                const taxa =
                  Number(
                    (
                      oferta.fee_amount *
                      0.03
                    ).toFixed(2)
                  );

                const total =
                  Number(
                    oferta.fee_amount
                  ) + taxa;

                return (
                  <article
                    key={
                      oferta.id
                    }
                    className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5"
                  >

                    <div className="mb-4 flex items-start justify-between gap-3">

                      <div>
                        <div className="mb-2 flex items-center gap-2">
                          <span className="rounded-full border border-amber-800 bg-amber-950/30 px-2.5 py-1 text-xs font-semibold text-amber-300">
                            ⚡ Urgente
                          </span>

                          {oferta
                            .artista
                            ?.verification_status ===
                            "verified" && (
                            <span className="rounded-full border border-blue-900 bg-blue-950/30 px-2.5 py-1 text-xs text-blue-300">
                              ✓ Verificado
                            </span>
                          )}
                        </div>

                        <h2 className="text-xl font-bold">
                          {oferta
                            .artista
                            ?.stage_name ||
                            "Artista"}
                        </h2>

                        <p className="mt-1 text-sm text-zinc-500">
                          {oferta.base_city ||
                            oferta
                              .artista
                              ?.base_city ||
                            "Cidade não informada"}

                          {(oferta.base_state ||
                            oferta
                              .artista
                              ?.base_state) &&
                            `/${
                              oferta.base_state ||
                              oferta.artista
                                ?.base_state
                            }`}
                        </p>
                      </div>

                    </div>

                    <h3 className="font-semibold">
                      {oferta.title}
                    </h3>

                    {oferta.description && (
                      <p className="mt-2 line-clamp-3 text-sm text-zinc-400">
                        {
                          oferta.description
                        }
                      </p>
                    )}

                    <div className="mt-4 rounded-xl bg-black p-4 text-sm text-zinc-400">
                      <div>
                        📅{" "}
                        {dataHora(
                          oferta.available_from
                        )}
                      </div>

                      <div className="mt-1">
                        até{" "}
                        {dataHora(
                          oferta.available_until
                        )}
                      </div>

                      <div className="mt-1">
                        📍 Até{" "}
                        {oferta.radius_km} km
                      </div>
                    </div>

                    {oferta.styles &&
                      oferta.styles.length >
                        0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {oferta.styles.map(
                            (
                              estilo
                            ) => (
                              <span
                                key={
                                  estilo
                                }
                                className="rounded-lg bg-zinc-900 px-2.5 py-1 text-xs text-zinc-400"
                              >
                                {
                                  estilo
                                }
                              </span>
                            )
                          )}
                        </div>
                      )}

                    <div className="mt-5 border-t border-zinc-800 pt-4">

                      <div className="flex justify-between text-sm text-zinc-400">
                        <span>
                          Cachê
                        </span>

                        <span>
                          {dinheiro(
                            oferta.fee_amount
                          )}
                        </span>
                      </div>

                      <div className="mt-2 flex justify-between text-sm text-zinc-400">
                        <span>
                          Taxa Aura Beat 3%
                        </span>

                        <span>
                          {dinheiro(
                            taxa
                          )}
                        </span>
                      </div>

                      <div className="mt-3 flex justify-between font-semibold">
                        <span>
                          Total da Casa
                        </span>

                        <span className="text-green-400">
                          {dinheiro(
                            total
                          )}
                        </span>
                      </div>

                    </div>

                    {solicitacao ? (
                      <div className="mt-5 rounded-xl border border-zinc-800 bg-black p-3 text-center text-sm">
                        Solicitação:{" "}
                        <span className="font-semibold text-purple-300">
                          {textoSolicitacao(
                            solicitacao.status
                          )}
                        </span>
                      </div>
                    ) : (
                      <button
                        onClick={() =>
                          abrirSolicitacao(
                            oferta
                          )
                        }
                        className="mt-5 w-full rounded-xl bg-purple-600 px-4 py-3 font-semibold transition hover:bg-purple-500"
                      >
                        Solicitar contratação
                      </button>
                    )}

                  </article>
                );
              }
            )}

          </div>
        ) : null}

        {disponiveisFiltrados.length > 0 && (
          <section className="mt-8">
            <div className="mb-4">
              <p className="text-xs font-black uppercase tracking-wider text-green-400">
                ONLINE / DISPONÍVEL
              </p>
              <h2 className="mt-1 text-2xl font-black">
                DJs disponíveis agora
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Estes DJs marcaram “Disponível para eventos”, mesmo sem uma publicação urgente aberta.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {disponiveisFiltrados.map((artista) => (
                <article
                  key={artista.artist_id}
                  className="rounded-2xl border border-green-900/40 bg-gradient-to-br from-zinc-950 to-green-950/10 p-5"
                >
                  <div className="flex items-center gap-4">
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
                          {artista.stage_name}
                        </h3>

                        {artista.verification_status === "verified" && (
                          <span className="rounded-full border border-blue-900 bg-blue-950/30 px-2 py-0.5 text-[10px] font-black text-blue-300">
                            ✓ Verificado
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-sm text-zinc-500">
                        {artista.base_city || "Cidade não informada"}
                        {artista.base_state ? `/${artista.base_state}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-green-900/30 bg-green-950/10 p-3">
                    <p className="text-sm font-bold text-green-300">
                      ● Disponível para eventos
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Raio informado: até {artista.radius_km || 50} km
                    </p>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/artistas/${artista.artist_id}`)
                      }
                      className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold text-zinc-300"
                    >
                      Ver perfil
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/oferta-direta/${artista.artist_id}`)
                      }
                      className="rounded-xl bg-green-600 px-4 py-3 text-sm font-black text-white hover:bg-green-500"
                    >
                      Solicitar DJ
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {ofertaSelecionada && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">

            <form
              onSubmit={
                enviarSolicitacao
              }
              className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6"
            >

              <div className="mb-6 flex items-start justify-between gap-4">

                <div>
                  <div className="text-sm font-semibold text-amber-400">
                    ⚡ Oferta Urgente
                  </div>

                  <h2 className="mt-1 text-2xl font-bold">
                    Solicitar{" "}
                    {ofertaSelecionada
                      .artista
                      ?.stage_name ||
                      "artista"}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={
                    fecharSolicitacao
                  }
                  className="rounded-lg border border-zinc-700 px-3 py-2 text-zinc-400"
                >
                  ✕
                </button>

              </div>

              <div className="space-y-5">

                <div className="grid gap-4 md:grid-cols-2">

                  <div>
                    <label className="mb-2 block text-sm text-zinc-300">
                      Início do evento
                    </label>

                    <input
                      type="datetime-local"
                      value={inicio}
                      onChange={(e) =>
                        setInicio(
                          e.target.value
                        )
                      }
                      className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none focus:border-purple-600"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-zinc-300">
                      Duração
                    </label>

                    <div className="relative">
                      <input
                        value={duracao}
                        onChange={(e) =>
                          setDuracao(
                            e.target.value
                          )
                        }
                        inputMode="decimal"
                        className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 pr-16 outline-none focus:border-purple-600"
                      />

                      <span className="absolute right-4 top-3 text-zinc-500">
                        horas
                      </span>
                    </div>
                  </div>

                </div>

                <div>
                  <label className="mb-2 block text-sm text-zinc-300">
                    Endereço do evento
                  </label>

                  <input
                    value={endereco}
                    onChange={(e) =>
                      setEndereco(
                        e.target.value
                      )
                    }
                    className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none focus:border-purple-600"
                  />
                </div>

                <div className="rounded-xl border border-cyan-900/40 bg-cyan-950/10 p-4">
                  <p className="text-xs font-black uppercase text-cyan-300">
                    Meio escolhido pelo DJ
                  </p>
                  <p className="mt-1 font-black">
                    {ofertaSelecionada.transport_mode === "ticket"
                      ? "🎫 Passagem"
                      : ofertaSelecionada.transport_mode === "vehicle"
                        ? "⛽ Veículo próprio"
                        : ofertaSelecionada.transport_mode === "fixed"
                          ? "🚗 Valor por km"
                          : ofertaSelecionada.transport_mode === "venue_pickup"
                            ? "🏠 Casa busca o DJ"
                            : ofertaSelecionada.transport_mode === "other"
                              ? "🚐 Outro"
                              : "Não informado"}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Esse é o padrão publicado pelo DJ. Se precisar alterar, combine com ele antes da confirmação.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">

                  <div>
                    <label className="mb-2 block text-sm text-zinc-300">
                      Deslocamento
                    </label>

                    <input
                      value={
                        deslocamento
                      }
                      onChange={(e) =>
                        setDeslocamento(
                          e.target.value
                        )
                      }
                      inputMode="decimal"
                      className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none focus:border-purple-600"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-zinc-300">
                      Pedágio
                    </label>

                    <input
                      value={pedagio}
                      onChange={(e) =>
                        setPedagio(
                          e.target.value
                        )
                      }
                      inputMode="decimal"
                      className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none focus:border-purple-600"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-zinc-300">
                      Hospedagem
                    </label>

                    <input
                      value={
                        hospedagem
                      }
                      onChange={(e) =>
                        setHospedagem(
                          e.target.value
                        )
                      }
                      inputMode="decimal"
                      className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none focus:border-purple-600"
                    />
                  </div>

                </div>

                <div>
                  <label className="mb-2 block text-sm text-zinc-300">
                    Mensagem para o DJ
                  </label>

                  <textarea
                    value={
                      mensagemSolicitacao
                    }
                    onChange={(e) =>
                      setMensagemSolicitacao(
                        e.target.value
                      )
                    }
                    rows={4}
                    placeholder="Ex.: Evento em clube, público estimado de 300 pessoas..."
                    className="w-full resize-none rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none focus:border-purple-600"
                  />
                </div>

                <div className="rounded-xl border border-zinc-800 bg-black p-4">

                  <div className="flex justify-between text-sm text-zinc-400">
                    <span>
                      Cachê
                    </span>

                    <span>
                      {dinheiro(
                        cache
                      )}
                    </span>
                  </div>

                  <div className="mt-2 flex justify-between text-sm text-zinc-400">
                    <span>
                      Taxa da Casa 3%
                    </span>

                    <span>
                      {dinheiro(
                        taxaCasa
                      )}
                    </span>
                  </div>

                  {valorDeslocamento >
                    0 && (
                    <div className="mt-2 flex justify-between text-sm text-zinc-400">
                      <span>
                        Deslocamento
                      </span>

                      <span>
                        {dinheiro(
                          valorDeslocamento
                        )}
                      </span>
                    </div>
                  )}

                  {valorPedagio >
                    0 && (
                    <div className="mt-2 flex justify-between text-sm text-zinc-400">
                      <span>
                        Pedágio
                      </span>

                      <span>
                        {dinheiro(
                          valorPedagio
                        )}
                      </span>
                    </div>
                  )}

                  {valorHospedagem >
                    0 && (
                    <div className="mt-2 flex justify-between text-sm text-zinc-400">
                      <span>
                        Hospedagem
                      </span>

                      <span>
                        {dinheiro(
                          valorHospedagem
                        )}
                      </span>
                    </div>
                  )}

                  <div className="mt-3 flex justify-between border-t border-zinc-800 pt-3 text-lg font-bold">
                    <span>
                      Total da Casa
                    </span>

                    <span className="text-green-400">
                      {dinheiro(
                        totalCasa
                      )}
                    </span>
                  </div>

                  <div className="mt-4 rounded-lg bg-zinc-950 p-3 text-xs text-zinc-500">
                    O artista também paga 3% sobre o
                    cachê nesta contratação urgente.
                    Com esses valores, o artista receberá{" "}
                    <strong className="text-zinc-300">
                      {dinheiro(
                        liquidoArtista
                      )}
                    </strong>
                    .
                  </div>

                </div>

                <button
                  type="submit"
                  disabled={enviando}
                  className="w-full rounded-xl bg-purple-600 px-5 py-3 font-semibold transition hover:bg-purple-500 disabled:opacity-50"
                >
                  {enviando
                    ? "Enviando..."
                    : "Enviar solicitação ao DJ"}
                </button>

              </div>

            </form>
          </div>
        )}

      </div>
    </main>
  );
}