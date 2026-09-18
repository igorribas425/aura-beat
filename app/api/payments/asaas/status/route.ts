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

function bearerToken(
  request: NextRequest
) {
  const authorization =
    request.headers.get(
      "authorization"
    );

  if (
    !authorization
      ?.toLowerCase()
      .startsWith("bearer ")
  ) {
    return null;
  }

  return authorization
    .slice(7)
    .trim();
}

function getServerConfig() {
  const supabaseUrl =
    process.env
      .NEXT_PUBLIC_SUPABASE_URL
      ?.trim();

  const serviceRole =
    process.env
      .SUPABASE_SERVICE_ROLE_KEY
      ?.trim();

  if (
    !supabaseUrl ||
    !serviceRole
  ) {
    throw new Error(
      "Backend do Supabase nao configurado."
    );
  }

  return {
    supabaseUrl,
    serviceRole,
  };
}

export async function POST(
  request: NextRequest
) {
  try {
    const token =
      bearerToken(request);

    if (!token) {
      return NextResponse.json(
        {
          error:
            "Autenticacao obrigatoria.",
        },
        {
          status: 401,
        }
      );
    }

    const {
      supabaseUrl,
      serviceRole,
    } = getServerConfig();

    const admin =
      createClient(
        supabaseUrl,
        serviceRole,
        {
          auth: {
            persistSession: false,
            autoRefreshToken:
              false,
          },
        }
      );

    const {
      data: userData,
      error: userError,
    } =
      await admin.auth.getUser(
        token
      );

    if (
      userError ||
      !userData.user
    ) {
      return NextResponse.json(
        {
          error:
            "Sessao invalida.",
        },
        {
          status: 401,
        }
      );
    }

    const body =
      (await request.json()) as {
        bookingId?: string;
      };

    const bookingId =
      body.bookingId?.trim();

    if (!bookingId) {
      return NextResponse.json(
        {
          error:
            "bookingId obrigatorio.",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: booking,
      error: bookingError,
    } = await admin
      .from("bookings")
      .select(
        "id,venue_id,status"
      )
      .eq(
        "id",
        bookingId
      )
      .maybeSingle();

    if (bookingError) {
      throw bookingError;
    }

    if (!booking) {
      return NextResponse.json(
        {
          error:
            "Contratacao nao encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    const {
      data: venue,
      error: venueError,
    } = await admin
      .from("venue_profiles")
      .select(
        "id,owner_user_id"
      )
      .eq(
        "id",
        booking.venue_id
      )
      .maybeSingle();

    if (venueError) {
      throw venueError;
    }

    let authorized =
      venue?.owner_user_id ===
      userData.user.id;

    if (!authorized) {
      const {
        data: member,
        error: memberError,
      } = await admin
        .from("venue_members")
        .select("id")
        .eq(
          "venue_id",
          booking.venue_id
        )
        .eq(
          "user_id",
          userData.user.id
        )
        .maybeSingle();

      if (memberError) {
        throw memberError;
      }

      authorized =
        Boolean(member);
    }

    if (!authorized) {
      return NextResponse.json(
        {
          error:
            "Sem permissao para consultar este pagamento.",
        },
        {
          status: 403,
        }
      );
    }

    const {
      data: payment,
      error: paymentError,
    } = await admin
      .from("payments")
      .select(`
        id,
        provider_payment_id,
        status,
        gross_amount,
        provider_fee
      `)
      .eq(
        "booking_id",
        bookingId
      )
      .eq(
        "provider",
        "asaas"
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      )
      .limit(1)
      .maybeSingle();

    if (paymentError) {
      throw paymentError;
    }

    if (
      !payment ||
      !payment.provider_payment_id ||
      payment.provider_payment_id.startsWith(
        "creating:"
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Cobranca Pix ainda nao encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    const remote =
      await getAsaasPayment(
        payment.provider_payment_id
      );

    const status =
      mapAsaasStatus(
        remote.status
      );

    if (
      status !==
      payment.status
    ) {
      const now =
        new Date()
          .toISOString();

      const {
        error: updateError,
      } = await admin
        .from("payments")
        .update({
          status,
          updated_at: now,
          ...(status === "paid"
            ? {
                paid_at: now,
              }
            : {}),
          metadata: {
            source:
              "asaas_pix_checkout",
            asaas_status:
              remote.status,
          },
        })
        .eq(
          "id",
          payment.id
        );

      if (updateError) {
        throw updateError;
      }
    }

    return NextResponse.json({
      status,
      bookingStatus:
        status === "paid"
          ? "confirmed"
          : booking.status,
      total:
        Number(
          payment.gross_amount ||
            0
        ),
      providerFee:
        Number(
          payment.provider_fee ||
            0
        ),
    });
  } catch (error) {
    console.error(
      "Erro ao sincronizar Pix Asaas:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Nao foi possivel consultar o pagamento.",
      },
      {
        status: 500,
      }
    );
  }
}
