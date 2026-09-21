import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createClient,
  type SupabaseClient,
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

type PayerType = "venue" | "artist";
type ChargeType =
  | "venue_platform_fee"
  | "artist_platform_fee";

type BookingRow = {
  id: string;
  venue_id: string;
  artist_id: string;
  status: string;
  agreed_fee: number;
  travel_amount: number;
  toll_amount: number;
  lodging_amount: number;
  platform_fee_venue: number;
  platform_fee_artist: number;
};

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

function money(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function tomorrowDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function bearerToken(request: NextRequest) {
  const authorization =
    request.headers.get("authorization");

  if (
    !authorization
      ?.toLowerCase()
      .startsWith("bearer ")
  ) {
    return null;
  }

  return authorization.slice(7).trim();
}

function getServerConfig() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRole =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRole) {
    throw new Error(
      "Backend do Supabase nao configurado."
    );
  }

  return { supabaseUrl, serviceRole };
}

async function authorizeVenue(
  admin: SupabaseClient,
  userId: string,
  booking: BookingRow,
  fallbackEmail: string | null
) {
  const { data: venue, error } =
    await admin
      .from("venue_profiles")
      .select(
        "id,owner_user_id,trade_name,legal_name,cnpj,email,phone,verification_status,is_active"
      )
      .eq("id", booking.venue_id)
      .maybeSingle();

  if (error) throw error;
  if (!venue) {
    throw new Error("Casa nao encontrada.");
  }

  let authorized =
    venue.owner_user_id === userId;

  if (!authorized) {
    const { data: member, error: memberError } =
      await admin
        .from("venue_team")
        .select("user_id")
        .eq("venue_id", booking.venue_id)
        .eq("user_id", userId)
        .maybeSingle();

    if (memberError) throw memberError;
    authorized = Boolean(member);
  }

  if (!authorized) {
    throw new Error(
      "Voce nao tem permissao para pagar a taxa desta Casa."
    );
  }

  if (
    venue.verification_status !== "verified" ||
    venue.is_active === false
  ) {
    throw new Error(
      "A Casa precisa estar ativa e verificada para realizar o pagamento."
    );
  }

  return {
    chargeType: "venue_platform_fee" as ChargeType,
    platformFee: money(booking.platform_fee_venue),
    customer: {
      name:
        venue.legal_name ||
        venue.trade_name ||
        "Casa Aura Beat",
      cpfCnpj: venue.cnpj,
      email:
        venue.email ||
        fallbackEmail,
      phone: venue.phone,
    },
  };
}

