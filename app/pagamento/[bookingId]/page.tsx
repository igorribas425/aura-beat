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
  useSearchParams,
} from "next/navigation";

import {
  normalizeBillingDocument,
} from "../../../lib/billing-document";
import {
  supabase,
} from "../../../lib/supabase";

type PayerType =
  | "venue"
  | "artist";

type Booking = {
  id: string;
  status: string;
  agreed_fee: number;
  travel_amount: number;
  toll_amount: number;
  lodging_amount: number;
  platform_fee_venue: number;
  platform_fee_artist: number;
};

type PixResponse = {
  status: string;
  paymentId?: string;
  payerType?: PayerType;
  platformFee?: number;
  total: number;
  providerFee: number;
  bookingStatus?: string;
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
  const searchParams =
    useSearchParams();

  const bookingId =
    params.bookingId;

  const payerType: PayerType =
    searchParams.get("payer") ===
    "artist"
      ? "artist"
      : "venue";

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
    billingDocument,
    setBillingDocument,
  ] = useState("");

  const [
    hasBillingDocument,
    setHasBillingDocument,
  ] = useState(false);

  const [
    billingLast4,
    setBillingLast4,
  ] = useState<string | null>(null);

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
              platform_fee_venue,
              platform_fee_artist
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
              "Contratação não encontrada."
            );

            return;
          }

          setBooking(
            data as Booking
          );

          if (payerType === "artist") {
            const {
              data: { session },
            } =
              await supabase.auth.getSession();

            if (session?.access_token) {
              const billingResponse =
                await fetch(
                  "/api/billing/profile",
                  {
                    headers: {
                      authorization:
                        `Bearer ${session.access_token}`,
                    },
                    cache: "no-store",
                  }
                );

              if (billingResponse.ok) {
                const billingData =
                  (await billingResponse.json()) as {
                    hasDocument?: boolean;
                    last4?: string | null;
                  };

                setHasBillingDocument(
                  billingData.hasDocument === true
                );

                setBillingLast4(
                  billingData.last4 || null
                );
              }
            }
          }
        } catch (error) {
          console.error(
            error
          );

          setErro(
            error instanceof
              Error
              ? error.message
              : "Não foi possível carregar a contratação."
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
    setPix(null);
    setErro("");
    void carregarBooking();
  }, [
    carregarBooking,
    payerType,
  ]);

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
        "Sessão expirada. Entre novamente."
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
              payerType,
              cpfCnpj:
                billingDocument || undefined,
            }),
          }
        );

      const data =
        (await response.json()) as
          PixResponse;

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Não foi possível gerar o Pix."
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
          : "Não foi possível gerar o Pix."
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
                    payerType,
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
                  "Não foi possível verificar o pagamento."
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
                : "Não foi possível verificar o pagamento."
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
        payerType,
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

  const platformFee =
    booking
      ? payerType === "artist"
        ? Number(
            booking.platform_fee_artist ||
              0
          )
        : Number(
            booking.platform_fee_venue ||
              0
          )
      : 0;

  const taxaAsaas =
    Number(
      pix?.providerFee ||
        0
    );

  if (carregando) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        Carregando pagamento...
      </main>
    );
  }

  const pago =
    pix?.status ===
    "paid";

  const bookingConfirmed =
    booking?.status ===
    "confirmed";

  const backPath =
    payerType === "artist"
      ? "/eventos-artista"
      : "/eventos-casa";

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <div className="mx-auto max-w-3xl">
        <button
          type="button"
          onClick={() =>
            router.push(
              backPath
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
          Taxa da contratação
        </h1>

        <p className="mt-2 text-zinc-400">
          {payerType === "artist"
            ? "Pagamento da taxa de 3% do Artista."
            : "Pagamento da taxa de 3% da Casa."}
        </p>

        <div className="mt-5 rounded-2xl border border-purple-900/50 bg-purple-950/10 p-4 text-sm leading-6 text-purple-100/80">
          O cachê, deslocamento, pedágio e hospedagem são acertados diretamente entre Casa e DJ.
          Este Pix cobra somente a taxa do Aura Beat e a tarifa do provedor de pagamento.
        </div>

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
                  Cachê combinado
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
                    Extras combinados
                  </span>

                  <span>
                    {money(
                      extras
                    )}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-red-300">
                <span>
                  Taxa Aura Beat · 3%
                </span>

                <strong>
                  {money(
                    platformFee
                  )}
                </strong>
              </div>

              <div className="flex justify-between text-zinc-400">
                <span>
                  Tarifa ASAAS
                </span>

                <span>
                  {pix
                    ? money(
                        taxaAsaas
                      )
                    : "calculada ao gerar o Pix"}
                </span>
              </div>

              <div className="flex justify-between border-t border-zinc-800 pt-4 text-lg font-black">
                <span>
                  Total do Pix
                </span>

                <span className="text-green-400">
                  {pix
                    ? money(
                        pix.total
                      )
                    : money(
                        platformFee
                      )}
                </span>
              </div>
            </div>
          </section>
        )}

        {platformFee <= 0 ? (
          <section className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-950 p-6 text-center">
            <h2 className="text-xl font-black">
              Nenhuma taxa para pagar
            </h2>
            <p className="mt-2 text-sm text-zinc-500">
              Esta contratação não possui cobrança do Aura Beat para este perfil.
            </p>
          </section>
        ) : pago ? (
          <section className="mt-6 rounded-3xl border border-green-800 bg-green-950/20 p-8 text-center">
            <div className="text-4xl">
              ✓
            </div>

            <h2 className="mt-3 text-2xl font-black text-green-400">
              Taxa confirmada
            </h2>

            <p className="mt-2 text-zinc-300">
              {bookingConfirmed
                ? "As taxas necessárias foram confirmadas e a contratação está liberada."
                : "Sua taxa foi confirmada. A contratação será liberada quando a outra parte concluir a taxa obrigatória."}
            </p>

            <button
              type="button"
              onClick={() =>
                router.push(
                  backPath
                )
              }
              className="mt-6 rounded-xl bg-green-600 px-5 py-3 font-black hover:bg-green-500"
            >
              Abrir evento
            </button>
          </section>
        ) : !pix ? (
          <section className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            {payerType === "artist" && (
              <div className="mb-5">
                <label className="text-sm font-black text-zinc-200">
                  CPF do titular da cobrança
                </label>

                {hasBillingDocument ? (
                  <div className="mt-2 rounded-xl border border-green-900 bg-green-950/20 px-4 py-3 text-sm text-green-300">
                    CPF de cobrança já cadastrado
                    {billingLast4
                      ? ` · final ${billingLast4}`
                      : ""}.
                  </div>
                ) : (
                  <>
                    <input
                      value={billingDocument}
                      onChange={(event) =>
                        setBillingDocument(
                          event.target.value
                        )
                      }
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="000.000.000-00"
                      className="mt-2 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-white outline-none focus:border-green-500"
                    />

                    <p className="mt-2 text-xs leading-5 text-zinc-600">
                      O ASAAS exige CPF ou CNPJ para gerar a cobrança.
                      Esse documento fica somente no cadastro privado de pagamento
                      e não aparece no perfil público.
                    </p>
                  </>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() =>
                void gerarPix()
              }
              disabled={
                gerando ||
                !booking ||
                (payerType === "artist" &&
                  !hasBillingDocument &&
                  !normalizeBillingDocument(
                    billingDocument
                  )) ||
                ![
                  "awaiting_payment",
                  "confirmed",
                ].includes(
                  booking.status
                )
              }
              className="w-full rounded-2xl bg-green-600 px-5 py-4 text-lg font-black transition hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {gerando
                ? "Gerando Pix..."
                : "Gerar Pix da taxa"}
            </button>
          </section>
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
