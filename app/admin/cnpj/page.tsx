"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getOwnerAccessFast } from "../../../lib/admin-access";
import { supabase } from "../../../lib/supabase";
import {
  formatCnpj,
  getCnpjLocalStatus,
  normalizeCnpj,
} from "../../../lib/cnpj";

type ProfileStatus =
  | "pending"
  | "verified"
  | "rejected"
  | "suspended"
  | "unverified"
  | null;

type VenueProfile = {
  id: string;
  trade_name: string | null;
  legal_name: string | null;
  cnpj: string;
  verification_status: ProfileStatus;
};

type VenueRequest = {
  id: string;
  venue_id: string;
  cnpj_snapshot: string;
  trade_name_snapshot: string;
  status: "pending" | "verified" | "rejected";
  submitted_at: string;
};

type RiskLevel = "ok" | "attention" | "critical";

type Row = {
  profile: VenueProfile;
  latestRequest: VenueRequest | null;
  duplicateCount: number;
  risk: RiskLevel;
  signals: string[];
};

function statusLabel(status: ProfileStatus) {
  switch (status) {
    case "verified":
      return "Verificada";
    case "rejected":
      return "Recusada";
    case "suspended":
      return "Suspensa";
    case "pending":
      return "Pendente";
    default:
      return "Não verificada";
  }
}

function riskLabel(level: RiskLevel) {
  if (level === "critical") return "Revisar agora";
  if (level === "attention") return "Atenção";
  return "Sem alerta local";
}

function riskClass(level: RiskLevel) {
  if (level === "critical") {
    return "border-red-500/30 bg-red-500/10 text-red-200";
  }
  if (level === "attention") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-100";
  }
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
}

