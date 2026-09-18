import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function validSignature(
  body: string,
  received: string | null,
  secret: string
) {
  if (!received) {
    return false;
  }

  const expected = createHmac(
    "sha256",
    secret
  )
    .update(body)
    .digest("hex");

  const assinaturaRecebida =
    received.replace(
      /^sha256=/,
      ""
    );

  const a = Buffer.from(expected);
  const b = Buffer.from(
    assinaturaRecebida
  );

  return (
    a.length === b.length &&
    timingSafeEqual(a, b)
  );
}

export async function POST(
  request: NextRequest
) {
  const secret =
    process.env.PAYMENT_WEBHOOK_SECRET;

  const serviceKey =
    process.env
      .SUPABASE_SERVICE_ROLE_KEY;

  const supabaseUrl =
    process.env
      .NEXT_PUBLIC_SUPABASE_URL;

  if (
    !secret ||
    !serviceKey ||
    !supabaseUrl
  ) {
    return NextResponse.json(
      {
        error:
          "Payment backend is not configured",
      },
      {
        status: 503,
      }
    );
  }

  const body =
    await request.text();

  const assinatura =
    request.headers.get(
      "x-aura-signature"
    );

  if (
    !validSignature(
      body,
      assinatura,
      secret
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid signature",
      },
      {
        status: 401,
      }
    );
  }

  let event: {
    id?: string;
    status?: string;
  };

  try {
    event = JSON.parse(body);
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

  if (
    !event.id ||
    !event.status
  ) {
    return NextResponse.json(
      {
        error:
          "Missing event fields",
      },
      {
        status: 400,
      }
    );
  }

  const allowed: Record<
    string,
    string
  > = {
    pending: "pending",
    processing: "processing",
    paid: "paid",
    failed: "failed",
    refunded: "refunded",
    cancelled: "cancelled",
  };

  const status =
    allowed[event.status];

  if (!status) {
    return NextResponse.json(
      {
        error: "Unknown status",
      },
      {
        status: 422,
      }
    );
  }

  const admin = createClient(
    supabaseUrl,
    serviceKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  const agora =
    new Date().toISOString();

  const updateData: {
    status: string;
    updated_at: string;
    paid_at?: string;
  } = {
    status,
    updated_at: agora,
  };

  if (status === "paid") {
    updateData.paid_at = agora;
  }

  const {
    error,
  } = await admin
    .from("payments")
    .update(updateData)
    .eq(
      "provider_payment_id",
      event.id
    );

  if (error) {
    console.error(
      "Erro ao atualizar pagamento:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Persistence failed",
      },
      {
        status: 500,
      }
    );
  }

  return NextResponse.json({
    received: true,
  });
}