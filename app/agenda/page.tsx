"use client";

import {
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation";
import {
  resolveAgendaAccess,
} from "../../lib/agenda-access.mjs";
import { supabase } from "../../lib/supabase";

type Artista = {
  id: string;
  stage_name: string;
};

type TipoAgenda =
  | "blocked"
  | "manual"
  | "booking";

type ItemAgenda = {
  id: string;
  artist_id: string;
  kind: TipoAgenda;
  booking_id: string | null;
  starts_at: string;
  ends_at: string;
  note: string | null;
  created_at: string;
};

type BookingStatus =
  | "awaiting_payment"
  | "confirmed"
  | "in_transit"
  | "arrived"
  | "in_event"
  | "completed"
  | "cancelled"
  | "disputed";

type Booking = {
  id: string;
  venue_id: string;
  status: BookingStatus;
  starts_at: string;
  duration_minutes: number;
  event_address_snapshot: string | null;
};

type Casa = {
  id: string;
  trade_name: string;
};

type FormBloqueio = {
  kind: "blocked" | "manual";
  starts_at: string;
  ends_at: string;
  note: string;
};

const FORM_VAZIO: FormBloqueio = {
  kind: "blocked",
  starts_at: "",
  ends_at: "",
  note: "",
};

const NOMES_MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const DIAS_SEMANA = [
  "DOM",
  "SEG",
  "TER",
  "QUA",
  "QUI",
  "SEX",
  "SÁB",
];

function dataHora(valor: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(valor));
}

function somenteHora(valor: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(valor));
}

