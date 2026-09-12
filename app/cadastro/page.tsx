"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type TipoPerfil = "artist" | "venue";
type Etapa = "perfil" | "dados";

export default function CadastroPage() {
  const router = useRouter();

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [tipo, setTipo] = useState<TipoPerfil>("artist");
  const [etapa, setEtapa] = useState<Etapa>("perfil");
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [usuarioJaExiste, setUsuarioJaExiste] = useState(false);

  function irParaLogin() {
    router.push("/login");
  }

  function escolherPerfil(novoTipo: TipoPerfil) {
    setTipo(novoTipo);
    setMensagem("");
    setUsuarioJaExiste(false);
    setEtapa("dados");
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
          setMensagem(
            "Este e-mail já possui uma conta no Aura Beat. Entre com seu e-mail e senha.",
          );
        } else {
          setMensagem("Não foi possível criar a conta agora. Tente novamente.");
        }

        setCarregando(false);
        return;
      }

      const identidadeNova = data.user?.identities;
      if (data.user && Array.isArray(identidadeNova) && identidadeNova.length === 0) {
        setUsuarioJaExiste(true);
        setMensagem(
          "Este e-mail já possui uma conta no Aura Beat. Entre com seu e-mail e senha.",
        );
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
        setMensagem(
          "Conta criada, mas não foi possível preparar o perfil. Entre na conta para continuar.",
        );
        setUsuarioJaExiste(true);
        setCarregando(false);
        return;
      }

      setMensagem("Conta criada com sucesso!");

      setTimeout(() => {
        router.push(tipo === "artist" ? "/perfil-artista" : "/perfil-casa");
      }, 700);
    } catch {
      setMensagem("Ocorreu um erro inesperado. Tente novamente.");
      setCarregando(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050507] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-purple-700/15 blur-3xl" />
        <div className="absolute -right-24 top-1/3 h-80 w-80 rounded-full bg-red-600/15 blur-3xl" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-red-950/10 to-transparent" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-5 py-10 sm:px-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[26px] border border-white/10 bg-gradient-to-br from-red-500 via-red-600 to-purple-700 text-4xl font-black shadow-[0_0_55px_rgba(239,68,68,0.30)]">
            A
          </div>

          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            AURA <span className="text-red-500">BEAT</span>
          </h1>

          <p className="mt-2 text-sm text-zinc-400 sm:text-base">
            Conectando talentos aos melhores eventos.
          </p>
        </div>

        {etapa === "perfil" ? (
          <section className="mx-auto w-full max-w-4xl rounded-[32px] border border-zinc-800 bg-zinc-950/90 p-5 shadow-2xl backdrop-blur sm:p-8">
            <div className="text-center">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-red-500">
                Crie sua conta
              </p>
              <h2 className="mt-2 text-2xl font-black sm:text-3xl">Como você vai usar o Aura Beat?</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-400">
                Escolha seu perfil inicial. Depois você poderá ter Artista e Casa na mesma conta.
              </p>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <button
                type="button"
                onClick={() => escolherPerfil("artist")}
                className="group relative min-h-[230px] overflow-hidden rounded-[28px] border border-purple-500/30 bg-gradient-to-br from-purple-950/50 via-zinc-950 to-zinc-950 p-6 text-left shadow-[0_18px_45px_rgba(88,28,135,0.16)] transition hover:border-purple-400/60"
              >
                <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-purple-500/15 blur-3xl" />
                <div className="relative flex h-full flex-col">
                  <div className="grid h-14 w-14 place-items-center rounded-2xl border border-purple-400/30 bg-purple-500/10 text-3xl shadow-[0_0_30px_rgba(168,85,247,0.18)]">
                    🎧
                  </div>

                  <p className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-purple-400">
                    Perfil Artista
                  </p>
                  <h3 className="mt-2 text-2xl font-black">Sou Artista</h3>
                  <p className="mt-2 max-w-sm text-sm text-zinc-400">
                    DJs, MCs, bandas e talentos que querem encontrar eventos, receber ofertas e divulgar seu trabalho.
                  </p>

                  <div className="mt-auto pt-5 text-sm font-black text-purple-300">
                    Continuar como Artista →
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => escolherPerfil("venue")}
                className="group relative min-h-[230px] overflow-hidden rounded-[28px] border border-red-500/30 bg-gradient-to-br from-red-950/45 via-zinc-950 to-zinc-950 p-6 text-left shadow-[0_18px_45px_rgba(127,29,29,0.16)] transition hover:border-red-400/60"
              >
                <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-red-500/15 blur-3xl" />
                <div className="relative flex h-full flex-col">
                  <div className="grid h-14 w-14 place-items-center rounded-2xl border border-red-400/30 bg-red-500/10 text-3xl shadow-[0_0_30px_rgba(239,68,68,0.18)]">
                    🏢
                  </div>

                  <p className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-red-400">
                    Perfil Casa
                  </p>
                  <h3 className="mt-2 text-2xl font-black">Sou Casa</h3>
                  <p className="mt-2 max-w-sm text-sm text-zinc-400">
                    Clubes, casas noturnas, produtores e contratantes que procuram artistas para seus eventos.
                  </p>

                  <div className="mt-auto pt-5 text-sm font-black text-red-300">
                    Continuar como Casa →
                  </div>
                </div>
              </button>
            </div>

            <div className="mt-7 flex items-center justify-center gap-2 text-sm text-zinc-500">
              <span>Já possui conta?</span>
              <button type="button" onClick={irParaLogin} className="font-black text-red-400 hover:text-red-300">
                Entrar
              </button>
            </div>
          </section>
        ) : (
          <section className="mx-auto w-full max-w-xl rounded-[32px] border border-zinc-800 bg-zinc-950/90 p-5 shadow-2xl backdrop-blur sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <button
                  type="button"
                  onClick={() => setEtapa("perfil")}
                  className="mb-5 rounded-xl border border-zinc-800 px-3 py-2 text-xs font-bold text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900"
                >
                  ← Trocar perfil
                </button>

                <p className={`text-xs font-black uppercase tracking-[0.18em] ${tipo === "artist" ? "text-purple-400" : "text-red-400"}`}>
                  {tipo === "artist" ? "🎧 Cadastro de Artista" : "🏢 Cadastro de Casa"}
                </p>
                <h2 className="mt-2 text-2xl font-black sm:text-3xl">Crie sua conta</h2>
                <p className="mt-2 text-sm text-zinc-400">
                  Preencha seus dados para começar no Aura Beat.
                </p>
              </div>

              <div
                className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl border text-2xl ${
                  tipo === "artist"
                    ? "border-purple-500/30 bg-purple-500/10"
                    : "border-red-500/30 bg-red-500/10"
                }`}
              >
                {tipo === "artist" ? "🎧" : "🏢"}
              </div>
            </div>

            <form onSubmit={cadastrar} className="mt-7 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-bold text-zinc-300">Nome completo</label>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  type="text"
                  placeholder="Seu nome"
                  required
                  autoComplete="name"
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3.5 outline-none transition focus:border-red-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-zinc-300">E-mail</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="voce@email.com"
                  required
                  autoComplete="email"
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3.5 outline-none transition focus:border-red-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-zinc-300">Senha</label>
                <input
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                  required
                  autoComplete="new-password"
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3.5 outline-none transition focus:border-red-500"
                />
              </div>

              <button
                disabled={carregando}
                type="submit"
                className={`w-full rounded-2xl py-4 font-black text-white shadow-lg transition disabled:opacity-50 ${
                  tipo === "artist"
                    ? "bg-gradient-to-r from-purple-600 to-red-500 hover:from-purple-500 hover:to-red-500"
                    : "bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400"
                }`}
              >
                {carregando
                  ? "Criando conta..."
                  : tipo === "artist"
                    ? "Criar conta de Artista"
                    : "Criar conta de Casa"}
              </button>

              {mensagem && (
                <div
                  className={`rounded-2xl border p-3.5 text-sm ${
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
                  className="w-full rounded-2xl border border-red-500/40 bg-red-500/10 py-3.5 font-black text-red-200 transition hover:bg-red-500/15"
                >
                  Entrar nessa conta
                </button>
              )}
            </form>

            <div className="my-6 flex items-center gap-3 text-xs text-zinc-600">
              <div className="h-px flex-1 bg-zinc-800" />
              <span>ou</span>
              <div className="h-px flex-1 bg-zinc-800" />
            </div>

            <button
              type="button"
              onClick={irParaLogin}
              className="w-full rounded-2xl border border-zinc-800 py-3.5 text-sm font-bold text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-900"
            >
              Já tenho conta
            </button>
          </section>
        )}

        <p className="mt-7 text-center text-xs text-zinc-500">Música move pessoas. Aura Beat conecta.</p>
      </div>
    </main>
  );
}
