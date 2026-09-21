"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

type AccessState = "loading" | "allowed" | "denied";

export default function AdminSupportAiPage() {
  const router = useRouter();
  const [access, setAccess] = useState<AccessState>("loading");
  const [email, setEmail] = useState("");

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

      setEmail(user.email || "");

      const { data, error } = await supabase.rpc("owner_access_v1");

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
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-zinc-800 border-t-cyan-400" />
          <p className="text-zinc-400">Verificando acesso da IA…</p>
        </div>
      </main>
    );
  }

  if (access === "denied") {
    return (
      <main className="aura-page flex min-h-[70vh] items-center justify-center px-4">
        <section className="max-w-lg rounded-3xl border border-red-900/50 bg-red-950/10 p-8 text-center">
          <div className="text-5xl">🔒</div>
          <h1 className="mt-4 text-2xl font-black">Acesso restrito</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            A configuração futura da IA fica disponível somente para o proprietário administrativo.
          </p>
          {email && (
            <p className="mt-4 rounded-xl border border-zinc-800 bg-black/30 px-4 py-3 text-xs text-zinc-500">
              Sessão atual: <span className="font-bold text-zinc-300">{email}</span>
            </p>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="aura-page px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 via-zinc-950 to-purple-500/10 p-6 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">
                ADMIN · AUTOMAÇÃO FUTURA
              </p>
              <h1 className="mt-2 text-3xl font-black">🤖 IA do Suporte Aura</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
                Esta é a área reservada para configurarmos a IA do atendimento no futuro,
                sem aparecer para Artistas, Casas ou para a Equipe Aura.
              </p>
            </div>

            <span className="w-fit rounded-full border border-zinc-700 bg-black/40 px-4 py-2 text-xs font-black text-zinc-400">
              ○ IA DESATIVADA
            </span>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-purple-300">
              QUANDO ATIVARMOS
            </p>
            <h2 className="mt-2 text-xl font-black">Comportamento da IA</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Aqui vamos decidir em quais situações a IA poderá responder.
            </p>

            <div className="mt-5 space-y-3">
              <label className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-black/30 p-4">
                <span>
                  <strong className="block text-sm">Somente quando eu estiver ausente</strong>
                  <span className="mt-1 block text-xs text-zinc-500">
                    Recomendado para começar.
                  </span>
                </span>
                <input type="checkbox" checked disabled className="h-5 w-5 accent-cyan-400" />
              </label>

              <label className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-black/30 p-4 opacity-60">
                <span>
                  <strong className="block text-sm">Responder automaticamente</strong>
                  <span className="mt-1 block text-xs text-zinc-500">
                    Só será liberado após conectarmos um modelo real.
                  </span>
                </span>
                <input type="checkbox" disabled className="h-5 w-5" />
              </label>

              <label className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-black/30 p-4 opacity-60">
                <span>
                  <strong className="block text-sm">Pedir aprovação antes de enviar</strong>
                  <span className="mt-1 block text-xs text-zinc-500">
                    IA prepara a resposta e você confirma.
                  </span>
                </span>
                <input type="checkbox" disabled className="h-5 w-5" />
              </label>
            </div>
          </article>

          <article className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">
              CONEXÃO
            </p>
            <h2 className="mt-2 text-xl font-black">Modelo e provedor</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Nenhuma chave ou modelo será exposto no navegador. A conexão futura ficará no backend.
            </p>

            <div className="mt-5 grid gap-4">
              <label className="text-xs font-bold text-zinc-500">
                Provedor
                <input
                  value="Ainda não conectado"
                  disabled
                  className="mt-2 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-zinc-500"
                />
              </label>

              <label className="text-xs font-bold text-zinc-500">
                Modelo
                <input
                  value="A definir"
                  disabled
                  className="mt-2 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-zinc-500"
                />
              </label>

              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm leading-6 text-amber-200">
                Nenhum motor de IA está ativo hoje. O Suporte Aura continua funcionando normalmente com atendimento humano e Modo Ausente.
              </div>
            </div>
          </article>
        </section>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">
            INSTRUÇÕES FUTURAS
          </p>
          <h2 className="mt-2 text-xl font-black">Base de comportamento</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            Quando conectarmos a IA, esta parte poderá definir como ela deve atender:
            tom de voz, limites, assuntos que pode resolver e quando chamar uma pessoa da equipe.
          </p>

          <textarea
            rows={7}
            disabled
            value={
              "Exemplo futuro:\n- Responder em português do Brasil.\n- Nunca prometer pagamento ou aprovação.\n- Encaminhar casos financeiros, banimentos e verificações para um humano.\n- Priorizar usuários Pro.\n- Identificar-se claramente como assistente automatizado."
            }
            readOnly
            className="mt-5 w-full resize-none rounded-2xl border border-zinc-800 bg-black px-4 py-4 text-sm leading-6 text-zinc-500"
          />

          <p className="mt-3 text-xs text-zinc-600">
            Esses campos estão bloqueados agora porque ainda não existe um motor de IA conectado.
          </p>
        </section>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/suporte"
            className="rounded-xl border border-zinc-700 px-5 py-3 text-sm font-black text-zinc-300 hover:border-cyan-500/50"
          >
            ← Voltar ao Suporte Aura
          </Link>

          <Link
            href="/admin"
            className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-black text-black"
          >
            Voltar ao Admin
          </Link>
        </div>
      </div>
    </main>
  );
}
