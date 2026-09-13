"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

type AdminRole = "reviewer" | "admin" | "owner";
type Kind = "artist" | "venue";
type RequestStatus = "pending" | "verified" | "rejected";
type ProfileStatus = RequestStatus | "suspended" | null;
type FilterStatus = "all" | "pending" | "verified" | "rejected" | "suspended";
type Action = "verified" | "rejected" | "suspended";

type ArtistRequest = {
  id: string;
  artist_id: string;
  user_id: string;
  document_type: string;
  document_front_path: string;
  document_back_path: string | null;
  selfie_path: string;
  status: RequestStatus;
  rejection_reason: string | null;
  submitted_at: string;
  reviewed_at: string | null;
};

type VenueRequest = {
  id: string;
  venue_id: string;
  user_id: string;
  cnpj_snapshot: string;
  trade_name_snapshot: string;
  legal_name_snapshot: string | null;
  business_document_type: string;
  business_document_path: string;
  responsible_document_type: string;
  responsible_document_front_path: string;
  responsible_document_back_path: string | null;
  selfie_path: string;
  status: RequestStatus;
  rejection_reason: string | null;
  submitted_at: string;
  reviewed_at: string | null;
};

type ArtistProfile = {
  id: string;
  stage_name: string | null;
  verification_status: ProfileStatus;
};

type VenueProfile = {
  id: string;
  trade_name: string | null;
  verification_status: ProfileStatus;
};

type AuditRow = {
  id: string;
  request_kind: Kind;
  request_id: string;
  action: Action;
  reason: string | null;
  reviewed_by: string;
  created_at: string;
};

type ReviewItem = {
  kind: Kind;
  requestId: string;
  profileId: string;
  title: string;
  subtitle: string;
  requestStatus: RequestStatus;
  profileStatus: ProfileStatus;
  rejectionReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  documents: Array<{ label: string; path: string | null }>;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

function maskCnpj(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length !== 14) return value || "CNPJ não informado";
  return digits.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5",
  );
}

function statusLabel(status: ProfileStatus) {
  switch (status) {
    case "verified":
      return "Aprovado";
    case "rejected":
      return "Recusado";
    case "suspended":
      return "Suspenso";
    default:
      return "Em análise";
  }
}

function statusClass(status: ProfileStatus) {
  switch (status) {
    case "verified":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "rejected":
      return "border-red-500/30 bg-red-500/10 text-red-200";
    case "suspended":
      return "border-orange-500/30 bg-orange-500/10 text-orange-200";
    default:
      return "border-amber-500/30 bg-amber-500/10 text-amber-100";
  }
}

function actionLabel(action: Action) {
  if (action === "verified") return "Aprovado";
  if (action === "rejected") return "Recusado";
  return "Suspenso";
}

