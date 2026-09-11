"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type Casa = {
  id: string;
  trade_name: string;
  verification_status: string;

  address_line: string | null;
  address_number: string | null;
  address_extra: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
};

type Artista = {
  id: string;
  stage_name: string;
  fixed_fee: number | null;
  base_city: string | null;
  base_state: string | null;
  verification_status: string | null;
};

type OfertaStatus =
  | "draft"
  | "open"
  | "filled"
  | "closed"
  | "cancelled";

type Oferta = {
  id: string;
  title: string;
  status: OfertaStatus;
  is_urgent: boolean;
  event_type: string | null;
  starts_at: string;
  duration_minutes: number;
  budget_amount: number;
  address_text: string | null;
  created_at: string;
};

type LocalEvento = {
  lat: number;
  lng: number;
  accuracy: number;
};

type FormOferta = {
  title: string;
  description: string;
  event_type: string;
  styles: string;

  starts_at: string;
  duration_hours: string;

  budget_amount: string;

  radius_km: string;
  expected_audience: string;

  structure_details: string;
  address_text: string;

  expires_at: string;

  is_urgent: boolean;
};

const FORM_VAZIO: FormOferta = {
  title: "",
  description: "",
  event_type: "",
  styles: "",

  starts_at: "",
  duration_hours: "2",

  budget_amount: "",

  radius_km: "50",
  expected_audience: "",

  structure_details: "",
  address_text: "",

  expires_at: "",

  is_urgent: false,
};

function dinheiro(valor: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(valor || 0));
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

  const resto =
    Number(minutos || 0) % 60;

  if (
    horas > 0 &&
    resto > 0
  ) {
    return `${horas}h ${resto}min`;
  }

  if (horas > 0) {
    return `${horas}h`;
  }

  return `${resto} min`;
}

function statusOferta(
  status: OfertaStatus
) {
  switch (status) {
    case "open":
      return {
        texto: "Aberta",
        classe:
          "border-green-800 bg-green-950/20 text-green-400",
      };

    case "filled":
      return {
        texto: "Preenchida",
        classe:
          "border-purple-800 bg-purple-950/20 text-purple-400",
      };

    case "closed":
      return {
        texto: "Encerrada",
        classe:
          "border-zinc-700 bg-zinc-900 text-zinc-400",
      };

    case "cancelled":
      return {
        texto: "Cancelada",
        classe:
          "border-red-900 bg-red-950/20 text-red-400",
      };

    default:
      return {
        texto: "Rascunho",
        classe:
          "border-yellow-800 bg-yellow-950/20 text-yellow-400",
      };
  }
}

function enderecoCasa(
  casa: Casa
) {
  const partes = [
    casa.address_line,
    casa.address_number,
    casa.neighborhood,
    casa.city,
    casa.state,
  ].filter(Boolean);

  return partes.join(", ");
}

function converterNumero(
  valor: string
) {
  const tratado = valor
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");

  return Number(tratado);
}

