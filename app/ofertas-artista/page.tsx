"use client";

import {
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation";
import { formatBRL } from "../../lib/finance";
import { supabase } from "../../lib/supabase";

type Artista = {
  id: string;
  stage_name: string;
  fixed_fee: number | null;
  base_city: string | null;
  base_state: string | null;
};

type Oferta = {
  id: string;
  venue_id: string;
  created_by: string;
  title: string;
  description: string | null;
  status:
    | "draft"
    | "open"
    | "filled"
    | "closed"
    | "cancelled";

  is_urgent: boolean;
  event_type: string | null;

  requested_styles: string[];

  starts_at: string;
  duration_minutes: number;

  budget_amount: number;
  radius_km: number;

  expected_audience: number | null;

  structure_details: string | null;
  address_text: string | null;

  expires_at: string | null;
};

type Casa = {
  id: string;
  trade_name: string;
  city: string | null;
  state: string | null;
  verification_status: string;
};

type RespostaStatus =
  | "pending"
  | "accepted"
  | "countered"
  | "declined"
  | "selected"
  | "withdrawn";

type Resposta = {
  id: string;
  offer_id: string;
  artist_id: string;
  status: RespostaStatus;
  proposed_fee: number | null;
  message: string | null;
  created_at: string;
  updated_at: string;
};

type Filtro =
  | "todas"
  | "convites"
  | "urgentes"
  | "respondidas";

function dinheiro(valor: number) {
  return formatBRL(Number(valor || 0));
}

function dataEvento(valor: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(valor));
}

function duracaoEvento(minutos: number) {
  const horas = Math.floor(
    Number(minutos || 0) / 60
  );

  const minutosRestantes =
    Number(minutos || 0) % 60;

  if (
    horas > 0 &&
    minutosRestantes > 0
  ) {
    return `${horas}h ${minutosRestantes}min`;
  }

  if (horas > 0) {
    return `${horas}h`;
  }

  return `${minutosRestantes} min`;
}

function horasEvento(minutos: number) {
  return Number(minutos || 0) / 60;
}

function statusResposta(
  status: RespostaStatus
) {
  switch (status) {
    case "pending":
      return {
        texto: "Convite recebido",
        classe:
          "border-yellow-800 bg-yellow-950/20 text-yellow-400",
      };

    case "accepted":
      return {
        texto: "Oferta aceita",
        classe:
          "border-green-800 bg-green-950/20 text-green-400",
      };

    case "countered":
      return {
        texto: "Contraproposta enviada",
        classe:
          "border-purple-800 bg-purple-950/20 text-purple-400",
      };

    case "declined":
      return {
        texto: "Recusada",
        classe:
          "border-zinc-700 bg-zinc-900 text-zinc-400",
      };

    case "selected":
      return {
        texto: "Selecionado pela Casa",
        classe:
          "border-green-700 bg-green-950/30 text-green-300",
      };

    case "withdrawn":
      return {
        texto: "Retirada",
        classe:
          "border-zinc-700 bg-zinc-900 text-zinc-500",
      };

    default:
      return {
        texto: status,
        classe:
          "border-zinc-800 bg-zinc-900 text-zinc-400",
      };
  }
}

function statusOferta(
  status: Oferta["status"]
) {
  switch (status) {
    case "open":
      return "Aberta";

    case "filled":
      return "Preenchida";

    case "closed":
      return "Encerrada";

    case "cancelled":
      return "Cancelada";

    case "draft":
      return "Rascunho";

    default:
      return status;
  }
}

