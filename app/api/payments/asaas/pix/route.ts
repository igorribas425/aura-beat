import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createClient,
} from "@supabase/supabase-js";

import {
  createAsaasPixPayment,
  findOrCreateAsaasCustomer,
  getAsaasPixFee,
  getAsaasPixQrCode,
  getAsaasPayment,
  mapAsaasStatus,
} from "../../../../../lib/asaas";

export const runtime = "nodejs";

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Erro desconhecido.";
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

function tomorrowDate() {
  const date = new Date();

  date.setUTCDate(
    date.getUTCDate() + 1
  );

  return date
    .toISOString()
    .slice(0, 10);
}

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

async function authorizeVenue(
  admin: ReturnType<
    typeof createClient<any>
  >,
  userId: string,
  venueId: string
) {
  const {
    data: venue,
    error: venueError,
  } = await admin
    .from("venue_profiles")
    .select(`
      id,
      owner_user_id,
      trade_name,
      legal_name,
      cnpj,
      email,
      phone,
      verification_status,
      is_active
    `)
    .eq(
      "id",
      venueId
    )
    .maybeSingle();

  if (venueError) {
    throw venueError;
  }

  if (!venue) {
    throw new Error(
      "Casa nao encontrada."
    );
  }

  let authorized =
    venue.owner_user_id ===
    userId;

  if (!authorized) {
    const {
      data: member,
      error: memberError,
    } = await admin
      .from("venue_members")
      .select("id")
      .eq(
        "venue_id",
        venueId
      )
      .eq(
        "user_id",
        userId
      )
      .maybeSingle();

    if (memberError) {
      throw memberError;
    }

    authorized =
      Boolean(member);
  }

  if (!authorized) {
    throw new Error(
      "Voce nao tem permissao para pagar esta contratacao."
    );
  }

  if (
    venue.verification_status !==
      "verified" ||
    venue.is_active === false
  ) {
    throw new Error(
      "A Casa precisa estar ativa e verificada para realizar o pagamento."
    );
  }

  return venue;
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
      .select(`
        id,
        venue_id,
        artist_id,
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

    const venue =
      await authorizeVenue(
        admin,
        userData.user.id,
        booking.venue_id
      );

    if (
      ![
        "awaiting_payment",
        "confirmed",
      ].includes(
        booking.status
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Esta contratacao nao esta disponivel para pagamento.",
        },
        {
          status: 409,
        }
      );
    }

    const {
      data: existing,
      error: existingError,
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
      .in(
        "status",
        [
          "pending",
          "processing",
          "paid",
        ]
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      )
      .limit(1)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (
      existing
        ?.provider_payment_id &&
      !existing
        .provider_payment_id
        .startsWith(
          "creating:"
        )
    ) {
      const remote =
        await getAsaasPayment(
          existing
            .provider_payment_id
        );

      const mappedStatus =
        mapAsaasStatus(
          remote.status
        );

      if (
        mappedStatus !==
        existing.status
      ) {
        const now =
          new Date()
            .toISOString();

        const {
          error: syncError,
        } = await admin
          .from("payments")
          .update({
            status:
              mappedStatus,
            updated_at: now,
            ...(mappedStatus ===
            "paid"
              ? {
                  paid_at: now,
                }
              : {}),
          })
          .eq(
            "id",
            existing.id
          );

        if (syncError) {
          throw syncError;
        }
      }

      if (
        mappedStatus === "paid"
      ) {
        return NextResponse.json({
          status: "paid",
          paymentId:
            existing.id,
          total:
            Number(
              existing.gross_amount ||
                0
            ),
          providerFee:
            Number(
              existing.provider_fee ||
                0
            ),
        });
      }

      const qr =
        await getAsaasPixQrCode(
          existing
            .provider_payment_id
        );

      return NextResponse.json({
        status:
          mappedStatus,
        paymentId:
          existing.id,
        total:
          Number(
            existing.gross_amount ||
              0
          ),
        providerFee:
          Number(
            existing.provider_fee ||
              0
          ),
        pix: {
          payload:
            qr.payload || "",
          encodedImage:
            qr.encodedImage ||
            "",
          expirationDate:
            qr.expirationDate ||
            null,
        },
      });
    }

    const providerFee =
      getAsaasPixFee();

    const agreedFee =
      money(
        booking.agreed_fee
      );

    const venueFee =
      money(
        booking.platform_fee_venue
      );

    const artistFee =
      money(
        booking.platform_fee_artist
      );

    const travel =
      money(
        booking.travel_amount
      );

    const toll =
      money(
        booking.toll_amount
      );

    const lodging =
      money(
        booking.lodging_amount
      );

    const grossAmount =
      money(
        agreedFee +
          venueFee +
          providerFee +
          travel +
          toll +
          lodging
      );

    const customer =
      await findOrCreateAsaasCustomer(
        {
          name:
            venue.legal_name ||
            venue.trade_name,
          cpfCnpj:
            venue.cnpj,
          email:
            venue.email ||
            userData.user.email ||
            null,
          phone:
            venue.phone,
        }
      );

    const localId =
      crypto.randomUUID();

    const temporaryProviderId =
      `creating:${localId}`;

    const {
      data: localPayment,
      error: insertError,
    } = await admin
      .from("payments")
      .insert({
        id: localId,
        booking_id:
          booking.id,
        provider: "asaas",
        provider_payment_id:
          temporaryProviderId,
        method: "pix",
        status: "pending",
        gross_amount:
          grossAmount,
        agreed_fee:
          agreedFee,
        travel_amount:
          travel,
        toll_amount:
          toll,
        lodging_amount:
          lodging,
        platform_fee_venue:
          venueFee,
        platform_fee_artist:
          artistFee,
        provider_fee:
          providerFee,
        currency: "BRL",
        metadata: {
          source:
            "asaas_pix_checkout",
          asaas_customer_id:
            customer.id,
        },
      })
      .select("id")
      .single();

    if (insertError) {
      throw insertError;
    }

    try {
      const payment =
        await createAsaasPixPayment(
          {
            customerId:
              customer.id,
            value:
              grossAmount,
            dueDate:
              tomorrowDate(),
            description:
              `Aura Beat - contratacao ${booking.id}`,
            externalReference:
              booking.id,
          }
        );

      const mappedStatus =
        mapAsaasStatus(
          payment.status
        );

      const now =
        new Date()
          .toISOString();

      const {
        error: updateError,
      } = await admin
        .from("payments")
        .update({
          provider_payment_id:
            payment.id,
          status:
            mappedStatus,
          updated_at: now,
          ...(mappedStatus ===
          "paid"
            ? {
                paid_at: now,
              }
            : {}),
          metadata: {
            source:
              "asaas_pix_checkout",
            asaas_customer_id:
              customer.id,
            asaas_status:
              payment.status,
          },
        })
        .eq(
          "id",
          localPayment.id
        );

      if (updateError) {
        throw updateError;
      }

      if (
        mappedStatus === "paid"
      ) {
        return NextResponse.json({
          status: "paid",
          paymentId:
            localPayment.id,
          total:
            grossAmount,
          providerFee,
        });
      }

      const qr =
        await getAsaasPixQrCode(
          payment.id
        );

      return NextResponse.json({
        status:
          mappedStatus,
        paymentId:
          localPayment.id,
        total:
          grossAmount,
        providerFee,
        pix: {
          payload:
            qr.payload || "",
          encodedImage:
            qr.encodedImage ||
            "",
          expirationDate:
            qr.expirationDate ||
            null,
        },
      });
    } catch (error) {
      await admin
        .from("payments")
        .update({
          status: "failed",
          updated_at:
            new Date()
              .toISOString(),
          metadata: {
            source:
              "asaas_pix_checkout",
            asaas_customer_id:
              customer.id,
            creation_error:
              errorMessage(error),
          },
        })
        .eq(
          "id",
          localPayment.id
        );

      throw error;
    }
  } catch (error) {
    console.error(
      "Erro ao criar Pix Asaas:",
      error
    );

    return NextResponse.json(
      {
        error:
          errorMessage(error),
      },
      {
        status: 500,
      }
    );
  }
}