export default function OfertasCasaPage() {
  const router = useRouter();

  const [casa, setCasa] =
    useState<Casa | null>(null);

  const [artistaAlvo, setArtistaAlvo] =
    useState<Artista | null>(null);

  const [
    artistaAlvoId,
    setArtistaAlvoId,
  ] = useState<string | null>(null);

  const [form, setForm] =
    useState<FormOferta>(
      FORM_VAZIO
    );

  const [ofertas, setOfertas] =
    useState<Oferta[]>([]);

  const [
    localEvento,
    setLocalEvento,
  ] = useState<LocalEvento | null>(
    null
  );

  const [carregando, setCarregando] =
    useState(true);

  const [publicando, setPublicando] =
    useState(false);

  const [
    buscandoLocal,
    setBuscandoLocal,
  ] = useState(false);

  const [erro, setErro] =
    useState("");

  const [mensagem, setMensagem] =
    useState("");

  useEffect(() => {
    carregarPagina();
  }, []);

  async function carregarPagina() {
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

      const {
        data: perfilCasa,
        error: erroCasa,
      } = await supabase
        .from("venue_profiles")
        .select(`
          id,
          trade_name,
          verification_status,
          address_line,
          address_number,
          address_extra,
          neighborhood,
          city,
          state
        `)
        .eq(
          "owner_user_id",
          user.id
        )
        .maybeSingle();

      if (erroCasa) {
        throw erroCasa;
      }

      if (!perfilCasa) {
        router.replace(
          "/perfil-casa"
        );

        return;
      }

      const casaEncontrada =
        perfilCasa as Casa;

      setCasa(
        casaEncontrada
      );

      setForm(
        (anterior) => ({
          ...anterior,

          address_text:
            enderecoCasa(
              casaEncontrada
            ),
        })
      );

      const params =
        new URLSearchParams(
          window.location.search
        );

      const artistId =
        params.get("artist");

      setArtistaAlvoId(
        artistId
      );

      if (artistId) {
        await carregarArtista(
          artistId
        );
      }

      await carregarOfertas(
        casaEncontrada.id
      );
    } catch (error) {
      console.error(error);

      setErro(
        "Não foi possível carregar a página de ofertas."
      );
    } finally {
      setCarregando(false);
    }
  }

  async function carregarArtista(
    artistId: string
  ) {
    const {
      data,
      error,
    } = await supabase
      .from("artist_profiles")
      .select(`
        id,
        stage_name,
        fixed_fee,
        base_city,
        base_state,
        verification_status
      `)
      .eq("id", artistId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      setArtistaAlvo(null);
      setArtistaAlvoId(null);

      return;
    }

    setArtistaAlvo(
      data as Artista
    );
  }

  async function carregarOfertas(
    venueId: string
  ) {
    const {
      data,
      error,
    } = await supabase
      .from("offers")
      .select(`
        id,
        title,
        status,
        is_urgent,
        event_type,
        starts_at,
        duration_minutes,
        budget_amount,
        address_text,
        created_at
      `)
      .eq(
        "venue_id",
        venueId
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      )
      .limit(10);

    if (error) {
      console.error(error);
      return;
    }

    setOfertas(
      (data || []) as Oferta[]
    );
  }

  function atualizarCampo(
    campo: keyof FormOferta,
    valor: string | boolean
  ) {
    setForm(
      (anterior) => ({
        ...anterior,
        [campo]: valor,
      })
    );
  }

  const horas =
    useMemo(() => {
      const valor =
        converterNumero(
          form.duration_hours
        );

      if (
        !Number.isFinite(valor)
      ) {
        return 0;
      }

      return valor;
    }, [form.duration_hours]);

  const cacheSugerido =
    useMemo(() => {
      if (!artistaAlvo) {
        return 0;
      }

      return (
        Number(
          artistaAlvo.fixed_fee ||
            0
        ) * horas
      );
    }, [
      artistaAlvo,
      horas,
    ]);

  function usarCacheSugerido() {
    setForm(
      (anterior) => ({
        ...anterior,

        budget_amount:
          cacheSugerido.toFixed(2),
      })
    );
  }

  function removerArtistaAlvo() {
    setArtistaAlvo(null);
    setArtistaAlvoId(null);

    window.history.replaceState(
      {},
      "",
      "/ofertas"
    );
  }

  async function usarLocalAtual() {
    if (!navigator.geolocation) {
      setErro(
        "Seu navegador não possui acesso à localização."
      );

      return;
    }

    try {
      setBuscandoLocal(true);
      setErro("");
      setMensagem("");

      const local =
        await new Promise<LocalEvento>(
          (
            resolve,
            reject
          ) => {
            navigator.geolocation.getCurrentPosition(
              (posicao) => {
                resolve({
                  lat:
                    posicao.coords
                      .latitude,

                  lng:
                    posicao.coords
                      .longitude,

                  accuracy:
                    posicao.coords
                      .accuracy,
                });
              },

              reject,

              {
                enableHighAccuracy:
                  true,

                timeout: 20000,

                maximumAge: 5000,
              }
            );
          }
        );

      setLocalEvento(local);

      setMensagem(
        "Localização do evento registrada."
      );
    } catch (error) {
      console.error(error);

      setErro(
        "Não foi possível obter sua localização."
      );
    } finally {
      setBuscandoLocal(false);
    }
  }

  function validarFormulario() {
    if (!casa) {
      return "Perfil da Casa não encontrado.";
    }

    if (
      casa.verification_status !==
      "verified"
    ) {
      return "A Casa precisa estar verificada para contratar artistas.";
    }

    if (!form.title.trim()) {
      return "Informe o nome da oferta.";
    }

    if (
      !form.event_type.trim()
    ) {
      return "Informe o tipo de evento.";
    }

    if (!form.starts_at) {
      return "Informe a data e o horário do evento.";
    }

    if (
      !Number.isFinite(horas) ||
      horas <= 0
    ) {
      return "Informe uma duração válida.";
    }

    const budget =
      converterNumero(
        form.budget_amount
      );

    if (
      !Number.isFinite(
        budget
      ) ||
      budget < 0
    ) {
      return "Informe um orçamento válido.";
    }

    const raio =
      converterNumero(
        form.radius_km
      );

    if (
      !Number.isFinite(raio) ||
      raio <= 0
    ) {
      return "Informe um raio válido.";
    }

    if (
      !form.address_text.trim()
    ) {
      return "Informe o endereço do evento.";
    }

    if (
      form.expires_at &&
      new Date(
        form.expires_at
      ).getTime() >=
        new Date(
          form.starts_at
        ).getTime()
    ) {
      return "O prazo para responder deve terminar antes do início do evento.";
    }

    return null;
  }

  async function publicarOferta() {
    const erroValidacao =
      validarFormulario();

    if (erroValidacao) {
      setErro(
        erroValidacao
      );

      return;
    }

    if (!casa) {
      return;
    }

    try {
      setPublicando(true);
      setErro("");
      setMensagem("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const estilos =
        form.styles
          .split(",")
          .map(
            (item) =>
              item.trim()
          )
          .filter(Boolean);

      const publico =
        form.expected_audience
          ? Math.max(
              0,
              Math.round(
                converterNumero(
                  form.expected_audience
                )
              )
            )
          : null;

      const budget =
        converterNumero(
          form.budget_amount
        );

      const raio =
        converterNumero(
          form.radius_km
        );

      const duracaoMinutos =
        Math.max(
          1,
          Math.round(
            horas * 60
          )
        );

      const localizacao =
        localEvento
          ? `SRID=4326;POINT(${localEvento.lng} ${localEvento.lat})`
          : null;

      const payload = {
        venue_id:
          casa.id,

        created_by:
          user.id,

        title:
          form.title.trim(),

        description:
          form.description.trim() ||
          null,

        status:
          "open",

        is_urgent:
          form.is_urgent,

        event_type:
          form.event_type.trim(),

        requested_styles:
          estilos,

        starts_at:
          new Date(
            form.starts_at
          ).toISOString(),

        duration_minutes:
          duracaoMinutos,

        budget_amount:
          budget,

        radius_km:
          raio,

        expected_audience:
          publico,

        structure_details:
          form.structure_details.trim() ||
          null,

        address_text:
          form.address_text.trim(),

        event_location:
          localizacao,

        expires_at:
          form.expires_at
            ? new Date(
                form.expires_at
              ).toISOString()
            : null,
      };

      const {
        data: ofertaCriada,
        error: erroOferta,
      } = await supabase
        .from("offers")
        .insert(payload)
        .select(`
          id,
          title,
          status,
          is_urgent,
          event_type,
          starts_at,
          duration_minutes,
          budget_amount,
          address_text,
          created_at
        `)
        .single();

      if (erroOferta) {
        throw erroOferta;
      }

      if (
        artistaAlvoId
      ) {
        const {
          error: erroConvite,
        } = await supabase
          .from(
            "offer_responses"
          )
          .insert({
            offer_id:
              ofertaCriada.id,

            artist_id:
              artistaAlvoId,

            status:
              "pending",

            proposed_fee:
              null,

            message:
              "Convite enviado diretamente pela Casa.",
          });

        if (erroConvite) {
          await supabase
            .from("offers")
            .delete()
            .eq(
              "id",
              ofertaCriada.id
            );

          throw erroConvite;
        }

        setMensagem(
          `Convite enviado para ${artistaAlvo?.stage_name || "o artista"} com sucesso.`
        );
      } else {
        setMensagem(
          "Oferta publicada com sucesso para os artistas da Aura Beat."
        );
      }

      const enderecoAtual =
        form.address_text;

      setForm({
        ...FORM_VAZIO,

        address_text:
          enderecoAtual,
      });

      setLocalEvento(null);

      await carregarOfertas(
        casa.id
      );
    } catch (error: unknown) {
      console.error(error);

      let texto =
        "Não foi possível publicar a oferta.";

      if (
        typeof error ===
          "object" &&
        error !== null &&
        "message" in error
      ) {
        const mensagemErro =
          String(
            (
              error as {
                message?: string;
              }
            ).message || ""
          );

        if (
          mensagemErro.includes(
            "row-level security"
          )
        ) {
          texto =
            "O Supabase bloqueou esta ação por permissão. Me mande um print do erro do terminal que eu ajusto a regra.";
        }
      }

      setErro(texto);
    } finally {
      setPublicando(false);
    }
  }

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
              Criar oferta
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              router.push(
                "/home-casa"
              )
            }
            className="rounded-xl border border-zinc-800 px-4 py-2 text-sm font-bold text-zinc-300 hover:bg-zinc-900"
          >
            ← Home
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-7">
        <section className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-950 via-zinc-950 to-red-950/20 p-6">
          <p className="text-sm font-black text-red-500">
            NOVA OFERTA
          </p>

          <h1 className="mt-2 text-3xl font-black">
            Contratar artista
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Preencha os detalhes do evento,
            orçamento e estrutura disponível.
          </p>
        </section>

        {casa?.verification_status !==
          "verified" && (
          <div className="rounded-2xl border border-yellow-900 bg-yellow-950/20 p-5">
            <p className="font-black text-yellow-400">
              ⚠️ Casa ainda não verificada
            </p>

            <p className="mt-2 text-sm text-zinc-400">
              Para publicar uma contratação,
              o perfil da Casa precisa estar
              verificado.
            </p>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/perfil-casa"
                )
              }
              className="mt-4 rounded-xl border border-yellow-800 px-4 py-2 text-sm font-bold text-yellow-300"
            >
              Abrir Perfil da Casa
            </button>
          </div>
        )}

        {artistaAlvo && (
          <section className="rounded-3xl border border-purple-800 bg-purple-950/10 p-6">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs font-black text-purple-400">
                  CONVITE DIRETO
                </p>

                <h2 className="mt-2 text-2xl font-black">
                  🎧 {artistaAlvo.stage_name}
                </h2>

                <p className="mt-1 text-sm text-zinc-500">
                  {artistaAlvo.base_city ||
                    "Cidade não informada"}

                  {artistaAlvo.base_state
                    ? ` / ${artistaAlvo.base_state}`
                    : ""}
                </p>
              </div>

              <div className="sm:text-right">
                <p className="text-xs text-zinc-600">
                  Cachê por hora
                </p>

                <p className="mt-1 text-2xl font-black text-green-400">
                  {dinheiro(
                    Number(
                      artistaAlvo.fixed_fee ||
                        0
                    )
                  )}
                  /h
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <div className="rounded-xl border border-purple-900 bg-black/30 px-4 py-3">
                <p className="text-xs text-zinc-600">
                  Cachê sugerido para {horas || 0}h
                </p>

                <p className="mt-1 font-black">
                  {dinheiro(
                    cacheSugerido
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={
                  usarCacheSugerido
                }
                className="rounded-xl bg-purple-600 px-4 py-3 text-sm font-black hover:bg-purple-700"
              >
                Usar valor sugerido
              </button>

              <button
                type="button"
                onClick={
                  removerArtistaAlvo
                }
                className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold text-zinc-400 hover:bg-zinc-900"
              >
                Publicar para todos
              </button>
            </div>
          </section>
        )}

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
          <h2 className="text-xl font-black">
            🎉 Evento
          </h2>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Nome da oferta *
              </label>

              <input
                type="text"
                value={form.title}
                onChange={(event) =>
                  atualizarCampo(
                    "title",
                    event.target.value
                  )
                }
                placeholder="Ex.: Festa / Club"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Tipo de evento *
              </label>

              <select
                value={
                  form.event_type
                }
                onChange={(event) =>
                  atualizarCampo(
                    "event_type",
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
              >
                <option value="">
                  Selecione
                </option>

                <option value="Festa / Club">
                  Festa / Club
                </option>

                <option value="Festa Privada">
                  Festa Privada
                </option>

                <option value="Casamento">
                  Casamento
                </option>

                <option value="Formatura">
                  Formatura
                </option>

                <option value="Corporativo">
                  Corporativo
                </option>

                <option value="Festival">
                  Festival
                </option>

                <option value="Sunset">
                  Sunset
                </option>

                <option value="Aniversário">
                  Aniversário
                </option>

                <option value="Outro">
                  Outro
                </option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Data e horário *
              </label>

              <input
                type="datetime-local"
                value={
                  form.starts_at
                }
                onChange={(event) =>
                  atualizarCampo(
                    "starts_at",
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Duração em horas *
              </label>

              <input
                type="number"
                min="0.5"
                step="0.5"
                value={
                  form.duration_hours
                }
                onChange={(event) =>
                  atualizarCampo(
                    "duration_hours",
                    event.target.value
                  )
                }
                placeholder="2"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Estilos desejados
              </label>

              <input
                type="text"
                value={form.styles}
                onChange={(event) =>
                  atualizarCampo(
                    "styles",
                    event.target.value
                  )
                }
                placeholder="Ex.: Mega Funk, Funk, Open Format"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
              />

              <p className="mt-2 text-xs text-zinc-600">
                Separe vários estilos com vírgula.
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Descrição
              </label>

              <textarea
                rows={4}
                value={
                  form.description
                }
                onChange={(event) =>
                  atualizarCampo(
                    "description",
                    event.target.value
                  )
                }
                placeholder="Explique como será o evento..."
                className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
              />
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
          <h2 className="text-xl font-black">
            💰 Orçamento
          </h2>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Cachê total disponível *
              </label>

              <input
                type="text"
                inputMode="decimal"
                value={
                  form.budget_amount
                }
                onChange={(event) =>
                  atualizarCampo(
                    "budget_amount",
                    event.target.value
                  )
                }
                placeholder="500,00"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
              />

              <p className="mt-2 text-xs text-zinc-600">
                Deslocamento, pedágio e hospedagem são separados do cachê.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Raio da oferta
              </label>

              <select
                value={
                  form.radius_km
                }
                onChange={(event) =>
                  atualizarCampo(
                    "radius_km",
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
              >
                <option value="10">
                  10 km
                </option>

                <option value="25">
                  25 km
                </option>

                <option value="50">
                  50 km
                </option>

                <option value="100">
                  100 km
                </option>

                <option value="200">
                  200 km
                </option>

                <option value="500">
                  500 km
                </option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Público estimado
              </label>

              <input
                type="number"
                min="0"
                value={
                  form.expected_audience
                }
                onChange={(event) =>
                  atualizarCampo(
                    "expected_audience",
                    event.target.value
                  )
                }
                placeholder="Ex.: 300"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Prazo para responder
              </label>

              <input
                type="datetime-local"
                value={
                  form.expires_at
                }
                onChange={(event) =>
                  atualizarCampo(
                    "expires_at",
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
              />
            </div>

            <label className="md:col-span-2 flex cursor-pointer items-center gap-4 rounded-2xl border border-red-900 bg-red-950/10 p-5">
              <input
                type="checkbox"
                checked={
                  form.is_urgent
                }
                onChange={(event) =>
                  atualizarCampo(
                    "is_urgent",
                    event.target.checked
                  )
                }
                className="h-5 w-5 accent-red-500"
              />

              <div>
                <p className="font-black text-red-400">
                  🔥 Oferta urgente
                </p>

                <p className="mt-1 text-xs text-zinc-500">
                  Destaque esta contratação para os artistas.
                </p>
              </div>
            </label>
          </div>
        </section>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
          <h2 className="text-xl font-black">
            📍 Local e estrutura
          </h2>

          <div className="mt-6 space-y-5">
            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Endereço do evento *
              </label>

              <input
                type="text"
                value={
                  form.address_text
                }
                onChange={(event) =>
                  atualizarCampo(
                    "address_text",
                    event.target.value
                  )
                }
                placeholder="Rua, número, bairro, cidade e estado"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
              />
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-black/40 p-5">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <p className="font-black">
                    📡 GPS do local
                  </p>

                  {localEvento ? (
                    <p className="mt-1 text-sm text-green-400">
                      ✓ Localização registrada
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-zinc-500">
                      Ajuda a calcular rota e acompanhar o deslocamento do DJ.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={
                    buscandoLocal
                  }
                  onClick={
                    usarLocalAtual
                  }
                  className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-black hover:bg-zinc-900 disabled:opacity-50"
                >
                  {buscandoLocal
                    ? "Buscando..."
                    : "📍 Usar localização atual"}
                </button>
              </div>

              {localEvento && (
                <p className="mt-3 text-xs text-zinc-600">
                  {localEvento.lat.toFixed(
                    6
                  )}
                  ,{" "}
                  {localEvento.lng.toFixed(
                    6
                  )}
                  {" • "}
                  precisão aproximada ±
                  {Math.round(
                    localEvento.accuracy
                  )}
                  m
                </p>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-300">
                Estrutura disponível
              </label>

              <textarea
                rows={4}
                value={
                  form.structure_details
                }
                onChange={(event) =>
                  atualizarCampo(
                    "structure_details",
                    event.target.value
                  )
                }
                placeholder="Ex.: Som, luz, CDJ, mesa, cabine, retorno, microfone..."
                className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
              />
            </div>
          </div>
        </section>

        <button
          type="button"
          disabled={
            publicando ||
            casa?.verification_status !==
              "verified"
          }
          onClick={
            publicarOferta
          }
          className="w-full rounded-2xl bg-red-500 py-5 text-lg font-black transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {publicando
            ? "Publicando..."
            : artistaAlvo
              ? `🎧 Enviar convite para ${artistaAlvo.stage_name}`
              : "🔥 Publicar oferta"}
        </button>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-black text-red-500">
                HISTÓRICO
              </p>

              <h2 className="mt-1 text-2xl font-black">
                Ofertas da Casa
              </h2>
            </div>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/eventos-casa"
                )
              }
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-bold hover:bg-zinc-900"
            >
              Ver contratações →
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {ofertas.length ===
            0 ? (
              <div className="rounded-2xl border border-zinc-800 bg-black/40 p-5 text-sm text-zinc-500">
                Nenhuma oferta criada ainda.
              </div>
            ) : (
              ofertas.map(
                (oferta) => {
                  const status =
                    statusOferta(
                      oferta.status
                    );

                  return (
                    <article
                      key={
                        oferta.id
                      }
                      className="rounded-2xl border border-zinc-800 bg-black/40 p-5"
                    >
                      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                        <div>
                          <div className="flex flex-wrap gap-2">
                            <span
                              className={`rounded-full border px-3 py-1 text-xs font-black ${status.classe}`}
                            >
                              {
                                status.texto
                              }
                            </span>

                            {oferta.is_urgent && (
                              <span className="rounded-full border border-red-800 bg-red-950/30 px-3 py-1 text-xs font-black text-red-400">
                                🔥 Urgente
                              </span>
                            )}
                          </div>

                          <h3 className="mt-3 text-lg font-black">
                            {
                              oferta.title
                            }
                          </h3>

                          <p className="mt-1 text-sm text-zinc-500">
                            📅{" "}
                            {dataEvento(
                              oferta.starts_at
                            )}
                            {" • "}
                            {duracaoEvento(
                              oferta.duration_minutes
                            )}
                          </p>

                          <p className="mt-1 text-sm text-zinc-600">
                            📍{" "}
                            {oferta.address_text ||
                              "Endereço não informado"}
                          </p>
                        </div>

                        <div className="md:text-right">
                          <p className="text-xs text-zinc-600">
                            Orçamento
                          </p>

                          <p className="mt-1 text-xl font-black text-green-400">
                            {dinheiro(
                              oferta.budget_amount
                            )}
                          </p>
                        </div>
                      </div>
                    </article>
                  );
                }
              )
            )}
          </div>
        </section>
      </div>
    </main>
  );
}