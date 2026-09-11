"use client";

import { FormEvent, useState } from "react";
import { supabase } from "../lib/supabase";

type Perfil = "artist" | "venue";

export default function Home() {
  const [modo, setModo] = useState<"entrar" | "cadastrar">("cadastrar");
  const [perfil, setPerfil] = useState<Perfil>("artist");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function enviarFormulario(e: FormEvent) {
    e.preventDefault();

    setMensagem("");
    setCarregando(true);

    try {
      if (modo === "cadastrar") {
        if (!nome.trim()) {
          setMensagem("Digite seu nome.");
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: {
            data: {
              name: nome,
              account_type: perfil,
            },
          },
        });

        if (error) {
          setMensagem("❌ " + error.message);
          return;
        }

        if (data.session) {
          setMensagem("✅ Conta criada com sucesso!");
        } else {
          setMensagem(
            "✅ Conta criada. Confira seu e-mail caso a confirmação esteja ativada."
          );
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: senha,
        });

        if (error) {
          setMensagem("❌ " + error.message);
          return;
        }

        setMensagem("✅ Login realizado com sucesso!");
      }
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050507] text-white flex items-center justify-center p-5">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-red-500 to-purple-700 text-5xl font-black shadow-[0_0_40px_rgba(239,68,68,0.3)]">
            A
          </div>

          <h1 className="text-4xl font-black tracking-tight">
            AURA <span className="text-red-500">BEAT</span>
          </h1>

          <p className="mt-2 text-sm text-zinc-400">
            Conectando talentos aos melhores eventos.
          </p>
        </div>

        <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-zinc-900 p-1 mb-5">
            <button
              type="button"
              onClick={() => setModo("entrar")}
              className={`rounded-xl py-3 font-semibold transition ${
                modo === "entrar"
                  ? "bg-red-500 text-white"
                  : "text-zinc-400"
              }`}
            >
              Entrar
            </button>

            <button
              type="button"
              onClick={() => setModo("cadastrar")}
              className={`rounded-xl py-3 font-semibold transition ${
                modo === "cadastrar"
                  ? "bg-red-500 text-white"
                  : "text-zinc-400"
              }`}
            >
              Criar conta
            </button>
          </div>

          {modo === "cadastrar" && (
            <>
              <p className="mb-3 text-sm font-medium text-zinc-300">
                Quero começar como:
              </p>

              <div className="grid grid-cols-2 gap-3 mb-5">
                <button
                  type="button"
                  onClick={() => setPerfil("artist")}
                  className={`rounded-2xl border p-4 text-left transition ${
                    perfil === "artist"
                      ? "border-purple-500 bg-purple-500/10"
                      : "border-zinc-800 bg-zinc-900"
                  }`}
                >
                  <div className="text-3xl">🎧</div>
                  <div className="mt-2 font-bold">Sou Artista</div>
                  <div className="mt-1 text-xs text-zinc-400">
                    DJs, MCs, bandas e talentos
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPerfil("venue")}
                  className={`rounded-2xl border p-4 text-left transition ${
                    perfil === "venue"
                      ? "border-red-500 bg-red-500/10"
                      : "border-zinc-800 bg-zinc-900"
                  }`}
                >
                  <div className="text-3xl">🏢</div>
                  <div className="mt-2 font-bold">Sou Casa</div>
                  <div className="mt-1 text-xs text-zinc-400">
                    Contratantes e produtores
                  </div>
                </button>
              </div>
            </>
          )}

          <form onSubmit={enviarFormulario} className="space-y-4">
            {modo === "cadastrar" && (
              <div>
                <label className="mb-2 block text-sm text-zinc-400">
                  Nome
                </label>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder={
                    perfil === "artist"
                      ? "Seu nome ou nome artístico"
                      : "Nome do responsável"
                  }
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
                />
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm text-zinc-400">
                E-mail
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seuemail@gmail.com"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-zinc-400">
                Senha
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
              />
            </div>

            <button
              disabled={carregando}
              className="w-full rounded-xl bg-red-500 py-4 font-bold transition hover:bg-red-600 disabled:opacity-50"
            >
              {carregando
                ? "Aguarde..."
                : modo === "cadastrar"
                ? perfil === "artist"
                  ? "Criar conta de Artista"
                  : "Criar conta de Casa"
                : "Entrar na Aura Beat"}
            </button>
          </form>

          {mensagem && (
            <div className="mt-4 rounded-xl bg-zinc-900 p-3 text-sm">
              {mensagem}
            </div>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-zinc-600">
          Música move pessoas. Aura Beat conecta.
        </p>
      </div>
    </main>
  );
}