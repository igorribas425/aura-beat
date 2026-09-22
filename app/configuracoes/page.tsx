"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatBRL } from "../../lib/finance";
import { PASSWORD_REQUIREMENTS_TEXT, passwordMeetsRequirements } from "../../lib/password";
import { isOwnerEmail } from "../../lib/owner-account";
import { supabase } from "../../lib/supabase";
import { setThemePreference, type ThemePreference } from "../../lib/theme";
import { ProfilePhotoEditor } from "../../components/profile-photo-editor";
import { InstallAppCard } from "../../components/install-app-card";

type ModoPerfil = "artist" | "venue";
type Tema = ThemePreference;

const themeLabels: Record<Tema, string> = {
  system: "Sistema",
  dark: "Escuro",
  light: "Claro",
};

type PerfilBase = {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  default_mode: ModoPerfil;
  theme: Tema;
};

type Artista = {
  id: string;
  stage_name: string;
  avatar_url: string | null;
};

type Casa = {
  id: string;
  trade_name: string;
  verification_status: string;
  avatar_url: string | null;
};

type Plano = {
  id: string;
  audience: ModoPerfil;
  code: string;
  name: string;
  monthly_price: number;
  benefits: Record<string, unknown> | null;
  is_active: boolean;
};

type Assinatura = {
  id: string;
  plan_id: string;
  artist_id: string | null;
  venue_id: string | null;
  status: "trialing" | "active" | "past_due" | "cancelled" | "expired";
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
};

function dinheiro(valor: number) {
  return formatBRL(Number(valor || 0));
}

function data(valor: string | null) {
  if (!valor) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(valor));
}

function statusAssinatura(status: Assinatura["status"]) {
  switch (status) {
    case "trialing":
      return {
        texto: "Período grátis",
        classe: "border-purple-800 bg-purple-950/20 text-purple-400",
      };
    case "active":
      return {
        texto: "Ativo",
        classe: "border-green-800 bg-green-950/20 text-green-400",
      };
    case "past_due":
      return {
        texto: "Pagamento pendente",
        classe: "border-yellow-800 bg-yellow-950/20 text-yellow-400",
      };
    case "cancelled":
      return {
        texto: "Cancelado",
        classe: "border-zinc-700 bg-zinc-900 text-zinc-400",
      };
    case "expired":
      return {
        texto: "Expirado",
        classe: "border-red-900 bg-red-950/20 text-red-400",
      };
    default:
      return {
        texto: status,
        classe: "border-zinc-800 bg-zinc-900 text-zinc-400",
      };
  }
}

function nomeBeneficio(chave: string) {
  switch (chave) {
    case "trial_days":
      return "Primeiro mês grátis";
    case "visibility":
      return "Visibilidade";
    case "analytics":
      return "Estatísticas";
    case "priority_support":
      return "Suporte prioritário";
    case "pro_badge":
      return "Selo Pro";
    case "offers":
      return "Ofertas";
    case "advanced_filters":
      return "Filtros avançados";
    case "reports":
      return "Relatórios";
    case "team":
      return "Equipe da Casa";
    default:
      return chave;
  }
}

function valorBeneficio(chave: string, valor: unknown) {
  if (chave === "trial_days") return `${Number(valor || 30)} dias`;
  if (valor === true) return "Incluído";
  if (valor === false) return "Não incluído";
  if (valor === "standard") return "Padrão";
  if (valor === "enhanced") return "Ampliada";
  if (valor === "high") return "Máxima";
  return String(valor ?? "");
}

