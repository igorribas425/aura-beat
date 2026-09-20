"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProfileAvatar } from "../../components/profile-avatar";
import { supabase } from "../../lib/supabase";

type ProfileKind = "artist" | "venue";

type DirectConversation = {
  id: string;
  user_a: string;
  user_b: string;
  user_a_kind: ProfileKind;
  user_b_kind: ProfileKind;
  created_at: string;
  updated_at: string;
};

type DirectMessage = {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

type ConversationView = DirectConversation & {
  otherUserId: string;
  otherKind: ProfileKind;
  otherName: string;
  otherAvatar: string | null;
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function DirectChatPage() {
  const router = useRouter();
  const endRef = useRef<HTMLDivElement | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const stopTypingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTypingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingBroadcastRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);

  const [userId, setUserId] = useState("");
  const [conversations, setConversations] = useState<ConversationView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setAlertsEnabled(window.localStorage.getItem("aura-direct-alerts") === "on");
  }, []);

  useEffect(() => {
    let active = true;

    async function init() {
      setLoading(true);
      setError("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;

      if (!user) {
        router.replace("/login");
        return;
      }

      setUserId(user.id);

      const params = new URLSearchParams(window.location.search);
      const targetKind = params.get("targetKind");
      const targetId = params.get("targetId");
      const requestedConversation = params.get("id");
      let conversationId = requestedConversation;

      if (
        (targetKind === "artist" || targetKind === "venue") &&
        targetId
      ) {
        const { data, error: startError } = await supabase.rpc(
          "start_direct_conversation_v1",
          {
            p_target_kind: targetKind,
            p_target_profile_id: targetId,
          },
        );

        if (startError) {
          setError(
            startError.message.includes("start_direct_conversation_v1")
              ? "O Chat Direto precisa da migration 016 no Supabase antes de ser usado."
              : startError.message,
          );
        } else if (data) {
          conversationId = String(data);
          window.history.replaceState(
            null,
            "",
            `/chat-direto?id=${conversationId}`,
          );
        }
      }

      await loadConversations(user.id, conversationId);

      if (active) setLoading(false);
    }

    async function loadConversations(currentUserId: string, preferredId: string | null) {
      const { data, error: conversationsError } = await supabase
        .from("direct_conversations")
        .select("id,user_a,user_b,user_a_kind,user_b_kind,created_at,updated_at")
        .order("updated_at", { ascending: false });

      if (conversationsError) {
        if (active) {
          setError(
            conversationsError.message.includes("direct_conversations")
              ? "O Chat Direto precisa da migration 016 no Supabase antes de ser usado."
              : conversationsError.message,
          );
          setConversations([]);
        }
        return;
      }

      const rows = (data ?? []) as DirectConversation[];
      const artistUsers: string[] = [];
      const venueUsers: string[] = [];

      rows.forEach((conversation) => {
        const isA = conversation.user_a === currentUserId;
        const otherUserId = isA ? conversation.user_b : conversation.user_a;
        const otherKind = isA ? conversation.user_b_kind : conversation.user_a_kind;

        if (otherKind === "artist") artistUsers.push(otherUserId);
        else venueUsers.push(otherUserId);
      });

      const [artistResult, venueResult] = await Promise.all([
        artistUsers.length
          ? supabase
              .from("artist_profiles")
              .select("user_id,stage_name,avatar_url")
              .in("user_id", [...new Set(artistUsers)])
          : Promise.resolve({ data: [], error: null }),
        venueUsers.length
          ? supabase
              .from("venue_profiles")
              .select("owner_user_id,trade_name,avatar_url")
              .in("owner_user_id", [...new Set(venueUsers)])
          : Promise.resolve({ data: [], error: null }),
      ]);

      const artistMap = new Map(
        (artistResult.data ?? []).map(
          (item) =>
            [
              item.user_id,
              { name: item.stage_name, avatar: item.avatar_url as string | null },
            ] as const,
        ),
      );

      const venueMap = new Map(
        (venueResult.data ?? []).map(
          (item) =>
            [
              item.owner_user_id,
              { name: item.trade_name, avatar: item.avatar_url as string | null },
            ] as const,
        ),
      );

      const viewRows: ConversationView[] = rows.map((conversation) => {
        const isA = conversation.user_a === currentUserId;
        const otherUserId = isA ? conversation.user_b : conversation.user_a;
        const otherKind = isA ? conversation.user_b_kind : conversation.user_a_kind;
        const profile =
          otherKind === "artist"
            ? artistMap.get(otherUserId)
            : venueMap.get(otherUserId);

        return {
          ...conversation,
          otherUserId,
          otherKind,
          otherName:
            profile?.name ??
            (otherKind === "artist" ? "Artista Aura Beat" : "Casa Aura Beat"),
          otherAvatar: profile?.avatar ?? null,
        };
      });

      if (!active) return;

      setConversations(viewRows);
      const nextSelected =
        (preferredId && viewRows.some((item) => item.id === preferredId)
          ? preferredId
          : viewRows[0]?.id) ?? null;
      setSelectedId(nextSelected);
    }

    void init();

    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!selectedId || !userId) {
      setMessages([]);
      return;
    }

    let active = true;
    setLoadingMessages(true);

    async function loadMessages() {
      const { data, error: messagesError } = await supabase
        .from("direct_messages")
        .select("id,conversation_id,sender_user_id,body,read_at,created_at")
        .eq("conversation_id", selectedId)
        .order("created_at", { ascending: true });

      if (!active) return;

      if (messagesError) {
        setError(messagesError.message);
        setMessages([]);
      } else {
        setMessages((data ?? []) as DirectMessage[]);
        await supabase.rpc("mark_direct_conversation_read_v1", {
          p_conversation_id: selectedId,
        });
      }

      if (active) setLoadingMessages(false);
    }

    void loadMessages();

    const channel = supabase
      .channel(`direct-chat-${selectedId}`, {
        config: {
          broadcast: {
            self: false,
          },
        },
      })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter: `conversation_id=eq.${selectedId}`,
        },
        (payload) => {
          const incoming = payload.new as DirectMessage;
          setMessages((current) =>
            current.some((message) => message.id === incoming.id)
              ? current
              : [...current, incoming],
          );

          if (incoming.sender_user_id !== userId) {
            void supabase.rpc("mark_direct_conversation_read_v1", {
              p_conversation_id: selectedId,
            });

            if (alertsEnabled) {
              void playNotificationSound();

              if ("vibrate" in navigator) {
                navigator.vibrate(80);
              }

              if (
                document.hidden &&
                "Notification" in window &&
                Notification.permission === "granted"
              ) {
                const notification = new Notification("Nova mensagem no Aura Beat", {
                  body: incoming.body.slice(0, 120),
                });

                notification.onclick = () => {
                  window.focus();
                  notification.close();
                };
              }
            }
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "direct_messages",
          filter: `conversation_id=eq.${selectedId}`,
        },
        (payload) => {
          const updated = payload.new as DirectMessage;
          setMessages((current) =>
            current.map((message) =>
              message.id === updated.id ? updated : message,
            ),
          );
        },
      )
      .on(
        "broadcast",
        {
          event: "typing",
        },
        ({ payload }) => {
          const status = payload as {
            user_id?: string;
            typing?: boolean;
          };

          if (!status.user_id || status.user_id === userId) return;

          if (hideTypingRef.current) {
            clearTimeout(hideTypingRef.current);
          }

          setOtherTyping(Boolean(status.typing));

          if (status.typing) {
            hideTypingRef.current = setTimeout(() => {
              setOtherTyping(false);
            }, 2600);
          }
        },
      );

    typingChannelRef.current = channel;
    channel.subscribe();

    return () => {
      active = false;

      if (stopTypingRef.current) {
        clearTimeout(stopTypingRef.current);
      }

      if (hideTypingRef.current) {
        clearTimeout(hideTypingRef.current);
      }

      typingChannelRef.current = null;
      setOtherTyping(false);
      void supabase.removeChannel(channel);
    };
  }, [alertsEnabled, selectedId, userId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selected = useMemo(
    () => conversations.find((item) => item.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  async function playNotificationSound() {
    try {
      const AudioContextClass =
        window.AudioContext ??
        (
          window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;

      if (!AudioContextClass) return;

      const context =
        audioContextRef.current ??
        new AudioContextClass();

      audioContextRef.current = context;

      if (context.state === "suspended") {
        await context.resume();
      }

      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const now = context.currentTime;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, now);
      oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.16);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.23);
    } catch {
      // Alguns navegadores bloqueiam áudio até a primeira interação.
    }
  }

  async function toggleAlerts() {
    const next = !alertsEnabled;
    setAlertsEnabled(next);
    window.localStorage.setItem("aura-direct-alerts", next ? "on" : "off");

    if (!next) return;

    await playNotificationSound();

    if (
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      try {
        await Notification.requestPermission();
      } catch {
        // O som continua funcionando mesmo sem notificação do sistema.
      }
    }
  }

  function broadcastTyping(value: string) {
    const channel = typingChannelRef.current;
    if (!channel || !userId) return;

    if (stopTypingRef.current) {
      clearTimeout(stopTypingRef.current);
    }

    const typing = value.trim().length > 0;
    const now = Date.now();

    if (!typing || now - lastTypingBroadcastRef.current > 700) {
      lastTypingBroadcastRef.current = now;
      void channel.send({
        type: "broadcast",
        event: "typing",
        payload: {
          user_id: userId,
          typing,
        },
      });
    }

    if (typing) {
      stopTypingRef.current = setTimeout(() => {
        void channel.send({
          type: "broadcast",
          event: "typing",
          payload: {
            user_id: userId,
            typing: false,
          },
        });
      }, 1200);
    }
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();

    const body = text.trim();
    if (!body || !selectedId || !userId || sending) return;

    setSending(true);
    setError("");
    broadcastTyping("");

    const { data, error: sendError } = await supabase
      .from("direct_messages")
      .insert({
        conversation_id: selectedId,
        sender_user_id: userId,
        body,
      })
      .select("id,conversation_id,sender_user_id,body,read_at,created_at")
      .single();

    if (sendError) {
      setError(sendError.message);
    } else {
      setText("");
      if (data) {
        const sent = data as DirectMessage;
        setMessages((current) =>
          current.some((message) => message.id === sent.id)
            ? current
            : [...current, sent],
        );
      }
    }

    setSending(false);
  }

  if (loading) {
    return (
      <main className="aura-page flex min-h-[70vh] items-center justify-center">
        <p className="text-zinc-400">Carregando conversas...</p>
      </main>
    );
  }

  return (
    <main className="aura-page pb-8">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="aura-kicker">Rede Aura Beat</p>
            <h1 className="mt-1 text-3xl font-black">Chat Direto</h1>
            <p className="mt-2 text-sm text-zinc-500">
              Converse com Artistas e Casas encontrados no Explorar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void toggleAlerts()}
              className={`rounded-xl border px-4 py-2 text-sm font-bold transition ${
                alertsEnabled
                  ? "border-green-500/40 bg-green-500/10 text-green-300"
                  : "border-zinc-700 text-zinc-300"
              }`}
              title="Som, vibração e notificação quando chegar uma nova mensagem"
            >
              {alertsEnabled ? "🔔 Alertas ligados" : "🔕 Ativar alertas"}
            </button>
            <Link
              href="/buscar"
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-bold"
            >
              Explorar
            </Link>
            <Link
              href="/chat"
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-bold"
            >
              Chats de contratação
            </Link>
          </div>
        </div>

        {error && (
          <div className="mb-5 rounded-2xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        <section className="aura-card overflow-hidden rounded-3xl border lg:grid lg:min-h-[680px] lg:grid-cols-[340px_1fr]">
          <aside className="border-b border-zinc-800 lg:border-b-0 lg:border-r">
            <div className="border-b border-zinc-900 p-5">
              <p className="text-xs font-black uppercase tracking-wider text-zinc-500">
                Conversas diretas
              </p>
              <p className="mt-2 text-sm text-zinc-400">
                {conversations.length} conversa(s)
              </p>
            </div>

            <div className="max-h-[300px] overflow-y-auto lg:max-h-[620px]">
              {conversations.length === 0 ? (
                <div className="p-6 text-sm leading-6 text-zinc-500">
                  Nenhuma conversa direta ainda. Abra um perfil no Explorar e toque em Conversar.
                </div>
              ) : (
                conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => setSelectedId(conversation.id)}
                    className={`flex w-full items-center gap-3 border-b border-zinc-900 p-4 text-left transition ${
                      selectedId === conversation.id
                        ? "bg-red-950/20"
                        : "hover:bg-zinc-900/60"
                    }`}
                  >
                    <ProfileAvatar
                      kind={conversation.otherKind}
                      name={conversation.otherName}
                      url={conversation.otherAvatar}
                      sizeClassName="h-12 w-12"
                      className="rounded-2xl"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-black">{conversation.otherName}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {conversation.otherKind === "artist" ? "Artista" : "Casa"} · {formatDateTime(conversation.updated_at)}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className="flex min-h-[560px] flex-col">
            {!selected ? (
              <div className="grid flex-1 place-items-center p-8 text-center">
                <div>
                  <div className="text-5xl">💬</div>
                  <h2 className="mt-4 text-xl font-black">Escolha uma conversa</h2>
                  <p className="mt-2 text-sm text-zinc-500">
                    Você também pode iniciar uma conversa pelo Explorar.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 border-b border-zinc-900 p-5">
                  <ProfileAvatar
                    kind={selected.otherKind}
                    name={selected.otherName}
                    url={selected.otherAvatar}
                    sizeClassName="h-12 w-12"
                    className="rounded-2xl"
                  />
                  <div>
                    <p className="font-black">{selected.otherName}</p>
                    {otherTyping ? (
                      <p className="text-xs font-semibold text-sky-400">
                        Digitando<span className="animate-pulse">...</span>
                      </p>
                    ) : (
                      <p className="text-xs text-zinc-500">
                        {selected.otherKind === "artist" ? "Artista" : "Casa"}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto bg-black/20 p-4 sm:p-6">
                  {loadingMessages ? (
                    <p className="py-10 text-center text-sm text-zinc-500">
                      Carregando mensagens...
                    </p>
                  ) : messages.length === 0 ? (
                    <div className="py-12 text-center">
                      <p className="text-3xl">👋</p>
                      <p className="mt-3 font-black">Comece a conversa</p>
                      <p className="mt-1 text-sm text-zinc-500">
                        Esse chat é separado das contratações e pagamentos.
                      </p>
                    </div>
                  ) : (
                    messages.map((message) => {
                      const mine = message.sender_user_id === userId;
                      return (
                        <div
                          key={message.id}
                          className={`flex ${mine ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-2xl px-4 py-3 sm:max-w-[70%] ${
                              mine
                                ? "rounded-br-md bg-red-500 text-white"
                                : "rounded-bl-md border border-zinc-800 bg-zinc-900 text-zinc-200"
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words text-sm leading-6">
                              {message.body}
                            </p>
                            <p className={`mt-1 text-right text-[10px] ${
                              mine ? "text-red-100" : "text-zinc-600"
                            }`}>
                              {formatTime(message.created_at)}
                              {mine ? (message.read_at ? " · ✓✓" : " · ✓") : ""}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={endRef} />
                </div>

                <form onSubmit={sendMessage} className="border-t border-zinc-900 bg-zinc-950 p-4">
                  <div className="mb-2 h-5 text-xs">
                    {otherTyping ? (
                      <span className="font-semibold text-sky-400">
                        {selected.otherName} está digitando<span className="animate-pulse">...</span>
                      </span>
                    ) : (
                      <span className="text-transparent">.</span>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <textarea
                      rows={1}
                      value={text}
                      onChange={(event) => {
                        const value = event.target.value;
                        setText(value);
                        broadcastTyping(value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void sendMessage();
                        }
                      }}
                      placeholder="Escreva uma mensagem..."
                      className="max-h-32 min-h-12 flex-1 resize-none rounded-2xl border border-zinc-800 bg-black px-4 py-3 text-sm outline-none focus:border-red-500"
                    />
                    <button
                      type="submit"
                      disabled={!text.trim() || sending}
                      className="rounded-2xl bg-red-500 px-5 font-black disabled:opacity-40"
                    >
                      {sending ? "..." : "➤"}
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
