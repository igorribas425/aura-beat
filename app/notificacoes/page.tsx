"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link_url: string | null;
  read_at: string | null;
  created_at: string;
};

const labels: Record<string, string> = {
  offer: "Nova oferta",
  invitation: "Convite",
  offer_accepted: "Oferta aceita",
  offer_declined: "Oferta recusada",
  counterproposal: "Contraproposta",
  booking: "Contratação",
  message: "Mensagem",
  event_changed: "Alteração do evento",
  payment: "Pagamento",
  in_transit: "Deslocamento iniciado",
  arrived: "Artista chegou",
  completed: "Evento finalizado",
  review_request: "Avalie o evento",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data, error: loadError } = await supabase
        .from("notifications")
        .select("id,type,title,body,link_url,read_at,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (!active) return;

      if (loadError) {
        setError(loadError.message);
      } else {
        setItems((data ?? []) as NotificationItem[]);
      }

      setLoading(false);

      channel = supabase
        .channel(`notifications-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const incoming = payload.new as NotificationItem;

            setItems((current) => [
              incoming,
              ...current.filter((item) => item.id !== incoming.id),
            ].slice(0, 100));
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const updated = payload.new as NotificationItem;

            setItems((current) =>
              current.map((item) =>
                item.id === updated.id ? updated : item,
              ),
            );
          },
        )
        .subscribe();
    }

    void load();

    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [router]);

  async function mark(id?: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const readAt = new Date().toISOString();

    let query = supabase
      .from("notifications")
      .update({ read_at: readAt })
      .eq("user_id", user.id)
      .is("read_at", null);

    if (id) query = query.eq("id", id);

    const { error: markError } = await query;

    if (markError) {
      setError(markError.message);
      return;
    }

    setItems((current) =>
      current.map((item) =>
        !id || item.id === id
          ? { ...item, read_at: readAt }
          : item,
      ),
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-red-400">CENTRAL</p>
          <h1 className="text-3xl font-black">Notificações</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Mensagens, ofertas, eventos e pagamentos aparecem aqui.
          </p>
        </div>

        <button
          onClick={() => void mark()}
          className="rounded-xl border border-zinc-700 px-4 py-2 text-sm"
        >
          Marcar todas como lidas
        </button>
      </div>

      {loading ? (
        <p className="mt-10 text-zinc-400">Carregando notificações…</p>
      ) : error ? (
        <div
          role="alert"
          className="mt-8 rounded-2xl border border-red-900 bg-red-950/20 p-4 text-red-300"
        >
          Não foi possível carregar: {error}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-dashed border-zinc-800 p-12 text-center">
          <div className="text-4xl">♢</div>
          <h2 className="mt-3 font-bold">Tudo em dia</h2>
          <p className="text-sm text-zinc-500">
            Novidades de ofertas, eventos e mensagens aparecerão aqui.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {items.map((item) => (
            <Link
              href={item.link_url || "/notificacoes"}
              onClick={() => void mark(item.id)}
              key={item.id}
              className={`block rounded-2xl border p-4 transition hover:border-red-500/40 ${
                item.read_at
                  ? "border-zinc-900 bg-zinc-950"
                  : "border-red-500/30 bg-red-500/5"
              }`}
            >
              <div className="flex justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-red-400">
                    {labels[item.type] || item.type}
                  </p>
                  <h2 className="truncate font-bold">{item.title}</h2>
                  {item.body && (
                    <p className="mt-1 line-clamp-2 text-sm text-zinc-400">
                      {item.body}
                    </p>
                  )}
                </div>

                <time className="shrink-0 text-xs text-zinc-600">
                  {formatDate(item.created_at)}
                </time>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
