"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useParams,
  useRouter,
} from "next/navigation";

import {
  supabase,
} from "../../../lib/supabase";

type Booking = {
  id: string;
  status: string;
  agreed_fee: number;
  travel_amount: number;
  toll_amount: number;
  lodging_amount: number;
  platform_fee_venue: number;
};

type PixResponse = {
  status: string;
  paymentId?: string;
  total: number;
  providerFee: number;
  pix?: {
    payload: string;
    encodedImage: string;
    expirationDate: string | null;
  };
  error?: string;
};

function money(
  value: number
) {
  return new Intl.NumberFormat(
    "pt-BR",
    {
      style: "currency",
      currency: "BRL",
    }
  ).format(
    Number(value || 0)
  );
}

export default function PagamentoPixPage() {
  const router = useRouter();
  const params =
    useParams<{
      bookingId: string;
    }>();

  const bookingId =
    params.bookingId;

  const [
    booking,
    setBooking,
  ] =
    useState<Booking | null>(
      null
    );

  const [
    pix,
    setPix,
  ] =
    useState<PixResponse | null>(
      null
    );

  const [
    carregando,
    setCarregando,
  ] =
    useState(true);

  const [
    gerando,
    setGerando,
  ] =
    useState(false);

  const [
    verificando,
    setVerificando,
  ] =
    useState(false);

  const [
    copiado,
    setCopiado,
  ] =
    useState(false);

  const [
    erro,
    setErro,
  ] =
    useState("");

  const carregarBooking =
    useCallback(
      async () => {
        try {
          setCarregando(true);
          setErro("");

          const {
            data: {
              user,
            },
          } =
            await supabase.auth.getUser();

          if (!user) {
            router.replace(
              "/login"
            );

            return;
          }

          const {
            data,
            error,
          } = await supabase
            .from(
              "bookings"
            )
            .select(`
              id,
              status,
              agreed_fee,
              travel_amount,
              toll_amount,
              lodging_amount,
              platform_fee_venue
            `)
            .eq(
              "id",
              bookingId
            )
            .maybeSingle();

          if (error) {
            throw error;
          }

          if (!data) {
            setErro(
              "Contratacao nao encontrada."
            );

            return;
          }

          setBooking(
            data as Booking
          );
        } catch (error) {
          console.error(
            error
          );

          setErro(
            error instanceof
              Error
              ? error.message
              : "Nao foi possivel carregar a contratacao."
          );
        } finally {
          setCarregando(
            false
          );
        }
      },
      [
        bookingId,
        router,
      ]
    );

  useEffect(() => {
    void carregarBooking();
  }, [carregarBooking]);

  async function accessToken() {
    const {
      data: {
        session,
      },
    } =
      await supabase.auth.getSession();

    if (
      !session?.access_token
    ) {
      throw new Error(
        "Sessao expirada. Entre novamente."
      );
    }

    return session.access_token;
  }

  async function gerarPix() {
    try {
      setGerando(true);
      setErro("");

      const token =
        await accessToken();

      const response =
        await fetch(
          "/api/payments/asaas/pix",
          {
            method: "POST",
            headers: {
              "content-type":
                "application/json",
              authorization:
                `Bearer ${token}`,
            },
            body: JSON.stringify({
              bookingId,
            }),
          }
        );

      const data =
        (await response.json()) as
          PixResponse;

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Nao foi possivel gerar o Pix."
        );
      }

      setPix(data);

      if (
        data.status ===
        "paid"
      ) {
        await carregarBooking();
      }
    } catch (error) {
      console.error(
        error
      );

      setErro(
        error instanceof
          Error
          ? error.message
          : "Nao foi possivel gerar o Pix."
      );
    } finally {
      setGerando(false);
    }
  }

  const verificarPagamento =
    useCallback(
      async (
        silencioso = false
      ) => {
        if (
          !pix ||
          pix.status ===
            "paid"
        ) {
          return;
        }

        try {
          if (!silencioso) {
            setVerificando(
              true
            );
          }

          const token =
            await accessToken();

          const response =
            await fetch(
              "/api/payments/asaas/status",
              {
                method: "POST",
                headers: {
                  "content-type":
                    "application/json",
                  authorization:
                    `Bearer ${token}`,
                },
                body:
                  JSON.stringify({
                    bookingId,
                  }),
              }
            );

          const data =
            (await response.json()) as
              PixResponse;

          if (!response.ok) {
            if (!silencioso) {
              throw new Error(
                data.error ||
                  "Nao foi possivel verificar o pagamento."
              );
            }

            return;
          }

          setPix(
            (anterior) => ({
              ...(anterior ||
                data),
              ...data,
              pix:
                anterior?.pix,
            })
          );

          if (
            data.status ===
            "paid"
          ) {
            await carregarBooking();
          }
        } catch (error) {
          if (!silencioso) {
            console.error(
              error
            );

            setErro(
              error instanceof
                Error
                ? error.message
                : "Nao foi possivel verificar o pagamento."
            );
          }
        } finally {
          if (!silencioso) {
            setVerificando(
              false
            );
          }
        }
      },
      [
        bookingId,
        carregarBooking,
        pix,
      ]
    );

  useEffect(() => {
    if (
      !pix ||
      pix.status ===
        "paid"
    ) {
      return;
    }

    const timer =
      window.setInterval(
        () => {
          void verificarPagamento(
            true
          );
        },
        8000
      );

    return () =>
      window.clearInterval(
        timer
      );
  }, [
    pix,
    verificarPagamento,
  ]);

  async function copiarPix() {
    const payload =
      pix?.pix?.payload;

    if (!payload) {
      return;
    }

    await navigator.clipboard.writeText(
      payload
    );

    setCopiado(true);

    window.setTimeout(
      () =>
        setCopiado(
          false
        ),
      2000
    );
  }

  const extras =
    useMemo(() => {
      if (!booking) {
        return 0;
      }

      return (
        Number(
          booking.travel_amount ||
            0
        ) +
        Number(
          booking.toll_amount ||
            0
        ) +
        Number(
          booking.lodging_amount ||
            0
        )
      );
    }, [booking]);

  const taxaExibida =
    useMemo(() => {
      if (!booking) {
        return 0;
      }

      return (
        Number(
          booking.platform_fee_venue ||
            0
        ) +
        Number(
          pix?.providerFee ||
            0
        )
      );
    }, [
      booking,
      pix,
    ]);

  if (carregando) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        Carregando pagamento...
      </main>
    );
  }

  const pago =
    pix?.status ===
      "paid" ||
    booking?.status ===
      "confirmed";

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <div className="mx-auto max-w-3xl">
        <button
          type="button"
          onClick={() =>
            router.push(
              "/eventos-casa"
            )
          }
          className="mb-6 text-sm text-zinc-400 hover:text-white"
        >
          ← Voltar para eventos
        </button>

        <p className="text-sm font-bold uppercase tracking-wider text-red-400">
          Aura Beat
        </p>

        <h1 className="mt-2 text-3xl font-black">
          Pagamento da contratação
        </h1>

        <p className="mt-2 text-zinc-400">
          Finalize a contratação com Pix.
        </p>

        {erro && (
          <div className="mt-6 rounded-2xl border border-red-900 bg-red-950/30 p-4 text-red-300">
            {erro}
          </div>
        )}

        {booking && (
          <section className="mt-8 rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-lg font-black">
              Resumo
            </h2>

            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between text-zinc-400">
                <span>
                  Cachê
                </span>

                <span>
                  {money(
                    booking.agreed_fee
                  )}
                </span>
              </div>

              {extras > 0 && (
                <div className="flex justify-between text-zinc-400">
                  <span>
                    Extras
                  </span>

                  <span>
                    {money(
                      extras
                    )}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-zinc-400">
                <span>
                  Taxa Aura Beat
                </span>

                <span>
                  {pix
                    ? money(
                        taxaExibida
                      )
                    : "calculada ao gerar o Pix"}
                </span>
              </div>

              <div className="flex justify-between border-t border-zinc-800 pt-4 text-lg font-black">
                <span>
                  Total
                </span>

                <span className="text-green-400">
                  {pix
                    ? money(
                        pix.total
                      )
                    : money(
                        Number(
                          booking.agreed_fee ||
                            0
                        ) +
                          extras +
                          Number(
                            booking.platform_fee_venue ||
                              0
                          )
                      )}
                </span>
              </div>
            </div>
          </section>
        )}

        {pago ? (
          <section className="mt-6 rounded-3xl border border-green-800 bg-green-950/20 p-8 text-center">
            <div className="text-4xl">
              ✓
            </div>

            <h2 className="mt-3 text-2xl font-black text-green-400">
              Pagamento confirmado
            </h2>

            <p className="mt-2 text-zinc-300">
              A contratação foi confirmada e o contato do artista já pode ser liberado.
            </p>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/eventos-casa"
                )
              }
              className="mt-6 rounded-xl bg-green-600 px-5 py-3 font-black hover:bg-green-500"
            >
              Abrir evento
            </button>
          </section>
        ) : !pix ? (
          <button
            type="button"
            onClick={() =>
              void gerarPix()
            }
            disabled={
              gerando ||
              !booking ||
              booking.status !==
                "awaiting_payment"
            }
            className="mt-6 w-full rounded-2xl bg-green-600 px-5 py-4 text-lg font-black transition hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {gerando
              ? "Gerando Pix..."
              : "Gerar Pix"}
          </button>
        ) : (
          <section className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <div className="text-center">
              <span className="rounded-full border border-yellow-800 bg-yellow-950/30 px-3 py-1 text-xs font-bold text-yellow-300">
                Aguardando pagamento
              </span>

              <h2 className="mt-4 text-xl font-black">
                Escaneie o QR Code
              </h2>
            </div>

            {pix.pix?.encodedImage && (
              <div className="mt-6 flex justify-center">
                <img
                  src={`data:image/png;base64,${pix.pix.encodedImage}`}
                  alt="QR Code Pix"
                  className="h-64 w-64 rounded-2xl bg-white p-3"
                />
              </div>
            )}

            {pix.pix?.payload && (
              <div className="mt-6">
                <p className="mb-2 text-sm font-bold text-zinc-300">
                  Pix copia e cola
                </p>

                <div className="rounded-2xl border border-zinc-800 bg-black p-4">
                  <p className="break-all text-xs text-zinc-400">
                    {
                      pix.pix
                        .payload
                    }
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    void copiarPix()
                  }
                  className="mt-3 w-full rounded-xl border border-zinc-700 px-4 py-3 font-bold hover:bg-zinc-900"
                >
                  {copiado
                    ? "Copiado ✓"
                    : "Copiar código Pix"}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() =>
                void verificarPagamento()
              }
              disabled={
                verificando
              }
              className="mt-4 w-full rounded-xl bg-purple-600 px-4 py-3 font-bold hover:bg-purple-500 disabled:opacity-50"
            >
              {verificando
                ? "Verificando..."
                : "Já paguei — verificar"}
            </button>

            <p className="mt-4 text-center text-xs text-zinc-600">
              O status também é verificado automaticamente enquanto esta tela estiver aberta.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
