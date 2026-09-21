"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getMyPlanAccess,
  hasPlanBenefit,
  type PlanAccess,
} from "../../lib/plan-access";
import { supabase } from "../../lib/supabase";

type Audience = "artist" | "venue";

type SupportThread = {
  id: string;
  requester_user_id: string;
  audience: Audience;
  subject: string;
  status: "open" | "waiting_user" | "closed";
  created_at: string;
  updated_at: string;
  last_message_at: string;
};

type SupportMessage = {
  id: string;
  thread_id: string;
  sender_user_id: string;
  sender_side: "customer" | "support";
  body: string;
  read_at: string | null;
  created_at: string;
};

function dateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(status: SupportThread["status"]) {
  if (status === "closed") return "Encerrado";
  if (status === "waiting_user") return "Aguardando você";
  return "Em atendimento";
}

export default function SupportAuraPage() {
  const router = useRouter();
  const endRef = useRef<HTMLDivElement | null>(null);

  const [userId, setUserId] = useState("");
  const [audience, setAudience] = useState<Audience>("artist");
  const [access, setAccess] = useState<PlanAccess | null>(null);
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const canUseSupport = hasPlanBenefit(access, "support_chat");
  const priority = access?.benefits?.support_priority === "priority";
  const selected = useMemo(
    () => threads.find((thread) => thread.id === selectedId) || null,
    [selectedId, threads],
  );

  async function loadThreads(currentAudience: Audience) {
    const { data, error: threadsError } = await supabase
      .from("support_threads")
      .select(
        "id,requester_user_id,audience,subject,status,created_at,updated_at,last_message_at",
      )
      .eq("audience", currentAudience)
      .order("last_message_at", { ascending: false });

    if (threadsError) throw threadsError;

    const rows = (data || []) as SupportThread[];
    setThreads(rows);
    setSelectedId((current) =>
      current && rows.some((thread) => thread.id === current)
        ? current
        : rows[0]?.id || null,
    );
  }

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

        setUserId(user.id);
        setAudience(resolved);
        setAccess(plan);

        if (hasPlanBenefit(plan, "support_chat")) {
          await loadThreads(resolved);
        }
      } catch (caught) {
        console.error(caught);
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Não foi possível carregar o suporte.",
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

  useEffect(() => {
    if (!selectedId || !canUseSupport) {
      setMessages([]);
      return;
    }

    const threadId = selectedId;
    let active = true;

    async function loadMessages() {
      setLoadingMessages(true);

      const { data, error: messagesError } = await supabase
        .from("support_messages")
        .select("id,thread_id,sender_user_id,sender_side,body,read_at,created_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });

      if (!active) return;

      if (messagesError) {
        setError(messagesError.message);
        setMessages([]);
      } else {
        setMessages((data || []) as SupportMessage[]);
        await supabase.rpc("support_mark_read_v1", {
          p_thread_id: threadId,
        });
      }

      if (active) setLoadingMessages(false);
    }

    void loadMessages();

    const channel = supabase
      .channel("support-customer-" + threadId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: "thread_id=eq." + threadId,
        },
        (payload) => {
          const incoming = payload.new as SupportMessage;
          setMessages((current) =>
            current.some((message) => message.id === incoming.id)
              ? current
              : [...current, incoming],
          );
          void supabase.rpc("support_mark_read_v1", {
            p_thread_id: threadId,
          });
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [canUseSupport, selectedId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function openThread(event: FormEvent) {
    event.preventDefault();

    if (!subject.trim()) {
      setError("Escreva o assunto do atendimento.");
      return;
    }

    try {
      setBusy("open");
      setError("");

      const { data, error: openError } = await supabase.rpc(
        "support_open_thread_v1",
        {
          p_audience: audience,
          p_subject: subject.trim(),
        },
      );

      if (openError) throw openError;

      setSubject("");
      await loadThreads(audience);
      setSelectedId(String(data));
    } catch (caught) {
      console.error(caught);
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível abrir o atendimento.",
      );
    } finally {
      setBusy("");
    }
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();

    if (!selectedId || !text.trim()) return;

    try {
      setBusy("send");
      setError("");

      const { error: sendError } = await supabase.rpc(
        "support_send_message_v1",
        {
          p_thread_id: selectedId,
          p_body: text.trim(),
        },
      );

      if (sendError) throw sendError;

      setText("");
      await loadThreads(audience);
    } catch (caught) {
      console.error(caught);
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível enviar a mensagem.",
      );
    } finally {
      setBusy("");
    }
  }

  async function closeThread() {
    if (!selectedId) return;
    if (!window.confirm("Encerrar este atendimento?")) return;

    try {
      setBusy("close");

      const { error: closeError } = await supabase.rpc(
        "support_close_thread_v1",
        { p_thread_id: selectedId },
      );

      if (closeError) throw closeError;
      await loadThreads(audience);
    } catch (caught) {
      console.error(caught);
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível encerrar o atendimento.",
      );
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return (
      <main className="aura-page flex min-h-[70vh] items-center justify-center text-zinc-400">
        Carregando Suporte Aura…
      </main>
    );
  }

  if (!canUseSupport) {
    return (
      <main className="aura-page px-4 py-8">
        <section className="mx-auto max-w-4xl rounded-3xl border border-purple-500/30 bg-purple-500/5 p-8">
          <div className="text-5xl">💬</div>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-purple-300">
            SUPORTE AURA
          </p>
          <h1 className="mt-2 text-3xl font-black">
            Chat com a Equipe Aura Beat
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-zinc-400">
            O atendimento por chat é liberado nos planos Intermediário e Pro.
          </p>
          <button
            type="button"
            onClick={() =>
              router.push(
                audience === "venue" ? "/planos-casa" : "/planos-artista",
              )
            }
            className="mt-6 rounded-xl bg-purple-600 px-5 py-3 font-black text-white"
          >
            Ver planos
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="aura-page px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="aura-hero rounded-3xl p-6 sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="aura-kicker">SUPORTE AURA</p>
              <h1 className="mt-2 text-3xl font-black">
                Chat com a Equipe Aura Beat
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                Dúvidas sobre conta, planos, pagamentos, eventos e uso da plataforma.
              </p>
            </div>

            <div
              className={
                "rounded-full border px-4 py-2 text-xs font-black " +
                (priority
                  ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
                  : "border-purple-500/30 bg-purple-500/10 text-purple-300")
              }
            >
              {priority
                ? "✦ PRO · ATENDIMENTO PRIORITÁRIO"
                : "◆ INTERMEDIÁRIO · SUPORTE LIBERADO"}
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        <section className="grid overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 lg:grid-cols-[340px_1fr]">
          <aside className="border-b border-zinc-800 lg:border-b-0 lg:border-r">
            <div className="p-4">
              <form onSubmit={openThread} className="space-y-3">
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="Assunto do novo atendimento"
                  className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white"
                />
                <button
                  type="submit"
                  disabled={busy === "open"}
                  className="w-full rounded-xl bg-purple-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
                >
                  {busy === "open" ? "Abrindo…" : "+ Novo atendimento"}
                </button>
              </form>
            </div>

            <div className="max-h-[560px] overflow-y-auto border-t border-zinc-800">
              {threads.length === 0 ? (
                <p className="p-6 text-sm text-zinc-500">
                  Nenhum atendimento ainda.
                </p>
              ) : (
                threads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => setSelectedId(thread.id)}
                    className={
                      "w-full border-b border-zinc-900 p-4 text-left " +
                      (selectedId === thread.id
                        ? "bg-purple-500/10"
                        : "hover:bg-zinc-900/50")
                    }
                  >
                    <p className="truncate font-black">{thread.subject}</p>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <span className="text-zinc-500">
                        {dateTime(thread.last_message_at)}
                      </span>
                      <span className="text-zinc-400">
                        {statusLabel(thread.status)}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className="flex min-h-[620px] flex-col">
            {!selected ? (
              <div className="grid flex-1 place-items-center p-8 text-center">
                <div>
                  <div className="text-5xl">🎧</div>
                  <h2 className="mt-4 text-xl font-black">Equipe Aura Beat</h2>
                  <p className="mt-2 text-sm text-zinc-500">
                    Abra um atendimento ou escolha uma conversa.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-4 border-b border-zinc-800 p-4 sm:p-5">
                  <div>
                    <p className="font-black">{selected.subject}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {statusLabel(selected.status)}
                    </p>
                  </div>

                  {selected.status !== "closed" && (
                    <button
                      type="button"
                      disabled={busy === "close"}
                      onClick={() => void closeThread()}
                      className="rounded-xl border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-400"
                    >
                      Encerrar
                    </button>
                  )}
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto bg-black/20 p-4 sm:p-6">
                  {loadingMessages ? (
                    <p className="py-10 text-center text-sm text-zinc-500">
                      Carregando mensagens…
                    </p>
                  ) : messages.length === 0 ? (
                    <div className="py-12 text-center">
                      <p className="text-3xl">👋</p>
                      <p className="mt-3 font-black">
                        Explique como podemos ajudar
                      </p>
                    </div>
                  ) : (
                    messages.map((message) => {
                      const mine = message.sender_user_id === userId;

                      return (
                        <div
                          key={message.id}
                          className={mine ? "flex justify-end" : "flex justify-start"}
                        >
                          <div
                            className={
                              "max-w-[85%] rounded-2xl px-4 py-3 sm:max-w-[72%] " +
                              (mine
                                ? "rounded-br-md bg-purple-600 text-white"
                                : "rounded-bl-md border border-zinc-800 bg-zinc-900 text-zinc-200")
                            }
                          >
                            <p
                              className={
                                "mb-1 text-[10px] font-black uppercase tracking-wide " +
                                (mine ? "text-purple-100" : "text-amber-300")
                              }
                            >
                              {mine ? "Você" : "Equipe Aura"}
                            </p>

                            <p className="whitespace-pre-wrap break-words text-sm leading-6">
                              {message.body}
                            </p>

                            <p
                              className={
                                "mt-1 text-right text-[10px] " +
                                (mine ? "text-purple-100/70" : "text-zinc-500")
                              }
                            >
                              {dateTime(message.created_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={endRef} />
                </div>

                <form onSubmit={sendMessage} className="border-t border-zinc-800 p-4">
                  <div className="flex gap-3">
                    <textarea
                      rows={1}
                      value={text}
                      disabled={selected.status === "closed"}
                      onChange={(event) => setText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void sendMessage();
                        }
                      }}
                      placeholder={
                        selected.status === "closed"
                          ? "Atendimento encerrado"
                          : "Escreva uma mensagem para a Equipe Aura…"
                      }
                      className="min-h-12 flex-1 resize-none rounded-2xl border border-zinc-800 bg-black px-4 py-3 text-sm outline-none focus:border-purple-500 disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={
                        !text.trim() ||
                        busy === "send" ||
                        selected.status === "closed"
                      }
                      className="rounded-2xl bg-purple-600 px-5 font-black text-white disabled:opacity-40"
                    >
                      {busy === "send" ? "..." : "➤"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
