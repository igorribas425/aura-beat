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
  getAsaasPayment,
  getAsaasPixQrCode,
  mapAsaasStatus,
} from "../../../../../lib/asaas";

export const runtime = "nodejs";

type Audience = "artist" | "venue";

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  return authorization.slice(7).trim();
}

function tomorrowDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function money(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function getServerConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRole) {
    throw new Error("Backend do Supabase nao configurado.");
  }

  return { supabaseUrl, serviceRole };
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Nao foi possivel gerar o Pix do plano.";
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
      planId?: string;
    };

    const planId = body.planId?.trim();

    if (!planId) {
      return NextResponse.json(
        { error: "planId obrigatorio." },
        { status: 400 },
      );
    }

    const { data: plan, error: planError } = await admin
      .from("plans")
      .select("id,audience,code,name,monthly_price,is_active")
      .eq("id", planId)
      .maybeSingle();

    if (planError) throw planError;

    if (!plan || !plan.is_active) {
      return NextResponse.json(
        { error: "Plano inexistente ou indisponivel." },
        { status: 404 },
      );
    }

    const audience: Audience =
      plan.audience === "venue" ? "venue" : "artist";

    let artistId: string | null = null;
    let venueId: string | null = null;
    let customer: {
      name: string;
      cpfCnpj?: string | null;
      email?: string | null;
      phone?: string | null;
    };

    if (audience === "artist") {
      const { data: artist, error: artistError } = await admin
        .from("artist_profiles")
        .select("id,stage_name,is_active")
        .eq("user_id", userData.user.id)
        .maybeSingle();

      if (artistError) throw artistError;

      if (!artist || artist.is_active === false) {
        return NextResponse.json(
          { error: "Perfil de Artista nao encontrado ou inativo." },
          { status: 409 },
        );
      }

      artistId = artist.id;

      const { data: profile } = await admin
        .from("profiles")
        .select("full_name,phone")
        .eq("id", userData.user.id)
        .maybeSingle();

      customer = {
        name:
          artist.stage_name ||
          profile?.full_name ||
          "Artista Aura Beat",
        email: userData.user.email || null,
        phone: profile?.phone || null,
      };
    } else {
      const { data: venue, error: venueError } = await admin
        .from("venue_profiles")
        .select(
          "id,trade_name,legal_name,cnpj,email,phone,is_active",
        )
        .eq("owner_user_id", userData.user.id)
        .maybeSingle();

      if (venueError) throw venueError;

      if (!venue || venue.is_active === false) {
        return NextResponse.json(
          { error: "Perfil de Casa nao encontrado ou inativo." },
          { status: 409 },
        );
      }

      venueId = venue.id;

      customer = {
        name:
          venue.legal_name ||
          venue.trade_name ||
          "Casa Aura Beat",
        cpfCnpj: venue.cnpj,
        email: venue.email || userData.user.email || null,
        phone: venue.phone,
      };
    }

    const { data: existing, error: existingError } = await admin
      .from("subscription_payments")
      .select(
        "id,provider_payment_id,status,amount,plan_id,created_at",
      )
      .eq("user_id", userData.user.id)
      .eq("plan_id", plan.id)
      .eq("provider", "asaas")
      .in("status", ["pending", "processing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) throw existingError;

    if (
      existing?.provider_payment_id &&
      !existing.provider_payment_id.startsWith("creating:")
    ) {
      const remote = await getAsaasPayment(existing.provider_payment_id);
      const status = mapAsaasStatus(remote.status);

      if (status !== existing.status) {
        const { error: syncError } = await admin
          .from("subscription_payments")
          .update({
            status,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (syncError) throw syncError;
      }

      if (status === "paid") {
        return NextResponse.json({
          status,
          paymentId: existing.id,
          planId: plan.id,
          planName: plan.name,
          audience,
          total: Number(existing.amount || 0),
        });
      }

      if (status === "pending" || status === "processing") {
        const qr = await getAsaasPixQrCode(
          existing.provider_payment_id,
        );

        return NextResponse.json({
          status,
          paymentId: existing.id,
          planId: plan.id,
          planName: plan.name,
          audience,
          total: Number(existing.amount || 0),
          pix: {
            payload: qr.payload || "",
            encodedImage: qr.encodedImage || "",
            expirationDate: qr.expirationDate || null,
          },
        });
      }
    }

    const asaasCustomer = await findOrCreateAsaasCustomer(customer);
    const amount = money(Number(plan.monthly_price || 0));

    if (amount <= 0) {
      return NextResponse.json(
        { error: "Este plano nao possui valor mensal valido." },
        { status: 409 },
      );
    }

    const localId = crypto.randomUUID();

    const { data: localPayment, error: insertError } = await admin
      .from("subscription_payments")
      .insert({
        id: localId,
        plan_id: plan.id,
        user_id: userData.user.id,
        artist_id: artistId,
        venue_id: venueId,
        provider: "asaas",
        provider_payment_id: `creating:${localId}`,
        status: "pending",
        amount,
        currency: "BRL",
        metadata: {
          source: "asaas_plan_pix_v1",
          audience,
          plan_code: plan.code,
          asaas_customer_id: asaasCustomer.id,
        },
      })
      .select("id")
      .single();

    if (insertError) throw insertError;

    try {
      const payment = await createAsaasPixPayment({
        customerId: asaasCustomer.id,
        value: amount,
        dueDate: tomorrowDate(),
        description: `Aura Beat - Plano ${plan.name} - 1 mes`,
        externalReference: `subscription:${localPayment.id}`,
      });

      const status = mapAsaasStatus(payment.status);
      const now = new Date().toISOString();

      const { error: updateError } = await admin
        .from("subscription_payments")
        .update({
          provider_payment_id: payment.id,
          status,
          updated_at: now,
          ...(status === "paid" ? { paid_at: now } : {}),
          metadata: {
            source: "asaas_plan_pix_v1",
            audience,
            plan_code: plan.code,
            asaas_customer_id: asaasCustomer.id,
            asaas_status: payment.status,
          },
        })
        .eq("id", localPayment.id);

      if (updateError) throw updateError;

      if (status === "paid") {
        return NextResponse.json({
          status,
          paymentId: localPayment.id,
          planId: plan.id,
          planName: plan.name,
          audience,
          total: amount,
        });
      }

      const qr = await getAsaasPixQrCode(payment.id);

      return NextResponse.json({
        status,
        paymentId: localPayment.id,
        planId: plan.id,
        planName: plan.name,
        audience,
        total: amount,
        pix: {
          payload: qr.payload || "",
          encodedImage: qr.encodedImage || "",
          expirationDate: qr.expirationDate || null,
        },
      });
    } catch (error) {
      await admin
        .from("subscription_payments")
        .update({
          status: "failed",
          updated_at: new Date().toISOString(),
          metadata: {
            source: "asaas_plan_pix_v1",
            audience,
            plan_code: plan.code,
            asaas_customer_id: asaasCustomer.id,
            creation_error: errorMessage(error),
          },
        })
        .eq("id", localPayment.id);

      throw error;
    }
  } catch (error) {
    console.error("Erro ao criar Pix de plano ASAAS:", error);

    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500 },
    );
  }
}
