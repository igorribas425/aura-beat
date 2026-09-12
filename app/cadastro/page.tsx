"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type TipoPerfil = "artist" | "venue";

export default function CadastroPage() {
  const router = useRouter();

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [tipo, setTipo] = useState<TipoPerfil>("artist");
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [usuarioJaExiste, setUsuarioJaExiste] = useState(false);

  function irParaLogin() {
    router.push("/login");
  }

  async function cadastrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMensagem("");
    setUsuarioJaExiste(false);

    if (nome.trim().length < 3) {
      setMensagem("Digite seu nome completo.");
      return;
    }

    if (senha.length < 6) {
      setMensagem("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    setCarregando(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: senha,
        options: {
          data: {
            full_name: nome.trim(),
          },
        },
      });

      if (error) {
        const textoErro = error.message.toLowerCase();
        const contaExistente =
          textoErro.includes("already registered") ||
          textoErro.includes("already exists") ||
          textoErro.includes("user already registered");

        if (contaExistente) {
          setUsuarioJaExiste(true);
          setMensagem("Este e-mail já possui uma conta no Aura Beat. Entre com seu e-mail e senha.");
        } else {
          setMensagem("Não foi possível criar a conta agora. Tente novamente.");
        }

        setCarregando(false);
        return;
      }

      const identidadeNova = data.user?.identities;
      if (data.user && Array.isArray(identidadeNova) && identidadeNova.length === 0) {
        setUsuarioJaExiste(true);
        setMensagem("Este e-mail já possui uma conta no Aura Beat. Entre com seu e-mail e senha.");
        setCarregando(false);
        return;
      }

      if (!data.user) {
        setMensagem("Não foi possível criar a conta.");
        setCarregando(false);
        return;
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: nome.trim(),
          default_mode: tipo,
        })
        .eq("id", data.user.id);

      if (profileError) {
        setMensagem("Conta criada, mas não foi possível preparar o perfil. Entre na conta para continuar.");
        setUsuarioJaExiste(true);
        setCarregando(false);
        return;
      }

      setMensagem("Conta criada com sucesso!");

      setTimeout(() => {
        if (tipo === "artist") {
          router.push("/perfil-artista");
        } else {
          router.push("/perfil-casa");
        }
      }, 700);
    } catch {
      setMensagem("Ocorreu um erro inesperado. Tente novamente.");
      setCarregando(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050507] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-10">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-red-500 via-red-600 to-purple-700 text-4xl font-black shadow-[0_0_45px_rgba(239,68,68,0.30)]">
            A
          </div>

          <h1 className="text-3xl font-black">
            AURA <span className="text-red-500">BEAT</span>
          </h1>

          <p className="mt-2 text-sm text-zinc-400">
            Conectando talentos aos melhores eventos.
          </p>
        </div>

        <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
          <h2 className="text-2xl font-bold">Criar conta</h2>

          <p className="mt-1 text-sm text-zinc-400">
            Como você quer começar?
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTipo("artist")}
              className={`rounded-2xl border p-4 text-left transition ${
                tipo === "artist"
                  ? "border-red-500 bg-red-500/10"
                  : "border-zinc-800 bg-zinc-900"
              }`}
            >
              <div className="text-3xl">🎧</div>
              <div className="mt-3 font-bold">Sou Artista</div>
              <div className="mt-1 text-xs text-zinc-400">
                DJs, MCs, bandas e talentos.
              </div>
            </button>

            <button
              type="button"
              onClick={() => setTipo("venue")}
              className={`rounded-2xl border p-4 text-left transition ${
                tipo === "venue"
                  ? "border-red-500 bg-red-500/10"
                  : "border-zinc-800 bg-zinc-900"
              }`}
            >
              <div className="text-3xl">🏢</div>
              <div className="mt-3 font-bold">Sou Casa</div>
              <div className="mt-1 text-xs text-zinc-400">
                Clubes, casas e contratantes.
              </div>
            </button>
          </div>

          <form onSubmit={cadastrar} className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium">
                Nome completo
              </label>

              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                type="text"
                placeholder="Seu nome"
                required
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                E-mail
              </label>

              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="voce@email.com"
                required
                autoComplete="email"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Senha
              </label>

              <input
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                type="password"
                placeholder="Mínimo 6 caracteres"
                minLength={6}
                required
                autoComplete="new-password"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
              />
            </div>

            <button
              disabled={carregando}
              type="submit"
              className="w-full rounded-xl bg-red-500 py-4 font-bold transition hover:bg-red-600 disabled:opacity-50"
            >
              {carregando ? "Criando conta..." : "Criar conta"}
            </button>

            {mensagem && (
              <div
                className={`rounded-xl border p-3 text-sm ${
                  usuarioJaExiste
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
                    : "border-zinc-800 bg-zinc-900 text-zinc-200"
                }`}
              >
                {mensagem}
              </div>
            )}

            {usuarioJaExiste && (
              <button
                type="button"
                onClick={irParaLogin}
                className="w-full rounded-xl border border-red-500/50 bg-red-500/10 py-3 font-bold text-red-200 transition hover:bg-red-500/20"
              >
                Entrar nessa conta
              </button>
            )}
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-zinc-600">
            <div className="h-px flex-1 bg-zinc-800" />
            <span>ou</span>
            <div className="h-px flex-1 bg-zinc-800" />
          </div>

          <button
            type="button"
            onClick={irParaLogin}
            className="w-full rounded-xl border border-zinc-800 py-3 text-sm font-medium text-zinc-300 transition hover:bg-zinc-900"
          >
            Já tenho conta
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-500">
          Música move pessoas. Aura Beat conecta.
        </p>
      </div>
    </main>
  );
}
