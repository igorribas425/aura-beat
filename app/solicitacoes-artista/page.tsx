"use client";

import {
  useEffect,
  useState,
} from "react";

import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type Artista = {
  id: string;
  stage_name: string;
};

type Oferta = {
  id: string;
  title: string;
  fee_amount: number;
  available_from: string;
  available_until: string;
};

type Casa = {
  id: string;
  trade_name: string;
  city: string | null;
  state: string | null;
  verification_status: string | null;
};

type Solicitacao = {
  id: string;
  artist_offer_id: string;
  venue_id: string;

  requested_starts_at: string;
  duration_minutes: number;

  agreed_fee: number;

  travel_amount: number;
  toll_amount: number;
  lodging_amount: number;

  event_address: string | null;
  message: string | null;

  status:
    | "pending"
    | "accepted"
    | "declined"
    | "cancelled";

  created_at: string;
};

type SolicitacaoVisual =
  Solicitacao & {
    oferta: Oferta | null;
    casa: Casa | null;
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

function duracao(minutos: number) {
  const horas =
    Math.floor(minutos / 60);

  const resto =
    minutos % 60;

  if (
    horas > 0 &&
    resto > 0
  ) {
    return `${horas}h ${resto}min`;
  }

  if (horas > 0) {
    return `${horas}h`;
  }

  return `${resto} min`;
}

function statusSolicitacao(
  status: Solicitacao["status"]
) {
  switch (status) {
    case "pending":
      return {
        texto:
          "Aguardando sua resposta",
        classe:
          "border-yellow-800 bg-yellow-950/30 text-yellow-300",
      };

    case "accepted":
      return {
        texto:
          "Contratação aceita",
        classe:
          "border-green-800 bg-green-950/30 text-green-300",
      };

    case "declined":
      return {
        texto:
          "Recusada",
        classe:
          "border-zinc-700 bg-zinc-900 text-zinc-400",
      };

    case "cancelled":
      return {
        texto:
          "Cancelada",
        classe:
          "border-red-900 bg-red-950/30 text-red-400",
      };

    default:
      return {
        texto: status,
        classe:
          "border-zinc-700 text-zinc-400",
      };
  }
}

export default function SolicitacoesArtistaPage() {
  const router = useRouter();

  const [artista, setArtista] =
    useState<Artista | null>(null);

  const [
    solicitacoes,
    setSolicitacoes,
  ] = useState<
    SolicitacaoVisual[]
  >([]);

  const [carregando, setCarregando] =
    useState(true);

  const [
    processando,
    setProcessando,
  ] = useState<string | null>(
    null
  );

  const [erro, setErro] =
    useState("");

  const [mensagem, setMensagem] =
    useState("");

  useEffect(() => {
    void carregarPagina();
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
        data: artistaData,
        error: artistaError,
      } = await supabase
        .from("artist_profiles")
        .select(`
          id,
          stage_name
        `)
        .eq(
          "user_id",
          authData.user.id
        )
        .maybeSingle();

      if (artistaError) {
        throw artistaError;
      }

      if (!artistaData) {
        setErro(
          "Perfil de artista não encontrado."
        );

        return;
      }

      const perfil =
        artistaData as Artista;

      setArtista(perfil);

      const {
        data: ofertasData,
        error: ofertasError,
      } = await supabase
        .from("artist_offers")
        .select(`
          id,
          title,
          fee_amount,
          available_from,
          available_until
        `)
        .eq(
          "artist_id",
          perfil.id
        );

      if (ofertasError) {
        throw ofertasError;
      }

      const ofertas =
        (ofertasData ||
          []) as Oferta[];

      if (
        ofertas.length === 0
      ) {
        setSolicitacoes([]);
        return;
      }

      const idsOfertas =
        ofertas.map(
          (oferta) => oferta.id
        );

      const {
        data: solicitacoesData,
        error:
          solicitacoesError,
      } = await supabase
        .from(
          "artist_offer_requests"
        )
        .select(`
          id,
          artist_offer_id,
          venue_id,
          requested_starts_at,
          duration_minutes,
          agreed_fee,
          travel_amount,
          toll_amount,
          lodging_amount,
          event_address,
          message,
          status,
          created_at
        `)
        .in(
          "artist_offer_id",
          idsOfertas
        )
        .order(
          "created_at",
          {
            ascending: false,
          }
        );

      if (solicitacoesError) {
        throw solicitacoesError;
      }

      const lista =
        (solicitacoesData ||
          []) as Solicitacao[];

      if (
        lista.length === 0
      ) {
        setSolicitacoes([]);
        return;
      }

      const idsCasas = [
        ...new Set(
          lista.map(
            (item) =>
              item.venue_id
          )
        ),
      ];

      const {
        data: casasData,
        error: casasError,
      } = await supabase
        .from("venue_profiles")
        .select(`
          id,
          trade_name,
          city,
          state,
          verification_status
        `)
        .in(
          "id",
          idsCasas
        );

      if (casasError) {
        throw casasError;
      }

      const casas =
        (casasData ||
          []) as Casa[];

      const mapaOfertas =
        new Map(
          ofertas.map(
            (oferta) => [
              oferta.id,
              oferta,
            ]
          )
        );

      const mapaCasas =
        new Map(
          casas.map(
            (casa) => [
              casa.id,
              casa,
            ]
          )
        );

      setSolicitacoes(
        lista.map(
          (item) => ({
            ...item,

            oferta:
              mapaOfertas.get(
                item.artist_offer_id
              ) || null,

            casa:
              mapaCasas.get(
                item.venue_id
              ) || null,
          })
        )
      );
    } catch (error) {
      console.error(error);

      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar as solicitações."
      );
    } finally {
      setCarregando(false);
    }
  }

  async function responder(
    solicitacao: SolicitacaoVisual,
    acao:
      | "accepted"
      | "declined"
  ) {
    const aceitar =
      acao === "accepted";

    const confirmar =
      window.confirm(
        aceitar
          ? `Aceitar a contratação de ${
              solicitacao.casa
                ?.trade_name ||
              "esta Casa"
            }?`
          : "Deseja recusar esta solicitação?"
      );

    if (!confirmar) {
      return;
    }

    try {
      setProcessando(
        solicitacao.id
      );

      setErro("");
      setMensagem("");

      const {
        data,
        error,
      } = await supabase.rpc(
        "responder_solicitacao_oferta_artista",
        {
          p_request_id:
            solicitacao.id,

          p_action:
            acao,
        }
      );

      if (error) {
        throw error;
      }

      if (aceitar) {
        setMensagem(
          "Contratação aceita! O booking foi criado e agora está aguardando o pagamento da Casa."
        );

        console.log(
          "Booking criado:",
          data
        );
      } else {
        setMensagem(
          "Solicitação recusada."
        );
      }

      await carregarPagina();
    } catch (error) {
      console.error(error);

      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível responder à solicitação."
      );
    } finally {
      setProcessando(null);
    }
  }

  if (carregando) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        Carregando...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">

      <div className="mx-auto max-w-5xl">

        <div className="mb-8">

          <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-purple-400">
            Aura Beat
          </p>

          <h1 className="text-3xl font-bold">
            Solicitações de contratação
          </h1>

          <p className="mt-2 text-zinc-400">
            {artista
              ? `${artista.stage_name}, veja as Casas interessadas nas suas disponibilidades.`
              : "Veja suas solicitações."}
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

        {solicitacoes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 p-12 text-center text-zinc-500">
            Nenhuma solicitação recebida ainda.
          </div>
        ) : (
          <div className="space-y-5">

            {solicitacoes.map(
              (solicitacao) => {
                const status =
                  statusSolicitacao(
                    solicitacao.status
                  );

                const cache =
                  Number(
                    solicitacao.agreed_fee ||
                      0
                  );

                const taxaArtista =
                  Number(
                    (
                      cache *
                      0.03
                    ).toFixed(2)
                  );

                const extras =
                  Number(
                    solicitacao.travel_amount ||
                      0
                  ) +
                  Number(
                    solicitacao.toll_amount ||
                      0
                  ) +
                  Number(
                    solicitacao.lodging_amount ||
                      0
                  );

                const liquido =
                  cache -
                  taxaArtista +
                  extras;

                return (
                  <article
                    key={
                      solicitacao.id
                    }
                    className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6"
                  >

                    <div className="flex flex-col justify-between gap-4 md:flex-row">

                      <div>

                        <div className="mb-3 flex flex-wrap items-center gap-2">

                          <span className="rounded-full border border-amber-800 bg-amber-950/30 px-2.5 py-1 text-xs font-semibold text-amber-300">
                            ⚡ Oferta Urgente
                          </span>

                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs ${status.classe}`}
                          >
                            {status.texto}
                          </span>

                          {solicitacao
                            .casa
                            ?.verification_status ===
                            "verified" && (
                            <span className="rounded-full border border-blue-900 bg-blue-950/30 px-2.5 py-1 text-xs text-blue-300">
                              ✓ Casa verificada
                            </span>
                          )}

                        </div>

                        <h2 className="text-xl font-bold">
                          {solicitacao
                            .casa
                            ?.trade_name ||
                            "Casa"}
                        </h2>

                        <p className="mt-1 text-sm text-zinc-500">
                          {solicitacao
                            .casa
                            ?.city ||
                            "Cidade não informada"}

                          {solicitacao
                            .casa
                            ?.state &&
                            `/${
                              solicitacao
                                .casa
                                ?.state
                            }`}
                        </p>

                      </div>

                      <div className="text-left md:text-right">

                        <div className="text-xl font-bold text-green-400">
                          {dinheiro(
                            cache
                          )}
                        </div>

                        <div className="text-xs text-zinc-500">
                          cachê proposto
                        </div>

                      </div>

                    </div>

                    <div className="mt-5 grid gap-3 rounded-xl bg-black p-4 text-sm text-zinc-400 md:grid-cols-2">

                      <div>
                        📅 Evento:{" "}
                        <span className="text-zinc-200">
                          {dataHora(
                            solicitacao.requested_starts_at
                          )}
                        </span>
                      </div>

                      <div>
                        ⏱ Duração:{" "}
                        <span className="text-zinc-200">
                          {duracao(
                            solicitacao.duration_minutes
                          )}
                        </span>
                      </div>

                      <div className="md:col-span-2">
                        📍 Local:{" "}
                        <span className="text-zinc-200">
                          {solicitacao.event_address ||
                            "Não informado"}
                        </span>
                      </div>

                    </div>

                    {solicitacao.message && (
                      <div className="mt-4 rounded-xl border border-zinc-800 p-4">

                        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                          Mensagem da Casa
                        </div>

                        <p className="text-sm text-zinc-300">
                          {
                            solicitacao.message
                          }
                        </p>

                      </div>
                    )}

                    <div className="mt-5 rounded-xl border border-zinc-800 bg-black p-4">

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
                          Taxa Aura Beat 3%
                        </span>

                        <span>
                          - {dinheiro(
                            taxaArtista
                          )}
                        </span>
                      </div>

                      {Number(
                        solicitacao.travel_amount
                      ) > 0 && (
                        <div className="mt-2 flex justify-between text-sm text-zinc-400">
                          <span>
                            Deslocamento
                          </span>

                          <span>
                            + {dinheiro(
                              solicitacao.travel_amount
                            )}
                          </span>
                        </div>
                      )}

                      {Number(
                        solicitacao.toll_amount
                      ) > 0 && (
                        <div className="mt-2 flex justify-between text-sm text-zinc-400">
                          <span>
                            Pedágio
                          </span>

                          <span>
                            + {dinheiro(
                              solicitacao.toll_amount
                            )}
                          </span>
                        </div>
                      )}

                      {Number(
                        solicitacao.lodging_amount
                      ) > 0 && (
                        <div className="mt-2 flex justify-between text-sm text-zinc-400">
                          <span>
                            Hospedagem
                          </span>

                          <span>
                            + {dinheiro(
                              solicitacao.lodging_amount
                            )}
                          </span>
                        </div>
                      )}

                      <div className="mt-3 flex justify-between border-t border-zinc-800 pt-3 text-lg font-bold">

                        <span>
                          Você recebe
                        </span>

                        <span className="text-green-400">
                          {dinheiro(
                            liquido
                          )}
                        </span>

                      </div>

                      <p className="mt-2 text-xs text-zinc-600">
                        A comissão é aplicada somente sobre o cachê.
                      </p>

                    </div>

                    {solicitacao.status ===
                      "pending" && (
                      <div className="mt-5 grid gap-3 sm:grid-cols-2">

                        <button
                          onClick={() =>
                            void responder(
                              solicitacao,
                              "declined"
                            )
                          }
                          disabled={
                            processando ===
                            solicitacao.id
                          }
                          className="rounded-xl border border-red-900 px-4 py-3 font-semibold text-red-400 transition hover:bg-red-950/30 disabled:opacity-50"
                        >
                          Recusar
                        </button>

                        <button
                          onClick={() =>
                            void responder(
                              solicitacao,
                              "accepted"
                            )
                          }
                          disabled={
                            processando ===
                            solicitacao.id
                          }
                          className="rounded-xl bg-green-600 px-4 py-3 font-semibold transition hover:bg-green-500 disabled:opacity-50"
                        >
                          {processando ===
                          solicitacao.id
                            ? "Processando..."
                            : "✓ Aceitar contratação"}
                        </button>

                      </div>
                    )}

                    {solicitacao.status ===
                      "accepted" && (
                      <button
                        onClick={() =>
                          router.push(
                            "/eventos-artista"
                          )
                        }
                        className="mt-5 w-full rounded-xl bg-purple-600 px-4 py-3 font-semibold hover:bg-purple-500"
                      >
                        Abrir contratação
                      </button>
                    )}

                  </article>
                );
              }
            )}

          </div>
        )}

      </div>
    </main>
  );
}