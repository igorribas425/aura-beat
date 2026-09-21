import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isOwnerEmail } from "../../../../lib/owner-account";

export const runtime = "nodejs";

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

export async function POST(request: NextRequest) {
  const accessToken = bearerToken(request);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: "Serviço de exclusão de conta não configurado." },
      { status: 503 },
    );
  }

  if (!accessToken) {
    return NextResponse.json(
      { error: "Entre na sua conta antes de solicitar a exclusão." },
      { status: 401 },
    );
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(accessToken);

  if (userError || !user?.id || !user.email) {
    return NextResponse.json(
      { error: "Sessão inválida ou expirada. Entre novamente." },
      { status: 401 },
    );
  }

  if (isOwnerEmail(user.email)) {
    return NextResponse.json(
      {
        error:
          "A conta administradora principal não pode ser excluída por este fluxo.",
      },
      { status: 403 },
    );
  }

  const { data: existing, error: lookupError } = await admin
    .from("account_deletion_requests")
    .select("id,status,requested_at")
    .eq("user_id", user.id)
    .in("status", ["pending", "processing"])
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    console.error("Erro ao consultar solicitação de exclusão:", lookupError);
    return NextResponse.json(
      { error: "Não foi possível consultar sua solicitação." },
      { status: 500 },
    );
  }

  if (existing) {
    return NextResponse.json({
      message: "Sua solicitação de exclusão já está registrada.",
      requestId: existing.id,
      status: existing.status,
    });
  }

  const { data: created, error: insertError } = await admin
    .from("account_deletion_requests")
    .insert({
      user_id: user.id,
      email_snapshot: user.email,
      status: "pending",
    })
    .select("id,status,requested_at")
    .single();

  if (insertError) {
    console.error("Erro ao registrar solicitação de exclusão:", insertError);
    return NextResponse.json(
      { error: "Não foi possível registrar a solicitação de exclusão." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      message:
        "Solicitação registrada. A equipe Aura Beat seguirá o processo de exclusão da conta.",
      requestId: created.id,
      status: created.status,
    },
    { status: 201 },
  );
}
