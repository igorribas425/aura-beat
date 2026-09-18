"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type Artista = {
  id: string;
  stage_name: string;
  base_city: string | null;
  base_state: string | null;
  verification_status: string | null;
};

type OfertaArtista = {
  id: string;
  artist_id: string;

  title: string;
  description: string | null;

  styles: string[];

  available_from: string;
  available_until: string;

  fee_amount: number;
  radius_km: number;

  base_city: string | null;
  base_state: string | null;

  is_urgent: boolean;

  status:
    | "draft"
    | "open"
    | "filled"
    | "closed"
    | "cancelled";

  expires_at: string | null;

  created_at: string;
};

function dinheiro(valor: number) {
  return new Intl.NumberFormat(
    "pt-BR",
    {
      style: "currency",
      currency: "BRL",
    }
  ).format(Number(valor || 0));
}

function dataHora(valor: string) {
  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  ).format(new Date(valor));
}

function converterNumero(
  valor: string
) {
  return Number(
    valor
      .trim()
      .replace(/\./g, "")
      .replace(",", ".")
  );
}

function textoStatus(
  status: OfertaArtista["status"]
) {
  switch (status) {
    case "open":
      return "Disponível";

    case "filled":
      return "Contratado";

    case "cancelled":
      return "Cancelada";

    case "closed":
      return "Encerrada";

    case "draft":
      return "Rascunho";

    default:
      return status;
  }
}

