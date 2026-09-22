"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type FinanceRow = {
  payment_id: string;
  booking_id: string;
  starts_at: string;
  artist_name: string;
  booking_status: string;
  payment_status: string;
  payment_method: string | null;
  provider: string | null;
  agreed_fee: number;
  travel_amount: number;
  toll_amount: number;
  lodging_amount: number;
  platform_fee_venue: number;
  provider_fee: number;
  gross_amount: number;
  paid_at: string | null;
  created_at: string;
};

function dinheiro(valor: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(valor || 0));
}

function dataHora(valor: string | null) {
  if (!valor) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(valor));
}

function statusPagamento(status: string) {
  if (status === "paid") {
    return {
      texto: "Pago",
      classe:
        "border-green-800 bg-green-950/30 text-green-300",
    };
  }

  if (status === "pending") {
    return {
      texto: "Aguardando pagamento",
      classe:
        "border-yellow-800 bg-yellow-950/30 text-yellow-300",
    };
  }

  if (status === "failed") {
    return {
      texto: "Falhou",
      classe:
        "border-red-800 bg-red-950/30 text-red-300",
    };
  }

  return {
    texto: status || "Não informado",
    classe:
      "border-zinc-800 bg-zinc-900 text-zinc-400",
  };
}

function statusEvento(status: string) {
  const nomes: Record<string, string> = {
    awaiting_payment: "Aguardando pagamento",
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

export default function FinanceiroCasaPage() {
  const router = useRouter();

  const [nomeCasa, setNomeCasa] = useState("");
  const [dados, setDados] = useState<FinanceRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");

  async function carregarFinanceiro() {
    try {
      setCarregando(true);
      setErro("");

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.replace("/login");
        return;
      }

      const {
        data: casa,
        error: casaError,
      } = await supabase
        .from("venue_profiles")
        .select("id, trade_name")
        .eq("owner_user_id", user.id)
        .maybeSingle();

      if (casaError) {
        throw casaError;
      }

      if (!casa) {
        setErro("Perfil de Casa não encontrado.");
        return;
      }

      setNomeCasa(casa.trade_name);

      const {
        data,
        error,
      } = await supabase.rpc("get_venue_finance");

      if (error) {
        throw error;
      }

      setDados((data || []) as FinanceRow[]);
    } catch (error: unknown) {
      console.error(error);

      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o financeiro da Casa."
      );
    } finally {
      setCarregando(false);
    }
  }

  const carregarFinanceiroEffect = useEffectEvent(() => {
    void carregarFinanceiro();
  });

  useEffect(() => {
    carregarFinanceiroEffect();
  }, []);

  const totais = useMemo(() => {
    let totalPago = 0;
    let aguardando = 0;
    let taxaAsaas = 0;
    let taxaAura = 0;

    for (const linha of dados) {
      const total = Number(linha.gross_amount || 0);

      if (linha.payment_status === "paid") {
        totalPago += total;
        taxaAsaas +=
          Number(linha.provider_fee || 0);
        taxaAura += Number(linha.platform_fee_venue || 0);
      }

      if (linha.payment_status === "pending") {
        aguardando += total;
      }
    }

    return {
      totalPago,
      aguardando,
      taxaAsaas,
      taxaAura,
    };
  }, [dados]);

  const resultados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    if (!termo) return dados;

    return dados.filter((linha) => {
      const texto = [
        linha.artist_name,
        linha.booking_status,
        linha.payment_status,
        linha.payment_method,
        linha.provider,
        linha.booking_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return texto.includes(termo);
    });
  }, [busca, dados]);

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
            <p className="text-sm font-bold uppercase tracking-wider text-red-400">
              Aura Beat
            </p>

            <h1 className="mt-2 text-3xl font-black">
              Financeiro da Casa
            </h1>

            <p className="mt-2 text-zinc-400">
              {nomeCasa
                ? `${nomeCasa}, acompanhe seus pagamentos e contratações.`
                : "Acompanhe seus pagamentos e contratações."}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void carregarFinanceiro()}
            className="rounded-xl border border-zinc-800 px-4 py-2 text-sm font-bold text-zinc-300 hover:bg-zinc-900"
          >
            Atualizar
          </button>
        </div>

        {erro && (
          <div className="mb-6 rounded-xl border border-red-900 bg-red-950/30 p-4 text-red-300">
            {erro}
          </div>
        )}

        <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-green-900/60 bg-green-950/10 p-5">
            <p className="text-sm text-green-300">
              Taxas pagas
            </p>

            <p className="mt-2 text-3xl font-black text-green-400">
              {dinheiro(totais.totalPago)}
            </p>
          </div>

          <div className="rounded-2xl border border-yellow-900/60 bg-yellow-950/10 p-5">
            <p className="text-sm text-yellow-300">
              Taxas pendentes
            </p>

            <p className="mt-2 text-3xl font-black">
              {dinheiro(totais.aguardando)}
            </p>
          </div>

          <div className="rounded-2xl border border-purple-900/60 bg-purple-950/10 p-5">
            <p className="text-sm text-purple-300">
              Taxa ASAAS
            </p>

            <p className="mt-2 text-3xl font-black text-purple-400">
              {dinheiro(totais.taxaAsaas)}
            </p>
          </div>

          <div className="rounded-2xl border border-blue-900/60 bg-blue-950/10 p-5">
            <p className="text-sm text-blue-300">
              Taxa Aura Beat
            </p>

            <p className="mt-2 text-3xl font-black text-blue-400">
              {dinheiro(totais.taxaAura)}
            </p>
          </div>
        </div>

        <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h2 className="text-xl font-black">
              Histórico de pagamentos
            </h2>

            <p className="mt-1 text-sm text-zinc-500">
              O Pix do Aura Beat cobra somente a taxa da plataforma. Cachê e extras são pagos diretamente ao DJ.
            </p>
          </div>

          <input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar DJ ou evento..."
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-red-500 md:max-w-sm"
          />
        </div>

        {resultados.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-zinc-800 p-12 text-center text-zinc-500">
            Nenhuma movimentação financeira encontrada.
          </div>
        ) : (
          <div className="space-y-5">
            {resultados.map((linha) => {
              const pagamento = statusPagamento(
                linha.payment_status
              );

              return (
                <article
                  key={linha.payment_id}
                  className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6"
                >
                  <div className="flex flex-col justify-between gap-5 md:flex-row">
                    <div>
                      <div className="mb-3 flex flex-wrap gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-bold ${pagamento.classe}`}
                        >
                          {pagamento.texto}
                        </span>

                        <span className="rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-400">
                          {statusEvento(linha.booking_status)}
                        </span>
                      </div>

                      <p className="text-xs uppercase text-zinc-600">
                        Artista contratado
                      </p>

                      <h3 className="mt-1 text-xl font-black">
                        {linha.artist_name}
                      </h3>

                      <p className="mt-2 text-sm text-zinc-500">
                        Evento: {dataHora(linha.starts_at)}
                      </p>
                    </div>

                    <div className="md:text-right">
                      <p className="text-xs uppercase text-zinc-600">
                        Total do Pix
                      </p>

                      <p className="mt-1 text-3xl font-black text-green-400">
                        {dinheiro(linha.gross_amount)}
                      </p>

                      {linha.paid_at && (
                        <p className="mt-1 text-xs text-zinc-600">
                          Pago em {dataHora(linha.paid_at)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 rounded-2xl bg-black p-5">
                    <div className="flex justify-between text-sm text-zinc-400">
                      <span>Cachê combinado · fora do Aura Beat</span>
                      <span>{dinheiro(linha.agreed_fee)}</span>
                    </div>

                    <div className="mt-3 flex justify-between text-sm text-red-300">
                      <span>Taxa Aura Beat · 3%</span>
                      <span>
                        {dinheiro(
                          Number(linha.platform_fee_venue || 0)
                        )}
                      </span>
                    </div>

                    <div className="mt-3 flex justify-between text-sm text-zinc-400">
                      <span>Taxa ASAAS</span>
                      <span>
                        + {dinheiro(
                          Number(linha.provider_fee || 0)
                        )}
                      </span>
                    </div>

                    {Number(linha.travel_amount) > 0 && (
                      <div className="mt-3 flex justify-between text-sm text-zinc-400">
                        <span>Deslocamento</span>
                        <span>
                          + {dinheiro(linha.travel_amount)}
                        </span>
                      </div>
                    )}

                    {Number(linha.toll_amount) > 0 && (
                      <div className="mt-3 flex justify-between text-sm text-zinc-400">
                        <span>Pedágio</span>
                        <span>
                          + {dinheiro(linha.toll_amount)}
                        </span>
                      </div>
                    )}

                    {Number(linha.lodging_amount) > 0 && (
                      <div className="mt-3 flex justify-between text-sm text-zinc-400">
                        <span>Hospedagem</span>
                        <span>
                          + {dinheiro(linha.lodging_amount)}
                        </span>
                      </div>
                    )}

                    <div className="mt-4 flex justify-between border-t border-zinc-800 pt-4 font-black">
                      <span>Total</span>

                      <span className="text-green-400">
                        {dinheiro(linha.gross_amount)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 text-xs text-zinc-600">
                    Método: {linha.payment_method || "—"}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}