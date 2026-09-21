import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createClient,
} from "@supabase/supabase-js";

import {
  getAsaasPayment,
  mapAsaasStatus,
} from "../../../../../lib/asaas";

export const runtime = "nodejs";

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  return authorization.slice(7).trim();
}

function getServerConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRole) {
    throw new Error("Backend do Supabase nao configurado.");
  }

  return { supabaseUrl, serviceRole };
}

export async function POST(request: NextRequest) {
  try {
    const token = bearerToken(request);

    if (!token) {
      return NextResponse.json(
        { error: "Autenticacao obrigatoria." },
        { status: 401 },
      );
    }

    const { supabaseUrl, serviceRole } = getServerConfig();

    const admin = createClient(supabaseUrl, serviceRole, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: userData, error: userError } =
      await admin.auth.getUser(token);

    if (userError || !userData.user) {
      return NextResponse.json(
        { error: "Sessao invalida." },
        { status: 401 },
      );
    }

    const body = (await request.json()) as {
      paymentId?: string;
    };

    const paymentId = body.paymentId?.trim();

    if (!paymentId) {
      return NextResponse.json(
        { error: "paymentId obrigatorio." },
        { status: 400 },
      );
    }

    const { data: payment, error: paymentError } = await admin
      .from("subscription_payments")
      .select(
        "id,user_id,provider_payment_id,status,amount,subscription_id,plan_id",
      )
      .eq("id", paymentId)
      .maybeSingle();

    if (paymentError) throw paymentError;

    if (!payment || payment.user_id !== userData.user.id) {
      return NextResponse.json(
        { error: "Pagamento do plano nao encontrado." },
        { status: 404 },
      );
    }

    if (
      !payment.provider_payment_id ||
      payment.provider_payment_id.startsWith("creating:")
    ) {
      return NextResponse.json(
        { error: "Cobranca ainda nao disponivel." },
        { status: 409 },
      );
    }

    const remote = await getAsaasPayment(payment.provider_payment_id);
    const status = mapAsaasStatus(remote.status);

    if (status !== payment.status) {
      const now = new Date().toISOString();

      const { error: updateError } = await admin
        .from("subscription_payments")
        .update({
          status,
          updated_at: now,
          ...(status === "paid" ? { paid_at: now } : {}),
        })
        .eq("id", payment.id);

      if (updateError) throw updateError;
    }

    const { data: refreshed, error: refreshError } = await admin
      .from("subscription_payments")
      .select("status,subscription_id")
      .eq("id", payment.id)
      .single();

    if (refreshError) throw refreshError;

    return NextResponse.json({
      status: refreshed.status,
      paymentId: payment.id,
      subscriptionId: refreshed.subscription_id,
      total: Number(payment.amount || 0),
    });
  } catch (error) {
    console.error("Erro ao consultar Pix do plano ASAAS:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Nao foi possivel consultar o pagamento.",
      },
      { status: 500 },
    );
  }
}