export default function AdminCnpjPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<"all" | RiskLevel>("all");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const ownerAccess =
        await getOwnerAccessFast();

      if (!ownerAccess.authenticated) {
        router.replace("/login");
        return;
      }

      if (!ownerAccess.allowed) {
        setAccessDenied(true);
        setRows([]);
        return;
      }

      setAccessDenied(false);

      const [profilesResult, requestsResult] = await Promise.all([
        supabase
          .from("venue_profiles")
          .select("id,trade_name,legal_name,cnpj,verification_status")
          .order("trade_name", { ascending: true })
          .limit(2000),
        supabase
          .from("venue_verification_requests")
          .select("id,venue_id,cnpj_snapshot,trade_name_snapshot,status,submitted_at")
          .order("submitted_at", { ascending: false })
          .limit(2000),
      ]);

      if (profilesResult.error) throw profilesResult.error;
      if (requestsResult.error) throw requestsResult.error;

      const profiles = (profilesResult.data || []) as VenueProfile[];
      const requests = (requestsResult.data || []) as VenueRequest[];

      const latestRequestByVenue = new Map<string, VenueRequest>();
      for (const request of requests) {
        if (!latestRequestByVenue.has(request.venue_id)) {
          latestRequestByVenue.set(request.venue_id, request);
        }
      }

      const counts = new Map<string, number>();
      for (const profile of profiles) {
        const normalized = normalizeCnpj(profile.cnpj);
        if (!normalized) continue;
        counts.set(normalized, (counts.get(normalized) || 0) + 1);
      }

      const result: Row[] = profiles.map((profile) => {
        const normalized = normalizeCnpj(profile.cnpj);
        const localStatus = getCnpjLocalStatus(profile.cnpj);
        const latestRequest = latestRequestByVenue.get(profile.id) || null;
        const duplicateCount = counts.get(normalized) || 0;
        const signals: string[] = [];
        let risk: RiskLevel = "ok";

        if (localStatus === "numeric-invalid") {
          signals.push("CNPJ numérico não passou nos dígitos verificadores.");
          risk = "critical";
        } else if (localStatus === "invalid-format") {
          signals.push("Formato do CNPJ não possui 14 caracteres normalizados.");
          risk = "critical";
        } else if (localStatus === "alphanumeric-review") {
          signals.push(
            "CNPJ alfanumérico: exige revisão manual porque a checagem local numérica não se aplica.",
          );
          risk = "attention";
        } else {
          signals.push("CNPJ numérico passou na validação matemática local.");
        }

        if (duplicateCount > 1) {
          signals.push(`Mesmo CNPJ aparece em ${duplicateCount} perfis de Casa.`);
          risk = "critical";
        } else {
          signals.push("Nenhuma duplicidade local encontrada para este CNPJ.");
        }

        if (!profile.legal_name?.trim()) {
          signals.push("Razão social não informada no perfil.");
          if (risk === "ok") risk = "attention";
        }

        if (
          latestRequest &&
          normalizeCnpj(latestRequest.cnpj_snapshot) !== normalized
        ) {
          signals.push("CNPJ da última solicitação difere do CNPJ atual do perfil.");
          risk = "critical";
        }

        return {
          profile,
          latestRequest,
          duplicateCount,
          risk,
          signals,
        };
      });

      result.sort((a, b) => {
        const weight = { critical: 0, attention: 1, ok: 2 } as const;
        return weight[a.risk] - weight[b.risk];
      });

      setRows(result);
    } catch (err) {
      console.error(err);
      setError("Não foi possível carregar a análise gratuita de CNPJ.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleRows = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((row) => row.risk === filter);
  }, [filter, rows]);

  const counters = useMemo(
    () => ({
      all: rows.length,
      critical: rows.filter((row) => row.risk === "critical").length,
      attention: rows.filter((row) => row.risk === "attention").length,
      ok: rows.filter((row) => row.risk === "ok").length,
    }),
    [rows],
  );

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050507] text-white">
        <p className="text-zinc-400">Analisando CNPJs...</p>
      </main>
    );
  }

  if (accessDenied) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050507] px-4 text-white">
        <div className="max-w-lg rounded-3xl border border-red-500/30 bg-red-500/10 p-8 text-center">
          <h1 className="text-2xl font-black">Acesso restrito</h1>
          <p className="mt-3 text-sm text-red-100/80">
            Esta tela é exclusiva da equipe administrativa do Aura Beat.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050507] pb-16 text-white">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-400">
              Segurança gratuita
            </p>
            <h1 className="mt-2 text-3xl font-black">Análise local de CNPJ</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
              Verifica formato, dígitos verificadores dos CNPJs numéricos, duplicidade interna e divergência entre perfil e solicitação. Não consulta Receita Federal e não substitui análise documental.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => router.push("/admin/verificacoes")}
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-black text-zinc-300"
            >
              ← Verificações
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-black text-blue-200"
            >
              ↻ Atualizar
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-left"
          >
            <p className="text-2xl font-black">{counters.all}</p>
            <p className="text-xs text-zinc-500">Todos</p>
          </button>
          <button
            type="button"
            onClick={() => setFilter("critical")}
            className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-left"
          >
            <p className="text-2xl font-black text-red-300">{counters.critical}</p>
            <p className="text-xs text-zinc-500">Revisar agora</p>
          </button>
          <button
            type="button"
            onClick={() => setFilter("attention")}
            className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-left"
          >
            <p className="text-2xl font-black text-amber-200">{counters.attention}</p>
            <p className="text-xs text-zinc-500">Atenção</p>
          </button>
          <button
            type="button"
            onClick={() => setFilter("ok")}
            className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-left"
          >
            <p className="text-2xl font-black text-emerald-200">{counters.ok}</p>
            <p className="text-xs text-zinc-500">Sem alerta local</p>
          </button>
        </section>

        <section className="space-y-4">
          {visibleRows.length === 0 ? (
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-10 text-center text-zinc-500">
              Nenhuma Casa neste filtro.
            </div>
          ) : (
            visibleRows.map((row) => (
              <article
                key={row.profile.id}
                className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6"
              >
                <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-black ${riskClass(row.risk)}`}
                      >
                        {riskLabel(row.risk)}
                      </span>
                      <span className="rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-400">
                        {statusLabel(row.profile.verification_status)}
                      </span>
                    </div>

                    <h2 className="mt-4 text-2xl font-black">
                      {row.profile.trade_name || "Casa sem nome"}
                    </h2>
                    <p className="mt-1 text-sm text-zinc-400">
                      {row.profile.legal_name || "Razão social não informada"}
                    </p>
                    <p className="mt-2 font-mono text-sm text-zinc-300">
                      {formatCnpj(row.profile.cnpj)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-zinc-800 bg-black/30 px-4 py-3 text-xs text-zinc-500">
                    Última solicitação: {row.latestRequest ? row.latestRequest.status : "não enviada"}
                  </div>
                </div>

                <div className="mt-5 grid gap-2">
                  {row.signals.map((signal) => (
                    <div
                      key={signal}
                      className="rounded-xl border border-zinc-800 bg-black/30 px-4 py-3 text-sm text-zinc-300"
                    >
                      {signal}
                    </div>
                  ))}
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
