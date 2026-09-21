import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    if (!token) {
      return Response.json(
        { error: "authentication required" },
        { status: 401, headers: corsHeaders },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      },
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return Response.json(
        { error: "invalid session" },
        { status: 401, headers: corsHeaders },
      );
    }

    const body = await req.json().catch(() => ({}));
    const audience = body?.audience === "venue" ? "venue" : "artist";

    const { data: allowed, error: accessError } = await supabase.rpc(
      "user_has_active_plan_benefit_v1",
      {
        p_audience: audience,
        p_benefit: "ai_chat",
      },
    );

    if (accessError) throw accessError;

    if (allowed !== true) {
      return Response.json(
        {
          configured: false,
          access: false,
          message: "Aura IA é exclusivo do plano Pro.",
        },
        { status: 403, headers: corsHeaders },
      );
    }

    const providerKey = Deno.env.get("AURA_AI_API_KEY");
    const providerUrl = Deno.env.get("AURA_AI_API_URL");

    if (!providerKey || !providerUrl) {
      return Response.json(
        {
          configured: false,
          access: true,
          message:
            "Seu acesso Pro ao Aura IA está liberado. O motor de IA ainda precisa ser conectado pelo administrador.",
        },
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return Response.json(
      {
        configured: false,
        access: true,
        message:
          "O provedor do Aura IA foi informado, mas esta versão ainda aguarda a integração final do modelo.",
      },
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "internal error",
      },
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
