"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function ExcluirContaPage() {
  const [carregando, setCarregando] = useState(true);
  const [autenticado, setAutenticado] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  useEffect(() => {
    let ativo = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return;
      setAutenticado(Boolean(data.session?.user));
      setCarregando(false);
    });

    return () => {
      ativo = false;
    };
  }, []);

  async function solicitarExclusao() {
    setErro("");
    setMensagem("");

    if (confirmacao.trim().toUpperCase() !== "EXCLUIR") {
      setErro('Digite "EXCLUIR" para confirmar a solicitação.');
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setErro("Entre na sua conta antes de solicitar a exclusão.");
      setAutenticado(false);
      return;
    }

    try {
      setEnviando(true);

      const resposta = await fetch("/api/account/delete-request", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
      });

      const corpo = (await resposta.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (!resposta.ok) {
        throw new Error(corpo.error || "Não foi possível registrar a solicitação.");
      }

      setMensagem(
        corpo.message ||
          "Solicitação registrada. A equipe Aura Beat seguirá o processo de exclusão da conta.",
      );
      setConfirmacao("");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível registrar a solicitação.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050507] text-white">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <Link
          href={autenticado ? "/configuracoes" : "/login"}
          className="text-sm font-bold text-zinc-400 transition hover:text-white"
        >
          ← Voltar
        </Link>

        <header className="mt-8 rounded-3xl border border-red-950 bg-red-950/10 p-6 sm:p-8">
          <p className="text-xs font-black tracking-[0.2em] text-red-500">
            AURA BEAT
          </p>
          <h1 className="mt-3 text-3xl font-black">Exclusão de conta</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Aqui você pode solicitar a exclusão da sua conta e dos dados
            associados que não precisem ser mantidos por obrigação legal,
            fiscal, segurança ou prevenção a fraude.
          </p>
        </header>

        <section className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
          <h2 className="text-xl font-black">O que acontece após a solicitação?</h2>
          <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-400">
            <p>• Seu pedido fica registrado para processamento pela equipe Aura Beat.</p>
            <p>• Perfis e dados que possam ser excluídos serão removidos ou anonimizados.</p>
            <p>
              • Registros que precisem ser mantidos por obrigação legal, fiscal,
              segurança ou prevenção a fraude poderão ser retidos pelo período necessário.
            </p>
            <p>
              • Se houver contratação, disputa ou pagamento em andamento, a análise
              poderá considerar esses registros antes da conclusão.
            </p>
          </div>
        </section>

        {erro && (
          <div className="mt-6 rounded-2xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
            {erro}
          </div>
        )}

        {mensagem && (
          <div className="mt-6 rounded-2xl border border-green-900 bg-green-950/30 p-4 text-sm text-green-300">
            {mensagem}
          </div>
        )}

        {carregando ? (
          <div className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-950 p-6 text-sm text-zinc-400">
            Verificando sua sessão...
          </div>
        ) : autenticado ? (
          <section className="mt-6 rounded-3xl border border-red-900/60 bg-zinc-950 p-6">
            <h2 className="text-xl font-black">Solicitar exclusão</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Para evitar solicitações acidentais, digite{" "}
              <strong className="text-white">EXCLUIR</strong> abaixo.
            </p>

            <input
              type="text"
              value={confirmacao}
              onChange={(event) => setConfirmacao(event.target.value)}
              placeholder="Digite EXCLUIR"
              className="mt-5 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none focus:border-red-500"
            />

            <button
              type="button"
              disabled={enviando || confirmacao.trim().toUpperCase() !== "EXCLUIR"}
              onClick={solicitarExclusao}
              className="mt-4 w-full rounded-xl bg-red-600 px-5 py-3 font-black hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {enviando ? "Registrando solicitação..." : "Solicitar exclusão da conta"}
            </button>
          </section>
        ) : (
          <section className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-xl font-black">Entre na sua conta</h2>
            <p className="mt-2 text-sm text-zinc-400">
              A autenticação é necessária para confirmar que a solicitação pertence
              ao titular da conta.
            </p>
            <Link
              href="/login"
              className="mt-5 inline-flex rounded-xl bg-red-500 px-5 py-3 font-black hover:bg-red-600"
            >
              Entrar na Aura Beat
            </Link>
          </section>
        )}

        <p className="mt-6 text-xs leading-5 text-zinc-600">
          Dúvidas sobre privacidade ou exclusão podem ser enviadas para
          {" "}
          <a href="mailto:igorribas425@gmail.com" className="text-zinc-400 underline">
            igorribas425@gmail.com
          </a>
          .
        </p>
      </div>
    </main>
  );
}
