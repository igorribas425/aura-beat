"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { PublicLocationControl } from "../../components/public-location-control";
import { VenueMediaManager } from "../../components/venue-media-manager";

type StatusVerificacao =
  | "pending"
  | "verified"
  | "rejected"
  | "suspended";

type Casa = {
  id: string;
  owner_user_id: string;
  trade_name: string;
  legal_name: string | null;
  venue_type: string | null;
  avatar_url: string | null;
  cnpj: string;
  phone: string | null;
  email: string | null;
  address_line: string | null;
  address_number: string | null;
  address_extra: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  verification_status: StatusVerificacao;
  is_active: boolean;
};

type FormCasa = {
  trade_name: string;
  legal_name: string;
  venue_type: string;
  avatar_url: string;
  cnpj: string;
  phone: string;
  email: string;
  address_line: string;
  address_number: string;
  address_extra: string;
  neighborhood: string;
  city: string;
  state: string;
  postal_code: string;
};

type AvaliacaoCasa = {
  id: string;
  overall_rating: number;
  professionalism_rating: number | null;
  quality_rating: number | null;
  organization_rating: number | null;
  comment: string | null;
  created_at: string;
};

const FORM_VAZIO: FormCasa = {
  trade_name: "",
  legal_name: "",
  venue_type: "",
  avatar_url: "",
  cnpj: "",
  phone: "",
  email: "",
  address_line: "",
  address_number: "",
  address_extra: "",
  neighborhood: "",
  city: "",
  state: "",
  postal_code: "",
};

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

function formatarCep(valor: string) {
  const numeros = somenteNumeros(valor).slice(0, 8);

  return numeros.replace(/^(\d{5})(\d)/, "$1-$2");
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

function mediaNotas(
  valores: Array<number | null | undefined>
) {
  const notas = valores
    .map((valor) => Number(valor || 0))
    .filter((valor) => valor > 0);

  if (notas.length === 0) {
    return 0;
  }

  return (
    notas.reduce((total, valor) => total + valor, 0) /
    notas.length
  );
}

function estrelas(nota: number) {
  const arredondada = Math.round(nota);

  return Array.from({ length: 5 }, (_, index) =>
    index < arredondada ? "★" : "☆"
  ).join("");
}

function formatarData(data: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(data));
  } catch {
    return "";
  }
}