export default function DisponibilidadeArtistaPage() {
  const router = useRouter();

  const [artista, setArtista] =
    useState<Artista | null>(null);

  const [ofertas, setOfertas] =
    useState<OfertaArtista[]>([]);

  const [titulo, setTitulo] =
    useState("");

  const [descricao, setDescricao] =
    useState("");

  const [estilos, setEstilos] =
    useState("");

  const [
    inicioDisponibilidade,
    setInicioDisponibilidade,
  ] = useState("");

  const [
    fimDisponibilidade,
    setFimDisponibilidade,
  ] = useState("");

  const [cache, setCache] =
    useState("");

  const [cidade, setCidade] =
    useState("");

  const [estado, setEstado] =
    useState("");

  const [raio, setRaio] =
    useState("50");

  const [expiraEm, setExpiraEm] =
    useState("");

  const [carregando, setCarregando] =
    useState(true);

  const [salvando, setSalvando] =
    useState(false);

  const [erro, setErro] =
    useState("");

  const [mensagem, setMensagem] =
    useState("");

  useEffect(() => {
    void carregarPagina();
  }, []);

  const taxaArtista = useMemo(() => {
    const valor = converterNumero(cache);

    if (
      !Number.isFinite(valor) ||
      valor <= 0
    ) {
      return 0;
    }

    return Number(
      (valor * 0.03).toFixed(2)
    );
  }, [cache]);

  const liquidoArtista = useMemo(() => {
    const valor = converterNumero(cache);

    if (
      !Number.isFinite(valor) ||
      valor <= 0
    ) {
      return 0;
    }

    return Number(
      (valor - taxaArtista).toFixed(2)
    );
  }, [cache, taxaArtista]);

  async function carregarPagina() {
    try {
      setCarregando(true);
      setErro("");

      const {
        data: authData,
        error: authError,
      } = await supabase.auth.getUser();

      if (
        authError ||
        !authData.user
      ) {
        router.push("/login");
        return;
      }

      const {
        data: artistaData,
        error: artistaError,
      } = await supabase
        .from("artist_profiles")
        .select(`
          id,
          stage_name,
          base_city,
          base_state,
          verification_status
        `)
        .eq(
          "user_id",
          authData.user.id
        )
        .maybeSingle();

      if (artistaError) {
        throw artistaError;
      }

      if (!artistaData) {
        setErro(
          "Você ainda não possui perfil de artista."
        );

        return;
      }

      const perfil =
        artistaData as Artista;

      setArtista(perfil);

      setCidade(
        perfil.base_city || ""
      );

      setEstado(
        perfil.base_state || ""
      );

      await carregarOfertas(
        perfil.id
      );
    } catch (error) {
      console.error(error);

      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar a página."
      );
    } finally {
      setCarregando(false);
    }
  }

  async function carregarOfertas(
    artistaId: string
  ) {
    const {
      data,
      error,
    } = await supabase
      .from("artist_offers")
      .select(`
        id,
        artist_id,
        title,
        description,
        styles,
        available_from,
        available_until,
        fee_amount,
        radius_km,
        base_city,
        base_state,
        is_urgent,
        status,
        expires_at,
        created_at
      `)
      .eq(
        "artist_id",
        artistaId
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (error) {
      throw error;
    }

    setOfertas(
      (data || []) as OfertaArtista[]
    );
  }

  async function publicarOferta(
    event: FormEvent
  ) {
    event.preventDefault();

    if (!artista) {
      return;
    }

    setErro("");
    setMensagem("");

    if (
      artista.verification_status !==
      "verified"
    ) {
      setErro(
        "Seu perfil precisa estar verificado para publicar uma disponibilidade."
      );

      return;
    }

    if (!titulo.trim()) {
      setErro(
        "Informe um título para a oferta."
      );

      return;
    }

    if (
      !inicioDisponibilidade ||
      !fimDisponibilidade
    ) {
      setErro(
        "Informe o início e o fim da disponibilidade."
      );

      return;
    }

    const inicio = new Date(
      inicioDisponibilidade
    );

    const fim = new Date(
      fimDisponibilidade
    );

    if (
      Number.isNaN(inicio.getTime()) ||
      Number.isNaN(fim.getTime())
    ) {
      setErro(
        "Data ou horário inválido."
      );

      return;
    }

    if (fim <= inicio) {
      setErro(
        "O horário final precisa ser depois do horário inicial."
      );

      return;
    }

    const valorCache =
      converterNumero(cache);

    if (
      !Number.isFinite(valorCache) ||
      valorCache <= 0
    ) {
      setErro(
        "Informe um cachê válido."
      );

      return;
    }

    const valorRaio =
      converterNumero(raio);

    if (
      !Number.isFinite(valorRaio) ||
      valorRaio < 0
    ) {
      setErro(
        "Informe um raio válido."
      );

      return;
    }

    const listaEstilos =
      estilos
        .split(",")
        .map(
          (item) => item.trim()
        )
        .filter(Boolean);

    try {
      setSalvando(true);

      const {
        error,
      } = await supabase
        .from("artist_offers")
        .insert({
          artist_id:
            artista.id,

          title:
            titulo.trim(),

          description:
            descricao.trim() ||
            null,

          styles:
            listaEstilos,

          available_from:
            inicio.toISOString(),

          available_until:
            fim.toISOString(),

          fee_amount:
            valorCache,

          radius_km:
            valorRaio,

          base_city:
            cidade.trim() ||
            null,

          base_state:
            estado
              .trim()
              .toUpperCase() ||
            null,

          is_urgent:
            true,

          status:
            "open",

          expires_at:
            expiraEm
              ? new Date(
                  expiraEm
                ).toISOString()
              : fim.toISOString(),
        });

      if (error) {
        throw error;
      }

      setMensagem(
        "Disponibilidade publicada com sucesso."
      );

      setTitulo("");
      setDescricao("");
      setEstilos("");
      setInicioDisponibilidade("");
      setFimDisponibilidade("");
      setCache("");
      setRaio("50");
      setExpiraEm("");

      await carregarOfertas(
        artista.id
      );
    } catch (error) {
      console.error(error);

      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível publicar a oferta."
      );
    } finally {
      setSalvando(false);
    }
  }

  async function cancelarOferta(
    ofertaId: string
  ) {
    if (!artista) {
      return;
    }

    const confirmar =
      window.confirm(
        "Deseja cancelar esta disponibilidade?"
      );

    if (!confirmar) {
      return;
    }

    try {
      setErro("");
      setMensagem("");

      const {
        error,
      } = await supabase
        .from("artist_offers")
        .update({
          status:
            "cancelled",

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          ofertaId
        )
        .eq(
          "artist_id",
          artista.id
        );

      if (error) {
        throw error;
      }

      setMensagem(
        "Oferta cancelada."
      );

      await carregarOfertas(
        artista.id
      );
    } catch (error) {
      console.error(error);

      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível cancelar."
      );
    }
  }

  if (carregando) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <div className="mx-auto max-w-6xl">
          Carregando...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <div className="mx-auto max-w-6xl">

        <div className="mb-8">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-purple-400">
            Aura Beat
          </p>

          <h1 className="text-3xl font-bold">
            Disponibilidade Urgente
          </h1>

          <p className="mt-2 max-w-3xl text-zinc-400">
            Publique uma data livre para que Casas encontrem
            você e enviem uma solicitação de contratação.
          </p>
        </div>

        {erro && (
          <div className="mb-6 rounded-xl border border-red-900 bg-red-950/30 p-4 text-red-300">
            {erro}
          </div>
        )}

        {mensagem && (
          <div className="mb-6 rounded-xl border border-green-900 bg-green-950/30 p-4 text-green-300">
            {mensagem}
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">

          <form
            onSubmit={
              publicarOferta
            }
            className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6"
          >
            <div className="mb-6">
              <h2 className="text-xl font-semibold">
                Publicar disponibilidade
              </h2>

              {artista && (
                <p className="mt-1 text-sm text-zinc-500">
                  {artista.stage_name}
                </p>
              )}
            </div>

            <div className="mb-5 rounded-xl border border-amber-800/60 bg-amber-950/20 p-4">
              <div className="font-semibold text-amber-300">
                ⚡ Oferta Urgente
              </div>

              <p className="mt-1 text-sm text-amber-100/70">
                Quando uma contratação acontecer por este
                anúncio, a Aura Beat cobra 3% da Casa e 3%
                do artista, somente sobre o cachê.
              </p>
            </div>

            <div className="space-y-5">

              <div>
                <label className="mb-2 block text-sm text-zinc-300">
                  Título
                </label>

                <input
                  value={titulo}
                  onChange={(e) =>
                    setTitulo(
                      e.target.value
                    )
                  }
                  placeholder="Ex.: DJ disponível sábado à noite"
                  className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none focus:border-purple-600"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-300">
                  Descrição
                </label>

                <textarea
                  value={descricao}
                  onChange={(e) =>
                    setDescricao(
                      e.target.value
                    )
                  }
                  placeholder="Ex.: disponível para festas, clubs e eventos particulares."
                  rows={4}
                  className="w-full resize-none rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none focus:border-purple-600"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-300">
                  Estilos
                </label>

                <input
                  value={estilos}
                  onChange={(e) =>
                    setEstilos(
                      e.target.value
                    )
                  }
                  placeholder="Mega Funk, Funk, Open Format"
                  className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none focus:border-purple-600"
                />

                <p className="mt-1 text-xs text-zinc-600">
                  Separe os estilos por vírgula.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-zinc-300">
                    Disponível a partir de
                  </label>

                  <input
                    type="datetime-local"
                    value={
                      inicioDisponibilidade
                    }
                    onChange={(e) =>
                      setInicioDisponibilidade(
                        e.target.value
                      )
                    }
                    className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none focus:border-purple-600"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-zinc-300">
                    Disponível até
                  </label>

                  <input
                    type="datetime-local"
                    value={
                      fimDisponibilidade
                    }
                    onChange={(e) =>
                      setFimDisponibilidade(
                        e.target.value
                      )
                    }
                    className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none focus:border-purple-600"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-300">
                  Cachê pretendido
                </label>

                <input
                  value={cache}
                  onChange={(e) =>
                    setCache(
                      e.target.value
                    )
                  }
                  inputMode="decimal"
                  placeholder="500,00"
                  className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-lg font-semibold outline-none focus:border-purple-600"
                />
              </div>

              {liquidoArtista > 0 && (
                <div className="rounded-xl border border-zinc-800 bg-black p-4">
                  <div className="flex justify-between text-sm text-zinc-400">
                    <span>
                      Cachê
                    </span>

                    <span>
                      {dinheiro(
                        converterNumero(
                          cache
                        )
                      )}
                    </span>
                  </div>

                  <div className="mt-2 flex justify-between text-sm text-zinc-400">
                    <span>
                      Taxa Aura Beat 3%
                    </span>

                    <span>
                      - {dinheiro(
                        taxaArtista
                      )}
                    </span>
                  </div>

                  <div className="mt-3 flex justify-between border-t border-zinc-800 pt-3 font-semibold">
                    <span>
                      Você recebe
                    </span>

                    <span className="text-green-400">
                      {dinheiro(
                        liquidoArtista
                      )}
                    </span>
                  </div>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-[1fr_120px]">

                <div>
                  <label className="mb-2 block text-sm text-zinc-300">
                    Cidade
                  </label>

                  <input
                    value={cidade}
                    onChange={(e) =>
                      setCidade(
                        e.target.value
                      )
                    }
                    placeholder="Carazinho"
                    className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none focus:border-purple-600"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-zinc-300">
                    UF
                  </label>

                  <input
                    value={estado}
                    maxLength={2}
                    onChange={(e) =>
                      setEstado(
                        e.target.value
                          .toUpperCase()
                      )
                    }
                    placeholder="RS"
                    className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 uppercase outline-none focus:border-purple-600"
                  />
                </div>

              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-300">
                  Raio de atendimento
                </label>

                <div className="relative">
                  <input
                    value={raio}
                    onChange={(e) =>
                      setRaio(
                        e.target.value
                      )
                    }
                    inputMode="decimal"
                    className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 pr-14 outline-none focus:border-purple-600"
                  />

                  <span className="absolute right-4 top-3 text-zinc-500">
                    km
                  </span>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-300">
                  Oferta disponível até
                </label>

                <input
                  type="datetime-local"
                  value={expiraEm}
                  onChange={(e) =>
                    setExpiraEm(
                      e.target.value
                    )
                  }
                  className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none focus:border-purple-600"
                />

                <p className="mt-1 text-xs text-zinc-600">
                  Se deixar vazio, a oferta expira no fim da disponibilidade.
                </p>
              </div>

              <button
                type="submit"
                disabled={salvando}
                className="w-full rounded-xl bg-purple-600 px-5 py-3 font-semibold transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {salvando
                  ? "Publicando..."
                  : "⚡ Publicar disponibilidade"}
              </button>

            </div>
          </form>

          <section>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">
                  Minhas ofertas
                </h2>

                <p className="text-sm text-zinc-500">
                  Acompanhe suas disponibilidades.
                </p>
              </div>
            </div>

            {ofertas.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-zinc-500">
                Você ainda não publicou nenhuma disponibilidade.
              </div>
            ) : (
              <div className="space-y-4">

                {ofertas.map(
                  (oferta) => (
                    <div
                      key={
                        oferta.id
                      }
                      className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5"
                    >
                      <div className="flex items-start justify-between gap-4">

                        <div>
                          <div className="mb-2 flex flex-wrap items-center gap-2">

                            <span className="rounded-full border border-amber-800 bg-amber-950/30 px-2.5 py-1 text-xs font-semibold text-amber-300">
                              ⚡ Urgente
                            </span>

                            <span className="rounded-full border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300">
                              {textoStatus(
                                oferta.status
                              )}
                            </span>

                          </div>

                          <h3 className="font-semibold">
                            {
                              oferta.title
                            }
                          </h3>

                          <p className="mt-1 text-sm text-zinc-500">
                            {oferta.base_city ||
                              "Cidade não informada"}
                            {oferta.base_state
                              ? `/${oferta.base_state}`
                              : ""}
                          </p>
                        </div>

                        <div className="text-right">
                          <div className="font-bold text-green-400">
                            {dinheiro(
                              oferta.fee_amount
                            )}
                          </div>

                          <div className="text-xs text-zinc-600">
                            cachê
                          </div>
                        </div>

                      </div>

                      <div className="mt-4 rounded-xl bg-black p-3 text-sm text-zinc-400">
                        <div>
                          📅{" "}
                          {dataHora(
                            oferta.available_from
                          )}
                        </div>

                        <div className="mt-1">
                          até{" "}
                          {dataHora(
                            oferta.available_until
                          )}
                        </div>

                        <div className="mt-1">
                          📍 Raio de{" "}
                          {oferta.radius_km} km
                        </div>
                      </div>

                      {oferta.styles &&
                        oferta.styles.length >
                          0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {oferta.styles.map(
                              (
                                estilo
                              ) => (
                                <span
                                  key={
                                    estilo
                                  }
                                  className="rounded-lg bg-zinc-900 px-2.5 py-1 text-xs text-zinc-400"
                                >
                                  {
                                    estilo
                                  }
                                </span>
                              )
                            )}
                          </div>
                        )}

                      {oferta.status ===
                        "open" && (
                        <button
                          onClick={() =>
                            void cancelarOferta(
                              oferta.id
                            )
                          }
                          className="mt-4 rounded-lg border border-red-900 px-3 py-2 text-sm text-red-400 hover:bg-red-950/30"
                        >
                          Cancelar oferta
                        </button>
                      )}

                    </div>
                  )
                )}

              </div>
            )}
          </section>

        </div>
      </div>
    </main>
  );
}