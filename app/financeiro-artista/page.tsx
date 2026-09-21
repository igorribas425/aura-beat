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
};

function dinheiro(valor: number) {
  return new Intl.NumberFormat(
    "pt-BR",
    {
      style: "currency",
      currency: "BRL",
    }
  ).format(
    Number(valor || 0)
  );
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
  ).format(
    new Date(valor)
  );
}

function statusEvento(status: string) {
  const nomes: Record<string, string> = {
    awaiting_payment: "Aguardando taxas",
    confirmed: "Confirmado",
    in_transit: "DJ a caminho",
    arrived: "DJ chegou",
    in_event: "Evento acontecendo",
    completed: "Finalizado",
    cancelled: "Cancelado",
    disputed: "Em análise",
  };

  return nomes[status] || status;
}

function statusTaxa(
  taxa: number,
  status: string | null
) {
  if (taxa <= 0) {
    return {
      texto:
        "Sem taxa do Artista",
      classe:
        "border-zinc-800 bg-zinc-900 text-zinc-400",
    };
  }

  if (status === "paid") {
    return {
      texto:
        "Taxa Aura Beat paga",
      classe:
        "border-green-800 bg-green-950/30 text-green-300",
    };
  }

  if (status === "processing") {
    return {
      texto:
        "Taxa em processamento",
      classe:
        "border-blue-800 bg-blue-950/30 text-blue-300",
    };
  }

  if (status === "failed") {
    return {
      texto:
        "Pagamento falhou",
      classe:
        "border-red-800 bg-red-950/30 text-red-300",
    };
  }

  return {
    texto:
      "Taxa de 3% pendente",
    classe:
      "border-yellow-800 bg-yellow-950/30 text-yellow-300",
  };
}

