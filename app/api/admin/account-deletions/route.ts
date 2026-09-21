import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isOwnerEmail } from "../../../../lib/owner-account";

export const runtime = "nodejs";

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

async function ownerAdmin(request: NextRequest) {
  const accessToken = bearerToken(request);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceKey) {
    return { error: "Backend administrativo não configurado.", status: 503 as const };
  }

  if (!accessToken) {
    return { error: "Sessão administrativa ausente.", status: 401 as const };
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const {
    data: { user },
    error,
  } = await admin.auth.getUser(accessToken);

  if (error || !user?.email) {
    return { error: "Sessão inválida ou expirada.", status: 401 as const };
  }

  if (!isOwnerEmail(user.email)) {
    return { error: "Acesso restrito ao proprietário da Aura Beat.", status: 403 as const };
  }

  return { admin, user };
}

export async function GET(request: NextRequest) {
  const auth = await ownerAdmin(request);

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await auth.admin
    .from("account_deletion_requests")
    .select(
      "id,user_id,email_snapshot,status,requested_at,updated_at,processed_at,resolution_note",
    )
    .order("requested_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Erro ao listar exclusões:", error);
    return NextResponse.json(
      { error: "Não foi possível carregar as solicitações." },
      { status: 500 },
    );
  }

  return NextResponse.json({ requests: data || [] });
}

export async function PATCH(request: NextRequest) {
  const auth = await ownerAdmin(request);

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    id?: string;
    status?: string;
    note?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const id = body.id?.trim();
  const status = body.status?.trim();
  const note = body.note?.trim() || null;

  if (!id || !status) {
    return NextResponse.json(
      { error: "Informe a solicitação e o novo status." },
      { status: 400 },
    );
  }

  const allowed = new Set(["pending", "processing", "rejected", "cancelled"]);

  if (!allowed.has(status)) {
    return NextResponse.json(
      {
        error:
          "Este painel ainda não conclui exclusões automaticamente. Use apenas pendente, em processamento, rejeitada ou cancelada.",
      },
      { status: 400 },
    );
  }

  const { data, error } = await auth.admin
    .from("account_deletion_requests")
    .update({
      status,
      resolution_note: note,
      updated_at: new Date().toISOString(),
      processed_at:
        status === "rejected" || status === "cancelled"
          ? new Date().toISOString()
          : null,
    })
    .eq("id", id)
    .select(
      "id,user_id,email_snapshot,status,requested_at,updated_at,processed_at,resolution_note",
    )
    .single();

  if (error) {
    console.error("Erro ao atualizar exclusão:", error);
    return NextResponse.json(
      { error: "Não foi possível atualizar a solicitação." },
      { status: 500 },
    );
  }

  return NextResponse.json({ request: data });
}
