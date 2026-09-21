"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type AccessState =
  | "loading"
  | "allowed"
  | "denied";

export default function AdminHomePage() {
  const router = useRouter();
  const [access, setAccess] =
    useState<AccessState>("loading");
  const [sessionEmail, setSessionEmail] = useState("");

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;

      if (!user) {
        router.replace("/login");
        return;
      }

      setSessionEmail(user.email || "");

      const { data, error } = await supabase.rpc(
        "owner_access_v1"
      );

      if (!active) return;

      if (error || data !== true) {
        setAccess("denied");
        return;
      }

      setAccess("allowed");
    }

    void checkAccess();

    return () => {
      active = false;
    };
  }, [router]);

  if (access === "loading") {
    return (
      <main className="aura-page flex min-h-[70vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-zinc-800 border-t-red-500" />
          <p className="text-zinc-400">
            Verificando acesso administrativo…
          </p>
        </div>
      </main>
    );
  }

  if (access === "denied") {
    return (
      <main className="aura-page flex min-h-[70vh] items-center justify-center px-4">
        <section className="max-w-lg rounded-3xl border border-red-900/50 bg-red-950/10 p-8 text-center">
          <div className="text-5xl">🔒</div>
          <h1 className="mt-4 text-2xl font-black">
            Acesso restrito
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Esta área é exclusiva do proprietário administrativo da Aura Beat.
          </p>

          {sessionEmail && (
            <p className="mt-4 rounded-xl border border-zinc-800 bg-black/30 px-4 py-3 text-xs text-zinc-500">
              Sessão atual: <span className="font-bold text-zinc-300">{sessionEmail}</span>
            </p>
          )}

          {sessionEmail && sessionEmail !== "igorribas425@gmail.com" && (
            <p className="mt-3 text-xs leading-5 text-amber-300">
              Entre com a conta principal igorribas425@gmail.com para acessar a Central Mestre.
            </p>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="aura-page px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="aura-hero rounded-3xl p-6 sm:p-8">
          <p className="aura-kicker">
            ACESSO PRIVADO
          </p>

          <h1 className="mt-2 text-3xl font-black">
            Central Administrativa Aura Beat
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
            Esta página não aparece nos menus de Casa ou Artista.
            O acesso é validado pelo seu perfil de proprietário.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Link
            href="/admin/financeiro"
            className="rounded-3xl border border-green-900/50 bg-green-950/10 p-6 transition hover:border-green-500/60"
          >
            <div className="text-3xl">💰</div>
            <h2 className="mt-4 text-xl font-black">
              Financeiro Aura Beat
            </h2>
            <p className="mt-2 text-sm text-zinc-500">
              Comissões, ASAAS, pagamentos e repasses.
            </p>
          </Link>

          <Link
            href="/admin/verificacoes"
            className="rounded-3xl border border-blue-900/50 bg-blue-950/10 p-6 transition hover:border-blue-500/60"
          >
            <div className="text-3xl">✅</div>
            <h2 className="mt-4 text-xl font-black">
              Verificações
            </h2>
            <p className="mt-2 text-sm text-zinc-500">
              Análise de Artistas e Casas.
            </p>
          </Link>

          <Link
            href="/admin/planos"
            className="rounded-3xl border border-amber-900/50 bg-amber-950/10 p-6 transition hover:border-amber-500/60"
          >
            <div className="text-3xl">💎</div>
            <h2 className="mt-4 text-xl font-black">
              Planos e assinaturas
            </h2>
            <p className="mt-2 text-sm text-zinc-500">
              Valores, benefícios, planos de DJs/Casas e cancelamentos.
            </p>
          </Link>

          <Link
            href="/admin/cnpj"
            className="rounded-3xl border border-purple-900/50 bg-purple-950/10 p-6 transition hover:border-purple-500/60"
          >
            <div className="text-3xl">🏢</div>
            <h2 className="mt-4 text-xl font-black">
              CNPJ
            </h2>
            <p className="mt-2 text-sm text-zinc-500">
              Consulta e validação administrativa.
            </p>
          </Link>
        </section>
      </div>
    </main>
  );
}
