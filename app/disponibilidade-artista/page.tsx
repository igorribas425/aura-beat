"use client";

import {
  FormEvent,
  useEffect,
  useEffectEvent,
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
  travel_calculation_mode: "fixed" | "vehicle" | "ticket" | null;
  ticket_transport_type: string | null;
  ticket_round_trip_amount: number | null;
  local_transport_default_amount: number | null;
  travel_notes: string | null;
};

type SolicitacaoRecebida = {
  id: string;
  artist_offer_id: string;
  venue_id: string;
  requested_starts_at: string;
  duration_minutes: number;
  agreed_fee: number;
  travel_amount: number;
  toll_amount: number;
  lodging_amount: number;
  event_address: string | null;
  message: string | null;
  status: "pending" | "accepted" | "declined" | "cancelled";
  transport_mode: string | null;
  transport_type: string | null;
  ticket_amount: number | null;
  local_transport_amount: number | null;
  transport_notes: string | null;
  venue_name?: string;
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
  transport_mode: string | null;
  transport_type: string | null;
  ticket_amount: number | null;
  local_transport_amount: number | null;
  transport_notes: string | null;
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

  const [transportMode, setTransportMode] =
    useState<"fixed" | "vehicle" | "ticket" | "venue_pickup" | "other">("fixed");

  const [transportType, setTransportType] =
    useState("");

  const [ticketAmount, setTicketAmount] =
    useState("");

  const [localTransportAmount, setLocalTransportAmount] =
    useState("");

  const [transportNotes, setTransportNotes] =
    useState("");

  const [solicitacoes, setSolicitacoes] =
    useState<SolicitacaoRecebida[]>([]);

  const [carregando, setCarregando] =
    useState(true);

  const [salvando, setSalvando] =
    useState(false);

  const [erro, setErro] =
    useState("");

  const [mensagem, setMensagem] =
    useState("");

  const carregarPaginaEffect = useEffectEvent(() => {
    void carregarPagina();
  });

  useEffect(() => {
    carregarPaginaEffect();
  }, []);

  useEffect(() => {
    if (solicitacoes.length === 0) return;

    const requestToFocus = new URLSearchParams(window.location.search).get("request");
    if (!requestToFocus) return;

    window.requestAnimationFrame(() => {
      document
        .getElementById(`request-${requestToFocus}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [solicitacoes]);

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
          verification_status,
          travel_calculation_mode,
          ticket_transport_type,
          ticket_round_trip_amount,
          local_transport_default_amount,
          travel_notes
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

      const modoPadrao =
        perfil.travel_calculation_mode === "vehicle"
          ? "vehicle"
          : perfil.travel_calculation_mode === "ticket"
            ? "ticket"
            : "fixed";

      setTransportMode(modoPadrao);
      setTransportType(perfil.ticket_transport_type || "");
      setTicketAmount(String(perfil.ticket_round_trip_amount ?? ""));
      setLocalTransportAmount(
        String(perfil.local_transport_default_amount ?? "")
      );
      setTransportNotes(perfil.travel_notes || "");

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
        created_at,
        transport_mode,
        transport_type,
        ticket_amount,
        local_transport_amount,
        transport_notes
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

    await carregarSolicitacoesRecebidas(
      (data || []) as OfertaArtista[]
    );
  }

  async function carregarSolicitacoesRecebidas(
    lista: OfertaArtista[]
  ) {
    const offerIds = lista.map((item) => item.id);

    if (offerIds.length === 0) {
      setSolicitacoes([]);
      return;
    }

    const { data, error } = await supabase
      .from("artist_offer_requests")
      .select(
        "id,artist_offer_id,venue_id,requested_starts_at,duration_minutes,agreed_fee,travel_amount,toll_amount,lodging_amount,event_address,message,status,transport_mode,transport_type,ticket_amount,local_transport_amount,transport_notes"
      )
      .in("artist_offer_id", offerIds)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    const requests = (data || []) as SolicitacaoRecebida[];
    const venueIds = [...new Set(requests.map((item) => item.venue_id))];

    if (venueIds.length === 0) {
      setSolicitacoes(requests);
      return;
    }

    const { data: venues } = await supabase
      .from("venue_profiles")
      .select("id,trade_name")
      .in("id", venueIds);

    const names = new Map(
      (venues || []).map((venue) => [venue.id, venue.trade_name])
    );

    setSolicitacoes(
      requests.map((item) => ({
        ...item,
        venue_name: names.get(item.venue_id) || "Casa",
      }))
    );
  }

  async function responderSolicitacao(
    requestId: string,
    action: "accepted" | "declined"
  ) {
    try {
      setErro("");
      setMensagem("");

      const { data, error } = await supabase.rpc(
        "responder_solicitacao_oferta_artista",
        {
          p_request_id: requestId,
          p_action: action,
        }
      );

      if (error) throw error;

      setMensagem(
        action === "accepted"
          ? "Solicitação aceita. A contratação já entrou nos eventos."
          : "Solicitação recusada."
      );

      if (artista) {
        await carregarOfertas(artista.id);
      }

      if (action === "accepted" && data) {
        router.push("/eventos-artista");
      }
    } catch (error) {
      console.error(error);
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível responder à solicitação."
      );
    }
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

          transport_mode:
            transportMode,

          transport_type:
            transportType.trim() || null,

          ticket_amount:
            transportMode === "ticket"
              ? converterNumero(ticketAmount || "0")
              : 0,

          local_transport_amount:
            transportMode === "ticket" || transportMode === "other"
              ? converterNumero(localTransportAmount || "0")
              : 0,

          transport_notes:
            transportNotes.trim() || null,

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
                anúncio, a comissão Aura Beat é de 3% da Casa e 3%
                do artista, somente sobre o cachê. A taxa de processamento
                do ASAAS é calculada separadamente no pagamento.
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

              <div className="rounded-2xl border border-cyan-900/50 bg-cyan-950/10 p-4">
                <label className="mb-3 block text-sm font-black text-cyan-300">
                  Como você vai até o evento?
                </label>

                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    ["fixed", "🚗 Valor por km"],
                    ["vehicle", "⛽ Meu veículo"],
                    ["ticket", "🎫 Passagem"],
                    ["venue_pickup", "🏠 Casa me busca"],
                    ["other", "🚐 Outro"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        setTransportMode(
                          value as
                            | "fixed"
                            | "vehicle"
                            | "ticket"
                            | "venue_pickup"
                            | "other"
                        )
                      }
                      className={`rounded-xl border px-3 py-3 text-left text-sm font-bold ${
                        transportMode === value
                          ? "border-cyan-500 bg-cyan-500/10 text-cyan-200"
                          : "border-zinc-800 bg-black text-zinc-400"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {(transportMode === "ticket" || transportMode === "other") && (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <input
                      value={transportType}
                      onChange={(e) => setTransportType(e.target.value)}
                      placeholder="Ônibus, avião, van..."
                      className="rounded-xl border border-zinc-800 bg-black px-4 py-3"
                    />

                    {transportMode === "ticket" && (
                      <input
                        value={ticketAmount}
                        onChange={(e) => setTicketAmount(e.target.value)}
                        inputMode="decimal"
                        placeholder="Passagem ida e volta"
                        className="rounded-xl border border-zinc-800 bg-black px-4 py-3"
                      />
                    )}

                    <input
                      value={localTransportAmount}
                      onChange={(e) => setLocalTransportAmount(e.target.value)}
                      inputMode="decimal"
                      placeholder="Transporte local"
                      className="rounded-xl border border-zinc-800 bg-black px-4 py-3"
                    />

                    <input
                      value={transportNotes}
                      onChange={(e) => setTransportNotes(e.target.value)}
                      placeholder="Observação sobre deslocamento"
                      className="rounded-xl border border-zinc-800 bg-black px-4 py-3"
                    />
                  </div>
                )}

                <p className="mt-3 text-xs text-zinc-500">
                  A Casa verá esse meio de locomoção antes de solicitar sua contratação.
                </p>
              </div>

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

        <section className="mt-8 rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase text-amber-400">
                Solicitações das Casas
              </p>
              <h2 className="mt-1 text-2xl font-black">
                Pedidos recebidos
              </h2>
            </div>

            <span className="rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-400">
              {solicitacoes.filter((item) => item.status === "pending").length} pendente(s)
            </span>
          </div>

          <div className="mt-5 space-y-4">
            {solicitacoes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-zinc-500">
                Nenhuma Casa enviou solicitação ainda.
              </div>
            ) : (
              solicitacoes.map((solicitacao) => (
                <article
                  key={solicitacao.id}
                  id={`request-${solicitacao.id}`}
                  className="rounded-2xl border border-zinc-800 bg-black p-5"
                >
                  <div className="flex flex-col justify-between gap-4 md:flex-row">
                    <div>
                      <p className="text-xs uppercase text-zinc-500">
                        {solicitacao.venue_name || "Casa"}
                      </p>
                      <h3 className="mt-1 text-lg font-black">
                        {dataHora(solicitacao.requested_starts_at)}
                      </h3>
                      <p className="mt-1 text-sm text-zinc-500">
                        {Math.round(solicitacao.duration_minutes / 60 * 10) / 10}h · {dinheiro(solicitacao.agreed_fee)}
                      </p>
                    </div>

                    <span className="h-fit rounded-full border border-zinc-700 px-3 py-1 text-xs font-bold text-zinc-300">
                      {solicitacao.status === "pending"
                        ? "Aguardando sua resposta"
                        : solicitacao.status === "accepted"
                          ? "Aceita"
                          : solicitacao.status === "declined"
                            ? "Recusada"
                            : "Cancelada"}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div className="rounded-xl bg-zinc-950 p-3">
                      <p className="text-xs text-zinc-600">Local</p>
                      <p className="mt-1 text-zinc-300">
                        {solicitacao.event_address || "Não informado"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-zinc-950 p-3">
                      <p className="text-xs text-zinc-600">Deslocamento</p>
                      <p className="mt-1 text-zinc-300">
                        {solicitacao.transport_mode || "Padrão do DJ"} · {dinheiro(solicitacao.travel_amount)}
                      </p>
                    </div>
                  </div>

                  {solicitacao.message && (
                    <div className="mt-3 rounded-xl border border-zinc-800 p-3 text-sm text-zinc-400">
                      “{solicitacao.message}”
                    </div>
                  )}

                  {solicitacao.status === "pending" && (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => void responderSolicitacao(solicitacao.id, "declined")}
                        className="rounded-xl border border-zinc-700 py-3 font-bold text-zinc-300"
                      >
                        Recusar
                      </button>
                      <button
                        type="button"
                        onClick={() => void responderSolicitacao(solicitacao.id, "accepted")}
                        className="rounded-xl bg-green-600 py-3 font-black text-white"
                      >
                        ✓ Aceitar Casa
                      </button>
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        </section>

      </div>
    </main>
  );
}