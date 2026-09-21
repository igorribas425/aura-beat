import {
  timingSafeEqual,
} from "node:crypto";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createClient,
} from "@supabase/supabase-js";

export const runtime = "nodejs";

type AsaasWebhookEvent = {
  event?: string;
  payment?: {
    id?: string;
    status?: string;
    value?: number;
    externalReference?: string | null;
  };
};

function safeEqual(
  received: string | null,
  expected: string
) {
  if (!received) {
    return false;
  }

  const a = Buffer.from(received);
  const b = Buffer.from(expected);

  return (
    a.length === b.length &&
    timingSafeEqual(a, b)
  );
}

function mapEventToStatus(
  event: string
):
  | "paid"
  | "refunded"
  | "cancelled"
  | "failed"
  | null {
  switch (event) {
    case "PAYMENT_RECEIVED":
    case "PAYMENT_CONFIRMED":
      return "paid";

    case "PAYMENT_REFUNDED":
      return "refunded";

    case "PAYMENT_DELETED":
      return "cancelled";

    case "PAYMENT_OVERDUE":
      return "failed";

    default:
      return null;
  }
}

function money(
  value: number
) {
  return (
    Math.round(
      Number(value || 0) * 100
    ) / 100
  );
}

export async function POST(
  request: NextRequest
) {
  const webhookToken =
    process.env
      .ASAAS_WEBHOOK_TOKEN
      ?.trim();

  const serviceKey =
    process.env
      .SUPABASE_SERVICE_ROLE_KEY
      ?.trim();

  const supabaseUrl =
    process.env
      .NEXT_PUBLIC_SUPABASE_URL
      ?.trim();

  if (
    !webhookToken ||
    !serviceKey ||
    !supabaseUrl
  ) {
    return NextResponse.json(
      {
        error:
          "Webhook backend is not configured",
      },
      {
        status: 503,
      }
    );
  }

  const receivedToken =
    request.headers.get(
      "asaas-access-token"
    );

  if (
    !safeEqual(
      receivedToken,
      webhookToken
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid webhook token",
      },
      {
        status: 401,
      }
    );
  }

  let event: AsaasWebhookEvent;

  try {
    event =
      (await request.json()) as
        AsaasWebhookEvent;
  } catch {
    return NextResponse.json(
      {
        error: "Invalid JSON",
      },
      {
        status: 400,
      }
    );
  }

  const eventName =
    event.event?.trim();

  const providerPaymentId =
    event.payment?.id?.trim();

  if (
    !eventName ||
    !providerPaymentId
  ) {
    return NextResponse.json(
      {
        error:
          "Missing Asaas event fields",
      },
      {
        status: 400,
      }
    );
  }

  const status =
    mapEventToStatus(
      eventName
    );

  if (!status) {
    return NextResponse.json({
      received: true,
      ignored: true,
      event: eventName,
    });
  }

  const admin =
    createClient(
      supabaseUrl,
      serviceKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken:
            false,
        },
      }
    );

  const {
    data: subscriptionPayment,
    error: subscriptionPaymentError,
  } = await admin
    .from("subscription_payments")
    .select(
      "id,status,amount,metadata"
    )
    .eq("provider", "asaas")
    .eq(
      "provider_payment_id",
      providerPaymentId
    )
    .maybeSingle();

  if (subscriptionPaymentError) {
    console.error(
      "Erro ao localizar mensalidade do webhook Asaas:",
      subscriptionPaymentError
    );

    return NextResponse.json(
      { error: "Persistence lookup failed" },
      { status: 500 }
    );
  }

  if (subscriptionPayment) {
    const externalReference =
      event.payment?.externalReference?.trim();

    const expectedReference =
      `subscription:${subscriptionPayment.id}`;

    if (
      externalReference &&
      externalReference !== expectedReference
    ) {
      return NextResponse.json(
        { error: "External reference mismatch" },
        { status: 409 }
      );
    }

    if (
      (status === "paid" ||
        status === "refunded") &&
      typeof event.payment?.value === "number" &&
      Math.abs(
        money(event.payment.value) -
          money(subscriptionPayment.amount)
      ) > 0.01
    ) {
      return NextResponse.json(
        { error: "Payment amount mismatch" },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const oldMetadata =
      subscriptionPayment.metadata &&
      typeof subscriptionPayment.metadata === "object"
        ? subscriptionPayment.metadata
        : {};

    const updateData: Record<string, unknown> = {
      status,
      updated_at: now,
      metadata: {
        ...oldMetadata,
        webhook_event: eventName,
        webhook_received_at: now,
      },
    };

    if (status === "paid") {
      updateData.paid_at = now;
    }

    if (status === "refunded") {
      updateData.refunded_at = now;
    }

    const { error: subscriptionUpdateError } =
      await admin
        .from("subscription_payments")
        .update(updateData)
        .eq("id", subscriptionPayment.id);

    if (subscriptionUpdateError) {
      console.error(
        "Erro ao atualizar mensalidade pelo webhook Asaas:",
        subscriptionUpdateError
      );

      return NextResponse.json(
        { error: "Persistence update failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      received: true,
      event: eventName,
      status,
      billing: "subscription",
    });
  }

  const {
    data: payment,
    error: paymentError,
  } = await admin
    .from("payments")
    .select(
      "id,booking_id,status,gross_amount,charge_type,metadata"
    )
    .eq(
      "provider",
      "asaas"
    )
    .eq(
      "provider_payment_id",
      providerPaymentId
    )
    .maybeSingle();

  if (paymentError) {
    console.error(
      "Erro ao localizar pagamento do webhook Asaas:",
      paymentError
    );

    return NextResponse.json(
      {
        error:
          "Persistence lookup failed",
      },
      {
        status: 500,
      }
    );
  }

  if (!payment) {
    return NextResponse.json({
      received: true,
      ignored: true,
      reason:
        "Payment not managed by Aura Beat",
    });
  }

  if (
    payment.charge_type ===
    "legacy_booking_total"
  ) {
    return NextResponse.json({
      received: true,
      ignored: true,
      reason:
        "Legacy full-booking charge disabled",
    });
  }

  const externalReference =
    event.payment
      ?.externalReference
      ?.trim();

  const expectedReference =
    `${payment.booking_id}:${payment.charge_type}`;

  if (
    externalReference &&
    externalReference !==
      expectedReference
  ) {
    return NextResponse.json(
      {
        error:
          "External reference mismatch",
      },
      {
        status: 409,
      }
    );
  }

  if (
    (status === "paid" ||
      status === "refunded") &&
    typeof event.payment?.value ===
      "number" &&
    Math.abs(
      money(
        event.payment.value
      ) -
        money(
          payment.gross_amount
        )
    ) > 0.01
  ) {
    return NextResponse.json(
      {
        error:
          "Payment amount mismatch",
      },
      {
        status: 409,
      }
    );
  }

  const now =
    new Date().toISOString();

  const oldMetadata =
    payment.metadata &&
    typeof payment.metadata ===
      "object"
      ? payment.metadata
      : {};

  const updateData: {
    status:
      | "paid"
      | "refunded"
      | "cancelled"
      | "failed";
    updated_at: string;
    paid_at?: string;
    refunded_at?: string;
    metadata: Record<
      string,
      unknown
    >;
  } = {
    status,
    updated_at: now,
    metadata: {
      ...oldMetadata,
      webhook_event:
        eventName,
      webhook_received_at:
        now,
    },
  };

  if (status === "paid") {
    updateData.paid_at = now;
  }

  if (status === "refunded") {
    updateData.refunded_at =
      now;
  }

  const {
    error: updateError,
  } = await admin
    .from("payments")
    .update(updateData)
    .eq(
      "id",
      payment.id
    );

  if (updateError) {
    console.error(
      "Erro ao atualizar pagamento pelo webhook Asaas:",
      updateError
    );

    return NextResponse.json(
      {
        error:
          "Persistence update failed",
      },
      {
        status: 500,
      }
    );
  }

  return NextResponse.json({
    received: true,
    event: eventName,
    status,
    chargeType:
      payment.charge_type,
  });
}