async function authorizeArtist(
  admin: SupabaseClient,
  userId: string,
  booking: BookingRow,
  fallbackEmail: string | null
) {
  const { data: artist, error } =
    await admin
      .from("artist_profiles")
      .select(
        "id,user_id,stage_name,verification_status,is_active"
      )
      .eq("id", booking.artist_id)
      .maybeSingle();

  if (error) throw error;
  if (!artist) {
    throw new Error("Artista nao encontrado.");
  }

  if (artist.user_id !== userId) {
    throw new Error(
      "Apenas o Artista desta contratacao pode pagar esta taxa."
    );
  }

  if (
    artist.verification_status !== "verified" ||
    artist.is_active === false
  ) {
    throw new Error(
      "O Artista precisa estar ativo e verificado para realizar o pagamento."
    );
  }

  const { data: profile } =
    await admin
      .from("profiles")
      .select("full_name,phone")
      .eq("id", userId)
      .maybeSingle();

  return {
    chargeType: "artist_platform_fee" as ChargeType,
    platformFee: money(booking.platform_fee_artist),
    customer: {
      name:
        artist.stage_name ||
        profile?.full_name ||
        "Artista Aura Beat",
      cpfCnpj: null,
      email: fallbackEmail,
      phone: profile?.phone || null,
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const token = bearerToken(request);

    if (!token) {
      return NextResponse.json(
        { error: "Autenticacao obrigatoria." },
        { status: 401 }
      );
    }

    const { supabaseUrl, serviceRole } =
      getServerConfig();

    const admin = createClient(
      supabaseUrl,
      serviceRole,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { data: userData, error: userError } =
      await admin.auth.getUser(token);

    if (userError || !userData.user) {
      return NextResponse.json(
        { error: "Sessao invalida." },
        { status: 401 }
      );
    }

    const body =
      (await request.json()) as {
        bookingId?: string;
        payerType?: PayerType;
      };

    const bookingId = body.bookingId?.trim();
    const payerType: PayerType =
      body.payerType === "artist"
        ? "artist"
        : "venue";

    if (!bookingId) {
      return NextResponse.json(
        { error: "bookingId obrigatorio." },
        { status: 400 }
      );
    }

    const { data: booking, error: bookingError } =
      await admin
        .from("bookings")
        .select(
          "id,venue_id,artist_id,status,agreed_fee,travel_amount,toll_amount,lodging_amount,platform_fee_venue,platform_fee_artist"
        )
        .eq("id", bookingId)
        .maybeSingle();

    if (bookingError) throw bookingError;
    if (!booking) {
      return NextResponse.json(
        { error: "Contratacao nao encontrada." },
        { status: 404 }
      );
    }

    if (
      !["awaiting_payment", "confirmed"].includes(
        booking.status
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Esta contratacao nao esta disponivel para pagamento.",
        },
        { status: 409 }
      );
    }

    const typedBooking = booking as BookingRow;

    const payer =
      payerType === "artist"
        ? await authorizeArtist(
            admin,
            userData.user.id,
            typedBooking,
            userData.user.email || null
          )
        : await authorizeVenue(
            admin,
            userData.user.id,
            typedBooking,
            userData.user.email || null
          );

    if (payer.platformFee <= 0) {
      return NextResponse.json(
        {
          error:
            payerType === "artist"
              ? "Esta contratacao nao possui taxa para o Artista."
              : "Esta contratacao nao possui taxa para a Casa.",
        },
        { status: 409 }
      );
    }

    const { data: existing, error: existingError } =
      await admin
        .from("payments")
        .select(
          "id,provider_payment_id,status,gross_amount,provider_fee"
        )
        .eq("booking_id", bookingId)
        .eq("provider", "asaas")
        .eq("charge_type", payer.chargeType)
        .in("status", [
          "pending",
          "processing",
          "paid",
        ])
        .order("created_at", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

    if (existingError) throw existingError;

    if (
      existing?.provider_payment_id &&
      !existing.provider_payment_id.startsWith(
        "creating:"
      )
    ) {
      const remote = await getAsaasPayment(
        existing.provider_payment_id
      );

      const mappedStatus = mapAsaasStatus(
        remote.status
      );

      if (mappedStatus !== existing.status) {
        const now = new Date().toISOString();

        const { error: syncError } =
          await admin
            .from("payments")
            .update({
              status: mappedStatus,
              updated_at: now,
              ...(mappedStatus === "paid"
                ? { paid_at: now }
                : {}),
            })
            .eq("id", existing.id);

        if (syncError) throw syncError;
      }

      if (mappedStatus === "paid") {
        return NextResponse.json({
          status: "paid",
          paymentId: existing.id,
          payerType,
          platformFee: payer.platformFee,
          total: Number(
            existing.gross_amount || 0
          ),
          providerFee: Number(
            existing.provider_fee || 0
          ),
        });
      }

      if (
        mappedStatus === "pending" ||
        mappedStatus === "processing"
      ) {
        const qr = await getAsaasPixQrCode(
          existing.provider_payment_id
        );

        return NextResponse.json({
          status: mappedStatus,
          paymentId: existing.id,
          payerType,
          platformFee: payer.platformFee,
          total: Number(
            existing.gross_amount || 0
          ),
          providerFee: Number(
            existing.provider_fee || 0
          ),
          pix: {
            payload: qr.payload || "",
            encodedImage:
              qr.encodedImage || "",
            expirationDate:
              qr.expirationDate || null,
          },
        });
      }
    }

    const providerFee = getAsaasPixFee();
    const grossAmount = money(
      payer.platformFee + providerFee
    );

    const customer =
      await findOrCreateAsaasCustomer(
        payer.customer
      );

    const localId = crypto.randomUUID();
    const temporaryProviderId =
      `creating:${localId}`;

    const { data: localPayment, error: insertError } =
      await admin
        .from("payments")
        .insert({
          id: localId,
          booking_id: booking.id,
          payer_user_id: userData.user.id,
          charge_type: payer.chargeType,
          provider: "asaas",
          provider_payment_id:
            temporaryProviderId,
          method: "pix",
          status: "pending",
          gross_amount: grossAmount,
          agreed_fee: money(
            booking.agreed_fee
          ),
          travel_amount: money(
            booking.travel_amount
          ),
          toll_amount: money(
            booking.toll_amount
          ),
          lodging_amount: money(
            booking.lodging_amount
          ),
          platform_fee_venue:
            payer.chargeType ===
            "venue_platform_fee"
              ? payer.platformFee
              : 0,
          platform_fee_artist:
            payer.chargeType ===
            "artist_platform_fee"
              ? payer.platformFee
              : 0,
          provider_fee: providerFee,
          currency: "BRL",
          metadata: {
            source:
              "asaas_platform_fee_v2",
            payer_type: payerType,
            charge_type:
              payer.chargeType,
            asaas_customer_id:
              customer.id,
          },
        })
        .select("id")
        .single();

    if (insertError) throw insertError;

    try {
      const payment =
        await createAsaasPixPayment({
          customerId: customer.id,
          value: grossAmount,
          dueDate: tomorrowDate(),
          description:
            payerType === "artist"
              ? `Aura Beat - taxa Artista 3% - ${booking.id}`
              : `Aura Beat - taxa Casa 3% - ${booking.id}`,
          externalReference:
            `${booking.id}:${payer.chargeType}`,
        });

      const mappedStatus = mapAsaasStatus(
        payment.status
      );
      const now = new Date().toISOString();

      const { error: updateError } =
        await admin
          .from("payments")
          .update({
            provider_payment_id:
              payment.id,
            status: mappedStatus,
            updated_at: now,
            ...(mappedStatus === "paid"
              ? { paid_at: now }
              : {}),
            metadata: {
              source:
                "asaas_platform_fee_v2",
              payer_type: payerType,
              charge_type:
                payer.chargeType,
              asaas_customer_id:
                customer.id,
              asaas_status:
                payment.status,
            },
          })
          .eq("id", localPayment.id);

      if (updateError) throw updateError;

      if (mappedStatus === "paid") {
        return NextResponse.json({
          status: "paid",
          paymentId: localPayment.id,
          payerType,
          platformFee:
            payer.platformFee,
          total: grossAmount,
          providerFee,
        });
      }

      const qr = await getAsaasPixQrCode(
        payment.id
      );

      return NextResponse.json({
        status: mappedStatus,
        paymentId: localPayment.id,
        payerType,
        platformFee: payer.platformFee,
        total: grossAmount,
        providerFee,
        pix: {
          payload: qr.payload || "",
          encodedImage:
            qr.encodedImage || "",
          expirationDate:
            qr.expirationDate || null,
        },
      });
    } catch (error) {
      await admin
        .from("payments")
        .update({
          status: "failed",
          updated_at:
            new Date().toISOString(),
          metadata: {
            source:
              "asaas_platform_fee_v2",
            payer_type: payerType,
            charge_type:
              payer.chargeType,
            asaas_customer_id:
              customer.id,
            creation_error:
              errorMessage(error),
          },
        })
        .eq("id", localPayment.id);

      throw error;
    }
  } catch (error) {
    console.error(
      "Erro ao criar Pix Asaas:",
      error
    );

    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500 }
    );
  }
}
