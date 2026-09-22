"use client";

import Link from "next/link";
import { FormEvent, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
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
  otherProfileId: string | null;
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
  const stopTypingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingHeartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTypingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingWriteRef = useRef(0);
  const typingActiveRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const alertsEnabledRef = useRef(false);

  const [userId, setUserId] = useState("");
  const [activeMode, setActiveMode] = useState<ProfileKind>("artist");
  const [conversations, setConversations] = useState<ConversationView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [unreadByConversation, setUnreadByConversation] = useState<Record<string, number>>({});
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<
    "off" | "granted" | "denied" | "unsupported"
  >("off");
  const [error, setError] = useState("");

  const writeTypingStatusEffect = useEffectEvent(
    (conversationId: string, typing: boolean) => {
      void writeTypingStatus(conversationId, typing);
    },
  );

  useEffect(() => {
    const saved = window.localStorage.getItem("aura-direct-alerts") === "on";
    setAlertsEnabled(saved);
    alertsEnabledRef.current = saved;

    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setNotificationStatus("unsupported");
    } else if (Notification.permission === "granted") {
      setNotificationStatus("granted");
    } else if (Notification.permission === "denied") {
      setNotificationStatus("denied");
    } else {
      setNotificationStatus("off");
    }

    if ("serviceWorker" in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register("/sw.js").catch((serviceWorkerError) => {
        console.error("Não foi possível registrar notificações:", serviceWorkerError);
      });
    }
  }, []);

  useEffect(() => {
    alertsEnabledRef.current = alertsEnabled;
  }, [alertsEnabled]);

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

      const [accountProfileResult, ownArtistResult, ownVenueResult] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("default_mode")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("artist_profiles")
            .select("id,verification_status")
            .eq("user_id", user.id)
            .eq("is_active", true)
            .maybeSingle(),
          supabase
            .from("venue_profiles")
            .select("id,verification_status")
            .eq("owner_user_id", user.id)
            .eq("is_active", true)
            .maybeSingle(),
        ]);

      if (!active) return;

      const preferredMode: ProfileKind =
        accountProfileResult.data?.default_mode === "venue"
          ? "venue"
          : "artist";

      const resolvedMode: ProfileKind =
        preferredMode === "venue" && ownVenueResult.data
          ? "venue"
          : preferredMode === "artist" && ownArtistResult.data
            ? "artist"
            : ownVenueResult.data
              ? "venue"
              : "artist";

      const resolvedVerification =
        resolvedMode === "venue"
          ? ownVenueResult.data?.verification_status
          : ownArtistResult.data?.verification_status;

      if (resolvedVerification !== "verified") {
        router.replace(
          resolvedMode === "venue"
            ? "/verificacao-casa"
            : "/verificacao-artista",
        );
        return;
      }

      setActiveMode(resolvedMode);

      const params = new URLSearchParams(window.location.search);
      const targetKind = params.get("targetKind");
      const targetId = params.get("targetId");
      const sourceKindParam = params.get("sourceKind");
      const requestedConversation = params.get("id");
      let conversationId = requestedConversation;

      if (requestedConversation) {
        setMobileChatOpen(true);
      }

      if (
        (targetKind === "artist" || targetKind === "venue") &&
        targetId
      ) {
        const requestedSourceKind: ProfileKind =
          sourceKindParam === "venue"
            ? "venue"
            : sourceKindParam === "artist"
              ? "artist"
              : resolvedMode;

        const sourceKind: ProfileKind =
          requestedSourceKind === "venue" && ownVenueResult.data
            ? "venue"
            : requestedSourceKind === "artist" && ownArtistResult.data
              ? "artist"
              : resolvedMode;

        const { data, error: startError } = await supabase.rpc(
          "start_direct_conversation_v2",
          {
            p_source_kind: sourceKind,
            p_target_kind: targetKind,
            p_target_profile_id: targetId,
          },
        );

        if (startError) {
          setError(
            startError.message.includes("start_direct_conversation_v2")
              ? "O Chat Direto precisa da atualização mais recente do Supabase."
              : startError.message,
          );
        } else if (data) {
          conversationId = String(data);
          setMobileChatOpen(true);
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
              .select("id,user_id,stage_name,avatar_url")
              .in("user_id", [...new Set(artistUsers)])
          : Promise.resolve({ data: [], error: null }),
        venueUsers.length
          ? supabase
              .from("venue_profiles")
              .select("id,owner_user_id,trade_name,avatar_url")
              .in("owner_user_id", [...new Set(venueUsers)])
          : Promise.resolve({ data: [], error: null }),
      ]);

      const artistMap = new Map(
        (artistResult.data ?? []).map(
          (item) =>
            [
              item.user_id,
              {
                id: item.id as string,
                name: item.stage_name,
                avatar: item.avatar_url as string | null,
              },
            ] as const,
        ),
      );

      const venueMap = new Map(
        (venueResult.data ?? []).map(
          (item) =>
            [
              item.owner_user_id,
              {
                id: item.id as string,
                name: item.trade_name,
                avatar: item.avatar_url as string | null,
              },
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
          otherProfileId: profile?.id ?? null,
          otherKind,
          otherName:
            profile?.name ??
            (otherKind === "artist" ? "Artista Aura Beat" : "Casa Aura Beat"),
          otherAvatar: profile?.avatar ?? null,
        };
      });

      if (!active) return;

      setConversations(viewRows);

      if (rows.length > 0) {
        const { data: unreadRows, error: unreadError } = await supabase
          .from("direct_messages")
          .select("conversation_id,sender_user_id,read_at")
          .in(
            "conversation_id",
            rows.map((conversation) => conversation.id),
          )
          .is("read_at", null)
          .neq("sender_user_id", currentUserId);

        if (!unreadError && active) {
          const counts = (unreadRows ?? []).reduce<Record<string, number>>(
            (accumulator, message) => {
              const conversationId = String(message.conversation_id);
              accumulator[conversationId] = (accumulator[conversationId] ?? 0) + 1;
              return accumulator;
            },
            {},
          );

          setUnreadByConversation(counts);
        }
      } else {
        setUnreadByConversation({});
      }

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
    const desktopConversationVisible =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches;

    if (
      !selectedId ||
      !userId ||
      (!mobileChatOpen && !desktopConversationVisible)
    ) {
      setMessages([]);
      return;
    }

    const conversationId = selectedId;
    let active = true;
    setLoadingMessages(true);

    async function loadMessages() {
      const { data, error: messagesError } = await supabase
        .from("direct_messages")
        .select("id,conversation_id,sender_user_id,body,read_at,created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (!active) return;

      if (messagesError) {
        setError(messagesError.message);
        setMessages([]);
      } else {
        setMessages((data ?? []) as DirectMessage[]);
        await supabase.rpc("mark_direct_conversation_read_v1", {
          p_conversation_id: conversationId,
        });

        setUnreadByConversation((current) => ({
          ...current,
          [conversationId]: 0,
        }));
      }

      if (active) setLoadingMessages(false);
    }

    void loadMessages();

    async function loadTypingStatus() {
      const { data } = await supabase
        .from("direct_typing_status")
        .select("user_id,is_typing,updated_at")
        .eq("conversation_id", conversationId)
        .neq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!active || !data) return;

      const updatedAt = new Date(data.updated_at).getTime();
      const fresh =
        data.is_typing === true &&
        Number.isFinite(updatedAt) &&
        Date.now() - updatedAt < 6500;

      setOtherTyping(fresh);

      if (fresh) {
        if (hideTypingRef.current) {
          clearTimeout(hideTypingRef.current);
        }

        hideTypingRef.current = setTimeout(() => {
          setOtherTyping(false);
        }, 6500);
      }
    }

    void loadTypingStatus();

    const channel = supabase
      .channel(`direct-chat-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter: `conversation_id=eq.${conversationId}`,
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
              p_conversation_id: conversationId,
            });

            setUnreadByConversation((current) => ({
              ...current,
              [conversationId]: 0,
            }));

            if (alertsEnabledRef.current) {
              void playNotificationSound();

              if ("vibrate" in navigator) {
                navigator.vibrate([80, 50, 80]);
              }

              if (document.hidden) {
                void showPhoneNotification(incoming.body);
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
          filter: `conversation_id=eq.${conversationId}`,
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
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "direct_typing_status",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const status = payload.new as {
            user_id?: string;
            is_typing?: boolean;
            updated_at?: string;
          };

          if (!status.user_id || status.user_id === userId) return;

          if (hideTypingRef.current) {
            clearTimeout(hideTypingRef.current);
          }

          const updatedAt = status.updated_at
            ? new Date(status.updated_at).getTime()
            : Date.now();

          const fresh =
            status.is_typing === true &&
            Number.isFinite(updatedAt) &&
            Date.now() - updatedAt < 6500;

          setOtherTyping(fresh);

          if (fresh) {
            hideTypingRef.current = setTimeout(() => {
              setOtherTyping(false);
            }, 6500);
          }
        },
      );

    channel.subscribe();

    return () => {
      active = false;

      if (stopTypingRef.current) {
        clearTimeout(stopTypingRef.current);
        stopTypingRef.current = null;
      }

      if (typingHeartbeatRef.current) {
        clearInterval(typingHeartbeatRef.current);
        typingHeartbeatRef.current = null;
      }

      if (hideTypingRef.current) {
        clearTimeout(hideTypingRef.current);
        hideTypingRef.current = null;
      }

      typingActiveRef.current = false;
      lastTypingWriteRef.current = 0;
      setOtherTyping(false);
      writeTypingStatusEffect(conversationId, false);
      void supabase.removeChannel(channel);
    };
  }, [mobileChatOpen, selectedId, userId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`direct-inbox-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
        },
        (payload) => {
          const incoming = payload.new as DirectMessage;

          if (incoming.sender_user_id === userId) return;

          const belongsToInbox = conversations.some(
            (conversation) => conversation.id === incoming.conversation_id,
          );

          if (!belongsToInbox) return;

          if (
            incoming.conversation_id === selectedId &&
            mobileChatOpen
          ) {
            setUnreadByConversation((current) => ({
              ...current,
              [incoming.conversation_id]: 0,
            }));
            return;
          }

          setUnreadByConversation((current) => ({
            ...current,
            [incoming.conversation_id]:
              (current[incoming.conversation_id] ?? 0) + 1,
          }));


        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversations, mobileChatOpen, selectedId, userId]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`direct-profile-visuals-${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "artist_profiles" },
        (payload) => {
          const row = payload.new as {
            user_id?: string;
            stage_name?: string;
            avatar_url?: string | null;
          };

          if (!row.user_id) return;

          setConversations((current) =>
            current.map((conversation) =>
              conversation.otherKind === "artist" &&
              conversation.otherUserId === row.user_id
                ? {
                    ...conversation,
                    otherName: row.stage_name ?? conversation.otherName,
                    otherAvatar:
                      row.avatar_url === undefined
                        ? conversation.otherAvatar
                        : row.avatar_url,
                  }
                : conversation,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "venue_profiles" },
        (payload) => {
          const row = payload.new as {
            owner_user_id?: string;
            trade_name?: string;
            avatar_url?: string | null;
          };

          if (!row.owner_user_id) return;

          setConversations((current) =>
            current.map((conversation) =>
              conversation.otherKind === "venue" &&
              conversation.otherUserId === row.owner_user_id
                ? {
                    ...conversation,
                    otherName: row.trade_name ?? conversation.otherName,
                    otherAvatar:
                      row.avatar_url === undefined
                        ? conversation.otherAvatar
                        : row.avatar_url,
                  }
                : conversation,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

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

  async function showPhoneNotification(body: string) {
    if (
      !window.isSecureContext ||
      !("Notification" in window) ||
      Notification.permission !== "granted" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification("Aura Beat", {
        body: body.slice(0, 120),
        icon: "/icons/icon.svg",
        badge: "/icons/icon.svg",
        tag: "aura-direct-message",
        data: {
          url: "/chat-direto",
        },
      });
    } catch (notificationError) {
      console.error("Não foi possível exibir a notificação:", notificationError);
    }
  }

  async function enablePhoneAlerts() {
    setError("");

    if (!window.isSecureContext) {
      setError(
        "Para o celular liberar notificações, abra o Aura Beat pelo link HTTPS do teste.",
      );
      return;
    }

    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setNotificationStatus("unsupported");

      const isAndroid = /Android/i.test(navigator.userAgent);
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

      setError(
        isAndroid
          ? "Este navegador não liberou notificações web. Abra o Aura Beat no Google Chrome pelo mesmo link HTTPS e toque novamente em Ativar notificações."
          : isIOS
            ? "No iPhone, adicione o Aura Beat à Tela de Início e abra o app instalado para permitir notificações."
            : "Este navegador não permite notificações web neste modo. Abra o Aura Beat em um navegador compatível e tente novamente.",
      );
      return;
    }

    try {
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        setAlertsEnabled(false);
        alertsEnabledRef.current = false;
        window.localStorage.setItem("aura-direct-alerts", "off");
        setNotificationStatus(permission === "denied" ? "denied" : "off");
        setError(
          permission === "denied"
            ? "As notificações foram bloqueadas. Libere o Aura Beat nas permissões de notificações do navegador/celular."
            : "A permissão de notificações não foi concedida.",
        );
        return;
      }

      setAlertsEnabled(true);
      alertsEnabledRef.current = true;
      setNotificationStatus("granted");
      window.localStorage.setItem("aura-direct-alerts", "on");

      await playNotificationSound();

      if ("vibrate" in navigator) {
        navigator.vibrate([70, 40, 70]);
      }

      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification("Aura Beat", {
        body: "Notificações ativadas. Você será avisado quando chegar uma nova mensagem.",
        icon: "/icons/icon.svg",
        badge: "/icons/icon.svg",
        tag: "aura-alerts-enabled",
        data: {
          url: "/chat-direto",
        },
      });
    } catch (notificationError) {
      console.error(notificationError);
      setError("Não foi possível ativar as notificações neste navegador.");
    }
  }

  function openInChrome() {
    if (!/Android/i.test(navigator.userAgent)) return;

    const current = window.location.href.replace(/^https?:\/\//, "");
    window.location.href =
      `intent://${current}#Intent;scheme=https;package=com.android.chrome;end`;
  }

  function disablePhoneAlerts() {
    setAlertsEnabled(false);
    alertsEnabledRef.current = false;
    window.localStorage.setItem("aura-direct-alerts", "off");
  }

  async function writeTypingStatus(
    conversationId: string,
    typing: boolean,
  ) {
    if (!conversationId || !userId) return;

    const { error: typingError } = await supabase
      .from("direct_typing_status")
      .upsert(
        {
          conversation_id: conversationId,
          user_id: userId,
          is_typing: typing,
        },
        {
          onConflict: "conversation_id,user_id",
        },
      );

    if (typingError) {
      console.error("Nao foi possivel atualizar o status de digitacao:", typingError);
    }
  }

  function stopTypingHeartbeat() {
    if (typingHeartbeatRef.current) {
      clearInterval(typingHeartbeatRef.current);
      typingHeartbeatRef.current = null;
    }
  }

  function broadcastTyping(value: string) {
    if (!selectedId || !userId) return;

    const conversationId = selectedId;

    if (stopTypingRef.current) {
      clearTimeout(stopTypingRef.current);
      stopTypingRef.current = null;
    }

    if (value.length === 0) {
      typingActiveRef.current = false;
      lastTypingWriteRef.current = 0;
      stopTypingHeartbeat();
      void writeTypingStatus(conversationId, false);
      return;
    }

    const now = Date.now();

    if (
      !typingActiveRef.current ||
      now - lastTypingWriteRef.current >= 650
    ) {
      typingActiveRef.current = true;
      lastTypingWriteRef.current = now;
      void writeTypingStatus(conversationId, true);
    }

    if (!typingHeartbeatRef.current) {
      typingHeartbeatRef.current = setInterval(() => {
        if (!typingActiveRef.current) return;

        lastTypingWriteRef.current = Date.now();
        void writeTypingStatus(conversationId, true);
      }, 1200);
    }

    stopTypingRef.current = setTimeout(() => {
      typingActiveRef.current = false;
      lastTypingWriteRef.current = 0;
      stopTypingHeartbeat();
      void writeTypingStatus(conversationId, false);
    }, 3200);
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
        <div className={`mb-5 flex-wrap items-center justify-between gap-3 ${mobileChatOpen ? "hidden lg:flex" : "flex"}`}>
          <div>
            <p className="aura-kicker">Rede Aura Beat</p>
            <h1 className="mt-1 text-3xl font-black">Chat Direto</h1>
            <p className="mt-2 text-sm text-zinc-500">
              Converse com Artistas e Casas encontrados no Explorar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {alertsEnabled && notificationStatus === "granted" ? (
              <button
                type="button"
                onClick={disablePhoneAlerts}
                className="rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-2 text-sm font-bold text-green-300"
                title="Desativar som, vibração e avisos do Chat Direto"
              >
                🔔 Notificações ativas
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void enablePhoneAlerts()}
                className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-sm font-black text-yellow-200"
                title="O celular vai pedir permissão para o Aura Beat enviar notificações"
              >
                🔔 Ativar notificações
              </button>
            )}
            <Link
              href="/buscar"
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-bold"
            >
              Explorar
            </Link>

          </div>
        </div>

        {error && (
          <div className="mb-5 rounded-2xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
            <p>{error}</p>
            {notificationStatus === "unsupported" &&
              /Android/i.test(navigator.userAgent) && (
                <button
                  type="button"
                  onClick={openInChrome}
                  className="mt-3 rounded-xl border border-red-700 px-4 py-2 font-black text-red-200"
                >
                  Abrir no Google Chrome
                </button>
              )}
          </div>
        )}

        <section className="aura-card overflow-hidden rounded-3xl border lg:grid lg:min-h-[680px] lg:grid-cols-[340px_1fr]">
          <aside className={`${mobileChatOpen ? "hidden lg:block" : "block"} border-b border-zinc-800 lg:border-b-0 lg:border-r`}>
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
                    onClick={() => {
                      setSelectedId(conversation.id);
                      setMobileChatOpen(true);
                      setUnreadByConversation((current) => ({
                        ...current,
                        [conversation.id]: 0,
                      }));
                    }}
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
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate font-black">
                          {conversation.otherName}
                        </p>
                        {(unreadByConversation[conversation.id] ?? 0) > 0 && (
                          <span
                            className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-red-500 px-1.5 text-[11px] font-black text-white"
                            aria-label={`${unreadByConversation[conversation.id]} mensagem(ns) não lida(s)`}
                          >
                            {unreadByConversation[conversation.id] > 99
                              ? "99+"
                              : unreadByConversation[conversation.id]}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        {conversation.otherKind === "artist" ? "Artista" : "Casa"} · {formatDateTime(conversation.updated_at)}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className={`${mobileChatOpen ? "flex" : "hidden lg:flex"} min-h-[560px] flex-col`}>
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
                <div className="flex items-center gap-3 border-b border-zinc-900 p-4 sm:p-5">
                  <button
                    type="button"
                    onClick={() => setMobileChatOpen(false)}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-zinc-800 text-xl text-zinc-300 lg:hidden"
                    aria-label="Voltar para conversas"
                  >
                    ←
                  </button>
                  <ProfileAvatar
                    kind={selected.otherKind}
                    name={selected.otherName}
                    url={selected.otherAvatar}
                    sizeClassName="h-12 w-12"
                    className="rounded-2xl"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-black">{selected.otherName}</p>
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

                  {activeMode === "venue" &&
                    selected.otherKind === "artist" &&
                    selected.otherProfileId && (
                      <Link
                        href={`/oferta-direta/${selected.otherProfileId}?conversation=${selected.id}`}
                        className="ml-auto shrink-0 rounded-xl border border-green-500/40 bg-green-500/10 px-3 py-2 text-xs font-black text-green-300 transition hover:bg-green-500/20 sm:px-4 sm:text-sm"
                      >
                        📅 Fechar data
                      </Link>
                    )}

                  {activeMode === "artist" &&
                    selected.otherKind === "venue" &&
                    selected.otherProfileId && (
                      <Link
                        href={`/casas/${selected.otherProfileId}#agenda-publica`}
                        className="ml-auto shrink-0 rounded-xl border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-300 sm:px-4 sm:text-sm"
                      >
                        🗓 Agenda da Casa
                      </Link>
                    )}
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
                        Converse normalmente e use “Fechar data” quando chegarem a um acordo.
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
                      onInput={(event) => {
                        broadcastTyping(event.currentTarget.value);
                      }}
                      onBlur={() => broadcastTyping("")}
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
