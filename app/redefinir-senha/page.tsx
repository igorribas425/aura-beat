"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { PASSWORD_REQUIREMENTS_TEXT, passwordMeetsRequirements } from "../../lib/password";
import { supabase } from "../../lib/supabase";

export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [pronto, setPronto] = useState(false);
  const [sessaoValida, setSessaoValida] = useState(false);
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    let recuperacaoConfirmada = false;

    const currentUrl = new URL(window.location.href);
    const temSinalDeRecuperacao =
      currentUrl.hash.includes("type=recovery") ||
      currentUrl.searchParams.get("type") === "recovery" ||
      currentUrl.searchParams.has("code");

    const fallback = window.setTimeout(
      () => {
        if (!ativo || recuperacaoConfirmada) return;

        // Uma sessão comum não autoriza a troca de senha por esta rota.
        // Sem o evento PASSWORD_RECOVERY, voltamos ao login normal.
        router.replace("/login");
      },
      temSinalDeRecuperacao ? 5000 : 800,
    );

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!ativo) return;

      if (event === "PASSWORD_RECOVERY" && session?.user) {
        recuperacaoConfirmada = true;
        window.clearTimeout(fallback);
        setSessaoValida(true);
        setPronto(true);
      }
    });

    return () => {
      ativo = false;
      window.clearTimeout(fallback);
      subscription.unsubscribe();
    };
  }, [router]);

  async function redefinir(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro("");
    setMensagem("");

    if (!passwordMeetsRequirements(senha)) {
      setErro(PASSWORD_REQUIREMENTS_TEXT);
      return;
    }

    if (senha !== confirmar) {
      setErro("As duas senhas não são iguais.");
      return;
    }

    try {
      setSalvando(true);

      const { error } = await supabase.auth.updateUser({
        password: senha,
      });

      if (error) throw error;

      setSenha("");
      setConfirmar("");
      setMensagem("Senha redefinida com sucesso. Você já pode entrar no Aura Beat.");
    } catch (cause) {
      console.error(cause);
      setErro("Não foi possível redefinir a senha. Solicite um novo link de recuperação.");
    } finally {
      setSalvando(false);
    }
  }

  if (!pronto) {
    return (
      <main className="aura-page flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-zinc-800 border-t-red-500" />
          <p className="text-zinc-400">Validando link de recuperação...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="aura-page">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-10">
        <section className="aura-card rounded-3xl border p-5">
          <p className="text-xs font-black tracking-[0.18em] text-red-500">AURA BEAT</p>
          <h1 className="mt-2 text-2xl font-black">Redefinir senha</h1>

          {!sessaoValida ? (
            <>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Este link de recuperação não está mais válido. Solicite um novo link.
              </p>
              <Link
                href="/recuperar-senha"
                className="mt-5 block rounded-xl bg-red-500 px-5 py-3 text-center font-black hover:bg-red-600"
              >
                Solicitar novo link
              </Link>
            </>
          ) : (
            <form onSubmit={redefinir} className="mt-6 space-y-4">
              <p className="text-sm leading-6 text-zinc-400">
                {PASSWORD_REQUIREMENTS_TEXT}
              </p>

              <div>
                <label className="mb-2 block text-sm font-medium">Nova senha</label>
                <input
                  type="password"
                  value={senha}
                  onChange={(event) => setSenha(event.target.value)}
                  minLength={8}
                  required
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none transition focus:border-red-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Confirmar nova senha</label>
                <input
                  type="password"
                  value={confirmar}
                  onChange={(event) => setConfirmar(event.target.value)}
                  minLength={8}
                  required
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none transition focus:border-red-500"
                />
              </div>

              {erro && (
                <div className="rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">
                  {erro}
                </div>
              )}

              {mensagem && (
                <div className="rounded-xl border border-green-900 bg-green-950/30 p-3 text-sm text-green-300">
                  {mensagem}
                </div>
              )}

              <button
                type="submit"
                disabled={salvando}
                className="w-full rounded-xl bg-red-500 py-4 font-bold transition hover:bg-red-600 disabled:opacity-50"
              >
                {salvando ? "Salvando..." : "Salvar nova senha"}
              </button>

              {mensagem && (
                <Link
                  href="/login"
                  className="block w-full rounded-xl border border-zinc-800 py-3 text-center text-sm font-bold text-zinc-300 hover:bg-zinc-900"
                >
                  Ir para o login
                </Link>
              )}
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
