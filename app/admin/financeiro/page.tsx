"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

type AdminRole =
  | "reviewer"
  | "admin"
  | "owner";

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
  | "pending_release"
  | "eligible"
  | "released";

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
  if (!valor) {
    return "—";
  }

  try {
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
        texto: status || "Desconhecido",
        classe:
          "border-zinc-700 bg-zinc-900 text-zinc-400",
      };
  }
}

function statusBooking(
  status: string
) {
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

function normalizarLinha(
  linha: FinanceRow
): FinanceRow {
  return {
    ...linha,

    gross_amount:
      Number(
        linha.gross_amount || 0
      ),

    agreed_fee:
      Number(
        linha.agreed_fee || 0
      ),

    travel_amount:
      Number(
        linha.travel_amount || 0
      ),

    toll_amount:
      Number(
        linha.toll_amount || 0
      ),

    lodging_amount:
      Number(
        linha.lodging_amount || 0
      ),

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
      Number(
        linha.provider_fee || 0
      ),

    aura_fee_total:
      Number(
        linha.aura_fee_total || 0
      ),

    artist_total:
      Number(
        linha.artist_total || 0
      ),

    release_pending:
      Number(
        linha.release_pending || 0
      ),

    release_eligible:
      Number(
        linha.release_eligible ||
          0
      ),

    release_released:
      Number(
        linha.release_released ||
          0
      ),
  };
}

export default function AdminFinanceiroPage() {
  const router = useRouter();

  const [role, setRole] =
    useState<AdminRole | null>(
      null
    );

  const [dados, setDados] =
    useState<FinanceRow[]>([]);

  const [busca, setBusca] =
    useState("");

  const [filtro, setFiltro] =
    useState<Filtro>("todos");

  const [carregando, setCarregando] =
    useState(true);

  const [erro, setErro] =
    useState("");

  const carregar =
    useCallback(
      async () => {
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
            router.replace(
              "/login"
            );

            return;
          }

          const {
            data: adminData,
            error: adminError,
          } = await supabase
            .from(
              "aura_admins"
            )
            .select(
              "role,is_active"
            )
            .eq(
              "user_id",
              authData.user.id
            )
            .maybeSingle();

          if (adminError) {
            throw adminError;
          }

          if (
            !adminData?.is_active ||
            adminData.role !== "owner"
          ) {
            setRole(null);

            setDados([]);

            setErro(
              "Acesso restrito ao proprietário da Aura Beat."
            );

            return;
          }

          setRole(
            adminData.role as AdminRole
          );

          const {
            data,
            error,
          } = await supabase.rpc(
            "get_admin_finance"
          );

          if (error) {
            throw error;
          }

          setDados(
            (
              (data ||
                []) as FinanceRow[]
            ).map(
              normalizarLinha
            )
          );
        } catch (error) {
          const detalhe =
            error &&
            typeof error ===
              "object" &&
            "message" in error
              ? String(
                  error.message
                )
              : "Não foi possível carregar o financeiro administrativo.";

          console.warn(
            "Erro financeiro admin:",
            detalhe
          );

          setErro(detalhe);
        } finally {
          setCarregando(
            false
          );
        }
      },
      [router]
    );

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const totais =
    useMemo(() => {
      let recebidoCasas = 0;
      let taxasAura = 0;
      let pendente = 0;
      let disponivel = 0;
      let repassado = 0;

      for (
        const linha of dados
      ) {
        if (
          linha.payment_status !==
          "paid"
        ) {
          continue;
        }

        recebidoCasas +=
          linha.gross_amount;

        taxasAura +=
          linha.aura_fee_total;

        pendente +=
          linha.release_pending;

        disponivel +=
          linha.release_eligible;

        repassado +=
          linha.release_released;
      }

      return {
        recebidoCasas,
        taxasAura,
        pendente,
        disponivel,
        repassado,
      };
    }, [dados]);

  const dadosFiltrados =
    useMemo(() => {
      const termo =
        busca
          .trim()
          .toLowerCase();

      return dados.filter(
        (linha) => {
          if (
            filtro ===
              "paid" &&
            linha.payment_status !==
              "paid"
          ) {
            return false;
          }

          if (
            filtro ===
              "pending_release" &&
            linha.release_pending <=
              0
          ) {
            return false;
          }

          if (
            filtro ===
              "eligible" &&
            linha.release_eligible <=
              0
          ) {
            return false;
          }

          if (
            filtro ===
              "released" &&
            linha.release_released <=
              0
          ) {
            return false;
          }

          if (!termo) {
            return true;
          }

          const texto = [
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
            .toLowerCase();

          return texto.includes(
            termo
          );
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
        <div className="mx-auto max-w-7xl">
          Carregando financeiro...
        </div>
      </main>
    );
  }

  if (!role) {
    return (
      <main className="min-h-screen bg-black px-4 py-8 text-white">
        <div className="mx-auto max-w-5xl">

          <div className="rounded-2xl border border-red-900 bg-red-950/20 p-6 text-red-300">
            {erro ||
              "Acesso administrativo negado."}
          </div>

        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">

      <div className="mx-auto max-w-7xl">

        <div className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">

          <div>

            <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-red-400">
              Administração Aura Beat
            </p>

            <h1 className="text-3xl font-bold">
              Financeiro
            </h1>

            <p className="mt-2 text-zinc-400">
              Controle de pagamentos,
              taxas e repasses da
              plataforma.
            </p>

          </div>

          <div className="flex items-center gap-3">

            <span className="rounded-xl border border-red-900/60 bg-red-950/20 px-3 py-2 text-xs font-semibold uppercase text-red-300">
              {role}
            </span>

            <button
              type="button"
              onClick={() =>
                void carregar()
              }
              className="rounded-xl border border-zinc-800 px-4 py-2 text-sm text-zinc-300 transition hover:bg-zinc-900"
            >
              Atualizar
            </button>

          </div>

        </div>

        {erro && (
          <div className="mb-6 rounded-xl border border-red-900 bg-red-950/30 p-4 text-red-300">
            {erro}
          </div>
        )}

        <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">

          <div className="rounded-2xl border border-green-900/60 bg-green-950/10 p-5">

            <div className="text-sm text-green-300">
              Recebido das Casas
            </div>

            <div className="mt-2 text-2xl font-bold">
              {dinheiro(
                totais.recebidoCasas
              )}
            </div>

          </div>

          <div className="rounded-2xl border border-purple-900/60 bg-purple-950/10 p-5">

            <div className="text-sm text-purple-300">
              Taxas Aura Beat
            </div>

            <div className="mt-2 text-2xl font-bold text-purple-400">
              {dinheiro(
                totais.taxasAura
              )}
            </div>

          </div>

          <div className="rounded-2xl border border-yellow-900/60 bg-yellow-950/10 p-5">

            <div className="text-sm text-yellow-300">
              Aguardando evento
            </div>

            <div className="mt-2 text-2xl font-bold">
              {dinheiro(
                totais.pendente
              )}
            </div>

          </div>

          <div className="rounded-2xl border border-emerald-900/60 bg-emerald-950/10 p-5">

            <div className="text-sm text-emerald-300">
              A repassar aos DJs
            </div>

            <div className="mt-2 text-2xl font-bold text-emerald-400">
              {dinheiro(
                totais.disponivel
              )}
            </div>

          </div>

          <div className="rounded-2xl border border-blue-900/60 bg-blue-950/10 p-5">

            <div className="text-sm text-blue-300">
              Já repassado
            </div>

            <div className="mt-2 text-2xl font-bold text-blue-400">
              {dinheiro(
                totais.repassado
              )}
            </div>

          </div>

        </div>

        <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_auto]">

          <input
            value={busca}
            onChange={(e) =>
              setBusca(
                e.target.value
              )
            }
            placeholder="Buscar Casa, artista, booking ou pagamento..."
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none transition focus:border-red-600"
          />

          <div className="flex flex-wrap gap-2">

            {(
              [
                [
                  "todos",
                  "Todos",
                ],

                [
                  "paid",
                  "Pagos",
                ],

                [
                  "pending_release",
                  "Pendentes",
                ],

                [
                  "eligible",
                  "A repassar",
                ],

                [
                  "released",
                  "Repassados",
                ],
              ] as Array<
                [Filtro, string]
              >
            ).map(
              ([
                valor,
                texto,
              ]) => (
                <button
                  type="button"
                  key={valor}
                  onClick={() =>
                    setFiltro(
                      valor
                    )
                  }
                  className={`rounded-xl border px-3 py-2 text-sm transition ${
                    filtro ===
                    valor
                      ? "border-red-500 bg-red-500/10 text-red-300"
                      : "border-zinc-800 text-zinc-400 hover:bg-zinc-900"
                  }`}
                >
                  {texto}
                </button>
              )
            )}

          </div>

        </div>

        {dadosFiltrados.length ===
        0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 p-12 text-center text-zinc-500">
            Nenhuma movimentação financeira encontrada.
          </div>
        ) : (
          <div className="space-y-5">

            {dadosFiltrados.map(
              (linha) => {
                const pagamento =
                  statusPagamento(
                    linha.payment_status
                  );

                const extras =
                  linha.travel_amount +
                  linha.toll_amount +
                  linha.lodging_amount;

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
                            className={`rounded-full border px-3 py-1 text-xs ${pagamento.classe}`}
                          >
                            Pagamento:{" "}
                            {
                              pagamento.texto
                            }
                          </span>

                          <span className="rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-400">
                            {statusBooking(
                              linha.booking_status
                            )}
                          </span>

                          <span className="rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-500">
                            {linha.provider ||
                              "Sem provedor"}
                          </span>

                        </div>

                        <h2 className="text-xl font-bold">
                          {
                            linha.artist_name
                          }
                        </h2>

                        <p className="mt-1 text-sm text-zinc-400">
                          Contratante:{" "}
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

                      <div className="text-left lg:text-right">

                        <div className="text-xs uppercase tracking-wide text-zinc-600">
                          Pago pela Casa
                        </div>

                        <div className="mt-1 text-2xl font-bold text-green-400">
                          {dinheiro(
                            linha.gross_amount
                          )}
                        </div>

                        {linha.paid_at && (
                          <div className="mt-1 text-xs text-zinc-600">
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
                          Contratação
                        </div>

                        <div className="flex justify-between gap-4 text-sm text-zinc-400">

                          <span>
                            Cachê
                          </span>

                          <span>
                            {dinheiro(
                              linha.agreed_fee
                            )}
                          </span>

                        </div>

                        <div className="mt-2 flex justify-between gap-4 text-sm text-zinc-400">

                          <span>
                            Extras
                          </span>

                          <span>
                            {dinheiro(
                              extras
                            )}
                          </span>

                        </div>

                      </div>

                      <div className="rounded-xl bg-black p-4">

                        <div className="mb-3 text-sm font-semibold">
                          Receita Aura Beat
                        </div>

                        <div className="flex justify-between gap-4 text-sm text-zinc-400">

                          <span>
                            Taxa Casa
                          </span>

                          <span>
                            {dinheiro(
                              linha.platform_fee_venue
                            )}
                          </span>

                        </div>

                        <div className="mt-2 flex justify-between gap-4 text-sm text-zinc-400">

                          <span>
                            Taxa DJ
                          </span>

                          <span>
                            {dinheiro(
                              linha.platform_fee_artist
                            )}
                          </span>

                        </div>

                        {linha.provider_fee >
                          0 && (
                          <div className="mt-2 flex justify-between gap-4 text-sm text-zinc-500">

                            <span>
                              Taxa provedor
                            </span>

                            <span>
                              -{" "}
                              {dinheiro(
                                linha.provider_fee
                              )}
                            </span>

                          </div>
                        )}

                        <div className="mt-3 flex justify-between gap-4 border-t border-zinc-800 pt-3 font-semibold text-purple-400">

                          <span>
                            Aura Beat
                          </span>

                          <span>
                            {dinheiro(
                              linha.aura_fee_total
                            )}
                          </span>

                        </div>

                      </div>

                      <div className="rounded-xl bg-black p-4">

                        <div className="mb-3 text-sm font-semibold">
                          Artista
                        </div>

                        <div className="flex justify-between gap-4 text-sm text-zinc-400">

                          <span>
                            Líquido
                          </span>

                          <span>
                            {dinheiro(
                              linha.artist_total
                            )}
                          </span>

                        </div>

                        <div className="mt-2 flex justify-between gap-4 text-sm text-yellow-300">

                          <span>
                            Pendente
                          </span>

                          <span>
                            {dinheiro(
                              linha.release_pending
                            )}
                          </span>

                        </div>

                        <div className="mt-2 flex justify-between gap-4 text-sm text-green-300">

                          <span>
                            A repassar
                          </span>

                          <span>
                            {dinheiro(
                              linha.release_eligible
                            )}
                          </span>

                        </div>

                        <div className="mt-2 flex justify-between gap-4 text-sm text-blue-300">

                          <span>
                            Repassado
                          </span>

                          <span>
                            {dinheiro(
                              linha.release_released
                            )}
                          </span>

                        </div>

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

                      <span>
                        Método:{" "}
                        {linha.payment_method ||
                          "—"}
                      </span>

                    </div>

                    {linha.release_pending >
                      0 && (
                      <div className="mt-5 rounded-xl border border-yellow-900/60 bg-yellow-950/20 p-4 text-sm text-yellow-300">
                        ⏳{" "}
                        {dinheiro(
                          linha.release_pending
                        )}{" "}
                        está aguardando a conclusão do evento.
                      </div>
                    )}

                    {linha.release_eligible >
                      0 && (
                      <div className="mt-5 rounded-xl border border-green-900/60 bg-green-950/20 p-4 text-sm text-green-300">

                        💰 Há{" "}
                        <strong>
                          {dinheiro(
                            linha.release_eligible
                          )}
                        </strong>{" "}
                        disponível para repasse a este artista.

                        <div className="mt-1 text-xs text-green-200/70">
                          O valor só deve ser marcado como pago depois que uma transferência real for confirmada.
                        </div>

                      </div>
                    )}

                    {linha.release_released >
                      0 && (
                      <div className="mt-5 rounded-xl border border-blue-900/60 bg-blue-950/20 p-4 text-sm text-blue-300">

                        ✓{" "}
                        {dinheiro(
                          linha.release_released
                        )}{" "}
                        já foi registrado como repassado ao artista.

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