function chaveDia(data: Date) {
  const ano = data.getFullYear();

  const mes = String(
    data.getMonth() + 1
  ).padStart(2, "0");

  const dia = String(
    data.getDate()
  ).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function chaveDiaIso(valor: string) {
  return chaveDia(
    new Date(valor)
  );
}

function adicionarMinutos(
  data: string,
  minutos: number
) {
  const inicio =
    new Date(data);

  inicio.setMinutes(
    inicio.getMinutes() +
      Number(minutos || 0)
  );

  return inicio.toISOString();
}

function statusBooking(
  status: BookingStatus
) {
  switch (status) {
    case "awaiting_payment":
      return {
        texto: "Aguardando pagamento",
        classe:
          "border-yellow-800 bg-yellow-950/20 text-yellow-400",
      };

    case "confirmed":
      return {
        texto: "Confirmado",
        classe:
          "border-green-800 bg-green-950/20 text-green-400",
      };

    case "in_transit":
      return {
        texto: "A caminho",
        classe:
          "border-blue-800 bg-blue-950/20 text-blue-400",
      };

    case "arrived":
      return {
        texto: "No local",
        classe:
          "border-purple-800 bg-purple-950/20 text-purple-400",
      };

    case "in_event":
      return {
        texto: "Em evento",
        classe:
          "border-red-800 bg-red-950/20 text-red-400",
      };

    case "completed":
      return {
        texto: "Finalizado",
        classe:
          "border-zinc-700 bg-zinc-900 text-zinc-400",
      };

    case "cancelled":
      return {
        texto: "Cancelado",
        classe:
          "border-red-900 bg-red-950/20 text-red-400",
      };

    case "disputed":
      return {
        texto: "Em análise",
        classe:
          "border-orange-800 bg-orange-950/20 text-orange-400",
      };

    default:
      return {
        texto: status,
        classe:
          "border-zinc-800 bg-zinc-900 text-zinc-400",
      };
  }
}

function tipoManual(
  tipo: TipoAgenda
) {
  if (tipo === "blocked") {
    return {
      texto: "Indisponível",
      icone: "🔒",
      classe:
        "border-red-900 bg-red-950/20 text-red-400",
    };
  }

  if (tipo === "manual") {
    return {
      texto: "Compromisso",
      icone: "📌",
      classe:
        "border-purple-900 bg-purple-950/20 text-purple-400",
    };
  }

  return {
    texto: "Contratação",
    icone: "🎧",
    classe:
      "border-green-900 bg-green-950/20 text-green-400",
  };
}

export default function AgendaPage() {
  const router = useRouter();

  const hoje =
    new Date();

  const [
    artista,
    setArtista,
  ] = useState<Artista | null>(
    null
  );

  const [
    itensAgenda,
    setItensAgenda,
  ] = useState<ItemAgenda[]>(
    []
  );

  const [
    bookings,
    setBookings,
  ] = useState<Booking[]>([]);

  const [
    casas,
    setCasas,
  ] = useState<
    Record<string, Casa>
  >({});

  const [
    mesAtual,
    setMesAtual,
  ] = useState(
    new Date(
      hoje.getFullYear(),
      hoje.getMonth(),
      1
    )
  );

  const [
    diaSelecionado,
    setDiaSelecionado,
  ] = useState<string>(
    chaveDia(hoje)
  );

  const [
    mostrarFormulario,
    setMostrarFormulario,
  ] = useState(false);

  const [
    form,
    setForm,
  ] = useState<FormBloqueio>(
    FORM_VAZIO
  );

  const [
    carregando,
    setCarregando,
  ] = useState(true);

  const [
    salvando,
    setSalvando,
  ] = useState(false);

  const [
    excluindo,
    setExcluindo,
  ] = useState<string | null>(
    null
  );

  const [
    erro,
    setErro,
  ] = useState("");

  const [
    mensagem,
    setMensagem,
  ] = useState("");

  const carregarAgendaEffect = useEffectEvent(() => {
    void carregarAgenda();
  });

  useEffect(() => {
    carregarAgendaEffect();
  }, []);

  async function carregarAgenda() {
    try {
      setCarregando(true);
      setErro("");

      const {
        data: { user },
      } =
        await supabase.auth.getUser();

      if (!user) {
        router.replace(
          "/login"
        );

        return;
      }

      const acesso =
        await resolveAgendaAccess({
          loadActiveMode:
            async () => {
              const {
                data: perfil,
                error: erroPerfil,
              } = await supabase
                .from("profiles")
                .select(
                  "default_mode"
                )
                .eq(
                  "id",
                  user.id
                )
                .maybeSingle();

              if (erroPerfil) {
                throw erroPerfil;
              }

              return perfil?.default_mode;
            },
          loadArtist:
            async () => {
              const {
                data: perfil,
                error: erroPerfil,
              } = await supabase
                .from(
                  "artist_profiles"
                )
                .select(
                  "id, stage_name"
                )
                .eq(
                  "user_id",
                  user.id
                )
                .maybeSingle();

              if (erroPerfil) {
                throw erroPerfil;
              }

              return perfil as Artista | null;
            },
        });

      if (
        acesso.kind ===
        "redirect"
      ) {
        router.replace(
          acesso.href
        );

        return;
      }

      const perfil =
        acesso.artist;

      setArtista(perfil);

      const [
        respostaAgenda,
        respostaBookings,
      ] = await Promise.all([
        supabase
          .from(
            "artist_calendar"
          )
          .select(`
            id,
            artist_id,
            kind,
            booking_id,
            starts_at,
            ends_at,
            note,
            created_at
          `)
          .eq(
            "artist_id",
            perfil.id
          )
          .in(
            "kind",
            [
              "blocked",
              "manual",
            ]
          )
          .order(
            "starts_at",
            {
              ascending: true,
            }
          ),

        supabase
          .from("bookings")
          .select(`
            id,
            venue_id,
            status,
            starts_at,
            duration_minutes,
            event_address_snapshot
          `)
          .eq(
            "artist_id",
            perfil.id
          )
          .neq(
            "status",
            "cancelled"
          )
          .order(
            "starts_at",
            {
              ascending: true,
            }
          ),
      ]);

      if (
        respostaAgenda.error
      ) {
        throw respostaAgenda.error;
      }

      if (
        respostaBookings.error
      ) {
        throw respostaBookings.error;
      }

      const agenda =
        (respostaAgenda.data ||
          []) as ItemAgenda[];

      const listaBookings =
        (respostaBookings.data ||
          []) as Booking[];

      setItensAgenda(
        agenda
      );

      setBookings(
        listaBookings
      );

      await carregarCasas(
        listaBookings
      );
    } catch (error) {
      console.error(error);

      setErro(
        "Não foi possível carregar sua agenda."
      );
    } finally {
      setCarregando(false);
    }
  }

  async function carregarCasas(
    listaBookings: Booking[]
  ) {
    const ids = [
      ...new Set(
        listaBookings.map(
          (booking) =>
            booking.venue_id
        )
      ),
    ];

    if (
      ids.length === 0
    ) {
      setCasas({});

      return;
    }

    const {
      data,
      error,
    } = await supabase
      .from(
        "venue_profiles"
      )
      .select(
        "id, trade_name"
      )
      .in(
        "id",
        ids
      );

    if (error) {
      console.error(
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

  function atualizarCampo(
    campo: keyof FormBloqueio,
    valor: string
  ) {
    setForm(
      (anterior) => ({
        ...anterior,
        [campo]: valor,
      })
    );
  }

  function abrirNovoBloqueio() {
    const base =
      diaSelecionado ||
      chaveDia(new Date());

    setForm({
      kind: "blocked",

      starts_at:
        `${base}T18:00`,

      ends_at:
        `${base}T23:59`,

      note: "",
    });

    setErro("");
    setMensagem("");

    setMostrarFormulario(
      true
    );
  }

  function fecharFormulario() {
    setMostrarFormulario(
      false
    );

    setForm(
      FORM_VAZIO
    );
  }

  async function salvarBloqueio() {
    if (!artista) {
      return;
    }

    if (!form.starts_at) {
      setErro(
        "Informe o início."
      );

      return;
    }

    if (!form.ends_at) {
      setErro(
        "Informe o término."
      );

      return;
    }

    const inicio =
      new Date(
        form.starts_at
      );

    const fim =
      new Date(
        form.ends_at
      );

    if (
      Number.isNaN(
        inicio.getTime()
      ) ||
      Number.isNaN(
        fim.getTime()
      )
    ) {
      setErro(
        "Informe datas válidas."
      );

      return;
    }

    if (
      fim.getTime() <=
      inicio.getTime()
    ) {
      setErro(
        "O término precisa ser depois do início."
      );

      return;
    }

    const conflitoBooking =
      bookings.some(
        (booking) => {
          const inicioBooking =
            new Date(
              booking.starts_at
            );

          const fimBooking =
            new Date(
              adicionarMinutos(
                booking.starts_at,
                booking.duration_minutes
              )
            );

          return (
            inicio <
              fimBooking &&
            fim >
              inicioBooking
          );
        }
      );

    if (
      conflitoBooking
    ) {
      setErro(
        "Este horário já possui uma contratação na sua agenda."
      );

      return;
    }

    const conflitoManual =
      itensAgenda.some(
        (item) => {
          const inicioItem =
            new Date(
              item.starts_at
            );

          const fimItem =
            new Date(
              item.ends_at
            );

          return (
            inicio <
              fimItem &&
            fim >
              inicioItem
          );
        }
      );

    if (
      conflitoManual
    ) {
      setErro(
        "Este horário já está bloqueado ou possui outro compromisso."
      );

      return;
    }

    try {
      setSalvando(true);
      setErro("");
      setMensagem("");

      const {
        error,
      } = await supabase
        .from(
          "artist_calendar"
        )
        .insert({
          artist_id:
            artista.id,

          kind:
            form.kind,

          booking_id:
            null,

          starts_at:
            inicio.toISOString(),

          ends_at:
            fim.toISOString(),

          note:
            form.note.trim() ||
            null,
        });

      if (error) {
        throw error;
      }

      setMensagem(
        form.kind ===
          "blocked"
          ? "Horário bloqueado com sucesso."
          : "Compromisso adicionado à agenda."
      );

      fecharFormulario();

      await carregarAgenda();
    } catch (error) {
      console.error(error);

      setErro(
        "Não foi possível salvar este horário."
      );
    } finally {
      setSalvando(false);
    }
  }

  async function excluirItem(
    item: ItemAgenda
  ) {
    try {
      setExcluindo(
        item.id
      );

      setErro("");
      setMensagem("");

      const {
        error,
      } = await supabase
        .from(
          "artist_calendar"
        )
        .delete()
        .eq(
          "id",
          item.id
        );

      if (error) {
        throw error;
      }

      setItensAgenda(
        (anteriores) =>
          anteriores.filter(
            (atual) =>
              atual.id !==
              item.id
          )
      );

      setMensagem(
        "Horário removido da agenda."
      );
    } catch (error) {
      console.error(error);

      setErro(
        "Não foi possível remover este horário."
      );
    } finally {
      setExcluindo(null);
    }
  }

  const calendario =
    useMemo(() => {
      const ano =
        mesAtual.getFullYear();

      const mes =
        mesAtual.getMonth();

      const primeiroDia =
        new Date(
          ano,
          mes,
          1
        );

      const ultimoDia =
        new Date(
          ano,
          mes + 1,
          0
        );

      const quantidadeDias =
        ultimoDia.getDate();

      const espacosInicio =
        primeiroDia.getDay();

      const dias: Array<
        Date | null
      > = [];

      for (
        let i = 0;
        i < espacosInicio;
        i++
      ) {
        dias.push(null);
      }

      for (
        let dia = 1;
        dia <=
        quantidadeDias;
        dia++
      ) {
        dias.push(
          new Date(
            ano,
            mes,
            dia
          )
        );
      }

      while (
        dias.length % 7 !==
        0
      ) {
        dias.push(null);
      }

      return dias;
    }, [mesAtual]);

  const bookingsPorDia =
    useMemo(() => {
      const mapa: Record<
        string,
        Booking[]
      > = {};

      bookings.forEach(
        (booking) => {
          const chave =
            chaveDiaIso(
              booking.starts_at
            );

          if (!mapa[chave]) {
            mapa[chave] = [];
          }

          mapa[chave].push(
            booking
          );
        }
      );

      return mapa;
    }, [bookings]);

  const agendaPorDia =
    useMemo(() => {
      const mapa: Record<
        string,
        ItemAgenda[]
      > = {};

      itensAgenda.forEach(
        (item) => {
          const chave =
            chaveDiaIso(
              item.starts_at
            );

          if (!mapa[chave]) {
            mapa[chave] = [];
          }

          mapa[chave].push(
            item
          );
        }
      );

      return mapa;
    }, [itensAgenda]);

  const eventosDia =
    bookingsPorDia[
      diaSelecionado
    ] || [];

  const bloqueiosDia =
    agendaPorDia[
      diaSelecionado
    ] || [];

  const proximosBookings =
    bookings
      .filter(
        (booking) =>
          new Date(
            booking.starts_at
          ).getTime() >=
            Date.now() &&
          booking.status !==
            "completed"
      )
      .slice(0, 5);

  const diasOcupados =
    new Set([
      ...bookings.map(
        (booking) =>
          chaveDiaIso(
            booking.starts_at
          )
      ),

      ...itensAgenda.map(
        (item) =>
          chaveDiaIso(
            item.starts_at
          )
      ),
    ]).size;

  function mesAnterior() {
    setMesAtual(
      (anterior) =>
        new Date(
          anterior.getFullYear(),
          anterior.getMonth() -
            1,
          1
        )
    );
  }

  function proximoMes() {
    setMesAtual(
      (anterior) =>
        new Date(
          anterior.getFullYear(),
          anterior.getMonth() +
            1,
          1
        )
    );
  }

  function voltarHoje() {
    const agora =
      new Date();

    setMesAtual(
      new Date(
        agora.getFullYear(),
        agora.getMonth(),
        1
      )
    );

    setDiaSelecionado(
      chaveDia(agora)
    );
  }

  if (carregando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050507] text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-zinc-800 border-t-red-500" />

          <p className="text-zinc-400">
            Carregando agenda...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050507] pb-24 text-white">
      <header className="border-b border-zinc-900 bg-black/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xl font-black">
              AURA{" "}
              <span className="text-red-500">
                BEAT
              </span>
            </p>

            <p className="text-xs text-zinc-500">
              Agenda do Artista
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              router.push(
                "/home-artista"
              )
            }
            className="rounded-xl border border-zinc-800 px-4 py-2 text-sm font-bold text-zinc-300 hover:bg-zinc-900"
          >
            ← Home
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-7">
        <section className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-950 via-zinc-950 to-red-950/20 p-6">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
            <div>
              <p className="text-sm font-black text-red-500">
                MINHA AGENDA
              </p>

              <h1 className="mt-2 text-3xl font-black">
                {artista?.stage_name ||
                  "Artista"}
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                Veja seus eventos e bloqueie
                horários em que você não quer
                receber novas contratações.
              </p>
            </div>

            <button
              type="button"
              onClick={
                abrirNovoBloqueio
              }
              className="rounded-2xl bg-red-500 px-6 py-4 font-black hover:bg-red-600"
            >
              + Bloquear horário
            </button>
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

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <p className="text-sm text-zinc-500">
              📅 Dias ocupados
            </p>

            <p className="mt-2 text-3xl font-black">
              {diasOcupados}
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <p className="text-sm text-zinc-500">
              🎧 Próximos eventos
            </p>

            <p className="mt-2 text-3xl font-black text-green-400">
              {
                proximosBookings.length
              }
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <p className="text-sm text-zinc-500">
              🔒 Bloqueios manuais
            </p>

            <p className="mt-2 text-3xl font-black text-red-400">
              {
                itensAgenda.length
              }
            </p>
          </div>
        </section>

        {mostrarFormulario && (
          <section className="rounded-3xl border border-red-900 bg-zinc-950 p-6">
            <p className="text-sm font-black text-red-500">
              NOVO HORÁRIO
            </p>

            <h2 className="mt-1 text-2xl font-black">
              Adicionar à agenda
            </h2>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-bold text-zinc-300">
                  Tipo
                </label>

                <select
                  value={
                    form.kind
                  }
                  onChange={(event) =>
                    atualizarCampo(
                      "kind",
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
                >
                  <option value="blocked">
                    🔒 Indisponível
                  </option>

                  <option value="manual">
                    📌 Compromisso pessoal
                  </option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-zinc-300">
                  Observação
                </label>

                <input
                  type="text"
                  value={
                    form.note
                  }
                  onChange={(event) =>
                    atualizarCampo(
                      "note",
                      event.target.value
                    )
                  }
                  placeholder="Ex.: Viagem, outro compromisso..."
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-zinc-300">
                  Início *
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
                  Término *
                </label>

                <input
                  type="datetime-local"
                  value={
                    form.ends_at
                  }
                  onChange={(event) =>
                    atualizarCampo(
                      "ends_at",
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-red-500"
                />
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={
                  fecharFormulario
                }
                className="rounded-xl border border-zinc-700 py-3 font-bold text-zinc-400 hover:bg-zinc-900"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={
                  salvando
                }
                onClick={
                  salvarBloqueio
                }
                className="rounded-xl bg-red-500 py-3 font-black hover:bg-red-600 disabled:opacity-50"
              >
                {salvando
                  ? "Salvando..."
                  : "Salvar na agenda"}
              </button>
            </div>
          </section>
        )}

        <section className="grid gap-6 xl:grid-cols-[1.5fr_0.8fr]">
          <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950">
            <div className="flex flex-col justify-between gap-4 border-b border-zinc-900 p-5 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs font-black text-zinc-600">
                  CALENDÁRIO
                </p>

                <h2 className="mt-1 text-2xl font-black">
                  {
                    NOMES_MESES[
                      mesAtual.getMonth()
                    ]
                  }{" "}
                  {mesAtual.getFullYear()}
                </h2>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={
                    mesAnterior
                  }
                  className="h-10 w-10 rounded-xl border border-zinc-800 font-black hover:bg-zinc-900"
                >
                  ←
                </button>

                <button
                  type="button"
                  onClick={
                    voltarHoje
                  }
                  className="rounded-xl border border-zinc-800 px-4 text-sm font-bold hover:bg-zinc-900"
                >
                  Hoje
                </button>

                <button
                  type="button"
                  onClick={
                    proximoMes
                  }
                  className="h-10 w-10 rounded-xl border border-zinc-800 font-black hover:bg-zinc-900"
                >
                  →
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 border-b border-zinc-900 bg-black/30">
              {DIAS_SEMANA.map(
                (dia) => (
                  <div
                    key={dia}
                    className="px-1 py-3 text-center text-[10px] font-black text-zinc-600 sm:text-xs"
                  >
                    {dia}
                  </div>
                )
              )}
            </div>

            <div className="grid grid-cols-7">
              {calendario.map(
                (
                  dia,
                  index
                ) => {
                  if (!dia) {
                    return (
                      <div
                        key={`vazio-${index}`}
                        className="min-h-24 border-b border-r border-zinc-900 bg-black/20 sm:min-h-28"
                      />
                    );
                  }

                  const chave =
                    chaveDia(dia);

                  const eventos =
                    bookingsPorDia[
                      chave
                    ] || [];

                  const bloqueios =
                    agendaPorDia[
                      chave
                    ] || [];

                  const selecionado =
                    chave ===
                    diaSelecionado;

                  const ehHoje =
                    chave ===
                    chaveDia(
                      hoje
                    );

                  return (
                    <button
                      key={
                        chave
                      }
                      type="button"
                      onClick={() =>
                        setDiaSelecionado(
                          chave
                        )
                      }
                      className={`min-h-24 border-b border-r border-zinc-900 p-2 text-left transition sm:min-h-28 ${
                        selecionado
                          ? "bg-red-950/20"
                          : "hover:bg-zinc-900/70"
                      }`}
                    >
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-black ${
                          ehHoje
                            ? "bg-red-500 text-white"
                            : selecionado
                              ? "bg-zinc-800"
                              : ""
                        }`}
                      >
                        {
                          dia.getDate()
                        }
                      </div>

                      <div className="mt-2 space-y-1">
                        {eventos
                          .slice(
                            0,
                            2
                          )
                          .map(
                            (
                              booking
                            ) => (
                              <div
                                key={
                                  booking.id
                                }
                                className="truncate rounded bg-green-950/50 px-1.5 py-1 text-[9px] font-bold text-green-400 sm:text-[10px]"
                              >
                                🎧{" "}
                                {somenteHora(
                                  booking.starts_at
                                )}
                              </div>
                            )
                          )}

                        {bloqueios
                          .slice(
                            0,
                            2
                          )
                          .map(
                            (
                              item
                            ) => (
                              <div
                                key={
                                  item.id
                                }
                                className={`truncate rounded px-1.5 py-1 text-[9px] font-bold sm:text-[10px] ${
                                  item.kind ===
                                  "blocked"
                                    ? "bg-red-950/50 text-red-400"
                                    : "bg-purple-950/50 text-purple-400"
                                }`}
                              >
                                {item.kind ===
                                "blocked"
                                  ? "🔒"
                                  : "📌"}{" "}
                                {somenteHora(
                                  item.starts_at
                                )}
                              </div>
                            )
                          )}

                        {eventos.length +
                          bloqueios.length >
                          4 && (
                          <p className="text-[9px] text-zinc-600">
                            +
                            {eventos.length +
                              bloqueios.length -
                              4}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                }
              )}
            </div>
          </div>

          <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
            <p className="text-xs font-black text-red-500">
              DIA SELECIONADO
            </p>

            <h2 className="mt-2 text-xl font-black">
              {new Intl.DateTimeFormat(
                "pt-BR",
                {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                }
              ).format(
                new Date(
                  `${diaSelecionado}T12:00:00`
                )
              )}
            </h2>

            <button
              type="button"
              onClick={
                abrirNovoBloqueio
              }
              className="mt-4 w-full rounded-xl border border-red-900 py-3 text-sm font-black text-red-400 hover:bg-red-950/20"
            >
              + Bloquear este dia
            </button>

            <div className="mt-5 space-y-3">
              {eventosDia.length ===
                0 &&
              bloqueiosDia.length ===
                0 ? (
                <div className="rounded-2xl border border-zinc-800 bg-black/40 p-5 text-sm text-zinc-500">
                  Nenhum compromisso neste dia.
                </div>
              ) : (
                <>
                  {eventosDia.map(
                    (booking) => {
                      const status =
                        statusBooking(
                          booking.status
                        );

                      return (
                        <article
                          key={
                            booking.id
                          }
                          className="rounded-2xl border border-green-900/50 bg-green-950/10 p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-black">
                              🎧 Evento contratado
                            </p>

                            <span
                              className={`rounded-full border px-2 py-1 text-[10px] font-black ${status.classe}`}
                            >
                              {
                                status.texto
                              }
                            </span>
                          </div>

                          <p className="mt-3 text-sm font-bold text-zinc-300">
                            {
                              casas[
                                booking.venue_id
                              ]?.trade_name ||
                              "Casa contratante"
                            }
                          </p>

                          <p className="mt-1 text-xs text-zinc-500">
                            {dataHora(
                              booking.starts_at
                            )}
                          </p>

                          <p className="mt-2 text-xs text-zinc-600">
                            📍{" "}
                            {booking.event_address_snapshot ||
                              "Local não informado"}
                          </p>

                          <button
                            type="button"
                            onClick={() =>
                              router.push(
                                "/eventos-artista"
                              )
                            }
                            className="mt-3 rounded-lg border border-green-900 px-3 py-2 text-xs font-bold text-green-400"
                          >
                            Abrir evento →
                          </button>
                        </article>
                      );
                    }
                  )}

                  {bloqueiosDia.map(
                    (item) => {
                      const tipo =
                        tipoManual(
                          item.kind
                        );

                      return (
                        <article
                          key={
                            item.id
                          }
                          className={`rounded-2xl border p-4 ${tipo.classe}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-black">
                                {tipo.icone}{" "}
                                {
                                  tipo.texto
                                }
                              </p>

                              <p className="mt-2 text-sm">
                                {somenteHora(
                                  item.starts_at
                                )}
                                {" → "}
                                {somenteHora(
                                  item.ends_at
                                )}
                              </p>

                              {item.note && (
                                <p className="mt-2 text-sm opacity-75">
                                  {
                                    item.note
                                  }
                                </p>
                              )}
                            </div>

                            <button
                              type="button"
                              disabled={
                                excluindo ===
                                item.id
                              }
                              onClick={() =>
                                excluirItem(
                                  item
                                )
                              }
                              className="rounded-lg border border-current px-3 py-2 text-xs font-black opacity-70 hover:opacity-100 disabled:opacity-30"
                            >
                              {excluindo ===
                              item.id
                                ? "..."
                                : "Excluir"}
                            </button>
                          </div>
                        </article>
                      );
                    }
                  )}
                </>
              )}
            </div>
          </section>
        </section>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-black text-red-500">
                PRÓXIMOS
              </p>

              <h2 className="mt-1 text-2xl font-black">
                Próximos eventos
              </h2>
            </div>

            <button
              type="button"
              onClick={() =>
                router.push(
                  "/eventos-artista"
                )
              }
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-bold hover:bg-zinc-900"
            >
              Todos os eventos →
            </button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {proximosBookings.length ===
            0 ? (
              <div className="rounded-2xl border border-zinc-800 bg-black/40 p-5 text-sm text-zinc-500 md:col-span-2 xl:col-span-3">
                Nenhum evento futuro confirmado.
              </div>
            ) : (
              proximosBookings.map(
                (booking) => {
                  const status =
                    statusBooking(
                      booking.status
                    );

                  return (
                    <article
                      key={
                        booking.id
                      }
                      className="rounded-2xl border border-zinc-800 bg-black/40 p-5"
                    >
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-black ${status.classe}`}
                      >
                        {
                          status.texto
                        }
                      </span>

                      <h3 className="mt-4 text-lg font-black">
                        {casas[
                          booking.venue_id
                        ]?.trade_name ||
                          "Evento Aura Beat"}
                      </h3>

                      <p className="mt-2 text-sm text-zinc-400">
                        📅{" "}
                        {dataHora(
                          booking.starts_at
                        )}
                      </p>

                      <p className="mt-1 text-sm text-zinc-600">
                        📍{" "}
                        {booking.event_address_snapshot ||
                          "Local não informado"}
                      </p>
                    </article>
                  );
                }
              )
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-black/30 p-5 text-sm text-zinc-500">
          <p className="font-bold text-zinc-300">
            Legenda
          </p>

          <div className="mt-3 flex flex-wrap gap-4">
            <span>
              🎧 Contratação
            </span>

            <span>
              🔒 Indisponível
            </span>

            <span>
              📌 Compromisso pessoal
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}
