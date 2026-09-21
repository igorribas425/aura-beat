"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ensureFreshSession, getOwnerAccessFast } from "../../../lib/admin-access";

type DeleteRequest = {
  id: string;
  user_id: string | null;
  email_snapshot: string;
  status: "pending" | "processing" | "completed" | "rejected" | "cancelled";
  requested_at: string;
  updated_at: string;
  processed_at: string | null;
  resolution_note: string | null;
};

const labels: Record<DeleteRequest["status"], string> = {
  pending: "Pendente",
  processing: "Em processamento",
  completed: "Concluída",
  rejected: "Rejeitada",
  cancelled: "Cancelada",
};

function dataHora(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function ExclusoesAdminPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<DeleteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const carregar = useCallback(async () => {
    setError("");

    const access = await getOwnerAccessFast();

    if (!access.authenticated) {
      router.replace("/login");
      return;
    }

    if (!access.allowed) {
      router.replace("/admin");
      return;
    }

    const session = await ensureFreshSession();

    if (!session) {
      router.replace("/login");
      return;
    }

    const response = await fetch("/api/admin/account-deletions", {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      requests?: DeleteRequest[];
    };

    if (!response.ok) {
      throw new Error(body.error || "Não foi possível carregar as solicitações.");
    }

    setRequests(body.requests || []);
  }, [router]);

  useEffect(() => {
    let active = true;

    void carregar()
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Erro ao carregar.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [carregar]);

  const openCount = useMemo(
    () =>
      requests.filter((item) =>
        ["pending", "processing"].includes(item.status),
      ).length,
    [requests],
  );

  async function atualizar(
    item: DeleteRequest,
    status: "pending" | "processing" | "rejected" | "cancelled",
  ) {
    const note =
      status === "rejected" || status === "cancelled"
        ? window.prompt("Motivo/observação para esta alteração:")?.trim() || ""
        : "";

    if ((status === "rejected" || status === "cancelled") && !note) {
      return;
    }

    const session = await ensureFreshSession();

    if (!session) {
      router.replace("/login");
      return;
    }

    try {
      setBusyId(item.id);
      setError("");

      const response = await fetch("/api/admin/account-deletions", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: item.id,
          status,
          note: note || null,
        }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        request?: DeleteRequest;
      };

      if (!response.ok || !body.request) {
        throw new Error(body.error || "Não foi possível atualizar.");
      }

      setRequests((current) =>
        current.map((request) =>
          request.id === body.request?.id ? body.request : request,
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro ao atualizar.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <main className="aura-page flex min-h-[70vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-zinc-800 border-t-red-500" />
          <p className="text-zinc-400">Carregando solicitações de exclusão…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="aura-page px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="aura-hero rounded-3xl p-6 sm:p-8">
          <p className="aura-kicker">PRIVACIDADE E LGPD</p>
          <h1 className="mt-2 text-3xl font-black">Solicitações de exclusão</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
            Acompanhe pedidos feitos pelos usuários. Este painel organiza a fila,
            mas ainda não apaga uma conta automaticamente: a conclusão final só
            deve ser marcada depois que a remoção de dados for realmente processada.
          </p>

          <div className="mt-5 inline-flex rounded-full border border-red-900/50 bg-red-950/20 px-4 py-2 text-sm font-black text-red-300">
            {openCount} solicitação(ões) aberta(s)
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        <section className="space-y-4">
          {requests.length === 0 ? (
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8 text-center text-zinc-500">
              Nenhuma solicitação de exclusão registrada.
            </div>
          ) : (
            requests.map((item) => (
              <article
                key={item.id}
                className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-red-500">
                      {labels[item.status]}
                    </p>
                    <h2 className="mt-2 text-lg font-black">
                      {item.email_snapshot}
                    </h2>
                    <p className="mt-2 text-xs text-zinc-500">
                      Solicitado em {dataHora(item.requested_at)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">
                      ID: {item.id}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-zinc-800 bg-black/30 px-4 py-3 text-xs text-zinc-500">
                    Atualizado: {dataHora(item.updated_at)}
                  </div>
                </div>

                {item.resolution_note && (
                  <div className="mt-4 rounded-2xl border border-zinc-800 bg-black/30 p-4 text-sm text-zinc-400">
                    <strong className="text-zinc-200">Observação:</strong>{" "}
                    {item.resolution_note}
                  </div>
                )}

                <div className="mt-5 flex flex-wrap gap-3">
                  {item.status === "pending" && (
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void atualizar(item, "processing")}
                      className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-black text-black disabled:opacity-50"
                    >
                      Iniciar análise
                    </button>
                  )}

                  {item.status === "processing" && (
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void atualizar(item, "pending")}
                      className="rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-black disabled:opacity-50"
                    >
                      Voltar para pendente
                    </button>
                  )}

                  {["pending", "processing"].includes(item.status) && (
                    <>
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => void atualizar(item, "rejected")}
                        className="rounded-xl border border-red-900 px-4 py-2.5 text-sm font-black text-red-400 disabled:opacity-50"
                      >
                        Rejeitar com motivo
                      </button>

                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => void atualizar(item, "cancelled")}
                        className="rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-black text-zinc-300 disabled:opacity-50"
                      >
                        Cancelar solicitação
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
