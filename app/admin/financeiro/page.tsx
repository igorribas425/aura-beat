"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation";
import { getOwnerAccessFast } from "../../../lib/admin-access";
import { supabase } from "../../../lib/supabase";

type PlanPaymentRow = {
  payment_id: string;
  user_id: string;
  audience: "artist" | "venue";
  profile_name: string;
  plan_name: string;
  plan_code: string;
  status: string;
  amount: number;
  provider: string | null;
  provider_payment_id: string | null;
  paid_at: string | null;
  refunded_at: string | null;
  created_at: string;
};

type FinanceRow = {
  payment_id: string;
  booking_id: string;
  booking_status: string;
  starts_at: string;
  venue_name: string;
  artist_name: string;
  payment_status: string;
  payment_method: string | null;
  provider: string | null;
  gross_amount: number;
  agreed_fee: number;
  travel_amount: number;
  toll_amount: number;
  lodging_amount: number;
  platform_fee_venue: number;
  platform_fee_artist: number;
  provider_fee: number;
  aura_fee_total: number;
  artist_total: number;
  release_pending: number;
  release_eligible: number;
  release_released: number;
  paid_at: string | null;
  created_at: string;
};

type Filtro =
  | "todos"
  | "paid"
  | "pending"
  | "venue"
  | "artist"
  | "legacy";

function dinheiro(valor: number) {
  return new Intl.NumberFormat(
    "pt-BR",
    {
      style: "currency",
      currency: "BRL",
    }
  ).format(Number(valor || 0));
}

function dataHora(
  valor: string | null
) {
  if (!valor) return "—";

  try {
    return new Intl.DateTimeFormat(
      "pt-BR",
      {
        dateStyle: "short",
        timeStyle: "short",
      }
    ).format(new Date(valor));
  } catch {
    return "—";
  }
}

function statusPagamento(
  status: string
) {
  switch (status) {
    case "paid":
      return {
        texto: "Pago",
        classe:
          "border-green-800 bg-green-950/30 text-green-300",
      };
    case "pending":
      return {
        texto: "Pendente",
        classe:
          "border-yellow-800 bg-yellow-950/30 text-yellow-300",
      };
    case "processing":
      return {
        texto: "Processando",
        classe:
          "border-blue-800 bg-blue-950/30 text-blue-300",
      };
    case "failed":
      return {
        texto: "Falhou",
        classe:
          "border-red-900 bg-red-950/30 text-red-400",
      };
    case "refunded":
      return {
        texto: "Reembolsado",
        classe:
          "border-orange-900 bg-orange-950/30 text-orange-300",
      };
    case "cancelled":
      return {
        texto: "Cancelado",
        classe:
          "border-zinc-700 bg-zinc-900 text-zinc-400",
      };
    default:
      return {
        texto:
          status || "Desconhecido",
        classe:
          "border-zinc-700 bg-zinc-900 text-zinc-400",
      };
  }
}

