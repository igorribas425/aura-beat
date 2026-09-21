"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getMyPlanAccess,
  hasPlanBenefit,
  type PlanAccess,
} from "../../lib/plan-access";
import { supabase } from "../../lib/supabase";

type Audience = "artist" | "venue";

type ChatItem = {
  id: string;
  role: "user" | "assistant";
  body: string;
};

export default function AuraIaPage() {
  const router = useRouter();

  const [audience, setAudience] = useState<Audience>("artist");
  const [access, setAccess] = useState<PlanAccess | null>(null);
  const [configured, setConfigured] = useState(false);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const canUseAi = hasPlanBenefit(access, "ai_chat");

  useEffect(() => {
    let active = true;

    async function init() {
      try {
        setLoading(true);
        setError("");

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.replace("/login");
          return;
        }

        const [profileResult, artistResult, venueResult] = await Promise.all([
          supabase
            .from("profiles")
            .select("default_mode")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("artist_profiles")
            .select("id")
            .eq("user_id", user.id)
            .eq("is_active", true)
            .maybeSingle(),
          supabase
            .from("venue_profiles")
            .select("id")
            .eq("owner_user_id", user.id)
            .eq("is_active", true)
            .maybeSingle(),
        ]);

        if (!active) return;

        const preferred: Audience =
          profileResult.data?.default_mode === "venue" ? "venue" : "artist";

        const resolved: Audience =
          preferred === "venue" && venueResult.data
            ? "venue"
            : preferred === "artist" && artistResult.data
              ? "artist"
              : venueResult.data
                ? "venue"
                : "artist";

        const plan = await getMyPlanAccess(resolved);

        if (!active) return;

        setAudience(resolved);
        setAccess(plan);

        if (!hasPlanBenefit(plan, "ai_chat")) {
          return;
        }

        const { data, error: invokeError } = await supabase.functions.invoke(
          "aura-ai",
          {
            body: {
              audience: resolved,
              message: "__status__",
            },
          },
        );

        if (invokeError) {
          throw invokeError;
        }

        const isConfigured = data?.configured === true;
        setConfigured(isConfigured);

        setMessages([
          {
            id: "welcome",
            role: "assistant",
            body:
              data?.message ||
              "Seu acesso Pro ao Aura IA está liberado.",
          },
        ]);
      } catch (caught) {
        console.error(caught);

        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Não foi possível abrir o Aura IA.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void init();

    return () => {
      active = false;
    };
  }, [router]);

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();

    const value = text.trim();

    if (!value || !canUseAi) return;

    const userMessage: ChatItem = {
      id: "user-" + Date.now(),
      role: "user",
      body: value,
    };

    setMessages((current) => [...current, userMessage]);
    setText("");
    setSending(true);
    setError("");

    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "aura-ai",
        {
          body: {
            audience,
            message: value,
            history: messages.slice(-8),
          },
        },
      );

      if (invokeError) {
        throw invokeError;
      }

      setConfigured(data?.configured === true);

      setMessages((current) => [
        ...current,
        {
          id: "assistant-" + Date.now(),
          role: "assistant",
          body:
            data?.message ||
            "O motor do Aura IA ainda precisa ser conectado.",
        },
      ]);
    } catch (caught) {
      console.error(caught);

      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível falar com o Aura IA.",
      );
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <main className="aura-page flex min-h-[70vh] items-center justify-center text-zinc-400">
        Carregando Aura IA…
      </main>
    );
  }

  if (!canUseAi) {
    return (
      <main className="aura-page px-4 py-8">
        <section className="mx-auto max-w-4xl rounded-3xl border border-amber-400/30 bg-amber-400/5 p-8">
          <div className="text-5xl">🤖</div>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-amber-300">
            EXCLUSIVO PRO
          </p>
          <h1 className="mt-2 text-3xl font-black">Aura IA</h1>
          <p className="mt-3 max-w-2xl leading-7 text-zinc-400">
            O assistente inteligente do Aura Beat é exclusivo do plano Pro.
          </p>

          <button
            type="button"
            onClick={() =>
              router.push(
                audience === "venue" ? "/planos-casa" : "/planos-artista",
              )
            }
            className="mt-6 rounded-xl bg-amber-400 px-5 py-3 font-black text-black"
          >
            Ver plano Pro
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="aura-page px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-3xl border border-amber-400/35 bg-gradient-to-br from-amber-500/10 via-zinc-950 to-purple-500/10 p-6 shadow-[0_0_45px_rgba(251,191,36,0.08)] sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">
                ✦ PRO
              </p>
              <h1 className="mt-2 text-3xl font-black">Aura IA</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                Assistente para ajudar com propostas, agenda, viagens, cachê,
                planejamento de eventos e uso da plataforma.
              </p>
            </div>

            <span
              className={
                "w-fit rounded-full border px-4 py-2 text-xs font-black " +
                (configured
                  ? "border-green-500/30 bg-green-500/10 text-green-300"
                  : "border-amber-400/30 bg-amber-400/10 text-amber-300")
              }
            >
              {configured ? "● IA conectada" : "● Motor aguardando conexão"}
            </span>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        <section className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950">
          <div className="min-h-[540px] space-y-4 bg-black/20 p-5 sm:p-7">
            {messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.role === "user"
                    ? "flex justify-end"
                    : "flex justify-start"
                }
              >
                <div
                  className={
                    "max-w-[86%] rounded-2xl px-4 py-3 sm:max-w-[75%] " +
                    (message.role === "user"
                      ? "rounded-br-md bg-purple-600 text-white"
                      : "rounded-bl-md border border-amber-400/20 bg-amber-400/5 text-zinc-200")
                  }
                >
                  {message.role === "assistant" && (
                    <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-amber-300">
                      Aura IA
                    </p>
                  )}

                  <p className="whitespace-pre-wrap text-sm leading-6">
                    {message.body}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={sendMessage} className="border-t border-zinc-800 p-4">
            <div className="flex gap-3">
              <textarea
                rows={1}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder="Pergunte ao Aura IA…"
                className="min-h-12 flex-1 resize-none rounded-2xl border border-zinc-800 bg-black px-4 py-3 text-sm outline-none focus:border-amber-400"
              />

              <button
                type="submit"
                disabled={!text.trim() || sending}
                className="rounded-2xl bg-amber-400 px-5 font-black text-black disabled:opacity-40"
              >
                {sending ? "..." : "➤"}
              </button>
            </div>

            {!configured && (
              <p className="mt-3 text-xs leading-5 text-zinc-500">
                O acesso Pro está correto, mas o modelo de IA ainda não foi
                conectado no backend. As mensagens servem para testar a estrutura
                até o provedor ser configurado.
              </p>
            )}
          </form>
        </section>
      </div>
    </main>
  );
}