export default function AdminVerificacoesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [moduleReady, setModuleReady] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [filter, setFilter] = useState<FilterStatus>("pending");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadData = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);

    setError("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: adminRow, error: adminError } = await supabase
        .from("aura_admins")
        .select("role,is_active")
        .eq("user_id", user.id)
        .maybeSingle();

      if (adminError) {
        const text = `${adminError.code || ""} ${adminError.message || ""}`.toLowerCase();
        if (
          text.includes("42p01") ||
          text.includes("pgrst205") ||
          text.includes("aura_admins")
        ) {
          setModuleReady(false);
          setAccessDenied(false);
          setRole(null);
          setItems([]);
          return;
        }
        throw adminError;
      }

      setModuleReady(true);

      if (!adminRow?.is_active) {
        setAccessDenied(true);
        setRole(null);
        setItems([]);
        return;
      }

      const currentRole = adminRow.role as AdminRole;
      setAccessDenied(false);
      setRole(currentRole);

      const [artistResult, venueResult, auditResult] = await Promise.all([
        supabase
          .from("artist_verification_requests")
          .select(
            "id,artist_id,user_id,document_type,document_front_path,document_back_path,selfie_path,status,rejection_reason,submitted_at,reviewed_at",
          )
          .order("submitted_at", { ascending: false })
          .limit(100),
        supabase
          .from("venue_verification_requests")
          .select(
            "id,venue_id,user_id,cnpj_snapshot,trade_name_snapshot,legal_name_snapshot,business_document_type,business_document_path,responsible_document_type,responsible_document_front_path,responsible_document_back_path,selfie_path,status,rejection_reason,submitted_at,reviewed_at",
          )
          .order("submitted_at", { ascending: false })
          .limit(100),
        supabase
          .from("verification_review_audit")
          .select("id,request_kind,request_id,action,reason,reviewed_by,created_at")
          .order("created_at", { ascending: false })
          .limit(30),
      ]);

      if (artistResult.error) throw artistResult.error;
      if (venueResult.error) throw venueResult.error;
      if (auditResult.error) throw auditResult.error;

      const artistRequests = (artistResult.data || []) as ArtistRequest[];
      const venueRequests = (venueResult.data || []) as VenueRequest[];

      const artistIds = [...new Set(artistRequests.map((request) => request.artist_id))];
      const venueIds = [...new Set(venueRequests.map((request) => request.venue_id))];

      const [artistProfilesResult, venueProfilesResult] = await Promise.all([
        artistIds.length > 0
          ? supabase
              .from("artist_profiles")
              .select("id,stage_name,verification_status")
              .in("id", artistIds)
          : Promise.resolve({ data: [] as ArtistProfile[], error: null }),
        venueIds.length > 0
          ? supabase
              .from("venue_profiles")
              .select("id,trade_name,verification_status")
              .in("id", venueIds)
          : Promise.resolve({ data: [] as VenueProfile[], error: null }),
      ]);

      if (artistProfilesResult.error) throw artistProfilesResult.error;
      if (venueProfilesResult.error) throw venueProfilesResult.error;

      const artistProfiles = new Map(
        ((artistProfilesResult.data || []) as ArtistProfile[]).map((profile) => [
          profile.id,
          profile,
        ]),
      );
      const venueProfiles = new Map(
        ((venueProfilesResult.data || []) as VenueProfile[]).map((profile) => [
          profile.id,
          profile,
        ]),
      );

      const artistItems: ReviewItem[] = artistRequests.map((request) => {
        const profile = artistProfiles.get(request.artist_id);
        return {
          kind: "artist",
          requestId: request.id,
          profileId: request.artist_id,
          title: profile?.stage_name || "Artista sem nome público",
          subtitle: `Documento: ${request.document_type.toUpperCase()}`,
          requestStatus: request.status,
          profileStatus: profile?.verification_status ?? request.status,
          rejectionReason: request.rejection_reason,
          submittedAt: request.submitted_at,
          reviewedAt: request.reviewed_at,
          documents: [
            { label: "Documento — frente", path: request.document_front_path },
            { label: "Documento — verso", path: request.document_back_path },
            { label: "Foto facial", path: request.selfie_path },
          ],
        };
      });

      const venueItems: ReviewItem[] = venueRequests.map((request) => {
        const profile = venueProfiles.get(request.venue_id);
        return {
          kind: "venue",
          requestId: request.id,
          profileId: request.venue_id,
          title: profile?.trade_name || request.trade_name_snapshot || "Casa sem nome",
          subtitle: `${maskCnpj(request.cnpj_snapshot)} · ${request.legal_name_snapshot || "Razão social não informada"}`,
          requestStatus: request.status,
          profileStatus: profile?.verification_status ?? request.status,
          rejectionReason: request.rejection_reason,
          submittedAt: request.submitted_at,
          reviewedAt: request.reviewed_at,
          documents: [
            { label: "Documento da empresa", path: request.business_document_path },
            {
              label: "Responsável — frente",
              path: request.responsible_document_front_path,
            },
            {
              label: "Responsável — verso",
              path: request.responsible_document_back_path,
            },
            { label: "Foto facial do responsável", path: request.selfie_path },
          ],
        };
      });

      setItems(
        [...artistItems, ...venueItems].sort(
          (a, b) =>
            new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
        ),
      );
      setAudit((auditResult.data || []) as AuditRow[]);
    } catch (err) {
      console.error(err);
      setError("Não foi possível carregar a Central de Verificações.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    void loadData(true);
  }, [loadData]);

  const filteredItems = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((item) => {
      const effectiveStatus =
        item.profileStatus === "suspended" ? "suspended" : item.requestStatus;
      return effectiveStatus === filter;
    });
  }, [filter, items]);

  const counters = useMemo(() => {
    const result = {
      all: items.length,
      pending: 0,
      verified: 0,
      rejected: 0,
      suspended: 0,
    };

    for (const item of items) {
      const effectiveStatus =
        item.profileStatus === "suspended" ? "suspended" : item.requestStatus;
      result[effectiveStatus] += 1;
    }

    return result;
  }, [items]);

  async function openDocument(path: string | null) {
    if (!path) return;

    setError("");
    const popup = window.open("", "_blank", "noopener,noreferrer");

    try {
      const { data, error: signedUrlError } = await supabase.storage
        .from("verification-documents")
        .createSignedUrl(path, 90);

      if (signedUrlError) throw signedUrlError;
      if (!data?.signedUrl) throw new Error("URL assinada não gerada");

      if (popup) popup.location.href = data.signedUrl;
      else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      popup?.close();
      console.error(err);
      setError("Não foi possível abrir este documento privado.");
    }
  }

  async function review(item: ReviewItem, action: Action) {
    setError("");
    setMessage("");

    let reason: string | null = null;

    if (action === "rejected") {
      reason = window.prompt("Informe o motivo da recusa:");
      if (reason === null) return;
      if (!reason.trim()) {
        setError("O motivo da recusa é obrigatório.");
        return;
      }
    }

    if (action === "suspended") {
      reason = window.prompt("Informe o motivo da suspensão:");
      if (reason === null) return;
      if (!reason.trim()) {
        setError("O motivo da suspensão é obrigatório.");
        return;
      }
    }

    if (
      action === "verified" &&
      !window.confirm(`Aprovar a verificação de ${item.title}?`)
    ) {
      return;
    }

    try {
      setActingId(`${item.kind}:${item.requestId}:${action}`);

      const { error: rpcError } = await supabase.rpc("admin_review_verification", {
        p_kind: item.kind,
        p_request_id: item.requestId,
        p_action: action,
        p_reason: reason,
      });

      if (rpcError) throw rpcError;

      setMessage(`${item.title}: ${actionLabel(action).toLowerCase()} com sucesso.`);
      await loadData(false);
    } catch (err) {
      console.error(err);
      const text =
        typeof err === "object" && err !== null && "message" in err
          ? String((err as { message?: string }).message || "")
          : "";
      setError(text || "Não foi possível concluir a decisão administrativa.");
    } finally {
      setActingId(null);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050507] text-white">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-zinc-800 border-t-blue-500" />
          <p className="mt-4 text-sm text-zinc-400">Abrindo Central de Verificações...</p>
        </div>
      </main>
    );
  }

  if (!moduleReady) {
    return (
      <main className="min-h-screen bg-[#050507] px-4 py-16 text-white">
        <div className="mx-auto max-w-2xl rounded-3xl border border-amber-500/30 bg-amber-500/10 p-8">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">
            Central administrativa
          </p>
          <h1 className="mt-3 text-3xl font-black">Módulo ainda não ativado</h1>
          <p className="mt-3 text-sm leading-6 text-amber-100/80">
            A interface está pronta, mas a migration administrativa ainda não foi aplicada no Supabase. Nenhuma permissão foi aberta automaticamente.
          </p>
        </div>
      </main>
    );
  }

  if (accessDenied || !role) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050507] px-4 text-white">
        <div className="max-w-lg rounded-3xl border border-red-500/30 bg-red-500/10 p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-red-500/30 text-2xl">
            🔒
          </div>
          <h1 className="mt-5 text-2xl font-black">Acesso restrito</h1>
          <p className="mt-3 text-sm leading-6 text-red-100/80">
            Esta área é exclusiva da equipe administrativa do Aura Beat. Usuários comuns não podem se autoaprovar.
          </p>
        </div>
      </main>
    );
  }

  const canSuspend = role === "admin" || role === "owner";

  return (
    <main className="min-h-screen bg-[#050507] pb-16 text-white">
      <header className="border-b border-zinc-900 bg-black/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-400">
              Segurança Aura Beat
            </p>
            <h1 className="mt-1 text-2xl font-black">Central de Verificações</h1>
            <p className="mt-1 text-xs text-zinc-500">
              Acesso: {role} · documentos privados com URL temporária
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadData(false)}
            disabled={refreshing}
            className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-black text-zinc-200 transition hover:bg-zinc-900 disabled:opacity-50"
          >
            {refreshing ? "Atualizando..." : "↻ Atualizar"}
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <section className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-950 to-blue-950/20 p-6">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <p className="text-sm font-black text-blue-400">ANÁLISE INTERNA</p>
              <h2 className="mt-2 text-3xl font-black">Artistas e Casas</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                Aprovação e recusa passam por uma função protegida no banco. O frontend não possui service_role e não tem UPDATE direto nas solicitações.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-2xl border border-zinc-800 bg-black/40 px-4 py-3 text-center">
                <p className="text-2xl font-black">{counters.pending}</p>
                <p className="text-xs text-zinc-500">Pendentes</p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-black/40 px-4 py-3 text-center">
                <p className="text-2xl font-black text-emerald-300">{counters.verified}</p>
                <p className="text-xs text-zinc-500">Aprovados</p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-black/40 px-4 py-3 text-center">
                <p className="text-2xl font-black text-red-300">{counters.rejected}</p>
                <p className="text-xs text-zinc-500">Recusados</p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-black/40 px-4 py-3 text-center">
                <p className="text-2xl font-black text-orange-300">{counters.suspended}</p>
                <p className="text-xs text-zinc-500">Suspensos</p>
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {message && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            {message}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {(
            ["pending", "all", "verified", "rejected", "suspended"] as FilterStatus[]
          ).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setFilter(status)}
              className={`rounded-xl border px-4 py-2 text-sm font-black transition ${
                filter === status
                  ? "border-blue-500 bg-blue-500/15 text-blue-200"
                  : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              {status === "all"
                ? `Todos (${counters.all})`
                : status === "pending"
                  ? `Pendentes (${counters.pending})`
                  : status === "verified"
                    ? `Aprovados (${counters.verified})`
                    : status === "rejected"
                      ? `Recusados (${counters.rejected})`
                      : `Suspensos (${counters.suspended})`}
            </button>
          ))}
        </div>

        <section className="space-y-4">
          {filteredItems.length === 0 ? (
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-10 text-center text-zinc-500">
              Nenhuma solicitação neste filtro.
            </div>
          ) : (
            filteredItems.map((item) => {
              const effectiveStatus =
                item.profileStatus === "suspended" ? "suspended" : item.requestStatus;
              const isPending = item.requestStatus === "pending";
              const isVerified = item.requestStatus === "verified";

              return (
                <article
                  key={`${item.kind}:${item.requestId}`}
                  className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6"
                >
                  <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-zinc-700 bg-black px-3 py-1 text-xs font-black uppercase tracking-wide text-zinc-300">
                          {item.kind === "artist" ? "Artista" : "Casa"}
                        </span>
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass(effectiveStatus)}`}
                        >
                          {statusLabel(effectiveStatus)}
                        </span>
                      </div>

                      <h3 className="mt-4 text-2xl font-black">{item.title}</h3>
                      <p className="mt-1 text-sm text-zinc-400">{item.subtitle}</p>
                      <p className="mt-3 text-xs text-zinc-600">
                        Enviado em {formatDate(item.submittedAt)} · Solicitação {item.requestId}
                      </p>

                      {item.rejectionReason && (
                        <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200">
                          <strong>Motivo da recusa:</strong> {item.rejectionReason}
                        </div>
                      )}
                    </div>

                    <div className="grid min-w-[260px] gap-2">
                      {isPending && (
                        <>
                          <button
                            type="button"
                            disabled={actingId !== null}
                            onClick={() => void review(item, "verified")}
                            className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-black transition hover:bg-emerald-400 disabled:opacity-50"
                          >
                            {actingId === `${item.kind}:${item.requestId}:verified`
                              ? "Aprovando..."
                              : "✓ Aprovar"}
                          </button>
                          <button
                            type="button"
                            disabled={actingId !== null}
                            onClick={() => void review(item, "rejected")}
                            className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-black text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
                          >
                            {actingId === `${item.kind}:${item.requestId}:rejected`
                              ? "Recusando..."
                              : "✕ Recusar"}
                          </button>
                        </>
                      )}

                      {isVerified &&
                        effectiveStatus !== "suspended" &&
                        canSuspend && (
                          <button
                            type="button"
                            disabled={actingId !== null}
                            onClick={() => void review(item, "suspended")}
                            className="rounded-xl border border-orange-500/40 bg-orange-500/10 px-4 py-3 text-sm font-black text-orange-200 transition hover:bg-orange-500/20 disabled:opacity-50"
                          >
                            {actingId === `${item.kind}:${item.requestId}:suspended`
                              ? "Suspendendo..."
                              : "! Suspender perfil"}
                          </button>
                        )}

                      {!isPending && (
                        <div className="rounded-xl border border-zinc-800 bg-black/40 px-4 py-3 text-xs text-zinc-500">
                          Revisado em {formatDate(item.reviewedAt)}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 border-t border-zinc-900 pt-5">
                    <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-zinc-500">
                      Documentos privados
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {item.documents.map((document) =>
                        document.path ? (
                          <button
                            key={document.label}
                            type="button"
                            onClick={() => void openDocument(document.path)}
                            className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-bold text-blue-200 transition hover:bg-blue-500/20"
                          >
                            🔒 {document.label}
                          </button>
                        ) : (
                          <span
                            key={document.label}
                            className="rounded-xl border border-zinc-800 px-4 py-2 text-sm text-zinc-600"
                          >
                            {document.label}: não enviado
                          </span>
                        ),
                      )}
                    </div>
                    <p className="mt-3 text-xs text-zinc-600">
                      Os links expiram em 90 segundos e o bucket continua privado.
                    </p>
                  </div>
                </article>
              );
            })
          )}
        </section>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
          <h2 className="text-xl font-black">Auditoria recente</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Registro das decisões feitas pela equipe administrativa.
          </p>

          <div className="mt-5 space-y-2">
            {audit.length === 0 ? (
              <p className="rounded-2xl border border-zinc-800 bg-black/30 p-4 text-sm text-zinc-500">
                Nenhuma decisão administrativa registrada ainda.
              </p>
            ) : (
              audit.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-col justify-between gap-2 rounded-2xl border border-zinc-800 bg-black/30 p-4 text-sm sm:flex-row sm:items-center"
                >
                  <div>
                    <span className="font-black">
                      {row.request_kind === "artist" ? "Artista" : "Casa"} · {actionLabel(row.action)}
                    </span>
                    {row.reason && (
                      <span className="ml-2 text-zinc-400">— {row.reason}</span>
                    )}
                  </div>
                  <span className="text-xs text-zinc-600">{formatDate(row.created_at)}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
