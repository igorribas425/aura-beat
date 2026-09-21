"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SupportNotificationButton } from "../../../components/support-notification-button";
import { ensureFreshSession, getOwnerAccessFast } from "../../../lib/admin-access";
import { notifySupportIncoming } from "../../../lib/support-alerts";
import { supabase } from "../../../lib/supabase";

type ThreadRow = {
  thread_id: string;
  requester_user_id: string;
  requester_name: string;
  requester_email: string | null;
  audience: "artist" | "venue";
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
  is_automatic: boolean;
  created_at: string;
};

type SupportSettings = {
  away_enabled: boolean;
  away_message: string;
  ai_enabled: boolean;
  updated_at: string;
};

function dateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function AdminSupportPage() {
  const router = useRouter();
  const endRef = useRef<HTMLDivElement | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [unreadByThread, setUnreadByThread] = useState<Record<string, number>>({});
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [awayEnabled, setAwayEnabled] = useState(false);
  const [awayMessage, setAwayMessage] = useState(
    "Recebemos sua mensagem. A Equipe Aura está ausente no momento e responderá assim que possível.",
  );
  const [settingsUpdatedAt, setSettingsUpdatedAt] = useState<string | null>(null);

  const selected = useMemo(
    () => threads.find((thread) => thread.thread_id === selectedId) || null,
    [selectedId, threads],
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();

    if (!term) return threads;

    return threads.filter((thread) =>
      [
        thread.requester_name,
        thread.requester_email,
        thread.subject,
        thread.audience,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [query, threads]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  async function loadThreads(preferredId?: string | null) {
    const { data, error: threadError } = await supabase.rpc(
      "admin_support_threads_v1",
    );

    if (threadError) throw threadError;

    const rows = (data || []) as ThreadRow[];
    setThreads(rows);

    const ids = rows.map((thread) => thread.thread_id);

    if (ids.length > 0) {
      const { data: unreadRows, error: unreadError } = await supabase
        .from("support_messages")
        .select("thread_id")
        .in("thread_id", ids)
        .eq("sender_side", "customer")
        .is("read_at", null);

      if (!unreadError) {
        const counts = (unreadRows || []).reduce<Record<string, number>>(
          (accumulator, row) => {
            const threadId = String(row.thread_id);
            accumulator[threadId] = (accumulator[threadId] || 0) + 1;
            return accumulator;
          },
          {},
        );

        setUnreadByThread(counts);
      }
    } else {
      setUnreadByThread({});
    }

    setSelectedId((current) => {
      const wanted = preferredId || current;

      if (wanted && rows.some((thread) => thread.thread_id === wanted)) {
        return wanted;
      }

      return rows[0]?.thread_id || null;
    });
  }

  async function loadSettings() {
    const { data, error: settingsError } = await supabase.rpc(
      "admin_support_settings_v1",
    );

    if (settingsError) throw settingsError;

    const row = Array.isArray(data)
      ? ((data[0] || null) as SupportSettings | null)
      : null;

    if (!row) return;

    setAwayEnabled(row.away_enabled === true);
    setAwayMessage(row.away_message);
    setSettingsUpdatedAt(row.updated_at);
  }

  useEffect(() => {
    let active = true;

    async function init() {
      try {
        setLoading(true);
        setError("");

        const session =
          await ensureFreshSession();

        if (!session?.user) {
          router.replace("/login");
          return;
        }

        const ownerAccess =
          await getOwnerAccessFast();

        if (!ownerAccess.authenticated) {
          router.replace("/login");
          return;
        }

        if (!ownerAccess.allowed) {
          const { data: staff, error: staffError } = await supabase.rpc(
            "is_aura_staff_v1",
          );

          if (staffError) throw staffError;

          if (staff !== true) {
            router.replace("/home");
            return;
          }
        }

        const requestedThread = new URLSearchParams(
          window.location.search,
        ).get("thread");

        await Promise.all([
          loadThreads(requestedThread),
          loadSettings(),
        ]);
      } catch (caught) {
        console.error(caught);

        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Não foi possível carregar a Central de Suporte.",
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
    const channel = supabase
      .channel("admin-support-inbox")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "support_threads",
        },
        () => {
          void loadThreads(selectedIdRef.current);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
        },
        (payload) => {
          const incoming = payload.new as SupportMessage;

          if (incoming.sender_side !== "customer") return;

          void notifySupportIncoming(
            incoming.body,
            "/admin/suporte?thread=" + incoming.thread_id,
          );

          void loadThreads(selectedIdRef.current);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }

    const threadId = selectedId;
    let active = true;

    async function markRead() {
      await supabase.rpc("support_mark_staff_read_v1", {
        p_thread_id: threadId,
      });

      setUnreadByThread((current) => ({
        ...current,
        [threadId]: 0,
      }));
    }

    async function loadMessages() {
      const { data, error: messageError } = await supabase
        .from("support_messages")
        .select(
          "id,thread_id,sender_user_id,sender_side,body,read_at,is_automatic,created_at",
        )
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });

      if (!active) return;

      if (messageError) {
        setError(messageError.message);
        return;
      }

      setMessages((data || []) as SupportMessage[]);
      await markRead();
    }

    void loadMessages();

    const channel = supabase
      .channel("admin-support-thread-" + threadId)
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

          if (incoming.sender_side === "customer") {
            void markRead();
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "support_messages",
          filter: "thread_id=eq." + threadId,
        },
        (payload) => {
          const updated = payload.new as SupportMessage;

          setMessages((current) =>
            current.map((message) =>
              message.id === updated.id ? updated : message,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [selectedId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
    } catch (caught) {
      console.error(caught);

      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível responder.",
      );
    } finally {
      setBusy("");
    }
  }

  async function persistSettings(
    nextAwayEnabled: boolean,
    nextMessage: string,
  ) {
    const cleanMessage = nextMessage.trim();

    if (cleanMessage.length < 5) {
      setError("Escreva uma mensagem automática com pelo menos 5 caracteres.");
      return false;
    }

    try {
      setBusy("settings");
      setError("");

      const { error: settingsError } = await supabase.rpc(
        "admin_update_support_settings_v1",
        {
          p_away_enabled: nextAwayEnabled,
          p_away_message: cleanMessage,
          p_ai_enabled: false,
        },
      );

      if (settingsError) throw settingsError;

      await loadSettings();
      return true;
    } catch (caught) {
      console.error(caught);

      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível salvar o modo ausente.",
      );

      return false;
    } finally {
      setBusy("");
    }
  }

  async function toggleAway() {
    const next = !awayEnabled;
    const previous = awayEnabled;

    setAwayEnabled(next);

    const saved = await persistSettings(next, awayMessage);

    if (!saved) {
      setAwayEnabled(previous);
    }
  }

  async function saveSettings() {
    await persistSettings(awayEnabled, awayMessage);
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

      await loadThreads(selectedId);
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
        Carregando Central de Suporte…
      </main>
    );
  }

  return (
    <main className="aura-page px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="aura-hero rounded-3xl p-6 sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="aura-kicker">ADMIN · SUPORTE</p>
              <h1 className="mt-2 text-3xl font-black">
                Central de Suporte Aura
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                Atendimentos de Artistas e Casas dos planos Intermediário e Pro.
              </p>
            </div>

            <SupportNotificationButton />
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <article
            className={
              "rounded-3xl border p-5 sm:p-6 " +
              (awayEnabled
                ? "border-amber-400/40 bg-amber-400/5"
                : "border-zinc-800 bg-zinc-950")
            }
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">
                  MODO AUSENTE
                </p>
                <h2 className="mt-2 text-xl font-black">
                  Resposta automática da Equipe Aura
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
                  O botão salva imediatamente. Quando estiver ativo, a primeira
                  mensagem do cliente recebe a resposta automática configurada.
                </p>
              </div>

              <button
                type="button"
                disabled={busy === "settings"}
                onClick={() => void toggleAway()}
                className={
                  "rounded-full border px-4 py-2 text-xs font-black disabled:opacity-50 " +
                  (awayEnabled
                    ? "border-green-500/30 bg-green-500/10 text-green-300"
                    : "border-zinc-700 bg-black/30 text-zinc-400")
                }
              >
                {busy === "settings"
                  ? "Salvando…"
                  : awayEnabled
                    ? "● ATIVO"
                    : "○ DESATIVADO"}
              </button>
            </div>

            <label className="mt-5 block text-xs font-bold text-zinc-500">
              Mensagem automática
              <textarea
                rows={3}
                value={awayMessage}
                onChange={(event) => setAwayMessage(event.target.value)}
                className="mt-2 w-full resize-y rounded-2xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-amber-400"
              />
            </label>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                disabled={busy === "settings"}
                onClick={() => void saveSettings()}
                className="rounded-xl bg-amber-400 px-5 py-3 text-sm font-black text-black disabled:opacity-50"
              >
                {busy === "settings" ? "Salvando…" : "Salvar mensagem"}
              </button>

              {settingsUpdatedAt && (
                <span className="text-xs text-zinc-600">
                  Última atualização: {dateTime(settingsUpdatedAt)}
                </span>
              )}
            </div>
          </article>

          <article className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-purple-300">
              AUTOMAÇÃO FUTURA
            </p>
            <h2 className="mt-2 text-xl font-black">
              IA no atendimento
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              A IA permanece desativada e separada no Admin até conectarmos um modelo real.
            </p>

            <button
              type="button"
              onClick={() => router.push("/admin/ia-suporte")}
              className="mt-5 rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-3 text-sm font-black text-purple-200"
            >
              🤖 Abrir área futura da IA
            </button>
          </article>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        <section className="grid overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 lg:grid-cols-[360px_1fr]">
          <aside className="border-b border-zinc-800 lg:border-b-0 lg:border-r">
            <div className="p-4">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar cliente ou assunto..."
                className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white"
              />
            </div>

            <div className="max-h-[640px] overflow-y-auto border-t border-zinc-800">
              {filtered.length === 0 ? (
                <p className="p-6 text-sm text-zinc-500">
                  Nenhum atendimento encontrado.
                </p>
              ) : (
                filtered.map((thread) => {
                  const unread = unreadByThread[thread.thread_id] || 0;

                  return (
                    <button
                      key={thread.thread_id}
                      type="button"
                      onClick={() => {
                        setSelectedId(thread.thread_id);
                        window.history.replaceState(
                          null,
                          "",
                          "/admin/suporte?thread=" + thread.thread_id,
                        );
                      }}
                      className={
                        "w-full border-b border-zinc-900 p-4 text-left " +
                        (selectedId === thread.thread_id
                          ? "bg-amber-400/10"
                          : "hover:bg-zinc-900/50")
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <p className="min-w-0 flex-1 truncate font-black">
                            {thread.requester_name}
                          </p>

                          {unread > 0 && (
                            <span className="grid h-6 min-w-6 place-items-center rounded-full bg-amber-400 px-1.5 text-[11px] font-black text-black">
                              {unread > 99 ? "99+" : unread}
                            </span>
                          )}
                        </div>

                        <span className="text-[10px] font-black uppercase text-zinc-500">
                          {thread.audience === "artist" ? "Artista" : "Casa"}
                        </span>
                      </div>

                      <p className="mt-1 truncate text-xs text-zinc-500">
                        {thread.subject}
                      </p>

                      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-zinc-600">
                          {dateTime(thread.last_message_at)}
                        </span>

                        <span
                          className={
                            thread.status === "open"
                              ? "font-bold text-green-400"
                              : thread.status === "waiting_user"
                                ? "font-bold text-amber-300"
                                : "text-zinc-600"
                          }
                        >
                          {thread.status === "open"
                            ? "Responder"
                            : thread.status === "waiting_user"
                              ? "Aguardando cliente"
                              : "Encerrado"}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section className="flex min-h-[650px] flex-col">
            {!selected ? (
              <div className="grid flex-1 place-items-center p-8 text-center">
                <div>
                  <div className="text-5xl">🎧</div>
                  <h2 className="mt-4 text-xl font-black">
                    Escolha um atendimento
                  </h2>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-4 border-b border-zinc-800 p-5">
                  <div>
                    <p className="font-black">{selected.requester_name}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {selected.requester_email || "E-mail não disponível"} ·{" "}
                      {selected.subject}
                    </p>
                  </div>

                  {selected.status !== "closed" && (
                    <button
                      type="button"
                      disabled={busy === "close"}
                      onClick={() => void closeThread()}
                      className="rounded-xl border border-red-800 px-3 py-2 text-xs font-black text-red-300"
                    >
                      Encerrar
                    </button>
                  )}
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto bg-black/20 p-5">
                  {messages.length === 0 ? (
                    <p className="py-10 text-center text-sm text-zinc-500">
                      Ainda não há mensagens.
                    </p>
                  ) : (
                    messages.map((message) => {
                      const support = message.sender_side === "support";

                      return (
                        <div
                          key={message.id}
                          className={support ? "flex justify-end" : "flex justify-start"}
                        >
                          <div
                            className={
                              "max-w-[82%] rounded-2xl px-4 py-3 " +
                              (support
                                ? "rounded-br-md bg-amber-400 text-black"
                                : "rounded-bl-md border border-zinc-800 bg-zinc-900 text-zinc-200")
                            }
                          >
                            <p
                              className={
                                "mb-1 text-[10px] font-black uppercase tracking-wide " +
                                (support ? "text-black/60" : "text-zinc-500")
                              }
                            >
                              {support
                                ? message.is_automatic
                                  ? "Equipe Aura · automática"
                                  : "Equipe Aura"
                                : "Cliente"}
                            </p>

                            <p className="whitespace-pre-wrap break-words text-sm leading-6">
                              {message.body}
                            </p>

                            <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-60">
                              <span>{dateTime(message.created_at)}</span>

                              {support && !message.is_automatic && (
                                <span
                                  className={
                                    message.read_at
                                      ? "font-black text-sky-700"
                                      : "font-black"
                                  }
                                  title={message.read_at ? "Visualizada" : "Enviada"}
                                >
                                  {message.read_at ? "✓✓" : "✓"}
                                </span>
                              )}
                            </div>
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
                          : "Responder como Equipe Aura..."
                      }
                      className="min-h-12 flex-1 resize-none rounded-2xl border border-zinc-800 bg-black px-4 py-3 text-sm outline-none focus:border-amber-400 disabled:opacity-50"
                    />

                    <button
                      type="submit"
                      disabled={
                        !text.trim() ||
                        busy === "send" ||
                        selected.status === "closed"
                      }
                      className="rounded-2xl bg-amber-400 px-5 font-black text-black disabled:opacity-40"
                    >
                      {busy === "send" ? "..." : "Responder"}
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
