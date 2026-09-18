"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type FinanceRow = {
  booking_id: string;
  starts_at: string;

  venue_name: string;

  booking_status: string;
  payment_status: string | null;

  agreed_fee: number;
  platform_fee_artist: number;

  travel_amount: number;
  toll_amount: number;
  lodging_amount: number;

  artist_total: number;

  release_kind:
    | "performance"
    | "travel"
    | null;

  release_amount: number | null;

  release_status:
    | "pending"
    | "eligible"
    | "released"
    | "held"
    | "cancelled"
    | null;

  eligible_at: string | null;
  released_at: string | null;
};

type BookingFinance = {
  booking_id: string;
  starts_at: string;
  venue_name: string;

  booking_status: string;
  payment_status: string | null;

  agreed_fee: number;
  platform_fee_artist: number;

  travel_amount: number;
  toll_amount: number;
  lodging_amount: number;

  artist_total: number;

  releases: FinanceRow[];
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

function statusEvento(status: string) {
  switch (status) {
    case "awaiting_payment":
      return "Aguardando pagamento";

    case "confirmed":
      return "Confirmado";

    case "in_transit":
      return "DJ a caminho";

    case "arrived":
      return "DJ chegou";

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

function statusRepasse(
  status: FinanceRow["release_status"]
) {
  switch (status) {
    case "pending":
      return {
        texto: "Pendente",
        classe:
          "border-yellow-800 bg-yellow-950/30 text-yellow-300",
      };

    case "eligible":
      return {
        texto: "Disponível para repasse",
        classe:
          "border-green-800 bg-green-950/30 text-green-300",
      };

    case "released":
      return {
        texto: "Pago",
        classe:
          "border-blue-800 bg-blue-950/30 text-blue-300",
      };

    case "held":
      return {
        texto: "Retido",
        classe:
          "border-orange-800 bg-orange-950/30 text-orange-300",
      };

    case "cancelled":
      return {
        texto: "Cancelado",
        classe:
          "border-zinc-700 bg-zinc-900 text-zinc-500",
      };

    default:
      return {
        texto: "Sem pagamento",
        classe:
          "border-zinc-800 bg-zinc-950 text-zinc-500",
      };
  }
}

export default function FinanceiroArtistaPage() {
  const router = useRouter();

  const [nomeArtista, setNomeArtista] =
    useState("");

  const [dados, setDados] =
    useState<FinanceRow[]>([]);

  const [carregando, setCarregando] =
    useState(true);

  const [erro, setErro] =
    useState("");

  useEffect(() => {
    void carregarFinanceiro();
  }, []);

  async function carregarFinanceiro() {
    try {
      setCarregando(true);
      setErro("");

      const {
        data: authData,
        error: authError,
      } = await supabase.auth.getUser();

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

      setNomeArtista(
        artistaData.stage_name
      );

      const {
        data,
        error,
      } = await supabase.rpc(
        "get_artist_finance"
      );

      if (error) {
        throw error;
      }

      setDados(
        (data || []) as FinanceRow[]
      );
    } catch (error) {
      console.error(error);

      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o financeiro."
      );
    } finally {
      setCarregando(false);
    }
  }

  const totais =
    useMemo(() => {
      let pendente = 0;
      let disponivel = 0;
      let pago = 0;

      for (const linha of dados) {
        const valor =
          Number(
            linha.release_amount ||
              0
          );

        if (
          linha.release_status ===
          "pending"
        ) {
          pendente += valor;
        }

        if (
          linha.release_status ===
          "eligible"
        ) {
          disponivel += valor;
        }

        if (
          linha.release_status ===
          "released"
        ) {
          pago += valor;
        }
      }

      return {
        pendente,
        disponivel,
        pago,
      };
    }, [dados]);

  const bookings =
    useMemo(() => {
      const mapa =
        new Map<
          string,
          BookingFinance
        >();

      for (const linha of dados) {
        const existente =
          mapa.get(
            linha.booking_id
          );

        if (existente) {
          existente.releases.push(
            linha
          );

          continue;
        }

        mapa.set(
          linha.booking_id,
          {
            booking_id:
              linha.booking_id,

            starts_at:
              linha.starts_at,

            venue_name:
              linha.venue_name,

            booking_status:
              linha.booking_status,

            payment_status:
              linha.payment_status,

            agreed_fee:
              Number(
                linha.agreed_fee ||
                  0
              ),

            platform_fee_artist:
              Number(
                linha.platform_fee_artist ||
                  0
              ),

            travel_amount:
              Number(
                linha.travel_amount ||
                  0
              ),

            toll_amount:
              Number(
                linha.toll_amount ||
                  0
              ),

            lodging_amount:
              Number(
                linha.lodging_amount ||
                  0
              ),

            artist_total:
              Number(
                linha.artist_total ||
                  0
              ),

            releases: [linha],
          }
        );
      }

      return Array.from(
        mapa.values()
      );
    }, [dados]);

  if (carregando) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        Carregando financeiro...
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
            Financeiro
          </h1>

          <p className="mt-2 text-zinc-400">
            {nomeArtista
              ? `${nomeArtista}, acompanhe seus cachês e repasses.`
              : "Acompanhe seus cachês e repasses."}
          </p>

        </div>

        {erro && (
          <div className="mb-6 rounded-xl border border-red-900 bg-red-950/30 p-4 text-red-300">
            {erro}
          </div>
        )}

        <div className="mb-8 grid gap-4 md:grid-cols-3">

          <div className="rounded-2xl border border-yellow-900/60 bg-yellow-950/10 p-5">
            <div className="text-sm text-yellow-300">
              A receber
            </div>

            <div className="mt-2 text-3xl font-bold">
              {dinheiro(
                totais.pendente
              )}
            </div>

            <p className="mt-2 text-xs text-zinc-500">
              Eventos ainda não finalizados.
            </p>
          </div>

          <div className="rounded-2xl border border-green-900/60 bg-green-950/10 p-5">
            <div className="text-sm text-green-300">
              Disponível para repasse
            </div>

            <div className="mt-2 text-3xl font-bold text-green-400">
              {dinheiro(
                totais.disponivel
              )}
            </div>

            <p className="mt-2 text-xs text-zinc-500">
              Eventos finalizados e liberados.
            </p>
          </div>

          <div className="rounded-2xl border border-blue-900/60 bg-blue-950/10 p-5">
            <div className="text-sm text-blue-300">
              Já pago
            </div>

            <div className="mt-2 text-3xl font-bold text-blue-400">
              {dinheiro(
                totais.pago
              )}
            </div>

            <p className="mt-2 text-xs text-zinc-500">
              Repasses efetivamente concluídos.
            </p>
          </div>

        </div>

        <div className="mb-5 flex items-center justify-between">

          <div>
            <h2 className="text-xl font-bold">
              Histórico
            </h2>

            <p className="text-sm text-zinc-500">
              Detalhes das suas contratações.
            </p>
          </div>

          <button
            onClick={() =>
              void carregarFinanceiro()
            }
            className="rounded-xl border border-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-900"
          >
            Atualizar
          </button>

        </div>

        {bookings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 p-12 text-center text-zinc-500">
            Nenhuma movimentação financeira ainda.
          </div>
        ) : (
          <div className="space-y-5">

            {bookings.map(
              (booking) => {
                const principal =
                  booking.releases.find(
                    (release) =>
                      release.release_kind ===
                      "performance"
                  ) ||
                  booking.releases[0];

                const status =
                  statusRepasse(
                    principal
                      ?.release_status ||
                      null
                  );

                const extras =
                  booking.travel_amount +
                  booking.toll_amount +
                  booking.lodging_amount;

                return (
                  <article
                    key={
                      booking.booking_id
                    }
                    className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6"
                  >

                    <div className="flex flex-col justify-between gap-4 md:flex-row">

                      <div>

                        <div className="mb-3 flex flex-wrap items-center gap-2">

                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-semibold ${status.classe}`}
                          >
                            {
                              status.texto
                            }
                          </span>

                          <span className="rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-400">
                            {statusEvento(
                              booking.booking_status
                            )}
                          </span>

                        </div>

                        <h3 className="text-xl font-bold">
                          {
                            booking.venue_name
                          }
                        </h3>

                        <p className="mt-1 text-sm text-zinc-500">
                          {dataHora(
                            booking.starts_at
                          )}
                        </p>

                      </div>

                      <div className="text-left md:text-right">

                        <div className="text-2xl font-bold text-green-400">
                          {dinheiro(
                            booking.artist_total
                          )}
                        </div>

                        <div className="text-xs text-zinc-500">
                          líquido do artista
                        </div>

                      </div>

                    </div>

                    <div className="mt-5 rounded-xl border border-zinc-800 bg-black p-4">

                      <div className="flex justify-between text-sm text-zinc-400">
                        <span>
                          Cachê
                        </span>

                        <span>
                          {dinheiro(
                            booking.agreed_fee
                          )}
                        </span>
                      </div>

                      {booking.platform_fee_artist >
                        0 && (
                        <div className="mt-2 flex justify-between text-sm text-zinc-400">

                          <span>
                            Taxa Aura Beat
                          </span>

                          <span>
                            -{" "}
                            {dinheiro(
                              booking.platform_fee_artist
                            )}
                          </span>

                        </div>
                      )}

                      {booking.travel_amount >
                        0 && (
                        <div className="mt-2 flex justify-between text-sm text-zinc-400">

                          <span>
                            Deslocamento
                          </span>

                          <span>
                            +{" "}
                            {dinheiro(
                              booking.travel_amount
                            )}
                          </span>

                        </div>
                      )}

                      {booking.toll_amount >
                        0 && (
                        <div className="mt-2 flex justify-between text-sm text-zinc-400">

                          <span>
                            Pedágio
                          </span>

                          <span>
                            +{" "}
                            {dinheiro(
                              booking.toll_amount
                            )}
                          </span>

                        </div>
                      )}

                      {booking.lodging_amount >
                        0 && (
                        <div className="mt-2 flex justify-between text-sm text-zinc-400">

                          <span>
                            Hospedagem
                          </span>

                          <span>
                            +{" "}
                            {dinheiro(
                              booking.lodging_amount
                            )}
                          </span>

                        </div>
                      )}

                      <div className="mt-3 flex justify-between border-t border-zinc-800 pt-3 font-bold">

                        <span>
                          Total líquido
                        </span>

                        <span className="text-green-400">
                          {dinheiro(
                            booking.artist_total
                          )}
                        </span>

                      </div>

                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">

                      {booking.releases.map(
                        (
                          release,
                          index
                        ) => {
                          if (
                            !release.release_kind
                          ) {
                            return null;
                          }

                          const releaseStatus =
                            statusRepasse(
                              release.release_status
                            );

                          return (
                            <div
                              key={`${booking.booking_id}-${release.release_kind}-${index}`}
                              className="rounded-xl bg-black p-4"
                            >

                              <div className="flex items-center justify-between gap-3">

                                <div>
                                  <div className="text-sm font-semibold">
                                    {release.release_kind ===
                                    "performance"
                                      ? "Cachê"
                                      : "Extras"}
                                  </div>

                                  <div className="mt-1 text-xs text-zinc-500">
                                    {
                                      releaseStatus.texto
                                    }
                                  </div>
                                </div>

                                <div className="font-semibold">
                                  {dinheiro(
                                    Number(
                                      release.release_amount ||
                                        0
                                    )
                                  )}
                                </div>

                              </div>

                            </div>
                          );
                        }
                      )}

                    </div>

                    {extras === 0 && (
                      <p className="mt-4 text-xs text-zinc-600">
                        Nenhum valor adicional de deslocamento,
                        pedágio ou hospedagem nesta contratação.
                      </p>
                    )}

                    {principal?.release_status ===
                      "eligible" && (
                      <div className="mt-5 rounded-xl border border-green-900/60 bg-green-950/20 p-4 text-sm text-green-300">
                        ✓ Este valor está liberado para repasse.
                        Ele só será marcado como pago quando a
                        transferência financeira for realmente
                        confirmada.
                      </div>
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