export default function ConfiguracoesPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [perfil, setPerfil] = useState<PerfilBase | null>(null);
  const [artista, setArtista] = useState<Artista | null>(null);
  const [casa, setCasa] = useState<Casa | null>(null);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [assinaturas, setAssinaturas] = useState<Assinatura[]>([]);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [modoPadrao, setModoPadrao] = useState<ModoPerfil>("artist");
  const [tema, setTema] = useState<Tema>("system");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [alterandoSenha, setAlterandoSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  const ownerAccount = isOwnerEmail(email);

  useEffect(() => {
    let active = true;

    async function carregar() {
      try {
        setCarregando(true);
        setErro("");

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.replace("/login");
          return;
        }

        setEmail(user.email || "");

        const [respostaPerfil, respostaArtista, respostaCasa, respostaPlanos] =
          await Promise.all([
            supabase
              .from("profiles")
              .select("id,full_name,phone,avatar_url,default_mode,theme")
              .eq("id", user.id)
              .maybeSingle(),
            supabase
              .from("artist_profiles")
              .select("id,stage_name,avatar_url")
              .eq("user_id", user.id)
              .maybeSingle(),
            supabase
              .from("venue_profiles")
              .select("id,trade_name,verification_status,avatar_url")
              .eq("owner_user_id", user.id)
              .maybeSingle(),
            supabase
              .from("plans")
              .select("id,audience,code,name,monthly_price,benefits,is_active")
              .eq("is_active", true)
              .order("monthly_price", { ascending: true }),
          ]);

        if (!active) return;
        if (respostaPerfil.error) throw respostaPerfil.error;
        if (respostaArtista.error) console.error(respostaArtista.error);
        if (respostaCasa.error) console.error(respostaCasa.error);
        if (respostaPlanos.error) console.error(respostaPlanos.error);

        const perfilEncontrado =
          (respostaPerfil.data as PerfilBase | null) ?? null;
        const artistaEncontrado =
          (respostaArtista.data as Artista | null) ?? null;
        const casaEncontrada = (respostaCasa.data as Casa | null) ?? null;

        setPerfil(perfilEncontrado);
        setArtista(artistaEncontrado);
        setCasa(casaEncontrada);
        setPlanos((respostaPlanos.data || []) as Plano[]);

        const modoResolvido: ModoPerfil =
          artistaEncontrado && !casaEncontrada
            ? "artist"
            : casaEncontrada && !artistaEncontrado
              ? "venue"
              : perfilEncontrado?.default_mode === "venue"
                ? "venue"
                : "artist";

        setModoPadrao(modoResolvido);

        if (perfilEncontrado) {
          setNome(perfilEncontrado.full_name || "");
          setTelefone(perfilEncontrado.phone || "");
          setTema(perfilEncontrado.theme || "system");
        }

        const filtros: string[] = [];
        if (artistaEncontrado?.id) {
          filtros.push(`artist_id.eq.${artistaEncontrado.id}`);
        }
        if (casaEncontrada?.id) {
          filtros.push(`venue_id.eq.${casaEncontrada.id}`);
        }

        if (filtros.length === 0) {
          setAssinaturas([]);
          return;
        }

        let consulta = supabase
          .from("subscriptions")
          .select(
            "id,plan_id,artist_id,venue_id,status,trial_ends_at,current_period_start,current_period_end,created_at",
          )
          .order("created_at", { ascending: false });

        if (filtros.length === 1) {
          const [coluna, , valor] = filtros[0].split(".");
          consulta = consulta.eq(coluna, valor);
        } else {
          consulta = consulta.or(filtros.join(","));
        }

        const { data: dadosAssinaturas, error: erroAssinaturas } =
          await consulta;

        if (!active) return;
        if (erroAssinaturas) {
          console.error(erroAssinaturas);
          setAssinaturas([]);
        } else {
          setAssinaturas((dadosAssinaturas || []) as Assinatura[]);
        }
      } catch (error) {
        console.error(error);
        if (active) setErro("Não foi possível carregar as configurações.");
      } finally {
        if (active) setCarregando(false);
      }
    }

    void carregar();

    return () => {
      active = false;
    };
  }, [router]);

  const possuiDoisPerfis = Boolean(artista && casa);

  const modoAtual = useMemo<ModoPerfil>(() => {
    if (artista && !casa) return "artist";
    if (casa && !artista) return "venue";
    return modoPadrao;
  }, [artista, casa, modoPadrao]);

  const assinaturaArtista = useMemo(
    () =>
      assinaturas.find(
        (assinatura) =>
          assinatura.artist_id === artista?.id &&
          ["trialing", "active", "past_due"].includes(assinatura.status),
      ) || null,
    [assinaturas, artista],
  );

  const assinaturaCasa = useMemo(
    () =>
      assinaturas.find(
        (assinatura) =>
          assinatura.venue_id === casa?.id &&
          ["trialing", "active", "past_due"].includes(assinatura.status),
      ) || null,
    [assinaturas, casa],
  );

  function planoDaAssinatura(assinatura: Assinatura | null) {
    if (!assinatura) return null;
    return planos.find((plano) => plano.id === assinatura.plan_id) || null;
  }

  const assinaturaAtual =
    modoAtual === "venue" ? assinaturaCasa : assinaturaArtista;
  const planoAtual = planoDaAssinatura(assinaturaAtual);
  const planosDoModo = planos.filter((plano) => plano.audience === modoAtual);

  async function salvarPerfil() {
    if (!perfil) {
      setErro("Perfil base não encontrado.");
      return;
    }

    if (modoPadrao === "artist" && !artista) {
      setErro(
        "Você não possui perfil de Artista para defini-lo como modo padrão.",
      );
      return;
    }

    if (modoPadrao === "venue" && !casa) {
      setErro("Você não possui perfil de Casa para defini-lo como modo padrão.");
      return;
    }

    try {
      setSalvando(true);
      setErro("");
      setMensagem("");

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: nome.trim() || null,
          phone: telefone.trim() || null,
          default_mode: modoPadrao,
          theme: tema,
        })
        .eq("id", perfil.id);

      if (error) throw error;

      setPerfil({
        ...perfil,
        full_name: nome.trim() || null,
        phone: telefone.trim() || null,
        default_mode: modoPadrao,
        theme: tema,
      });

      setMensagem("Configurações salvas com sucesso.");
    } catch (error) {
      console.error(error);
      setErro("Não foi possível salvar as configurações.");
    } finally {
      setSalvando(false);
    }
  }

  async function alterarTema(novoTema: Tema) {
    setTema(novoTema);
    setThemePreference(novoTema);
    setErro("");
    setMensagem(`Tema ${themeLabels[novoTema]} aplicado.`);
    setPerfil((atual) => (atual ? { ...atual, theme: novoTema } : atual));

    if (!perfil) return;

    const { error } = await supabase
      .from("profiles")
      .update({ theme: novoTema })
      .eq("id", perfil.id);

    if (error) {
      console.error(error);
      setErro(
        "O tema foi aplicado neste aparelho, mas não foi possível salvar a preferência na conta.",
      );
    }
  }

  async function alterarSenha() {
    setErro("");
    setMensagem("");

    if (!passwordMeetsRequirements(senha)) {
      setErro(PASSWORD_REQUIREMENTS_TEXT);
      return;
    }

    if (senha !== confirmarSenha) {
      setErro("As duas senhas não são iguais.");
      return;
    }

    try {
      setAlterandoSenha(true);

      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) throw error;

      setSenha("");
      setConfirmarSenha("");
      setMensagem("Senha alterada com sucesso.");
    } catch (error) {
      console.error(error);
      setErro("Não foi possível alterar a senha.");
    } finally {
      setAlterandoSenha(false);
    }
  }

  async function sair() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  function abrirHomePadrao() {
    router.push(modoAtual === "venue" ? "/home-casa" : "/home-artista");
  }

  if (carregando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050507] text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-zinc-800 border-t-red-500" />
          <p className="text-zinc-400">Carregando configurações...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050507] pb-24 text-white">
      <header className="border-b border-zinc-900 bg-black/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-xl font-black">
              AURA <span className="text-red-500">BEAT</span>
            </p>
            <p className="text-xs text-zinc-500">Configurações</p>
          </div>

          <button
            type="button"
            onClick={abrirHomePadrao}
            className="rounded-xl border border-zinc-800 px-4 py-2 text-sm font-bold text-zinc-300 hover:bg-zinc-900"
          >
            ← Home
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-7">
        <section className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-950 via-zinc-950 to-red-950/20 p-6">
          <p className="text-sm font-black text-red-500">MINHA CONTA</p>
          <h1 className="mt-2 text-3xl font-black">Configurações</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Gerencie sua conta, perfil e assinatura da Aura Beat.
          </p>
        </section>

        {erro && (
          <div className="rounded-2xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
            {erro}
          </div>
        )}

        {mensagem && (
          <div className="rounded-2xl border border-green-900 bg-green-950/30 p-4 text-sm text-green-300">
            {mensagem}
          </div>
        )}

        <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
          <p className="text-xs font-black text-red-500">MEU PERFIL</p>
          <h2 className="mt-1 text-2xl font-black">Foto e edição do perfil</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Altere sua foto principal e entre na edição completa do perfil.
          </p>

          <div className="mt-6 grid gap-4">
            {modoAtual === "artist" && artista && (
              <article className="rounded-2xl border border-zinc-800 bg-black/30 p-5">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <ProfilePhotoEditor
                      kind="artist"
                      profileId={artista.id}
                      name={artista.stage_name}
                      url={artista.avatar_url}
                      onChange={(url) =>
                        setArtista((atual) =>
                          atual ? { ...atual, avatar_url: url } : atual,
                        )
                      }
                    />

                    <div>
                      <p className="text-xs font-black text-purple-400">
                        🎧 ARTISTA
                      </p>
                      <h3 className="mt-2 text-xl font-black">
                        {artista.stage_name}
                      </h3>
                      <p className="mt-1 text-xs text-zinc-500">
                        Esta foto aparece no perfil público e no mapa.
                      </p>
                    </div>
                  </div>

                  <span className="self-start rounded-full border border-red-800 bg-red-950/30 px-3 py-1 text-xs font-black text-red-400 sm:self-center">
                    Atual
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => router.push("/perfil-artista")}
                    className="rounded-xl border border-zinc-700 py-3 text-sm font-bold hover:bg-zinc-900"
                  >
                    Editar perfil
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/home-artista")}
                    className="rounded-xl border border-zinc-700 py-3 text-sm font-bold hover:bg-zinc-900"
                  >
                    Abrir Home
                  </button>
                </div>
              </article>
            )}

            {modoAtual === "venue" && casa && (
              <article className="rounded-2xl border border-zinc-800 bg-black/30 p-5">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <ProfilePhotoEditor
                      kind="venue"
                      profileId={casa.id}
                      name={casa.trade_name}
                      url={casa.avatar_url}
                      onChange={(url) =>
                        setCasa((atual) =>
                          atual ? { ...atual, avatar_url: url } : atual,
                        )
                      }
                    />

                    <div>
                      <p className="text-xs font-black text-blue-400">🏢 CASA</p>
                      <h3 className="mt-2 text-xl font-black">
                        {casa.trade_name}
                      </h3>
                      <p className="mt-1 text-xs text-zinc-500">
                        {casa.verification_status === "verified"
                          ? "✓ Casa Verificada"
                          : "Verificação pendente"}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Esta foto aparece no perfil público e no mapa.
                      </p>
                    </div>
                  </div>

                  <span className="self-start rounded-full border border-red-800 bg-red-950/30 px-3 py-1 text-xs font-black text-red-400 sm:self-center">
                    Atual
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => router.push("/perfil-casa")}
                    className="rounded-xl border border-zinc-700 py-3 text-sm font-bold hover:bg-zinc-900"
                  >
                    Editar perfil
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/home-casa")}
                    className="rounded-xl border border-zinc-700 py-3 text-sm font-bold hover:bg-zinc-900"
                  >
                    Abrir Home
                  </button>
                </div>
              </article>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
          <p className="text-xs font-black text-red-500">CONTA</p>
          <h2 className="mt-1 text-2xl font-black">Dados pessoais</h2>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Nome completo
              </label>
              <input
                type="text"
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                placeholder="Seu nome"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Telefone
              </label>
              <input
                type="tel"
                value={telefone}
                onChange={(event) => setTelefone(event.target.value)}
                placeholder="(54) 99999-9999"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
              />
            </div>

            <div className={possuiDoisPerfis ? "" : "md:col-span-2"}>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                E-mail da conta
              </label>
              <input
                type="email"
                value={email}
                disabled
                className="w-full cursor-not-allowed rounded-xl border border-zinc-800 bg-black px-4 py-3 text-zinc-500"
              />
              <p className="mt-2 text-xs text-zinc-600">
                Um único login pode administrar seus perfis da Aura Beat.
              </p>
            </div>

            {possuiDoisPerfis && (
              <div>
                <label className="mb-2 block text-sm font-bold text-zinc-300">
                  Modo padrão
                </label>
                <select
                  value={modoPadrao}
                  onChange={(event) =>
                    setModoPadrao(event.target.value as ModoPerfil)
                  }
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
                >
                  <option value="artist">🎧 Artista</option>
                  <option value="venue">🏢 Casa</option>
                </select>
                <p className="mt-2 text-xs text-zinc-600">
                  Essa opção só aparece porque esta conta possui os dois perfis.
                </p>
              </div>
            )}

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Aparência preferida
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { valor: "system" as Tema, titulo: "Sistema", icone: "💻" },
                  { valor: "dark" as Tema, titulo: "Escuro", icone: "🌙" },
                  { valor: "light" as Tema, titulo: "Claro", icone: "☀️" },
                ].map((item) => (
                  <button
                    key={item.valor}
                    type="button"
                    aria-pressed={tema === item.valor}
                    onClick={() => void alterarTema(item.valor)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      tema === item.valor
                        ? "border-red-500 bg-red-950/20"
                        : "border-zinc-800 bg-black/30 hover:border-zinc-700"
                    }`}
                  >
                    <p className="text-xl">{item.icone}</p>
                    <p className="mt-2 font-black">{item.titulo}</p>
                  </button>
                ))}
              </div>

              <p className="mt-3 text-xs text-zinc-600">
                A mudança é imediata. Em Sistema, o Aura Beat acompanha
                automaticamente a aparência do aparelho.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={salvando}
            onClick={salvarPerfil}
            className="mt-6 w-full rounded-2xl bg-red-500 py-4 font-black hover:bg-red-600 disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Salvar configurações"}
          </button>
        </section>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
          <p className="text-xs font-black text-red-500">ASSINATURA</p>
          <h2 className="mt-1 text-2xl font-black">Meu plano</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Gerencie o plano do modo atual:{" "}
            <strong className="text-zinc-300">
              {modoAtual === "venue" ? "Casa" : "Artista"}
            </strong>
            .
          </p>

          <article className="mt-6 rounded-2xl border border-zinc-800 bg-black/30 p-5">
            <p
              className={`text-xs font-black ${
                modoAtual === "venue" ? "text-blue-400" : "text-purple-400"
              }`}
            >
              {modoAtual === "venue" ? "🏢 CASA" : "🎧 ARTISTA"}
            </p>

            {planoAtual && assinaturaAtual ? (
              <>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-black">
                      Plano {planoAtual.name}
                    </h3>
                    <p className="mt-1 font-black text-green-400">
                      {dinheiro(planoAtual.monthly_price)}/mês
                    </p>
                  </div>

                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-black ${
                      statusAssinatura(assinaturaAtual.status).classe
                    }`}
                  >
                    {statusAssinatura(assinaturaAtual.status).texto}
                  </span>
                </div>

                {assinaturaAtual.status === "trialing" && (
                  <p className="mt-4 text-sm text-zinc-500">
                    Teste grátis até{" "}
                    <strong className="text-zinc-300">
                      {data(assinaturaAtual.trial_ends_at)}
                    </strong>
                  </p>
                )}

                {assinaturaAtual.current_period_end && (
                  <p className="mt-2 text-sm text-zinc-500">
                    Período atual até{" "}
                    <strong className="text-zinc-300">
                      {data(assinaturaAtual.current_period_end)}
                    </strong>
                  </p>
                )}
              </>
            ) : (
              <>
                <h3 className="mt-3 text-xl font-black">Sem plano ativo</h3>
                <p className="mt-2 text-sm text-zinc-500">
                  Escolha um plano de {modoAtual === "venue" ? "Casa" : "Artista"}{" "}
                  quando ativarmos o fluxo de assinatura.
                </p>
              </>
            )}
          </article>
        </section>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
          <p
            className={`text-xs font-black ${
              modoAtual === "venue" ? "text-blue-400" : "text-purple-400"
            }`}
          >
            {modoAtual === "venue" ? "PLANOS PARA CASA" : "PLANOS PARA ARTISTA"}
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {planosDoModo.map((plano) => (
              <article
                key={plano.id}
                className={`rounded-2xl border p-5 ${
                  planoAtual?.id === plano.id
                    ? "border-red-500 bg-red-950/10"
                    : "border-zinc-800 bg-black/30"
                }`}
              >
                <h3 className="text-xl font-black">{plano.name}</h3>
                <p className="mt-2 text-2xl font-black text-green-400">
                  {dinheiro(plano.monthly_price)}
                </p>
                <p className="text-xs text-zinc-600">por mês</p>

                <div className="mt-5 space-y-2">
                  {Object.entries(plano.benefits || {}).map(([chave, valor]) => (
                    <div
                      key={chave}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="text-zinc-500">
                        ✓ {nomeBeneficio(chave)}
                      </span>
                      <span className="font-bold text-zinc-300">
                        {valorBeneficio(chave, valor)}
                      </span>
                    </div>
                  ))}
                </div>

                {planoAtual?.id === plano.id && (
                  <div className="mt-5 rounded-xl border border-red-900 bg-red-950/20 py-2 text-center text-xs font-black text-red-400">
                    PLANO ATUAL
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>

        <InstallAppCard />

        {ownerAccount && (
          <section className="rounded-3xl border border-red-500/20 bg-red-950/10 p-6">
            <p className="text-xs font-black text-red-500">PROPRIETÁRIO</p>
            <h2 className="mt-1 text-2xl font-black">Acessos do Aura Beat</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Seu modo Artista fica separado da Central Administrativa. Use este atalho
              somente quando quiser trocar de acesso.
            </p>
            <button
              type="button"
              onClick={() => router.push("/acesso")}
              className="mt-5 rounded-xl border border-red-500/40 bg-red-500/10 px-5 py-3 font-black text-red-300 hover:bg-red-500/15"
            >
              Escolher acesso
            </button>
          </section>
        )}

        <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
          <p className="text-xs font-black text-red-500">SEGURANÇA</p>
          <h2 className="mt-1 text-2xl font-black">Alterar senha</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Use pelo menos 8 caracteres, com letra maiúscula, letra minúscula,
            número e símbolo.
          </p>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Nova senha
              </label>
              <input
                type="password"
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                placeholder="8+ caracteres, com maiúscula, número e símbolo"
                autoComplete="new-password"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Confirmar nova senha
              </label>
              <input
                type="password"
                value={confirmarSenha}
                onChange={(event) => setConfirmarSenha(event.target.value)}
                placeholder="Repita a senha"
                autoComplete="new-password"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
              />
            </div>
          </div>

          <button
            type="button"
            disabled={alterandoSenha}
            onClick={alterarSenha}
            className="mt-5 rounded-xl border border-zinc-700 px-5 py-3 font-black hover:bg-zinc-900 disabled:opacity-50"
          >
            {alterandoSenha ? "Alterando..." : "Alterar senha"}
          </button>
        </section>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
          <p className="text-xs font-black text-red-500">PRIVACIDADE E CONTA</p>
          <h2 className="mt-1 text-2xl font-black">Dados, termos e exclusão</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Consulte os documentos legais da Aura Beat e solicite a exclusão
            da sua conta quando precisar.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => router.push("/privacidade")}
              className="rounded-xl border border-zinc-700 px-4 py-3 text-left text-sm font-bold hover:bg-zinc-900"
            >
              Política de Privacidade
            </button>

            <button
              type="button"
              onClick={() => router.push("/termos")}
              className="rounded-xl border border-zinc-700 px-4 py-3 text-left text-sm font-bold hover:bg-zinc-900"
            >
              Termos de Uso
            </button>

            <button
              type="button"
              onClick={() => router.push("/excluir-conta")}
              className="rounded-xl border border-red-900 px-4 py-3 text-left text-sm font-bold text-red-400 hover:bg-red-950/30"
            >
              Solicitar exclusão da conta
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-red-950 bg-red-950/10 p-6">
          <p className="text-xs font-black text-red-500">SESSÃO</p>
          <h2 className="mt-1 text-xl font-black">Sair da Aura Beat</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Você precisará entrar novamente com seu e-mail e senha.
          </p>

          <button
            type="button"
            onClick={sair}
            className="mt-5 rounded-xl bg-red-500 px-5 py-3 font-black hover:bg-red-600"
          >
            Sair da conta
          </button>
        </section>
      </div>
    </main>
  );
}