function statusBooking(status: string) {
  const nomes: Record<string, string> = {
    awaiting_payment:
      "Aguardando taxas",
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

function normalizar(
  linha: FinanceRow
): FinanceRow {
  return {
    ...linha,
    gross_amount:
      Number(linha.gross_amount || 0),
    agreed_fee:
      Number(linha.agreed_fee || 0),
    travel_amount:
      Number(linha.travel_amount || 0),
    toll_amount:
      Number(linha.toll_amount || 0),
    lodging_amount:
      Number(linha.lodging_amount || 0),
    platform_fee_venue:
      Number(
        linha.platform_fee_venue ||
          0
      ),
    platform_fee_artist:
      Number(
        linha.platform_fee_artist ||
          0
      ),
    provider_fee:
      Number(linha.provider_fee || 0),
    aura_fee_total:
      Number(linha.aura_fee_total || 0),
    artist_total:
      Number(linha.artist_total || 0),
    release_pending:
      Number(linha.release_pending || 0),
    release_eligible:
      Number(
        linha.release_eligible || 0
      ),
    release_released:
      Number(
        linha.release_released || 0
      ),
  };
}

function payerKind(
  linha: FinanceRow
) {
  if (
    linha.platform_fee_artist > 0 &&
    linha.platform_fee_venue === 0
  ) {
    return "artist" as const;
  }

  if (
    linha.platform_fee_venue > 0 &&
    linha.platform_fee_artist === 0
  ) {
    return "venue" as const;
  }

  return "legacy" as const;
}

function isLegacy(
  linha: FinanceRow
) {
  if (
    linha.provider === "teste"
  ) {
    return true;
  }

  const expected =
    linha.aura_fee_total +
    linha.provider_fee;

  return (
    linha.gross_amount >
    expected + 0.02
  );
}

export default function AdminFinanceiroPage() {
  const router = useRouter();

  const [
    dados,
    setDados,
  ] = useState<FinanceRow[]>([]);

  const [
    planPayments,
    setPlanPayments,
  ] = useState<PlanPaymentRow[]>([]);

  const [
    busca,
    setBusca,
  ] = useState("");

  const [
    filtro,
    setFiltro,
  ] =
    useState<Filtro>("todos");

  const [
    carregando,
    setCarregando,
  ] = useState(true);

  const [
    erro,
    setErro,
  ] = useState("");

  const carregar =
    useCallback(
      async () => {
        try {
          setCarregando(true);
          setErro("");

          const ownerAccess =
            await getOwnerAccessFast();

          if (!ownerAccess.authenticated) {
            router.replace(
              "/login"
            );
            return;
          }

          if (!ownerAccess.allowed) {
            router.replace(
              "/home"
            );
            return;
          }

          const [
            financeResult,
            planPaymentsResult,
          ] = await Promise.all([
            supabase.rpc(
              "get_admin_finance"
            ),
            supabase.rpc(
              "owner_plan_payments_v1"
            ),
          ]);

          if (financeResult.error) {
            throw financeResult.error;
          }

          if (planPaymentsResult.error) {
            throw planPaymentsResult.error;
          }

          setDados(
            (
              (financeResult.data ||
                []) as FinanceRow[]
            ).map(normalizar)
          );

          setPlanPayments(
            (
              (planPaymentsResult.data ||
                []) as PlanPaymentRow[]
            ).map((row) => ({
              ...row,
              amount: Number(
                row.amount || 0
              ),
            }))
          );
        } catch (caught) {
          console.error(caught);
          setErro(
            caught instanceof Error
              ? caught.message
              : "Não foi possível carregar o financeiro administrativo."
          );
        } finally {
          setCarregando(false);
        }
      },
      [router]
    );

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const totais =
    useMemo(() => {
      let taxasRecebidas = 0;
      let taxasPendentes = 0;
      let tarifasProvedor = 0;
      let pixRecebidos = 0;

      for (const linha of dados) {
        if (isLegacy(linha)) {
          continue;
        }

        if (
          linha.payment_status ===
          "paid"
        ) {
          taxasRecebidas +=
            linha.aura_fee_total;

          tarifasProvedor +=
            linha.provider_fee;

          pixRecebidos +=
            linha.gross_amount;
        }

        if (
          [
            "pending",
            "processing",
          ].includes(
            linha.payment_status
          )
        ) {
          taxasPendentes +=
            linha.aura_fee_total;
        }
      }

      return {
        taxasRecebidas,
        taxasPendentes,
        tarifasProvedor,
        pixRecebidos,
      };
    }, [dados]);

  const planTotals =
    useMemo(() => {
      let recebidas = 0;
      let pendentes = 0;

      for (const payment of planPayments) {
        if (payment.status === "paid") {
          recebidas += payment.amount;
        }

        if (
          ["pending", "processing"].includes(
            payment.status
          )
        ) {
          pendentes += payment.amount;
        }
      }

      return {
        recebidas,
        pendentes,
      };
    }, [planPayments]);

  const filtrados =
    useMemo(() => {
      const termo =
        busca.trim().toLowerCase();

      return dados.filter(
        (linha) => {
          const kind =
            payerKind(linha);

          if (
            filtro === "paid" &&
            linha.payment_status !==
              "paid"
          ) {
            return false;
          }

          if (
            filtro === "pending" &&
            ![
              "pending",
              "processing",
            ].includes(
              linha.payment_status
            )
          ) {
            return false;
          }

          if (
            filtro === "venue" &&
            kind !== "venue"
          ) {
            return false;
          }

          if (
            filtro === "artist" &&
            kind !== "artist"
          ) {
            return false;
          }

          if (
            filtro === "legacy" &&
            !isLegacy(linha)
          ) {
            return false;
          }

          if (!termo) {
            return true;
          }

          return [
            linha.venue_name,
            linha.artist_name,
            linha.provider,
            linha.payment_method,
            linha.payment_status,
            linha.booking_status,
            linha.booking_id,
            linha.payment_id,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(termo);
        }
      );
    }, [
      busca,
      dados,
      filtro,
    ]);

  if (carregando) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        Carregando financeiro...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-red-400">
              Administração Aura Beat
            </p>

            <h1 className="mt-2 text-3xl font-bold">
              Financeiro
            </h1>

            <p className="mt-2 max-w-3xl text-zinc-400">
              O Aura Beat recebe somente as taxas da plataforma.
              Contratação normal: Casa 3%. Contratação urgente:
              Casa 3% + Artista 3%. Cachê e extras são acertados diretamente entre as partes.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              void carregar()
            }
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
            <div className="text-sm text-green-300">
              Taxas Aura recebidas
            </div>
            <div className="mt-2 text-2xl font-bold text-green-400">
              {dinheiro(
                totais.taxasRecebidas
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-yellow-900/60 bg-yellow-950/10 p-5">
            <div className="text-sm text-yellow-300">
              Taxas pendentes
            </div>
            <div className="mt-2 text-2xl font-bold">
              {dinheiro(
                totais.taxasPendentes
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-purple-900/60 bg-purple-950/10 p-5">
            <div className="text-sm text-purple-300">
              Pix recebidos
            </div>
            <div className="mt-2 text-2xl font-bold text-purple-300">
              {dinheiro(
                totais.pixRecebidos
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="text-sm text-zinc-400">
              Tarifas ASAAS
            </div>
            <div className="mt-2 text-2xl font-bold">
              {dinheiro(
                totais.tarifasProvedor
              )}
            </div>
          </div>
        </div>

        <section className="mb-8 rounded-3xl border border-purple-900/40 bg-purple-950/10 p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-purple-300">
                MENSALIDADES
              </p>
              <h2 className="mt-2 text-xl font-black">
                Planos pagos pelo ASAAS
              </h2>
              <p className="mt-2 text-sm text-zinc-500">
                Pagamentos de Artistas e Casas ativam o plano automaticamente por 1 mês.
              </p>
            </div>

            <div className="flex gap-3">
              <div className="rounded-2xl border border-green-900/60 bg-green-950/20 px-4 py-3">
                <p className="text-xs text-green-300">Recebido</p>
                <p className="mt-1 text-lg font-black text-green-400">
                  {dinheiro(planTotals.recebidas)}
                </p>
              </div>

              <div className="rounded-2xl border border-yellow-900/60 bg-yellow-950/20 px-4 py-3">
                <p className="text-xs text-yellow-300">Pendente</p>
                <p className="mt-1 text-lg font-black">
                  {dinheiro(planTotals.pendentes)}
                </p>
              </div>
            </div>
          </div>

          {planPayments.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
              Nenhuma mensalidade gerada ainda.
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {planPayments.slice(0, 12).map((payment) => {
                const visual = statusPagamento(payment.status);

                return (
                  <div
                    key={payment.payment_id}
                    className="flex flex-col justify-between gap-3 rounded-2xl border border-zinc-800 bg-black/40 p-4 sm:flex-row sm:items-center"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <strong>{payment.profile_name}</strong>
                        <span className="rounded-full border border-zinc-800 px-2 py-0.5 text-[10px] uppercase text-zinc-500">
                          {payment.audience === "venue" ? "Casa" : "Artista"}
                        </span>
                        <span className={"rounded-full border px-2 py-0.5 text-[10px] " + visual.classe}>
                          {visual.texto}
                        </span>
                      </div>

                      <p className="mt-1 text-sm text-zinc-400">
                        {payment.plan_name} · {dataHora(payment.created_at)}
                      </p>
                    </div>

                    <div className="sm:text-right">
                      <p className="text-lg font-black text-green-400">
                        {dinheiro(payment.amount)}
                      </p>
                      <p className="text-xs text-zinc-600">
                        {payment.provider || "ASAAS"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <input
            value={busca}
            onChange={(event) =>
              setBusca(
                event.target.value
              )
            }
            placeholder="Buscar Casa, Artista, booking ou pagamento..."
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-red-500 lg:max-w-xl"
          />

          <div className="flex flex-wrap gap-2">
            {(
              [
                ["todos", "Todos"],
                ["paid", "Pagos"],
                [
                  "pending",
                  "Pendentes",
                ],
                [
                  "venue",
                  "Taxa Casa",
                ],
                [
                  "artist",
                  "Taxa Artista",
                ],
                [
                  "legacy",
                  "Legado/Teste",
                ],
              ] as Array<
                [Filtro, string]
              >
            ).map(
              ([valor, texto]) => (
                <button
                  type="button"
                  key={valor}
                  onClick={() =>
                    setFiltro(valor)
                  }
                  className={
                    "rounded-xl border px-3 py-2 text-sm " +
                    (filtro === valor
                      ? "border-red-500 bg-red-500/10 text-red-300"
                      : "border-zinc-800 text-zinc-400 hover:bg-zinc-900")
                  }
                >
                  {texto}
                </button>
              )
            )}
          </div>
        </div>

        {filtrados.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 p-12 text-center text-zinc-500">
            Nenhuma movimentação encontrada.
          </div>
        ) : (
          <div className="space-y-5">
            {filtrados.map(
              (linha) => {
                const pagamento =
                  statusPagamento(
                    linha.payment_status
                  );

                const kind =
                  payerKind(linha);

                const legacy =
                  isLegacy(linha);

                const extras =
                  linha.travel_amount +
                  linha.toll_amount +
                  linha.lodging_amount;

                const fee =
                  kind === "artist"
                    ? linha.platform_fee_artist
                    : kind === "venue"
                      ? linha.platform_fee_venue
                      : linha.aura_fee_total;

                return (
                  <article
                    key={
                      linha.payment_id
                    }
                    className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6"
                  >
                    <div className="flex flex-col justify-between gap-5 lg:flex-row">
                      <div>
                        <div className="mb-3 flex flex-wrap gap-2">
                          <span
                            className={
                              "rounded-full border px-3 py-1 text-xs " +
                              pagamento.classe
                            }
                          >
                            {
                              pagamento.texto
                            }
                          </span>

                          <span className="rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-400">
                            {statusBooking(
                              linha.booking_status
                            )}
                          </span>

                          <span
                            className={
                              "rounded-full border px-3 py-1 text-xs " +
                              (legacy
                                ? "border-amber-800 bg-amber-950/20 text-amber-300"
                                : kind === "artist"
                                  ? "border-purple-800 bg-purple-950/20 text-purple-300"
                                  : "border-red-800 bg-red-950/20 text-red-300")
                            }
                          >
                            {legacy
                              ? "Histórico legado/teste"
                              : kind ===
                                  "artist"
                                ? "Artista · 3%"
                                : "Casa · 3%"}
                          </span>
                        </div>

                        <h2 className="text-xl font-bold">
                          {
                            linha.artist_name
                          }
                        </h2>

                        <p className="mt-1 text-sm text-zinc-400">
                          Casa:{" "}
                          <strong className="text-zinc-200">
                            {
                              linha.venue_name
                            }
                          </strong>
                        </p>

                        <p className="mt-1 text-sm text-zinc-500">
                          Evento:{" "}
                          {dataHora(
                            linha.starts_at
                          )}
                        </p>
                      </div>

                      <div className="lg:text-right">
                        <div className="text-xs uppercase tracking-wide text-zinc-600">
                          {legacy
                            ? "Valor histórico"
                            : "Pix da taxa"}
                        </div>

                        <div className="mt-1 text-2xl font-bold text-green-400">
                          {dinheiro(
                            linha.gross_amount
                          )}
                        </div>

                        {linha.paid_at && (
                          <div className="mt-1 text-xs text-zinc-600">
                            Pago em{" "}
                            {dataHora(
                              linha.paid_at
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 lg:grid-cols-3">
                      <div className="rounded-xl bg-black p-4">
                        <div className="mb-3 text-sm font-semibold">
                          Contrato
                        </div>

                        <div className="flex justify-between gap-4 text-sm text-zinc-400">
                          <span>
                            Cachê combinado
                          </span>
                          <span>
                            {dinheiro(
                              linha.agreed_fee
                            )}
                          </span>
                        </div>

                        <div className="mt-2 flex justify-between gap-4 text-sm text-zinc-400">
                          <span>
                            Extras combinados
                          </span>
                          <span>
                            {dinheiro(
                              extras
                            )}
                          </span>
                        </div>

                        <p className="mt-3 text-[11px] leading-5 text-zinc-600">
                          Cachê e extras não entram no caixa do Aura Beat no modelo atual.
                        </p>
                      </div>

                      <div className="rounded-xl bg-black p-4">
                        <div className="mb-3 text-sm font-semibold">
                          Receita Aura Beat
                        </div>

                        <div className="flex justify-between gap-4 text-sm text-zinc-400">
                          <span>
                            Taxa da plataforma
                          </span>
                          <span>
                            {dinheiro(
                              fee
                            )}
                          </span>
                        </div>

                        <div className="mt-2 flex justify-between gap-4 text-sm text-zinc-500">
                          <span>
                            Tarifa ASAAS
                          </span>
                          <span>
                            {dinheiro(
                              linha.provider_fee
                            )}
                          </span>
                        </div>

                        <div className="mt-3 flex justify-between gap-4 border-t border-zinc-800 pt-3 font-semibold text-purple-300">
                          <span>
                            Pix
                          </span>
                          <span>
                            {dinheiro(
                              linha.gross_amount
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="rounded-xl bg-black p-4">
                        <div className="mb-3 text-sm font-semibold">
                          Pagador
                        </div>

                        <p className="text-sm text-zinc-300">
                          {legacy
                            ? "Cobrança histórica anterior ao modelo de taxas separadas."
                            : kind ===
                                "artist"
                              ? "Artista — somente em contratação urgente."
                              : "Casa — taxa aplicada em toda contratação."}
                        </p>

                        <p className="mt-3 text-xs text-zinc-600">
                          Provedor:{" "}
                          {linha.provider ||
                            "—"}
                          {" · "}
                          Método:{" "}
                          {linha.payment_method ||
                            "—"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-zinc-900 pt-4 text-xs text-zinc-600">
                      <span>
                        Booking:{" "}
                        {linha.booking_id}
                      </span>
                      <span>
                        Pagamento:{" "}
                        {linha.payment_id}
                      </span>
                    </div>
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
