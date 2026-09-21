"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  useParams,
  useRouter,
} from "next/navigation";

import {
  normalizeBillingDocument,
} from "../../../lib/billing-document";
import {
  formatBRL,
} from "../../../lib/finance";
import {
  supabase,
} from "../../../lib/supabase";

type Plan = {
  id: string;
  audience: "artist" | "venue";
  code: string;
  name: string;
  monthly_price: number;
  is_active: boolean;
};

type CheckoutResponse = {
  status: string;
  paymentId?: string;
  planId?: string;
  planName?: string;
  audience?: "artist" | "venue";
  total?: number;
  subscriptionId?: string | null;
  pix?: {
    payload: string;
    encodedImage: string;
    expirationDate: string | null;
  };
  error?: string;
};

export default function SubscriptionCheckoutPage() {
  const router = useRouter();
  const params = useParams<{ planId: string }>();
  const planId = params.planId;

  const [plan, setPlan] = useState<Plan | null>(null);
  const [checkout, setCheckout] =
    useState<CheckoutResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [billingDocument, setBillingDocument] = useState("");
  const [hasBillingDocument, setHasBillingDocument] = useState(false);
  const [billingLast4, setBillingLast4] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data, error: planError } = await supabase
        .from("plans")
        .select("id,audience,code,name,monthly_price,is_active")
        .eq("id", planId)
        .maybeSingle();

      if (planError) throw planError;

      if (!data || !data.is_active) {
        throw new Error("Plano indisponível.");
      }

      const typedPlan = data as Plan;
      setPlan(typedPlan);

      if (typedPlan.audience === "artist") {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.access_token) {
          const billingResponse = await fetch(
            "/api/billing/profile",
            {
              headers: {
                authorization:
                  `Bearer ${session.access_token}`,
              },
              cache: "no-store",
            },
          );

          if (billingResponse.ok) {
            const billingData =
              (await billingResponse.json()) as {
                hasDocument?: boolean;
                last4?: string | null;
              };

            setHasBillingDocument(
              billingData.hasDocument === true,
            );
            setBillingLast4(
              billingData.last4 || null,
            );
          }
        }
      }
    } catch (caught) {
      console.error(caught);
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível carregar o plano.",
      );
    } finally {
      setLoading(false);
    }
  }, [planId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function token() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("Sessão expirada. Entre novamente.");
    }

    return session.access_token;
  }

  async function createPix() {
    try {
      setCreating(true);
      setError("");

      const accessToken = await token();

      const response = await fetch(
        "/api/subscriptions/asaas/pix",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            planId,
            cpfCnpj:
              billingDocument || undefined,
          }),
        },
      );

      const data = (await response.json()) as CheckoutResponse;

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Não foi possível gerar o Pix da mensalidade.",
        );
      }

      setCheckout(data);
    } catch (caught) {
      console.error(caught);
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível gerar o Pix da mensalidade.",
      );
    } finally {
      setCreating(false);
    }
  }

  const checkPayment = useCallback(
    async (silent = false) => {
      if (!checkout?.paymentId || checkout.status === "paid") {
        return;
      }

      try {
        if (!silent) {
          setChecking(true);
          setError("");
        }

        const accessToken = await token();

        const response = await fetch(
          "/api/subscriptions/asaas/status",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              paymentId: checkout.paymentId,
            }),
          },
        );

        const data = (await response.json()) as CheckoutResponse;

        if (!response.ok) {
          if (!silent) {
            throw new Error(
              data.error ||
                "Não foi possível verificar o pagamento.",
            );
          }
          return;
        }

        setCheckout((current) => ({
          ...(current || {}),
          ...data,
          pix: current?.pix,
        }));
      } catch (caught) {
        if (!silent) {
          console.error(caught);
          setError(
            caught instanceof Error
              ? caught.message
              : "Não foi possível verificar o pagamento.",
          );
        }
      } finally {
        if (!silent) setChecking(false);
      }
    },
    [checkout],
  );

  useEffect(() => {
    if (!checkout?.paymentId || checkout.status === "paid") {
      return;
    }

    const timer = window.setInterval(() => {
      void checkPayment(true);
    }, 8000);

    return () => window.clearInterval(timer);
  }, [checkout?.paymentId, checkout?.status, checkPayment]);

  async function copyPix() {
    const payload = checkout?.pix?.payload;
    if (!payload) return;

    await navigator.clipboard.writeText(payload);
    setCopied(true);

    window.setTimeout(() => {
      setCopied(false);
    }, 1800);
  }

  if (loading) {
    return (
      <main className="aura-page flex min-h-screen items-center justify-center text-zinc-400">
        Carregando mensalidade…
      </main>
    );
  }

  const backPath =
    plan?.audience === "venue"
      ? "/planos-casa"
      : "/planos-artista";

  const paid = checkout?.status === "paid";

  return (
    <main className="aura-page min-h-screen px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <button
          type="button"
          onClick={() => router.push(backPath)}
          className="mb-6 text-sm font-bold text-zinc-400 hover:text-white"
        >
          ← Voltar aos planos
        </button>

        <section className="aura-hero rounded-3xl p-6 sm:p-8">
          <p className="aura-kicker">MENSALIDADE AURA BEAT</p>
          <h1 className="mt-2 text-3xl font-black">
            {plan?.name || "Plano"}
          </h1>

          <p className="mt-3 text-3xl font-black text-green-400">
            {formatBRL(Number(plan?.monthly_price || 0))}
            <span className="text-sm font-semibold text-zinc-500">
              /mês
            </span>
          </p>

          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
            O Pix é processado pelo ASAAS. Depois da confirmação,
            o plano é ativado automaticamente por 1 mês.
          </p>
        </section>

        {error && (
          <div className="mt-5 rounded-2xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {paid ? (
          <section className="mt-6 rounded-3xl border border-green-800 bg-green-950/20 p-8 text-center">
            <div className="text-5xl">✓</div>
            <h2 className="mt-4 text-2xl font-black text-green-400">
              Plano ativado
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              O pagamento foi confirmado e os benefícios já estão liberados.
            </p>
            <button
              type="button"
              onClick={() => router.push(backPath)}
              className="mt-6 rounded-xl bg-green-600 px-6 py-3 font-black hover:bg-green-500"
            >
              Ver meu plano
            </button>
          </section>
        ) : !checkout ? (
          <section className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-xl font-black">
              Pagar mensalidade com Pix
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              O valor exibido no plano é o valor do Pix. A renovação seguinte
              pode ser feita novamente pela tela de planos.
            </p>

            {plan?.audience === "artist" && (
              <div className="mt-5 rounded-2xl border border-zinc-800 bg-black/40 p-4">
                <label className="text-sm font-black text-zinc-200">
                  CPF do titular da cobrança
                </label>

                {hasBillingDocument ? (
                  <div className="mt-2 rounded-xl border border-green-900 bg-green-950/20 px-4 py-3 text-sm text-green-300">
                    CPF de cobrança já cadastrado
                    {billingLast4 ? ` · final ${billingLast4}` : ""}.
                  </div>
                ) : (
                  <>
                    <input
                      value={billingDocument}
                      onChange={(event) =>
                        setBillingDocument(
                          event.target.value,
                        )
                      }
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="000.000.000-00"
                      className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-green-500"
                    />
                    <p className="mt-2 text-xs leading-5 text-zinc-600">
                      O ASAAS exige CPF ou CNPJ para gerar a cobrança.
                      Esse documento fica somente no cadastro privado de pagamento
                      e não aparece no seu perfil público.
                    </p>
                  </>
                )}
              </div>
            )}

            <button
              type="button"
              disabled={
                creating ||
                (plan?.audience === "artist" &&
                  !hasBillingDocument &&
                  !normalizeBillingDocument(
                    billingDocument,
                  ))
              }
              onClick={() => void createPix()}
              className="mt-5 w-full rounded-2xl bg-green-600 px-5 py-4 text-lg font-black hover:bg-green-500 disabled:opacity-50"
            >
              {creating
                ? "Gerando Pix…"
                : `Gerar Pix de ${formatBRL(Number(plan?.monthly_price || 0))}`}
            </button>
          </section>
        ) : (
          <section className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <div className="text-center">
              <span className="rounded-full border border-yellow-800 bg-yellow-950/30 px-3 py-1 text-xs font-black text-yellow-300">
                Aguardando pagamento
              </span>

              <h2 className="mt-4 text-xl font-black">
                Pix copia e cola
              </h2>

              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Copie o código abaixo e cole na opção Pix copia e cola do seu banco.
              </p>

              <p className="mt-3 text-2xl font-black text-green-400">
                {formatBRL(Number(checkout.total || plan?.monthly_price || 0))}
              </p>
            </div>

            {checkout.pix?.payload && (
              <div className="mt-6">
                <p className="mb-2 text-sm font-bold text-zinc-300">
                  Código Pix
                </p>
                <div className="rounded-2xl border border-zinc-800 bg-black p-4">
                  <p className="break-all text-xs text-zinc-400">
                    {checkout.pix.payload}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void copyPix()}
                  className="mt-3 w-full rounded-xl border border-zinc-700 px-4 py-3 font-bold hover:bg-zinc-900"
                >
                  {copied ? "Copiado ✓" : "Copiar código Pix"}
                </button>
              </div>
            )}

            <button
              type="button"
              disabled={checking}
              onClick={() => void checkPayment()}
              className="mt-4 w-full rounded-xl bg-purple-600 px-4 py-3 font-bold hover:bg-purple-500 disabled:opacity-50"
            >
              {checking
                ? "Verificando…"
                : "Já paguei — verificar"}
            </button>

            <p className="mt-4 text-center text-xs leading-5 text-zinc-600">
              O Aura Beat também verifica automaticamente enquanto esta tela estiver aberta.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