export default function OfertasArtistaPage() {
  const router = useRouter();

  const [artista, setArtista] =
    useState<Artista | null>(null);

  const [ofertas, setOfertas] =
    useState<Oferta[]>([]);

  const [casas, setCasas] = useState<
    Record<string, Casa>
  >({});

  const [respostas, setRespostas] =
    useState<Record<string, Resposta>>(
      {}
    );

  const [filtro, setFiltro] =
    useState<Filtro>("todas");

  const [
    ofertaContraproposta,
    setOfertaContraproposta,
  ] = useState<string | null>(null);

  const [
    valorContraproposta,
    setValorContraproposta,
  ] = useState("");

  const [
    mensagemContraproposta,
    setMensagemContraproposta,
  ] = useState("");

  const [
    processando,
    setProcessando,
  ] = useState<string | null>(null);

  const [carregando, setCarregando] =
    useState(true);

  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] =
    useState("");

  const carregarPaginaEffect = useEffectEvent(() => {
    void carregarPagina();
  });

  useEffect(() => {
    carregarPaginaEffect();
  }, []);

  async function carregarPagina(
    mostrarLoading = true
  ) {
    try {
      if (mostrarLoading) {
        setCarregando(true);
      }

      setErro("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const {
        data: perfil,
        error: erroPerfil,
      } = await supabase
        .from("artist_profiles")
        .select(`
          id,
          stage_name,
          fixed_fee,
          base_city,
          base_state
        `)
        .eq("user_id", user.id)
        .maybeSingle();

      if (erroPerfil) {
        throw erroPerfil;
      }

      if (!perfil) {
        router.replace(
          "/perfil-artista"
        );

        return;
      }

      const perfilArtista =
        perfil as Artista;

      setArtista(
        perfilArtista
      );

      const {
        data: listaRespostas,
        error: erroRespostas,
      } = await supabase
        .from("offer_responses")
        .select(`
          id,
          offer_id,
          artist_id,
          status,
          proposed_fee,
          message,
          created_at,
          updated_at
        `)
        .eq(
          "artist_id",
          perfilArtista.id
        )
        .order("updated_at", {
          ascending: false,
        });

      if (erroRespostas) {
        throw erroRespostas;
      }

      const respostasArtista =
        (listaRespostas ||
          []) as Resposta[];

      const mapaRespostas: Record<
        string,
        Resposta
      > = {};

      respostasArtista.forEach(
        (resposta) => {
          mapaRespostas[
            resposta.offer_id
          ] = resposta;
        }
      );

      setRespostas(
        mapaRespostas
      );

      const {
        data: ofertasAbertas,
        error: erroOfertas,
      } = await supabase
        .from("offers")
        .select(`
          id,
          venue_id,
          created_by,
          title,
          description,
          status,
          is_urgent,
          event_type,
          requested_styles,
          starts_at,
          duration_minutes,
          budget_amount,
          radius_km,
          expected_audience,
          structure_details,
          address_text,
          expires_at
        `)
        .eq("status", "open")
        .order("is_urgent", {
          ascending: false,
        })
        .order("starts_at", {
          ascending: true,
        });

      if (erroOfertas) {
        throw erroOfertas;
      }

      const abertas =
        (ofertasAbertas ||
          []) as Oferta[];

      const idsRespondidas =
        respostasArtista.map(
          (resposta) =>
            resposta.offer_id
        );

      const idsAbertas = new Set(
        abertas.map(
          (oferta) => oferta.id
        )
      );

      const idsHistorico =
        idsRespondidas.filter(
          (id) =>
            !idsAbertas.has(id)
        );

      let historico: Oferta[] = [];

      if (
        idsHistorico.length >
        0
      ) {
        const {
          data: antigas,
          error: erroAntigas,
        } = await supabase
          .from("offers")
          .select(`
            id,
            venue_id,
            created_by,
            title,
            description,
            status,
            is_urgent,
            event_type,
            requested_styles,
            starts_at,
            duration_minutes,
            budget_amount,
            radius_km,
            expected_audience,
            structure_details,
            address_text,
            expires_at
          `)
          .in(
            "id",
            idsHistorico
          );

        if (!erroAntigas) {
          historico =
            (antigas ||
              []) as Oferta[];
        }
      }

      const todas = [
        ...abertas,
        ...historico,
      ];

      setOfertas(todas);

      await carregarCasas(
        todas
      );
    } catch (error) {
      console.error(error);

      setErro(
        "Não foi possível carregar as ofertas."
      );
    } finally {
      if (mostrarLoading) {
        setCarregando(false);
      }
    }
  }

  async function carregarCasas(
    lista: Oferta[]
  ) {
    const ids = [
      ...new Set(
        lista.map(
          (oferta) =>
            oferta.venue_id
        )
      ),
    ];

    if (ids.length === 0) {
      setCasas({});
      return;
    }

    const {
      data,
      error,
    } = await supabase
      .from("venue_profiles")
      .select(`
        id,
        trade_name,
        city,
        state,
        verification_status
      `)
      .in("id", ids);

    if (error) {
      console.error(
        "Erro ao carregar Casas:",
        error
      );

      return;
    }

    const mapa: Record<
      string,
      Casa
    > = {};

    (data || []).forEach(
      (casa) => {
        mapa[casa.id] =
          casa as Casa;
      }
    );

    setCasas(mapa);
  }

  function cacheBaseArtista(
    oferta: Oferta
  ) {
    const valorHora =
      Number(
        artista?.fixed_fee || 0
      );

    return (
      valorHora *
      horasEvento(
        oferta.duration_minutes
      )
    );
  }

  async function salvarResposta(
    oferta: Oferta,
    status: RespostaStatus,
    proposedFee: number | null,
    message: string | null
  ) {
    if (!artista) {
      return;
    }

    const respostaExistente =
      respostas[
        oferta.id
      ];

    if (respostaExistente) {
      const {
        error,
      } = await supabase
        .from("offer_responses")
        .update({
          status,
          proposed_fee:
            proposedFee,
          message,
        })
        .eq(
          "id",
          respostaExistente.id
        );

      if (error) {
        throw error;
      }

      return;
    }

    const { error } =
      await supabase
        .from("offer_responses")
        .insert({
          offer_id:
            oferta.id,

          artist_id:
            artista.id,

          status,

          proposed_fee:
            proposedFee,

          message,
        });

    if (error) {
      throw error;
    }
  }

  async function aceitarOferta(
    oferta: Oferta
  ) {
    if (!artista) {
      return;
    }

    try {
      setProcessando(
        oferta.id
      );

      setErro("");
      setMensagem("");

      const cache =
        cacheBaseArtista(
          oferta
        );

      await salvarResposta(
        oferta,
        "accepted",
        cache,
        "Oferta aceita pelo artista."
      );

      setMensagem(
        `Oferta "${oferta.title}" aceita com sucesso.`
      );

      await carregarPagina(
        false
      );
    } catch (error) {
      console.error(error);

      setErro(
        "Não foi possível aceitar esta oferta."
      );
    } finally {
      setProcessando(null);
    }
  }

  async function recusarOferta(
    oferta: Oferta
  ) {
    try {
      setProcessando(
        oferta.id
      );

      setErro("");
      setMensagem("");

      await salvarResposta(
        oferta,
        "declined",
        null,
        "Oferta recusada pelo artista."
      );

      setMensagem(
        "Oferta recusada."
      );

      await carregarPagina(
        false
      );
    } catch (error) {
      console.error(error);

      setErro(
        "Não foi possível recusar esta oferta."
      );
    } finally {
      setProcessando(null);
    }
  }

  function abrirContraproposta(
    oferta: Oferta
  ) {
    const valorInicial =
      respostas[
        oferta.id
      ]?.proposed_fee ??
      cacheBaseArtista(
        oferta
      );

    setValorContraproposta(
      Number(
        valorInicial || 0
      ).toFixed(2)
    );

    setMensagemContraproposta(
      respostas[
        oferta.id
      ]?.message || ""
    );

    setOfertaContraproposta(
      oferta.id
    );
  }

  function fecharContraproposta() {
    setOfertaContraproposta(
      null
    );

    setValorContraproposta(
      ""
    );

    setMensagemContraproposta(
      ""
    );
  }

  async function enviarContraproposta(
    oferta: Oferta
  ) {
    const valor = Number(
      valorContraproposta
        .replace(",", ".")
    );

    if (
      !Number.isFinite(
        valor
      ) ||
      valor <= 0
    ) {
      setErro(
        "Informe um valor válido para a contraproposta."
      );

      return;
    }

    try {
      setProcessando(
        oferta.id
      );

      setErro("");
      setMensagem("");

      await salvarResposta(
        oferta,
        "countered",
        valor,
        mensagemContraproposta.trim() ||
          "Contraproposta enviada pelo artista."
      );

      fecharContraproposta();

      setMensagem(
        "Contraproposta enviada para a Casa."
      );

      await carregarPagina(
        false
      );
    } catch (error) {
      console.error(error);

      setErro(
        "Não foi possível enviar a contraproposta."
      );
    } finally {
      setProcessando(null);
    }
  }

  const ofertasFiltradas =
    useMemo(() => {
      let lista = [
        ...ofertas,
      ];

      if (
        filtro === "convites"
      ) {
        lista =
          lista.filter(
            (oferta) =>
              respostas[
                oferta.id
              ]?.status ===
              "pending"
          );
      }

      if (
        filtro === "urgentes"
      ) {
        lista =
          lista.filter(
            (oferta) =>
              oferta.is_urgent &&
              oferta.status ===
                "open"
          );
      }

      if (
        filtro === "respondidas"
      ) {
        lista =
          lista.filter(
            (oferta) =>
              Boolean(
                respostas[
                  oferta.id
                ]
              )
          );
      }

      return lista.sort(
        (a, b) => {
          if (
            a.is_urgent !==
            b.is_urgent
          ) {
            return a.is_urgent
              ? -1
              : 1;
          }

          return (
            new Date(
              a.starts_at
            ).getTime() -
            new Date(
              b.starts_at
            ).getTime()
          );
        }
      );
    }, [
      ofertas,
      respostas,
      filtro,
    ]);

  const quantidadeConvites =
    ofertas.filter(
      (oferta) =>
        respostas[
          oferta.id
        ]?.status ===
        "pending"
    ).length;

  const quantidadeUrgentes =
    ofertas.filter(
      (oferta) =>
        oferta.is_urgent &&
        oferta.status ===
          "open"
    ).length;

  const quantidadeRespondidas =
    ofertas.filter(
      (oferta) =>
        Boolean(
          respostas[
            oferta.id
          ]
        )
    ).length;

  if (carregando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050507] text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-zinc-800 border-t-red-500" />

          <p className="text-zinc-400">
            Carregando ofertas...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050507] pb-24 text-white">
      <header className="border-b border-zinc-900 bg-black/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xl font-black">
              AURA{" "}
              <span className="text-red-500">
                BEAT
              </span>
            </p>

            <p className="text-xs text-zinc-500">
              Ofertas do Artista
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              router.push(
                "/home-artista"
              )
            }
            className="rounded-xl border border-zinc-800 px-4 py-2 text-sm font-bold text-zinc-300 transition hover:bg-zinc-900"
          >
            ← Home
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-7">
        <section className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-950 via-zinc-950 to-red-950/20 p-6">
          <p className="text-sm font-black text-red-500">
            OPORTUNIDADES
          </p>

          <h1 className="mt-2 text-3xl font-black">
            Olá,{" "}
            {artista?.stage_name ||
              "Artista"}
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Veja eventos disponíveis,
            convites recebidos e responda
            diretamente pela Aura Beat.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <div className="rounded-xl border border-zinc-800 bg-black/40 px-4 py-3">
              <p className="text-xs text-zinc-600">
                Cachê por hora
              </p>

              <p className="mt-1 font-black text-green-400">
                {dinheiro(
                  Number(
                    artista?.fixed_fee ||
                      0
                  )
                )}
                /h
              </p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-black/40 px-4 py-3">
              <p className="text-xs text-zinc-600">
                Cidade base
              </p>

              <p className="mt-1 font-black">
                {artista?.base_city ||
                  "Não informada"}

                {artista?.base_state
                  ? ` / ${artista.base_state}`
                  : ""}
              </p>
            </div>
          </div>
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

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            onClick={() =>
              setFiltro("todas")
            }
            className={`rounded-2xl border p-4 text-left transition ${
              filtro === "todas"
                ? "border-red-500 bg-red-950/20"
                : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
            }`}
          >
            <p className="text-xs font-bold text-zinc-500">
              TODAS
            </p>

            <p className="mt-2 text-2xl font-black">
              {ofertas.length}
            </p>
          </button>

          <button
            type="button"
            onClick={() =>
              setFiltro(
                "convites"
              )
            }
            className={`rounded-2xl border p-4 text-left transition ${
              filtro === "convites"
                ? "border-yellow-500 bg-yellow-950/20"
                : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
            }`}
          >
            <p className="text-xs font-bold text-zinc-500">
              CONVITES
            </p>

            <p className="mt-2 text-2xl font-black text-yellow-400">
              {quantidadeConvites}
            </p>
          </button>

          <button
            type="button"
            onClick={() =>
              setFiltro(
                "urgentes"
              )
            }
            className={`rounded-2xl border p-4 text-left transition ${
              filtro === "urgentes"
                ? "border-red-500 bg-red-950/20"
                : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
            }`}
          >
            <p className="text-xs font-bold text-zinc-500">
              URGENTES
            </p>

            <p className="mt-2 text-2xl font-black text-red-400">
              {quantidadeUrgentes}
            </p>
          </button>

          <button
            type="button"
            onClick={() =>
              setFiltro(
                "respondidas"
              )
            }
            className={`rounded-2xl border p-4 text-left transition ${
              filtro ===
              "respondidas"
                ? "border-purple-500 bg-purple-950/20"
                : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
            }`}
          >
            <p className="text-xs font-bold text-zinc-500">
              RESPONDIDAS
            </p>

            <p className="mt-2 text-2xl font-black text-purple-400">
              {
                quantidadeRespondidas
              }
            </p>
          </button>
        </section>

        {ofertasFiltradas.length ===
        0 ? (
          <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-10 text-center">
            <div className="text-4xl">
              🎧
            </div>

            <h2 className="mt-4 text-xl font-black">
              Nenhuma oferta encontrada
            </h2>

            <p className="mt-2 text-sm text-zinc-500">
              Quando novas Casas
              publicarem oportunidades,
              elas aparecerão aqui.
            </p>
          </section>
        ) : (
          <section className="space-y-5">
            {ofertasFiltradas.map(
              (oferta) => {
                const casa =
                  casas[
                    oferta.venue_id
                  ];

                const resposta =
                  respostas[
                    oferta.id
                  ];

                const cacheBase =
                  cacheBaseArtista(
                    oferta
                  );

                const statusResp =
                  resposta
                    ? statusResposta(
                        resposta.status
                      )
                    : null;

                const expirada =
                  oferta.expires_at
                    ? new Date(
                        oferta.expires_at
                      ).getTime() <
                      Date.now()
                    : false;

                const podeResponder =
                  oferta.status ===
                    "open" &&
                  !expirada &&
                  ![
                    "accepted",
                    "selected",
                  ].includes(
                    resposta?.status ||
                      ""
                  );

                return (
                  <article
                    key={oferta.id}
                    className={`overflow-hidden rounded-3xl border bg-zinc-950 ${
                      oferta.is_urgent
                        ? "border-red-800"
                        : "border-zinc-800"
                    }`}
                  >
                    <div className="border-b border-zinc-900 p-6">
                      <div className="flex flex-col justify-between gap-4 md:flex-row">
                        <div>
                          <div className="flex flex-wrap gap-2">
                            {oferta.is_urgent && (
                              <span className="rounded-full border border-red-700 bg-red-950/40 px-3 py-1 text-xs font-black text-red-400">
                                🔥 URGENTE
                              </span>
                            )}

                            {statusResp && (
                              <span
                                className={`rounded-full border px-3 py-1 text-xs font-black ${statusResp.classe}`}
                              >
                                {
                                  statusResp.texto
                                }
                              </span>
                            )}

                            {!resposta &&
                              oferta.status ===
                                "open" && (
                                <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs font-black text-zinc-400">
                                  Oferta aberta
                                </span>
                              )}

                            {oferta.status !==
                              "open" && (
                              <span className="rounded-full border border-zinc-700 bg-black px-3 py-1 text-xs font-black text-zinc-500">
                                {statusOferta(
                                  oferta.status
                                )}
                              </span>
                            )}
                          </div>

                          <h2 className="mt-4 text-2xl font-black">
                            {
                              oferta.title
                            }
                          </h2>

                          <p className="mt-2 text-sm text-zinc-400">
                            🏢{" "}
                            {casa?.trade_name ||
                              "Casa Aura Beat"}

                            {casa?.verification_status ===
                              "verified" &&
                              " ✓"}
                          </p>

                          {(casa?.city ||
                            casa?.state) && (
                            <p className="mt-1 text-sm text-zinc-600">
                              📍{" "}
                              {casa?.city}
                              {casa?.city &&
                              casa?.state
                                ? " / "
                                : ""}
                              {casa?.state}
                            </p>
                          )}
                        </div>

                        <div className="md:text-right">
                          <p className="text-xs font-bold text-zinc-600">
                            ORÇAMENTO DA CASA
                          </p>

                          <p className="mt-1 text-3xl font-black text-green-400">
                            {dinheiro(
                              oferta.budget_amount
                            )}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-6 p-6 lg:grid-cols-2">
                      <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4">
                            <p className="text-xs text-zinc-600">
                              📅 DATA
                            </p>

                            <p className="mt-2 font-black">
                              {dataEvento(
                                oferta.starts_at
                              )}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4">
                            <p className="text-xs text-zinc-600">
                              ⏱️ DURAÇÃO
                            </p>

                            <p className="mt-2 font-black">
                              {duracaoEvento(
                                oferta.duration_minutes
                              )}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4">
                            <p className="text-xs text-zinc-600">
                              🎉 TIPO
                            </p>

                            <p className="mt-2 font-black">
                              {oferta.event_type ||
                                "Não informado"}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-zinc-800 bg-black/40 p-4">
                            <p className="text-xs text-zinc-600">
                              👥 PÚBLICO
                            </p>

                            <p className="mt-2 font-black">
                              {oferta.expected_audience !==
                              null
                                ? `${oferta.expected_audience} pessoas`
                                : "Não informado"}
                            </p>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-zinc-800 bg-black/40 p-5">
                          <p className="text-xs font-bold text-zinc-600">
                            📍 LOCAL DO EVENTO
                          </p>

                          <p className="mt-2 font-bold">
                            {oferta.address_text ||
                              "Endereço não informado"}
                          </p>

                          <p className="mt-2 text-xs text-zinc-600">
                            Raio da oferta:{" "}
                            {Number(
                              oferta.radius_km ||
                                0
                            )}{" "}
                            km
                          </p>
                        </div>

                        {oferta.requested_styles &&
                          oferta
                            .requested_styles
                            .length >
                            0 && (
                            <div className="rounded-2xl border border-zinc-800 bg-black/40 p-5">
                              <p className="text-xs font-bold text-zinc-600">
                                🎵 ESTILOS DESEJADOS
                              </p>

                              <div className="mt-3 flex flex-wrap gap-2">
                                {oferta.requested_styles.map(
                                  (
                                    estilo
                                  ) => (
                                    <span
                                      key={
                                        estilo
                                      }
                                      className="rounded-full border border-purple-800 bg-purple-950/20 px-3 py-1 text-xs font-bold text-purple-300"
                                    >
                                      {
                                        estilo
                                      }
                                    </span>
                                  )
                                )}
                              </div>
                            </div>
                          )}
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-2xl border border-zinc-800 bg-black/40 p-5">
                          <p className="text-xs font-bold text-zinc-600">
                            💰 SEU CACHÊ BASE
                          </p>

                          <p className="mt-3 text-2xl font-black">
                            {dinheiro(
                              cacheBase
                            )}
                          </p>

                          <p className="mt-2 text-sm text-zinc-500">
                            {dinheiro(
                              Number(
                                artista?.fixed_fee ||
                                  0
                              )
                            )}
                            /h ×{" "}
                            {horasEvento(
                              oferta.duration_minutes
                            ).toLocaleString(
                              "pt-BR",
                              {
                                maximumFractionDigits: 2,
                              }
                            )}{" "}
                            hora(s)
                          </p>

                          <p className="mt-3 text-xs leading-5 text-zinc-600">
                            Deslocamento,
                            pedágios e
                            hospedagem são
                            tratados
                            separadamente do
                            cachê.
                          </p>
                        </div>

                        {oferta.description && (
                          <div className="rounded-2xl border border-zinc-800 bg-black/40 p-5">
                            <p className="text-xs font-bold text-zinc-600">
                              📝 DESCRIÇÃO
                            </p>

                            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
                              {
                                oferta.description
                              }
                            </p>
                          </div>
                        )}

                        {oferta.structure_details && (
                          <div className="rounded-2xl border border-zinc-800 bg-black/40 p-5">
                            <p className="text-xs font-bold text-zinc-600">
                              🔊 ESTRUTURA
                            </p>

                            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
                              {
                                oferta.structure_details
                              }
                            </p>
                          </div>
                        )}

                        {resposta?.proposed_fee !==
                          null &&
                          resposta?.proposed_fee !==
                            undefined && (
                            <div className="rounded-2xl border border-purple-900 bg-purple-950/20 p-5">
                              <p className="text-xs font-bold text-purple-400">
                                SUA PROPOSTA
                              </p>

                              <p className="mt-2 text-xl font-black">
                                {dinheiro(
                                  Number(
                                    resposta.proposed_fee
                                  )
                                )}
                              </p>

                              {resposta.message && (
                                <p className="mt-2 text-sm text-zinc-400">
                                  {
                                    resposta.message
                                  }
                                </p>
                              )}
                            </div>
                          )}
                      </div>
                    </div>

                    {resposta?.status ===
                      "accepted" ||
                    resposta?.status ===
                      "selected" ? (
                      <div className="border-t border-green-900/40 bg-green-950/10 p-5">
                        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                          <div>
                            <p className="font-black text-green-400">
                              ✓ Oferta aceita
                            </p>

                            <p className="mt-1 text-sm text-zinc-500">
                              Acompanhe a
                              contratação na
                              área de eventos.
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              router.push(
                                "/eventos-artista"
                              )
                            }
                            className="rounded-xl bg-green-600 px-5 py-3 text-sm font-black hover:bg-green-700"
                          >
                            Ver meus eventos →
                          </button>
                        </div>
                      </div>
                    ) : podeResponder ? (
                      <div className="grid gap-3 border-t border-zinc-900 p-5 sm:grid-cols-3">
                        <button
                          type="button"
                          disabled={
                            processando ===
                            oferta.id
                          }
                          onClick={() =>
                            recusarOferta(
                              oferta
                            )
                          }
                          className="rounded-xl border border-zinc-700 py-3 font-black text-zinc-400 transition hover:bg-zinc-900 disabled:opacity-50"
                        >
                          ✕ Recusar
                        </button>

                        <button
                          type="button"
                          disabled={
                            processando ===
                            oferta.id
                          }
                          onClick={() =>
                            abrirContraproposta(
                              oferta
                            )
                          }
                          className="rounded-xl border border-purple-800 py-3 font-black text-purple-300 transition hover:bg-purple-950/20 disabled:opacity-50"
                        >
                          💬 Contraproposta
                        </button>

                        <button
                          type="button"
                          disabled={
                            processando ===
                            oferta.id
                          }
                          onClick={() =>
                            aceitarOferta(
                              oferta
                            )
                          }
                          className="rounded-xl bg-red-500 py-3 font-black transition hover:bg-red-600 disabled:opacity-50"
                        >
                          {processando ===
                          oferta.id
                            ? "Processando..."
                            : "✓ Aceitar"}
                        </button>
                      </div>
                    ) : (
                      <div className="border-t border-zinc-900 p-5 text-sm text-zinc-500">
                        Esta oferta não está
                        mais disponível para
                        resposta.
                      </div>
                    )}

                    {ofertaContraproposta ===
                      oferta.id && (
                      <div className="border-t border-purple-900/50 bg-purple-950/10 p-6">
                        <p className="text-sm font-black text-purple-400">
                          CONTRAPROPOSTA
                        </p>

                        <h3 className="mt-1 text-xl font-black">
                          Negociar cachê
                        </h3>

                        <p className="mt-2 text-sm text-zinc-500">
                          Informe o novo
                          cachê total para
                          este evento.
                        </p>

                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                          <div>
                            <label className="mb-2 block text-sm font-bold text-zinc-300">
                              Cachê total
                              proposto
                            </label>

                            <input
                              type="text"
                              inputMode="decimal"
                              value={
                                valorContraproposta
                              }
                              onChange={(
                                event
                              ) =>
                                setValorContraproposta(
                                  event.target
                                    .value
                                )
                              }
                              placeholder="500,00"
                              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-purple-500"
                            />
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-bold text-zinc-300">
                              Mensagem para
                              a Casa
                            </label>

                            <input
                              type="text"
                              value={
                                mensagemContraproposta
                              }
                              onChange={(
                                event
                              ) =>
                                setMensagemContraproposta(
                                  event.target
                                    .value
                                )
                              }
                              placeholder="Ex.: Consigo fazer por este valor."
                              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-purple-500"
                            />
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={
                              fecharContraproposta
                            }
                            className="rounded-xl border border-zinc-700 py-3 font-bold text-zinc-400 hover:bg-zinc-900"
                          >
                            Cancelar
                          </button>

                          <button
                            type="button"
                            disabled={
                              processando ===
                              oferta.id
                            }
                            onClick={() =>
                              enviarContraproposta(
                                oferta
                              )
                            }
                            className="rounded-xl bg-purple-600 py-3 font-black hover:bg-purple-700 disabled:opacity-50"
                          >
                            Enviar
                            contraproposta
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              }
            )}
          </section>
        )}
      </div>
    </main>
  );
}
