import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createClient,
} from "@supabase/supabase-js";

export const runtime = "nodejs";

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  return authorization.slice(7).trim();
}

export async function GET(request: NextRequest) {
  const token = bearerToken(request);

  if (!token) {
    return NextResponse.json(
      { error: "Autenticacao obrigatoria." },
      { status: 401 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRole) {
    return NextResponse.json(
      { error: "Backend do Supabase nao configurado." },
      { status: 503 },
    );
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const {
    data: userData,
    error: userError,
  } = await admin.auth.getUser(token);

  if (userError || !userData.user) {
    return NextResponse.json(
      { error: "Sessao invalida." },
      { status: 401 },
    );
  }

  const { data, error } = await admin
    .from("billing_customer_profiles")
    .select("cpf_cnpj")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  const digits = String(data?.cpf_cnpj || "").replace(/\D/g, "");

  return NextResponse.json({
    hasDocument: digits.length === 11 || digits.length === 14,
    documentType:
      digits.length === 14
        ? "cnpj"
        : digits.length === 11
          ? "cpf"
          : null,
    last4:
      digits.length >= 4
        ? digits.slice(-4)
        : null,
  });
}