export default function PerfilCasaPage() {
  const router = useRouter();

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [casa, setCasa] = useState<Casa | null>(null);

  const [form, setForm] = useState<FormCasa>(FORM_VAZIO);

  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const [cnpjOriginal, setCnpjOriginal] = useState("");

  const [avaliacoes, setAvaliacoes] = useState<
    AvaliacaoCasa[]
  >([]);

  const [avaliacaoMedia, setAvaliacaoMedia] =
    useState(0);

  const [mediaOrganizacao, setMediaOrganizacao] =
    useState(0);

  const [
    mediaProfissionalismo,
    setMediaProfissionalismo,
  ] = useState(0);

  const [mediaEstrutura, setMediaEstrutura] =
    useState(0);

  const [
    eventosConcluidos,
    setEventosConcluidos,
  ] = useState(0);

  const carregarPerfilEffect = useEffectEvent(() => {
    void carregarPerfil();
  });

  useEffect(() => {
    carregarPerfilEffect();
  }, []);

  async function carregarPerfil() {
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

      const { data, error } = await supabase
        .from("venue_profiles")
        .select(`
          id,
          owner_user_id,
          trade_name,
          legal_name,
          venue_type,
          avatar_url,
          cnpj,
          phone,
          email,
          address_line,
          address_number,
          address_extra,
          neighborhood,
          city,
          state,
          postal_code,
          verification_status,
          is_active
        `)
        .eq("owner_user_id", user.id)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        setCasa(null);
        setForm(FORM_VAZIO);
        return;
      }

      const perfil = data as Casa;

      setCasa(perfil);

      setCnpjOriginal(
        somenteNumeros(perfil.cnpj || "")
      );

      setForm({
        trade_name: perfil.trade_name || "",
        legal_name: perfil.legal_name || "",
        venue_type: perfil.venue_type || "",
        avatar_url: perfil.avatar_url || "",
        cnpj: formatarCnpj(perfil.cnpj || ""),
        phone: formatarTelefone(perfil.phone || ""),
        email: perfil.email || "",
        address_line: perfil.address_line || "",
        address_number: perfil.address_number || "",
        address_extra: perfil.address_extra || "",
        neighborhood: perfil.neighborhood || "",
        city: perfil.city || "",
        state: (perfil.state || "").toUpperCase(),
        postal_code: formatarCep(
          perfil.postal_code || ""
        ),
      });

      await carregarEstatisticasCasa(perfil.id);
    } catch (error) {
      console.error(error);

      setErro(
        "Não foi possível carregar o perfil da Casa."
      );
    } finally {
      setCarregando(false);
    }
  }

  async function carregarEstatisticasCasa(
    venueId: string
  ) {
    try {
      const {
        data: dadosAvaliacoes,
        error: erroAvaliacoes,
      } = await supabase
        .from("reviews")
        .select(`
          id,
          overall_rating,
          professionalism_rating,
          quality_rating,
          organization_rating,
          comment,
          created_at
        `)
        .eq("reviewee_type", "venue")
        .eq("venue_id", venueId)
        .order("created_at", {
          ascending: false,
        });

      if (erroAvaliacoes) {
        throw erroAvaliacoes;
      }

      const lista =
        (dadosAvaliacoes || []) as AvaliacaoCasa[];

      setAvaliacoes(lista);

      setAvaliacaoMedia(
        mediaNotas(
          lista.map(
            (avaliacao) =>
              avaliacao.overall_rating
          )
        )
      );

      setMediaOrganizacao(
        mediaNotas(
          lista.map(
            (avaliacao) =>
              avaliacao.organization_rating
          )
        )
      );

      setMediaProfissionalismo(
        mediaNotas(
          lista.map(
            (avaliacao) =>
              avaliacao.professionalism_rating
          )
        )
      );

      setMediaEstrutura(
        mediaNotas(
          lista.map(
            (avaliacao) =>
              avaliacao.quality_rating
          )
        )
      );

      const {
        count,
        error: erroEventos,
      } = await supabase
        .from("bookings")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("venue_id", venueId)
        .eq("status", "completed");

      if (erroEventos) {
        throw erroEventos;
      }

      setEventosConcluidos(count || 0);
    } catch (error) {
      console.error(
        "Erro ao carregar reputação da Casa:",
        error
      );

      setAvaliacoes([]);
      setAvaliacaoMedia(0);
      setMediaOrganizacao(0);
      setMediaProfissionalismo(0);
      setMediaEstrutura(0);
      setEventosConcluidos(0);
    }
  }

  function atualizarCampo(
    campo: keyof FormCasa,
    valor: string
  ) {
    setForm((anterior) => ({
      ...anterior,
      [campo]: valor,
    }));
  }

  function statusInfo() {
    if (
      casa?.verification_status === "verified"
    ) {
      return {
        texto: "Casa Verificada",
        descricao:
          "Sua Casa está verificada e pode visualizar DJs disponíveis no mapa.",
        classe:
          "border-green-800 bg-green-950/20 text-green-400",
        icone: "✓",
      };
    }

    if (
      casa?.verification_status === "rejected"
    ) {
      return {
        texto: "Verificação recusada",
        descricao:
          "Revise os dados da Casa antes de solicitar uma nova análise.",
        classe:
          "border-red-800 bg-red-950/20 text-red-400",
        icone: "✕",
      };
    }

    if (
      casa?.verification_status === "suspended"
    ) {
      return {
        texto: "Casa suspensa",
        descricao:
          "Este perfil está temporariamente suspenso.",
        classe:
          "border-red-800 bg-red-950/20 text-red-400",
        icone: "!",
      };
    }

    return {
      texto: "Verificação pendente",
      descricao:
        "O perfil ainda está aguardando verificação.",
      classe:
        "border-yellow-800 bg-yellow-950/20 text-yellow-400",
      icone: "⌛",
    };
  }

  async function salvarPerfil() {
    setErro("");
    setSucesso("");

    const cnpj = somenteNumeros(form.cnpj);
    const cep = somenteNumeros(form.postal_code);
    const telefone = somenteNumeros(form.phone);

    if (!form.trade_name.trim()) {
      setErro("Informe o nome da Casa.");
      return;
    }

    if (cnpj.length !== 14) {
      setErro(
        "Informe um CNPJ com 14 números."
      );
      return;
    }

    if (!form.city.trim()) {
      setErro("Informe a cidade.");
      return;
    }

    if (form.state.trim().length !== 2) {
      setErro(
        "Informe a sigla do Estado com 2 letras. Exemplo: RS."
      );
      return;
    }

    if (
      form.email &&
      !form.email.includes("@")
    ) {
      setErro("Informe um e-mail válido.");
      return;
    }

    try {
      setSalvando(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const dados = {
        trade_name: form.trade_name.trim(),

        legal_name:
          form.legal_name.trim() || null,

        venue_type:
          form.venue_type.trim() || null,

        avatar_url:
          form.avatar_url.trim() || null,

        cnpj,

        phone: telefone || null,

        email:
          form.email.trim().toLowerCase() ||
          null,

        address_line:
          form.address_line.trim() || null,

        address_number:
          form.address_number.trim() || null,

        address_extra:
          form.address_extra.trim() || null,

        neighborhood:
          form.neighborhood.trim() || null,

        city: form.city.trim(),

        state: form.state.trim().toUpperCase(),

        postal_code: cep || null,
      };

      if (casa) {
        const cnpjMudou =
          cnpjOriginal &&
          cnpjOriginal !== cnpj;

        const atualizacao: Record<
          string,
          unknown
        > = {
          ...dados,
        };

        if (
          cnpjMudou &&
          casa.verification_status ===
            "verified"
        ) {
          atualizacao.verification_status =
            "pending";
        }

        const {
          data: casaAtualizada,
          error,
        } = await supabase
          .from("venue_profiles")
          .update(atualizacao)
          .eq("id", casa.id)
          .select(`
            id,
            owner_user_id,
            trade_name,
            legal_name,
            venue_type,
            avatar_url,
            cnpj,
            phone,
            email,
            address_line,
            address_number,
            address_extra,
            neighborhood,
            city,
            state,
            postal_code,
            verification_status,
            is_active
          `)
          .single();

        if (error) {
          throw error;
        }

        const atualizada =
          casaAtualizada as Casa;

        setCasa(atualizada);

        setCnpjOriginal(
          somenteNumeros(atualizada.cnpj)
        );

        if (cnpjMudou) {
          setSucesso(
            "Perfil atualizado. Como o CNPJ foi alterado, a Casa voltou para análise."
          );
        } else {
          setSucesso(
            "Perfil da Casa atualizado com sucesso."
          );
        }

        await carregarEstatisticasCasa(
          atualizada.id
        );
      } else {
        const {
          data: casaCriada,
          error,
        } = await supabase
          .from("venue_profiles")
          .insert({
            owner_user_id: user.id,
            ...dados,
          })
          .select(`
            id,
            owner_user_id,
            trade_name,
            legal_name,
            venue_type,
            avatar_url,
            cnpj,
            phone,
            email,
            address_line,
            address_number,
            address_extra,
            neighborhood,
            city,
            state,
            postal_code,
            verification_status,
            is_active
          `)
          .single();

        if (error) {
          throw error;
        }

        const criada = casaCriada as Casa;

        setCasa(criada);

        setCnpjOriginal(
          somenteNumeros(criada.cnpj)
        );

        setSucesso(
          "Perfil da Casa criado com sucesso. Agora ele está aguardando verificação."
        );

        await carregarEstatisticasCasa(
          criada.id
        );
      }
    } catch (error: unknown) {
      let mensagem =
        "Não foi possível salvar o perfil da Casa.";

      if (
        typeof error === "object" &&
        error !== null &&
        "message" in error
      ) {
        const texto = String(
          (
            error as {
              message?: string;
            }
          ).message || ""
        );

        if (
          texto
            .toLowerCase()
            .includes("duplicate") ||
          texto.includes(
            "venue_profiles_cnpj_key"
          )
        ) {
          mensagem =
            "Este CNPJ já está cadastrado em outra Casa.";
        }
      }

      setErro(mensagem);
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050507] text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-zinc-800 border-t-red-500" />

          <p className="text-zinc-400">
            Carregando perfil...
          </p>
        </div>
      </main>
    );
  }

  const status = statusInfo();

  const comentariosRecentes =
    avaliacoes
      .filter(
        (avaliacao) =>
          avaliacao.comment &&
          avaliacao.comment.trim()
      )
      .slice(0, 5);

  return (
    <main className="min-h-screen bg-[#050507] pb-16 text-white">
      <header className="border-b border-zinc-900 bg-black/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xl font-black">
              AURA{" "}
              <span className="text-red-500">
                BEAT
              </span>
            </p>

            <p className="text-xs text-zinc-500">
              Perfil da Casa
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              router.push("/home-casa")
            }
            className="rounded-xl border border-zinc-800 px-4 py-2 text-sm font-bold text-zinc-300 transition hover:bg-zinc-900"
          >
            ← Voltar
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <section className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-950 via-zinc-950 to-red-950/20 p-6">
          <p className="text-sm font-black text-red-500">
            PERFIL DA CASA
          </p>

          <h1 className="mt-2 text-3xl font-black">
            {casa
              ? form.trade_name || "Sua Casa"
              : "Cadastrar Casa"}
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Dados, reputação e informações
            profissionais da sua Casa dentro
            do Aura Beat.
          </p>
        </section>

        {casa && (
          <>
            <section
              className={`rounded-2xl border p-5 ${status.classe}`}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black/30 text-xl font-black">
                    {status.icone}
                  </div>

                  <div>
                    <p className="font-black">
                      {status.texto}
                    </p>

                    <p className="mt-1 text-sm opacity-80">
                      {status.descricao}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => router.push("/verificacao-casa")}
                  className="shrink-0 rounded-xl border border-current/30 bg-black/20 px-4 py-3 text-sm font-black transition hover:bg-black/35"
                >
                  {casa.verification_status === "verified"
                    ? "Ver verificação"
                    : casa.verification_status === "rejected"
                      ? "Corrigir e reenviar"
                      : casa.verification_status === "suspended"
                        ? "Ver situação"
                        : "Acompanhar / iniciar verificação"}
                </button>
              </div>
            </section>

            <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <p className="text-sm font-black text-red-500">
                    REPUTAÇÃO
                  </p>

                  <h2 className="mt-1 text-2xl font-black">
                    Avaliação da Casa
                  </h2>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-black px-5 py-3 text-center">
                  <div className="text-2xl font-black text-yellow-400">
                    {avaliacaoMedia > 0
                      ? avaliacaoMedia.toFixed(1)
                      : "--"}
                  </div>

                  <div className="text-xs text-zinc-500">
                    {avaliacoes.length}{" "}
                    {avaliacoes.length === 1
                      ? "avaliação"
                      : "avaliações"}
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-zinc-800 bg-black/40 p-5">
                  <p className="text-sm text-zinc-500">
                    ⭐ Nota geral
                  </p>

                  <p className="mt-2 text-2xl font-black">
                    {avaliacaoMedia > 0
                      ? avaliacaoMedia.toFixed(1)
                      : "--"}
                  </p>

                  <p className="mt-1 text-sm text-yellow-400">
                    {avaliacaoMedia > 0
                      ? estrelas(avaliacaoMedia)
                      : "☆☆☆☆☆"}
                  </p>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-black/40 p-5">
                  <p className="text-sm text-zinc-500">
                    🎉 Eventos concluídos
                  </p>

                  <p className="mt-2 text-2xl font-black">
                    {eventosConcluidos}
                  </p>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-black/40 p-5">
                  <p className="text-sm text-zinc-500">
                    📋 Organização
                  </p>

                  <p className="mt-2 text-2xl font-black">
                    {mediaOrganizacao > 0
                      ? mediaOrganizacao.toFixed(1)
                      : "--"}
                  </p>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-black/40 p-5">
                  <p className="text-sm text-zinc-500">
                    🤝 Profissionalismo
                  </p>

                  <p className="mt-2 text-2xl font-black">
                    {mediaProfissionalismo > 0
                      ? mediaProfissionalismo.toFixed(
                          1
                        )
                      : "--"}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-zinc-800 bg-black/40 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-zinc-500">
                      🏢 Estrutura da Casa
                    </p>

                    <p className="mt-2 text-2xl font-black">
                      {mediaEstrutura > 0
                        ? mediaEstrutura.toFixed(1)
                        : "--"}
                    </p>
                  </div>

                  <div className="text-2xl text-yellow-400">
                    {mediaEstrutura > 0
                      ? estrelas(mediaEstrutura)
                      : "☆☆☆☆☆"}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
              <h2 className="text-xl font-black">
                💬 Comentários recentes
              </h2>

              <p className="mt-1 text-sm text-zinc-500">
                Feedback deixado por artistas após
                eventos concluídos.
              </p>

              <div className="mt-5 space-y-3">
                {comentariosRecentes.length ===
                0 ? (
                  <div className="rounded-2xl border border-zinc-800 bg-black/40 p-5 text-sm text-zinc-500">
                    Ainda não existem comentários
                    para esta Casa.
                  </div>
                ) : (
                  comentariosRecentes.map(
                    (avaliacao) => (
                      <article
                        key={avaliacao.id}
                        className="rounded-2xl border border-zinc-800 bg-black/40 p-5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="text-yellow-400">
                              {estrelas(
                                avaliacao.overall_rating
                              )}
                            </span>

                            <span className="ml-2 font-black">
                              {Number(
                                avaliacao.overall_rating
                              ).toFixed(1)}
                            </span>
                          </div>

                          <span className="text-xs text-zinc-600">
                            {formatarData(
                              avaliacao.created_at
                            )}
                          </span>
                        </div>

                        <p className="mt-3 text-sm leading-6 text-zinc-300">
                          “{avaliacao.comment}”
                        </p>
                      </article>
                    )
                  )
                )}
              </div>
            </section>
          </>
        )}

        {erro && (
          <div className="rounded-2xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
            {erro}
          </div>
        )}

        {sucesso && (
          <div className="rounded-2xl border border-green-900 bg-green-950/30 p-4 text-sm text-green-300">
            {sucesso}
          </div>
        )}

        <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
          <h2 className="text-xl font-black">
            🏢 Dados da empresa
          </h2>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Nome da Casa *
              </label>

              <input
                type="text"
                value={form.trade_name}
                onChange={(event) =>
                  atualizarCampo(
                    "trade_name",
                    event.target.value
                  )
                }
                placeholder="Ex.: Club Aura"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none transition focus:border-red-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Razão social
              </label>

              <input
                type="text"
                value={form.legal_name}
                onChange={(event) =>
                  atualizarCampo(
                    "legal_name",
                    event.target.value
                  )
                }
                placeholder="Razão social da empresa"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none transition focus:border-red-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                CNPJ *
              </label>

              <input
                type="text"
                value={form.cnpj}
                onChange={(event) =>
                  atualizarCampo(
                    "cnpj",
                    formatarCnpj(
                      event.target.value
                    )
                  )
                }
                placeholder="00.000.000/0000-00"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none transition focus:border-red-500"
              />

              {casa?.verification_status ===
                "verified" && (
                <p className="mt-2 text-xs text-yellow-500">
                  Alterar o CNPJ de uma Casa
                  verificada fará o perfil voltar
                  para análise.
                </p>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Tipo de estabelecimento
              </label>

              <input
                type="text"
                value={form.venue_type}
                onChange={(event) =>
                  atualizarCampo(
                    "venue_type",
                    event.target.value
                  )
                }
                placeholder="Ex.: Casa noturna, bar, espaço de eventos"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none transition focus:border-red-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                URL do logo ou foto pública
              </label>

              <input
                type="url"
                value={form.avatar_url}
                onChange={(event) =>
                  atualizarCampo(
                    "avatar_url",
                    event.target.value
                  )
                }
                placeholder="https://…"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none transition focus:border-red-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Telefone / WhatsApp
              </label>

              <input
                type="text"
                value={form.phone}
                onChange={(event) =>
                  atualizarCampo(
                    "phone",
                    formatarTelefone(
                      event.target.value
                    )
                  )
                }
                placeholder="(54) 99999-9999"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none transition focus:border-red-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                E-mail comercial
              </label>

              <input
                type="email"
                value={form.email}
                onChange={(event) =>
                  atualizarCampo(
                    "email",
                    event.target.value
                  )
                }
                placeholder="contato@minhacasa.com.br"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none transition focus:border-red-500"
              />
            </div>
          </div>
        </section>

        {casa && (
          <VenueMediaManager
            venueId={casa.id}
            onCoverChange={(url) =>
              atualizarCampo("avatar_url", url)
            }
          />
        )}

        <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
          <h2 className="text-xl font-black">
            📍 Endereço
          </h2>

          {casa && (
            <div className="mt-5">
              <PublicLocationControl kind="venue" />
            </div>
          )}

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Rua / Avenida
              </label>

              <input
                type="text"
                value={form.address_line}
                onChange={(event) =>
                  atualizarCampo(
                    "address_line",
                    event.target.value
                  )
                }
                placeholder="Ex.: Avenida Brasil"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none transition focus:border-red-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Número
              </label>

              <input
                type="text"
                value={form.address_number}
                onChange={(event) =>
                  atualizarCampo(
                    "address_number",
                    event.target.value
                  )
                }
                placeholder="100"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none transition focus:border-red-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Complemento
              </label>

              <input
                type="text"
                value={form.address_extra}
                onChange={(event) =>
                  atualizarCampo(
                    "address_extra",
                    event.target.value
                  )
                }
                placeholder="Sala, bloco..."
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none transition focus:border-red-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Bairro
              </label>

              <input
                type="text"
                value={form.neighborhood}
                onChange={(event) =>
                  atualizarCampo(
                    "neighborhood",
                    event.target.value
                  )
                }
                placeholder="Centro"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none transition focus:border-red-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                CEP
              </label>

              <input
                type="text"
                value={form.postal_code}
                onChange={(event) =>
                  atualizarCampo(
                    "postal_code",
                    formatarCep(
                      event.target.value
                    )
                  )
                }
                placeholder="00000-000"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none transition focus:border-red-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Cidade *
              </label>

              <input
                type="text"
                value={form.city}
                onChange={(event) =>
                  atualizarCampo(
                    "city",
                    event.target.value
                  )
                }
                placeholder="Carazinho"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none transition focus:border-red-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Estado *
              </label>

              <input
                type="text"
                maxLength={2}
                value={form.state}
                onChange={(event) =>
                  atualizarCampo(
                    "state",
                    event.target.value.toUpperCase()
                  )
                }
                placeholder="RS"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 uppercase outline-none transition focus:border-red-500"
              />
            </div>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() =>
              router.push("/home-casa")
            }
            className="rounded-xl border border-zinc-700 py-4 font-black text-zinc-300 transition hover:bg-zinc-900"
          >
            ← Voltar para Home
          </button>

          <button
            type="button"
            disabled={salvando}
            onClick={salvarPerfil}
            className="rounded-xl bg-red-500 py-4 font-black transition hover:bg-red-600 disabled:opacity-50"
          >
            {salvando
              ? "Salvando..."
              : casa
                ? "💾 Salvar alterações"
                : "🏢 Criar perfil da Casa"}
          </button>
        </div>
      </div>
    </main>
  );
}
