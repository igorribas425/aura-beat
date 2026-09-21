"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatBRL } from "../../lib/finance";
import {
  getMyPlanAccess,
  hasPlanBenefit,
  type PlanAccess,
} from "../../lib/plan-access";
import { supabase } from "../../lib/supabase";

type TopArtist = {
  artist_id: string;
  stage_name: string;
  bookings_count: number;
  contracted_value: number | string;
};

type VenueReport = {
  period_days: number;
  period_start: string;
  total_bookings: number;
  completed_bookings: number;
  cancelled_bookings: number;
  active_bookings: number;
  awaiting_payment: number;
  contracted_value: number | string;
  average_contract_value: number | string;
  upcoming_events: number;
  top_artists: TopArtist[];
};

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function VenueReportsPage() {
  const router = useRouter();
  const [access, setAccess] = useState<PlanAccess | null>(null);
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<VenueReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState("");

  const canUseReports = hasPlanBenefit(access, "reports");

  const loadReport = useCallback(async (period: number) => {
    setReportLoading(true);
    setError("");

    try {
      const { data, error: reportError } = await supabase.rpc(
        "venue_reports_v1",
        { p_days: period },
      );

      if (reportError) throw reportError;
      setReport((data || null) as VenueReport | null);
    } catch (caught) {
      console.error(caught);
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível carregar o relatório.",
      );
    } finally {
      setReportLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
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

        const plan = await getMyPlanAccess("venue");

        if (!active) return;
        setAccess(plan);

        if (hasPlanBenefit(plan, "reports")) {
          await loadReport(days);
        }
      } catch (caught) {
        console.error(caught);
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Não foi possível carregar o módulo.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [days, loadReport, router]);

  async function changePeriod(nextDays: number) {
    setDays(nextDays);

    if (canUseReports) {
      await loadReport(nextDays);
    }
  }

  if (loading) {
    return (
      <main className="aura-page flex min-h-[70vh] items-center justify-center text-zinc-400">
        Carregando relatórios…
      </main>
    );
  }

  if (!canUseReports) {
    return (
      <main className="aura-page px-4 py-8">
        <div className="mx-auto max-w-4xl">
          <section className="rounded-3xl border border-purple-500/30 bg-purple-500/5 p-7 sm:p-9">
            <div className="text-4xl">🔒</div>
            <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-purple-300">
              RECURSO PREMIUM
            </p>
            <h1 className="mt-2 text-3xl font-black">
              Relatórios avançados
            </h1>
            <p className="mt-3 max-w-2xl leading-7 text-zinc-400">
              Este módulo é liberado nos planos Intermediário e Pro. Ele reúne
              contratações, eventos concluídos, cancelamentos, valor médio e
              Artistas mais contratados.
            </p>
            <p className="mt-4 text-sm text-zinc-500">
              Plano atual: {access?.active ? access.planName : "sem plano ativo"}.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => router.push("/planos-casa")}
                className="rounded-xl bg-purple-600 px-5 py-3 font-black text-white"
              >
                Ver planos
              </button>
              <button
                type="button"
                onClick={() => router.push("/home-casa")}
                className="rounded-xl border border-zinc-800 px-5 py-3 font-bold text-zinc-300"
              >
                Voltar
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const topArtists = report?.top_artists || [];
  const totalBookings = number(report?.total_bookings);
  const completed = number(report?.completed_bookings);
  const cancellationRate =
    totalBookings > 0
      ? (number(report?.cancelled_bookings) / totalBookings) * 100
      : 0;

  return (
    <main className="aura-page px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="aura-hero aura-venue-hero rounded-3xl p-6 sm:p-8">
          <p className="aura-kicker">RELATÓRIOS DA CASA</p>
          <div className="mt-2 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black">Visão da operação</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                Dados de contratações e eventos para ajudar a Casa a tomar decisões.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {[7, 30, 90, 365].map((period) => (
                <button
                  key={period}
                  type="button"
                  disabled={reportLoading}
                  onClick={() => void changePeriod(period)}
                  className={`rounded-xl border px-4 py-2 text-sm font-black ${
                    days === period
                      ? "border-purple-500 bg-purple-500/10 text-purple-200"
                      : "border-zinc-800 text-zinc-400"
                  }`}
                >
                  {period === 365 ? "1 ano" : `${period} dias`}
                </button>
              ))}
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {reportLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-950" />
            ))}
          </div>
        ) : report ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="aura-stat rounded-2xl border p-5">
                <p className="text-xs text-zinc-500">Contratações</p>
                <p className="mt-2 text-3xl font-black">{totalBookings}</p>
                <p className="mt-1 text-xs text-zinc-600">no período</p>
              </div>

              <div className="aura-stat rounded-2xl border p-5">
                <p className="text-xs text-zinc-500">Concluídos</p>
                <p className="mt-2 text-3xl font-black text-green-400">{completed}</p>
                <p className="mt-1 text-xs text-zinc-600">eventos finalizados</p>
              </div>

              <div className="aura-stat rounded-2xl border p-5">
                <p className="text-xs text-zinc-500">Próximos eventos</p>
                <p className="mt-2 text-3xl font-black text-purple-300">
                  {number(report.upcoming_events)}
                </p>
                <p className="mt-1 text-xs text-zinc-600">confirmados/aguardando</p>
              </div>

              <div className="aura-stat rounded-2xl border p-5">
                <p className="text-xs text-zinc-500">Cancelamentos</p>
                <p className="mt-2 text-3xl font-black text-amber-300">
                  {cancellationRate.toFixed(0)}%
                </p>
                <p className="mt-1 text-xs text-zinc-600">
                  {number(report.cancelled_bookings)} no período
                </p>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
              <article className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-green-400">
                  VALOR CONTRATADO
                </p>
                <p className="mt-3 text-3xl font-black">
                  {formatBRL(number(report.contracted_value))}
                </p>
                <p className="mt-2 text-xs leading-5 text-zinc-500">
                  Cachê + deslocamento + pedágio + hospedagem. Comissão interna da
                  Aura Beat não aparece aqui.
                </p>
              </article>

              <article className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-purple-300">
                  MÉDIA POR CONTRATAÇÃO
                </p>
                <p className="mt-3 text-3xl font-black">
                  {formatBRL(number(report.average_contract_value))}
                </p>
                <p className="mt-2 text-xs text-zinc-500">
                  média dos contratos não cancelados
                </p>
              </article>

              <article className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-300">
                  EM ANDAMENTO
                </p>
                <p className="mt-3 text-3xl font-black">
                  {number(report.active_bookings)}
                </p>
                <p className="mt-2 text-xs text-zinc-500">
                  confirmados, deslocamento ou evento em andamento
                </p>
              </article>
            </section>

            <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">
                ARTISTAS MAIS CONTRATADOS
              </p>
              <h2 className="mt-2 text-2xl font-black">Top do período</h2>

              {topArtists.length === 0 ? (
                <p className="mt-5 text-sm text-zinc-500">
                  Ainda não há contratações suficientes neste período.
                </p>
              ) : (
                <div className="mt-5 space-y-3">
                  {topArtists.map((artist, index) => (
                    <div
                      key={artist.artist_id}
                      className="flex flex-col justify-between gap-3 rounded-2xl border border-zinc-800 bg-black/30 p-4 sm:flex-row sm:items-center"
                    >
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 place-items-center rounded-full bg-purple-500/10 font-black text-purple-300">
                          {index + 1}
                        </span>
                        <div>
                          <p className="font-black">{artist.stage_name}</p>
                          <p className="text-xs text-zinc-500">
                            {number(artist.bookings_count)} contratação(ões)
                          </p>
                        </div>
                      </div>
                      <strong className="text-green-400">
                        {formatBRL(number(artist.contracted_value))}
                      </strong>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}

        <button
          type="button"
          onClick={() => router.push("/home-casa")}
          className="rounded-xl border border-zinc-800 px-5 py-3 text-sm font-black text-zinc-300"
        >
          ← Voltar para Home
        </button>
      </div>
    </main>
  );
}