export default function FinanceiroArtistaPage() {
  const router = useRouter();

  const [
    nomeArtista,
    setNomeArtista,
  ] = useState("");

  const [
    dados,
    setDados,
  ] = useState<FinanceRow[]>([]);

  const [
    carregando,
    setCarregando,
  ] = useState(true);

  const [
    erro,
    setErro,
  ] = useState("");

  async function carregarFinanceiro() {
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
        .select("id,stage_name")
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
        ((data || []) as FinanceRow[])
          .map((linha) => ({
            ...linha,
            agreed_fee: Number(
              linha.agreed_fee || 0
            ),
            platform_fee_artist:
              Number(
                linha.platform_fee_artist ||
                  0
              ),
            travel_amount: Number(
              linha.travel_amount || 0
            ),
            toll_amount: Number(
              linha.toll_amount || 0
            ),
            lodging_amount: Number(
              linha.lodging_amount || 0
            ),
            artist_total: Number(
              linha.artist_total || 0
            ),
          }))
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

  useEffect(() => {
    void carregarFinanceiro();
  }, []);

  const totais =
    useMemo(() => {
      let caches = 0;
      let taxaPendente = 0;
      let taxaPaga = 0;

      for (const linha of dados) {
        caches +=
          Number(
            linha.agreed_fee || 0
          );

        const taxa =
          Number(
            linha.platform_fee_artist ||
              0
          );

        if (taxa <= 0) {
          continue;
        }

        if (
          linha.payment_status ===
          "paid"
        ) {
          taxaPaga += taxa;
        } else {
          taxaPendente += taxa;
        }
      }

      return {
        caches,
        taxaPendente,
        taxaPaga,
      };
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
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-purple-400">
              Aura Beat
            </p>

            <h1 className="text-3xl font-bold">
              Financeiro do Artista
            </h1>

            <p className="mt-2 text-zinc-400">
              {nomeArtista
                ? `${nomeArtista}, acompanhe seus cachês combinados e as taxas do Aura Beat.`
                : "Acompanhe seus cachês combinados e as taxas do Aura Beat."}
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              void carregarFinanceiro()
            }
            className="rounded-xl border border-zinc-800 px-4 py-2 text-sm font-bold text-zinc-300 hover:bg-zinc-900"
          >
            Atualizar
          </button>
        </div>

        <div className="mb-6 rounded-2xl border border-purple-900/50 bg-purple-950/10 p-4 text-sm leading-6 text-purple-100/80">
          O Aura Beat não recebe nem repassa o cachê do DJ. Cachê, deslocamento,
          pedágio e hospedagem são pagos diretamente entre Casa e Artista.
          Em contratação urgente, o Artista paga 3% ao Aura Beat.
        </div>

        {erro && (
          <div className="mb-6 rounded-xl border border-red-900 bg-red-950/30 p-4 text-red-300">
            {erro}
          </div>
        )}

        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="text-sm text-zinc-400">
              Cachês combinados
            </div>

            <div className="mt-2 text-3xl font-bold">
              {dinheiro(
                totais.caches
              )}
            </div>

            <p className="mt-2 text-xs text-zinc-600">
              Pagos diretamente pelas Casas.
            </p>
          </div>

          <div className="rounded-2xl border border-yellow-900/60 bg-yellow-950/10 p-5">
            <div className="text-sm text-yellow-300">
              Taxas pendentes
            </div>

            <div className="mt-2 text-3xl font-bold">
              {dinheiro(
                totais.taxaPendente
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-green-900/60 bg-green-950/10 p-5">
            <div className="text-sm text-green-300">
              Taxas pagas
            </div>

            <div className="mt-2 text-3xl font-bold text-green-400">
              {dinheiro(
                totais.taxaPaga
              )}
            </div>
          </div>
        </div>

        <div className="mb-5">
          <h2 className="text-xl font-bold">
            Histórico
          </h2>

          <p className="text-sm text-zinc-500">
            Detalhes das suas contratações.
          </p>
        </div>

        {dados.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 p-12 text-center text-zinc-500">
            Nenhuma movimentação financeira ainda.
          </div>
        ) : (
          <div className="space-y-5">
            {dados.map(
              (linha) => {
                const taxa =
                  Number(
                    linha.platform_fee_artist ||
                      0
                  );

                const extras =
                  Number(
                    linha.travel_amount ||
                      0
                  ) +
                  Number(
                    linha.toll_amount ||
                      0
                  ) +
                  Number(
                    linha.lodging_amount ||
                      0
                  );

                const status =
                  statusTaxa(
                    taxa,
                    linha.payment_status
                  );

                return (
                  <article
                    key={
                      linha.booking_id
                    }
                    className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6"
                  >
                    <div className="flex flex-col justify-between gap-5 md:flex-row">
                      <div>
                        <div className="mb-3 flex flex-wrap gap-2">
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-semibold ${status.classe}`}
                          >
                            {status.texto}
                          </span>

                          <span className="rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-400">
                            {statusEvento(
                              linha.booking_status
                            )}
                          </span>
                        </div>

                        <h3 className="text-xl font-bold">
                          {
                            linha.venue_name
                          }
                        </h3>

                        <p className="mt-1 text-sm text-zinc-500">
                          {dataHora(
                            linha.starts_at
                          )}
                        </p>
                      </div>

                      <div className="md:text-right">
                        <p className="text-xs uppercase text-zinc-600">
                          Cachê combinado
                        </p>

                        <p className="mt-1 text-2xl font-bold text-green-400">
                          {dinheiro(
                            linha.agreed_fee
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 rounded-xl border border-zinc-800 bg-black p-4">
                      <div className="flex justify-between text-sm text-zinc-400">
                        <span>
                          Cachê
                        </span>
                        <span>
                          {dinheiro(
                            linha.agreed_fee
                          )}
                        </span>
                      </div>

                      {extras > 0 && (
                        <div className="mt-2 flex justify-between text-sm text-zinc-400">
                          <span>
                            Extras combinados
                          </span>
                          <span>
                            +{" "}
                            {dinheiro(
                              extras
                            )}
                          </span>
                        </div>
                      )}

                      {taxa > 0 && (
                        <div className="mt-2 flex justify-between text-sm text-red-300">
                          <span>
                            Taxa Aura Beat · 3%
                          </span>
                          <span>
                            -{" "}
                            {dinheiro(
                              taxa
                            )}
                          </span>
                        </div>
                      )}

                      <div className="mt-3 flex justify-between border-t border-zinc-800 pt-3 font-bold">
                        <span>
                          Resultado após taxa
                        </span>
                        <span>
                          {dinheiro(
                            linha.artist_total
                          )}
                        </span>
                      </div>
                    </div>

                    {taxa > 0 &&
                      linha.payment_status !==
                        "paid" &&
                      linha.booking_status ===
                        "awaiting_payment" && (
                        <button
                          type="button"
                          onClick={() =>
                            router.push(
                              `/pagamento/${linha.booking_id}?payer=artist`
                            )
                          }
                          className="mt-4 w-full rounded-xl bg-green-600 py-3 font-black hover:bg-green-500"
                        >
                          Pagar taxa de 3%
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
