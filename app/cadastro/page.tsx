"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAuthenticatedDestination } from "../../lib/auth-navigation";
import { supabase } from "../../lib/supabase";

type TipoPerfil = "artist" | "venue";
type Etapa = "perfil" | "dados";

function somenteNumeros(valor: string) {
  return valor.replace(/\D/g, "");
}

function formatarCnpj(valor: string) {
  const numeros = somenteNumeros(valor).slice(0, 14);

  return numeros
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function formatarTelefone(valor: string) {
  const numeros = somenteNumeros(valor).slice(0, 11);

  if (numeros.length <= 10) {
    return numeros
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }

  return numeros
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

function cnpjValido(valor: string) {
  const cnpj = somenteNumeros(valor);

  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) {
    return false;
  }

  const calcularDigito = (base: string, pesos: number[]) => {
    const soma = base
      .split("")
      .reduce((total, numero, index) => total + Number(numero) * pesos[index], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const primeiro = calcularDigito(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = calcularDigito(cnpj.slice(0, 12) + primeiro, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

  return cnpj.endsWith(`${primeiro}${segundo}`);
}

export default function CadastroPage() {
  const router = useRouter();

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [tipo, setTipo] = useState<TipoPerfil>("artist");
  const [etapa, setEtapa] = useState<Etapa>("perfil");
  const [carregando, setCarregando] = useState(false);
  const [verificandoSessao, setVerificandoSessao] = useState(true);
  const [mensagem, setMensagem] = useState("");
  const [usuarioJaExiste, setUsuarioJaExiste] = useState(false);
  const [aceitouTermos, setAceitouTermos] = useState(false);

  const [nomeCasa, setNomeCasa] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");

  useEffect(() => {
    let active = true;

    async function redirectAuthenticatedUser() {
      const { data } = await supabase.auth.getUser();
      if (!active) return;

      if (data.user) {
        const destination = await getAuthenticatedDestination(data.user.id);
        if (active) router.replace(destination);
        return;
      }

      setVerificandoSessao(false);
    }

    void redirectAuthenticatedUser();
    return () => { active = false; };
  }, [router]);

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
      setMensagem(tipo === "venue" ? "Digite o nome completo do responsável." : "Digite seu nome completo.");
      return;
    }

    if (senha.length < 6) {
      setMensagem("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    if (!aceitouTermos) {
      setMensagem("Leia e aceite os Termos de Uso e a Política de Privacidade para criar a conta.");
      return;
    }

    if (tipo === "venue") {
      const telefoneNumeros = somenteNumeros(telefone);

      if (nomeCasa.trim().length < 2) {
        setMensagem("Informe o nome da Casa ou nome fantasia.");
        return;
      }

      if (razaoSocial.trim().length < 2) {
        setMensagem("Informe a razão social vinculada ao CNPJ.");
        return;
      }

      if (!cnpjValido(cnpj)) {
        setMensagem("Informe um CNPJ válido. O número será enviado para análise antes da contratação.");
        return;
      }

      if (telefoneNumeros.length < 10) {
        setMensagem("Informe um telefone válido da Casa ou do responsável.");
        return;
      }

      if (cidade.trim().length < 2) {
        setMensagem("Informe a cidade da Casa.");
        return;
      }

      if (estado.trim().length !== 2) {
        setMensagem("Informe a sigla do Estado com 2 letras. Exemplo: RS.");
        return;
      }
    }

    setCarregando(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: senha,
        options: {
          data: {
            full_name: nome.trim(),
            terms_accepted_at: new Date().toISOString(),
            terms_version: "2026-09-21",
            privacy_version: "2026-09-21",
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

      if (tipo === "venue") {
        const cnpjNumeros = somenteNumeros(cnpj);
        const telefoneNumeros = somenteNumeros(telefone);

        const { error: venueError } = await supabase.from("venue_profiles").insert({
          owner_user_id: data.user.id,
          trade_name: nomeCasa.trim(),
          legal_name: razaoSocial.trim(),
          cnpj: cnpjNumeros,
          phone: telefoneNumeros,
          email: email.trim().toLowerCase(),
          city: cidade.trim(),
          state: estado.trim().toUpperCase(),
        });

        if (venueError) {
          const texto = venueError.message.toLowerCase();
          const cnpjDuplicado = texto.includes("duplicate") || texto.includes("venue_profiles_cnpj_key");

          setUsuarioJaExiste(true);
          setMensagem(
            cnpjDuplicado
              ? "A conta foi criada, mas este CNPJ já está vinculado a outra Casa. Entre na conta e procure o suporte antes de continuar."
              : "A conta foi criada, mas não foi possível registrar a Casa. Entre na conta para concluir o perfil e a verificação.",
          );
          setCarregando(false);
          return;
        }

        setMensagem("Conta criada. A Casa está aguardando verificação antes de poder contratar artistas.");
      } else {
        setMensagem("Conta criada com sucesso! Complete seu perfil e a verificação de identidade para contratar com segurança.");
      }

      setTimeout(() => {
        router.push(tipo === "artist" ? "/perfil-artista" : "/perfil-casa");
      }, 900);
    } catch {
      setMensagem("Ocorreu um erro inesperado. Tente novamente.");
      setCarregando(false);
    }
  }

  if (verificandoSessao) {
    return (
      <main className="aura-page flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-zinc-800 border-t-purple-500" />
          <p className="mt-4 text-sm text-zinc-400">Preparando o cadastro…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="aura-page relative overflow-hidden">
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
          <section className="aura-card mx-auto w-full max-w-4xl rounded-[32px] border p-5 backdrop-blur sm:p-8">
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
                    DJs, MCs, bandas e talentos. A identidade deverá ser verificada antes de uma contratação formal.
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
                    Clubes, casas noturnas, produtores e contratantes. CNPJ e dados da empresa são obrigatórios.
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
          <section className="aura-card mx-auto w-full max-w-xl rounded-[32px] border p-5 backdrop-blur sm:p-8">
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
                  {tipo === "artist"
                    ? "Seus dados de acesso. A verificação de identidade será concluída no perfil profissional."
                    : "Dados de acesso e identificação da empresa. A Casa só poderá contratar após ser verificada."}
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
                <label className="mb-2 block text-sm font-bold text-zinc-300">
                  {tipo === "venue" ? "Nome completo do responsável" : "Nome completo"}
                </label>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  type="text"
                  placeholder={tipo === "venue" ? "Responsável legal ou operacional" : "Seu nome"}
                  required
                  autoComplete="name"
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3.5 outline-none transition focus:border-red-500"
                />
              </div>

              {tipo === "venue" && (
                <div className="space-y-4 rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-red-400">Identificação da Casa</p>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                      O CNPJ é validado no formato agora, mas o selo “Casa Verificada” só aparece depois da análise cadastral.
                    </p>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-zinc-300">Nome da Casa / nome fantasia</label>
                    <input
                      value={nomeCasa}
                      onChange={(e) => setNomeCasa(e.target.value)}
                      type="text"
                      placeholder="Ex.: Aura Club"
                      required
                      className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3.5 outline-none transition focus:border-red-500"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-zinc-300">Razão social</label>
                    <input
                      value={razaoSocial}
                      onChange={(e) => setRazaoSocial(e.target.value)}
                      type="text"
                      placeholder="Nome empresarial do CNPJ"
                      required
                      className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3.5 outline-none transition focus:border-red-500"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-zinc-300">CNPJ</label>
                    <input
                      value={cnpj}
                      onChange={(e) => setCnpj(formatarCnpj(e.target.value))}
                      type="text"
                      inputMode="numeric"
                      placeholder="00.000.000/0000-00"
                      required
                      className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3.5 outline-none transition focus:border-red-500"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-zinc-300">Telefone</label>
                    <input
                      value={telefone}
                      onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
                      type="tel"
                      placeholder="(54) 99999-9999"
                      required
                      autoComplete="tel"
                      className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3.5 outline-none transition focus:border-red-500"
                    />
                  </div>

                  <div className="grid grid-cols-[1fr_88px] gap-3">
                    <div>
                      <label className="mb-2 block text-sm font-bold text-zinc-300">Cidade</label>
                      <input
                        value={cidade}
                        onChange={(e) => setCidade(e.target.value)}
                        type="text"
                        placeholder="Cidade"
                        required
                        className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3.5 outline-none transition focus:border-red-500"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-bold text-zinc-300">UF</label>
                      <input
                        value={estado}
                        onChange={(e) => setEstado(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))}
                        type="text"
                        placeholder="RS"
                        maxLength={2}
                        required
                        className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3.5 uppercase outline-none transition focus:border-red-500"
                      />
                    </div>
                  </div>
                </div>
              )}

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

              <div className={`rounded-2xl border p-3.5 text-xs leading-relaxed ${tipo === "artist" ? "border-purple-500/20 bg-purple-500/[0.05] text-purple-100" : "border-red-500/20 bg-red-500/[0.05] text-red-100"}`}>
                🔒 Contratações formais no Aura Beat exigem verificação dos dois lados. Documentos e dados sensíveis nunca devem aparecer no perfil público.
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-black/30 p-4 text-xs leading-5 text-zinc-400">
                <input
                  type="checkbox"
                  checked={aceitouTermos}
                  onChange={(event) => setAceitouTermos(event.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 accent-red-500"
                />
                <span>
                  Li e aceito os{" "}
                  <Link href="/termos" target="_blank" className="font-bold text-zinc-200 underline">
                    Termos de Uso
                  </Link>{" "}
                  e a{" "}
                  <Link href="/privacidade" target="_blank" className="font-bold text-zinc-200 underline">
                    Política de Privacidade
                  </Link>
                  .
                </span>
              </label>

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
                    : "Criar Casa para verificação"}
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

        <div className="mt-7 text-center text-xs text-zinc-500">
          <p>Música move pessoas. Aura Beat conecta.</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <Link href="/privacidade" className="hover:text-zinc-300">Privacidade</Link>
            <Link href="/termos" className="hover:text-zinc-300">Termos</Link>
            <Link href="/excluir-conta" className="hover:text-zinc-300">Exclusão de conta</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
