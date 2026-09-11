"use client";

import { FormEvent, useState } from "react";
import { supabase } from "../../lib/supabase";

type TipoPerfil = "artist" | "venue";

export default function CadastroPage() {
  const [modo, setModo] = useState<"cadastro" | "login">("cadastro");
  const [tipoPerfil, setTipoPerfil] = useState<TipoPerfil>("artist");

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");

  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState("");

  async function irParaPerfil(
    userId: string,
    fallback?: TipoPerfil
  ) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("default_mode")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.log("Erro ao buscar perfil:", error.message);
    }

    const tipo =
      profile?.default_mode || fallback || "artist";

    if (tipo === "venue") {
      window.location.href = "/perfil-casa";
    } else {
      window.location.href = "/perfil-artista";
    }
  }

  async function enviarFormulario(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setMensagem("");
    setCarregando(true);

    try {
      if (modo === "cadastro") {
        if (!nome.trim()) {
          setMensagem("Digite seu nome.");
          return;
        }

        if (!email.trim()) {
          setMensagem("Digite seu e-mail.");
          return;
        }

        if (senha.length < 6) {
          setMensagem(
            "A senha precisa ter pelo menos 6 caracteres."
          );
          return;
        }

        const { data, error } =
          await supabase.auth.signUp({
            email: email.trim(),
            password: senha,
            options: {
              data: {
                full_name: nome.trim(),
                account_type: tipoPerfil,
              },
            },
          });

        if (error) {
          setMensagem("❌ " + error.message);
          return;
        }

        if (!data.user) {
          setMensagem(
            "❌ Não foi possível criar o usuário."
          );
          return;
        }

        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            full_name: nome.trim(),
            default_mode: tipoPerfil,
          })
          .eq("id", data.user.id);

        if (profileError) {
          console.log(
            "Erro ao atualizar profile:",
            profileError.message
          );
        }

        setMensagem(
          "✅ Conta criada! Abrindo seu perfil..."
        );

        setTimeout(() => {
          irParaPerfil(data.user!.id, tipoPerfil);
        }, 500);
      } else {
        if (!email.trim()) {
          setMensagem("Digite seu e-mail.");
          return;
        }

        if (!senha) {
          setMensagem("Digite sua senha.");
          return;
        }

        const { data, error } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password: senha,
          });

        if (error) {
          setMensagem("❌ " + error.message);
          return;
        }

        if (!data.user) {
          setMensagem(
            "❌ Usuário não encontrado."
          );
          return;
        }

        setMensagem(
          "✅ Login realizado! Entrando..."
        );

        setTimeout(() => {
          irParaPerfil(data.user.id);
        }, 500);
      }
    } catch (error) {
      console.error(error);

      setMensagem(
        "❌ Ocorreu um erro. Tente novamente."
      );
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#07080b] text-white flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-red-500 via-red-600 to-purple-600 text-4xl font-black shadow-[0_0_40px_rgba(239,68,68,0.25)]">
            A
          </div>

          <h1 className="text-4xl font-black tracking-tight">
            AURA{" "}
            <span className="text-red-500">
              BEAT
            </span>
          </h1>

          <p className="mt-2 text-sm text-zinc-400">
            Conectando talentos aos melhores eventos.
          </p>
        </div>

        <div className="mb-6 grid grid-cols-2 rounded-2xl bg-zinc-900 p-1">

          <button
            type="button"
            onClick={() => {
              setModo("login");
              setMensagem("");
            }}
            className={`rounded-xl py-3 font-semibold transition ${
              modo === "login"
                ? "bg-red-500 text-white"
                : "text-zinc-400"
            }`}
          >
            Entrar
          </button>

          <button
            type="button"
            onClick={() => {
              setModo("cadastro");
              setMensagem("");
            }}
            className={`rounded-xl py-3 font-semibold transition ${
              modo === "cadastro"
                ? "bg-red-500 text-white"
                : "text-zinc-400"
            }`}
          >
            Criar conta
          </button>

        </div>

        <form
          onSubmit={enviarFormulario}
          className="rounded-3xl border border-zinc-800 bg-zinc-950/80 p-5"
        >

          {modo === "cadastro" && (
            <>
              <p className="mb-3 text-sm font-semibold">
                Quero começar como:
              </p>

              <div className="mb-5 grid grid-cols-2 gap-3">

                <button
                  type="button"
                  onClick={() =>
                    setTipoPerfil("artist")
                  }
                  className={`rounded-2xl border p-4 text-left transition ${
                    tipoPerfil === "artist"
                      ? "border-purple-500 bg-purple-500/10"
                      : "border-zinc-800 bg-zinc-900"
                  }`}
                >
                  <div className="text-2xl">
                    🎧
                  </div>

                  <div className="mt-2 font-bold">
                    Sou Artista
                  </div>

                  <div className="mt-1 text-xs text-zinc-400">
                    DJs, MCs, bandas e talentos
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setTipoPerfil("venue")
                  }
                  className={`rounded-2xl border p-4 text-left transition ${
                    tipoPerfil === "venue"
                      ? "border-red-500 bg-red-500/10"
                      : "border-zinc-800 bg-zinc-900"
                  }`}
                >
                  <div className="text-2xl">
                    🏢
                  </div>

                  <div className="mt-2 font-bold">
                    Sou Casa
                  </div>

                  <div className="mt-1 text-xs text-zinc-400">
                    Contratantes e produtores
                  </div>
                </button>

              </div>

              <label className="mb-2 block text-sm font-medium">
                Nome
              </label>

              <input
                type="text"
                required
                value={nome}
                onChange={(e) =>
                  setNome(e.target.value)
                }
                placeholder="Seu nome ou nome artístico"
                className="mb-4 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none focus:border-red-500"
              />
            </>
          )}

          <label className="mb-2 block text-sm font-medium">
            E-mail
          </label>

          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
            placeholder="seuemail@gmail.com"
            className="mb-4 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none focus:border-red-500"
          />

          <label className="mb-2 block text-sm font-medium">
            Senha
          </label>

          <input
            type="password"
            required
            minLength={6}
            autoComplete={
              modo === "login"
                ? "current-password"
                : "new-password"
            }
            value={senha}
            onChange={(e) =>
              setSenha(e.target.value)
            }
            placeholder="Mínimo de 6 caracteres"
            className="mb-5 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none focus:border-red-500"
          />

          <button
            type="submit"
            disabled={carregando}
            className="w-full rounded-xl bg-red-500 py-4 font-bold text-white transition hover:bg-red-600 disabled:opacity-50"
          >
            {carregando
              ? "Aguarde..."
              : modo === "cadastro"
              ? "Criar conta"
              : "Entrar"}
          </button>

          {mensagem && (
            <div className="mt-4 rounded-xl bg-zinc-900 p-3 text-sm">
              {mensagem}
            </div>
          )}

        </form>

        <p className="mt-6 text-center text-xs text-zinc-500">
          Música move pessoas. Aura Beat conecta.
        </p>

      </div>
    </main>
  );
}