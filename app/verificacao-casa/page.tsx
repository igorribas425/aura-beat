"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isIosCameraDevice, normalizeCapturedImage } from "../../lib/camera-capture";
import { supabase } from "../../lib/supabase";

type RequestStatus = "pending" | "verified" | "rejected";
type VenueStatus = "pending" | "verified" | "rejected" | "suspended";
type BusinessDocumentType = "cnpj_card" | "social_contract" | "mei_certificate" | "other";
type ResponsibleDocumentType = "rg" | "cnh" | "passport" | "other";

type VenueProfile = {
  id: string;
  trade_name: string;
  legal_name: string | null;
  cnpj: string;
  verification_status: VenueStatus;
};

type VerificationRequest = {
  id: string;
  status: RequestStatus;
  business_document_type: BusinessDocumentType;
  responsible_document_type: ResponsibleDocumentType;
  rejection_reason: string | null;
  submitted_at: string;
  reviewed_at: string | null;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_DOCUMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

function somenteNumeros(value: string) {
  return value.replace(/\D/g, "");
}

function formatarCnpj(value: string) {
  const numbers = somenteNumeros(value).slice(0, 14);
  return numbers
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function nomeArquivoSeguro(file: File) {
  const extension =
    file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  return `${crypto.randomUUID()}.${extension}`;
}

function validarDocumento(file: File | null, label: string, obrigatorio = true) {
  if (!file) return obrigatorio ? `Selecione ${label}.` : null;
  if (!ACCEPTED_DOCUMENT_TYPES.includes(file.type)) {
    return `${label} precisa ser JPG, PNG, WEBP ou PDF.`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `${label} deve ter no máximo 10 MB.`;
  }
  return null;
}

function descricaoStatus(
  request: VerificationRequest | null,
  venueStatus: VenueStatus | null,
) {
  if (venueStatus === "suspended") {
    return {
      title: "Casa suspensa",
      body: "A verificação está bloqueada enquanto o perfil estiver suspenso.",
      className: "border-red-500/30 bg-red-500/10 text-red-200",
      icon: "!",
    };
  }

  if (venueStatus === "verified" || request?.status === "verified") {
    return {
      title: "Casa Verificada",
      body: "A empresa foi aprovada e pode usar os recursos de contratação destinados a Casas verificadas.",
      className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
      icon: "✓",
    };
  }

  if (request?.status === "pending") {
    return {
      title: "Verificação em análise",
      body: "Os documentos da empresa e do responsável foram enviados e aguardam análise.",
      className: "border-amber-500/30 bg-amber-500/10 text-amber-100",
      icon: "⌛",
    };
  }

  if (request?.status === "rejected" || venueStatus === "rejected") {
    return {
      title: "Verificação recusada",
      body: "Revise o motivo informado e envie uma nova solicitação com documentos legíveis e atualizados.",
      className: "border-red-500/30 bg-red-500/10 text-red-200",
      icon: "!",
    };
  }

  return {
    title: "Verificação da Casa ainda não enviada",
    body: "Envie um documento da empresa, o documento do responsável e uma foto facial para solicitar análise.",
    className: "border-blue-500/30 bg-blue-500/10 text-blue-100",
    icon: "◇",
  };
}

export default function VerificacaoCasaPage() {
  const router = useRouter();
  const [venue, setVenue] = useState<VenueProfile | null>(null);
  const [request, setRequest] = useState<VerificationRequest | null>(null);
  const [businessDocumentType, setBusinessDocumentType] =
    useState<BusinessDocumentType>("cnpj_card");
  const [responsibleDocumentType, setResponsibleDocumentType] =
    useState<ResponsibleDocumentType>("cnh");
  const [businessDocument, setBusinessDocument] = useState<File | null>(null);
  const [responsibleFront, setResponsibleFront] = useState<File | null>(null);
  const [responsibleBack, setResponsibleBack] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [moduleReady, setModuleReady] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const selfieInputRef = useRef<HTMLInputElement | null>(null);

  function isIosDevice() {
    if (typeof navigator === "undefined") return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  useEffect(() => {
    let active = true;

    async function carregar() {
      try {
        setLoading(true);
        setError("");

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.replace("/login");
          return;
        }

        const { data: venueData, error: venueError } = await supabase
          .from("venue_profiles")
          .select("id,trade_name,legal_name,cnpj,verification_status")
          .eq("owner_user_id", user.id)
          .maybeSingle();

        if (!active) return;
        if (venueError) throw venueError;

        if (!venueData) {
          router.replace("/perfil-casa");
          return;
        }

        const currentVenue = venueData as VenueProfile;
        setVenue(currentVenue);

        const { data: requestData, error: requestError } = await supabase
          .from("venue_verification_requests")
          .select(
            "id,status,business_document_type,responsible_document_type,rejection_reason,submitted_at,reviewed_at",
          )
          .eq("venue_id", currentVenue.id)
          .order("submitted_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!active) return;

        if (requestError) {
          const text = `${requestError.code || ""} ${requestError.message || ""}`.toLowerCase();
          const missingModule =
            text.includes("42p01") ||
            text.includes("pgrst205") ||
            text.includes("venue_verification_requests");

          if (missingModule) {
            setModuleReady(false);
            setRequest(null);
            return;
          }

          throw requestError;
        }

        setModuleReady(true);
        setRequest((requestData as VerificationRequest | null) ?? null);
      } catch (err) {
        console.error(err);
        if (active) setError("Não foi possível carregar a verificação da Casa.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void carregar();

    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [router]);

  useEffect(() => {
    if (!cameraOpen || !videoRef.current || !streamRef.current) return;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    void video.play().catch(() => {
      setCameraError("Não foi possível iniciar a visualização da câmera.");
    });
  }, [cameraOpen]);

  const status = useMemo(
    () => descricaoStatus(request, venue?.verification_status ?? null),
    [request, venue?.verification_status],
  );

  const blocked =
    request?.status === "pending" ||
    venue?.verification_status === "verified" ||
    venue?.verification_status === "suspended";

  function handleFile(
    setter: (file: File | null) => void,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    setter(event.target.files?.[0] || null);
  }

  function pararCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }

  async function abrirCamera() {
    setCameraError("");
    setError("");

    // No iPhone/iPad usamos a câmera nativa do iOS para evitar preview preto
    // no Safari e também quando o Aura Beat estiver instalado como PWA.
    if (isIosCameraDevice()) {
      pararCamera();
      selfieInputRef.current?.click();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      selfieInputRef.current?.click();
      return;
    }

    try {
      pararCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 1280 },
        },
      });
      streamRef.current = stream;
      setCameraOpen(true);
    } catch (err) {
      console.error(err);
      setCameraError(
        "Não foi possível abrir a câmera. Confira a permissão da câmera no navegador e tente novamente.",
      );
    }
  }

  async function capturarSelfieNativa(event: ChangeEvent<HTMLInputElement>) {
    const source = event.target.files?.[0] || null;
    event.target.value = "";

    if (!source) return;

    try {
      setCameraError("");

      const captured = await normalizeCapturedImage(
        source,
        `foto-responsavel-${Date.now()}.jpg`,
      );

      if (captured.file.size > MAX_FILE_SIZE) {
        setCameraError("A foto facial deve ter no máximo 10 MB.");
        return;
      }

      setSelfie(captured.file);
      setSelfiePreview(captured.preview);
      pararCamera();
    } catch (err) {
      console.error(err);
      setCameraError("Não foi possível usar a foto feita pela câmera do iPhone. Tente novamente.");
    }
  }

  async function capturarSelfie() {
    setCameraError("");
    const video = videoRef.current;

    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError("A câmera ainda está iniciando. Aguarde um instante e tente novamente.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("Não foi possível capturar a foto facial.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.92);
    });

    if (!blob) {
      setCameraError("Não foi possível gerar a foto facial. Tente novamente.");
      return;
    }

    const file = new File([blob], `foto-responsavel-${Date.now()}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });

    setSelfie(file);
    setSelfiePreview(canvas.toDataURL("image/jpeg", 0.86));
    pararCamera();
  }

  async function uploadDocument(
    userId: string,
    requestId: string,
    kind: string,
    file: File,
  ) {
    const path = `venue/${userId}/${requestId}/${kind}-${nomeArquivoSeguro(file)}`;
    const { error: uploadError } = await supabase.storage
      .from("verification-documents")
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });

    if (uploadError) throw uploadError;
    return path;
  }

  async function cleanup(paths: string[]) {
    if (paths.length === 0) return;
    await supabase.storage.from("verification-documents").remove(paths);
  }

  async function enviar() {
    setError("");
    setMessage("");

    if (!moduleReady) {
      setError("O módulo seguro de verificação da Casa ainda não foi ativado no banco.");
      return;
    }

    if (!venue) {
      setError("Perfil da Casa não encontrado.");
      return;
    }

    if (blocked) {
      setError("Esta verificação não pode receber um novo envio agora.");
      return;
    }

    if (somenteNumeros(venue.cnpj).length !== 14) {
      setError("O perfil da Casa precisa ter um CNPJ válido antes da verificação.");
      return;
    }

    const businessError = validarDocumento(
      businessDocument,
      "o documento da empresa",
    );
    const frontError = validarDocumento(
      responsibleFront,
      "a frente do documento do responsável",
    );
    const backRequired =
      responsibleDocumentType === "rg" || responsibleDocumentType === "cnh";
    const backError = validarDocumento(
      responsibleBack,
      "o verso do documento do responsável",
      backRequired,
    );
    const selfieError = validarDocumento(selfie, "a foto facial do responsável");

    const validationError = businessError || frontError || backError || selfieError;
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!businessDocument || !responsibleFront || !selfie) return;

    try {
      setSending(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const requestId = crypto.randomUUID();
      const uploaded: string[] = [];

      try {
        const businessPath = await uploadDocument(
          user.id,
          requestId,
          "business",
          businessDocument,
        );
        uploaded.push(businessPath);

        const responsibleFrontPath = await uploadDocument(
          user.id,
          requestId,
          "responsible-front",
          responsibleFront,
        );
        uploaded.push(responsibleFrontPath);

        let responsibleBackPath: string | null = null;
        if (responsibleBack) {
          responsibleBackPath = await uploadDocument(
            user.id,
            requestId,
            "responsible-back",
            responsibleBack,
          );
          uploaded.push(responsibleBackPath);
        }

        const selfiePath = await uploadDocument(
          user.id,
          requestId,
          "responsible-selfie",
          selfie,
        );
        uploaded.push(selfiePath);

        const { error: insertError } = await supabase
          .from("venue_verification_requests")
          .insert({
            id: requestId,
            venue_id: venue.id,
            user_id: user.id,
            cnpj_snapshot: somenteNumeros(venue.cnpj),
            trade_name_snapshot: venue.trade_name,
            legal_name_snapshot: venue.legal_name,
            business_document_type: businessDocumentType,
            business_document_path: businessPath,
            responsible_document_type: responsibleDocumentType,
            responsible_document_front_path: responsibleFrontPath,
            responsible_document_back_path: responsibleBackPath,
            selfie_path: selfiePath,
            status: "pending",
          });

        if (insertError) {
          await cleanup(uploaded);
          throw insertError;
        }
      } catch (uploadOrInsertError) {
        await cleanup(uploaded);
        throw uploadOrInsertError;
      }

      setBusinessDocument(null);
      setResponsibleFront(null);
      setResponsibleBack(null);
      setSelfie(null);
      setSelfiePreview(null);
      setMessage(
        "Documentos da Casa e do responsável enviados com segurança. A verificação entrou em análise.",
      );

      const { data: latestRequest } = await supabase
        .from("venue_verification_requests")
        .select(
          "id,status,business_document_type,responsible_document_type,rejection_reason,submitted_at,reviewed_at",
        )
        .eq("venue_id", venue.id)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestRequest) {
        setRequest(latestRequest as VerificationRequest);
      }
      setVenue((current) =>
        current ? { ...current, verification_status: "pending" } : current,
      );
    } catch (err) {
      console.error(err);
      setError("Não foi possível enviar a verificação. Nenhum selo foi liberado.");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <main className="aura-page flex min-h-screen items-center justify-center px-4">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-zinc-800 border-t-blue-500" />
          <p className="text-sm text-zinc-400">Carregando verificação...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="aura-page px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <button
          type="button"
          onClick={() => router.push("/perfil-casa")}
          className="mb-6 rounded-xl border border-zinc-800 px-4 py-2 text-sm font-bold text-zinc-300 transition hover:border-blue-500/40 hover:bg-zinc-900"
        >
          ← Voltar ao perfil
        </button>

        <div className="mb-7">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-400">
            Segurança Aura Beat
          </p>
          <h1 className="mt-2 text-3xl font-black">Verificação da Casa</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            A análise confirma a empresa e o responsável pela conta. Os documentos
            ficam privados e não aparecem no perfil público.
          </p>
        </div>

        <section className={`rounded-3xl border p-5 ${status.className}`}>
          <div className="flex items-start gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-current/20 bg-black/10 text-xl font-black">
              {status.icon}
            </div>
            <div>
              <h2 className="font-black">{status.title}</h2>
              <p className="mt-1 text-sm opacity-80">{status.body}</p>
            </div>
          </div>
        </section>

        {venue && (
          <section className="mt-5 rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
            <p className="text-xs font-black uppercase tracking-wider text-zinc-500">
              Empresa desta solicitação
            </p>
            <h2 className="mt-2 text-xl font-black">{venue.trade_name}</h2>
            {venue.legal_name && (
              <p className="mt-1 text-sm text-zinc-400">{venue.legal_name}</p>
            )}
            <p className="mt-2 text-sm font-bold text-zinc-300">
              CNPJ {formatarCnpj(venue.cnpj)}
            </p>
            <p className="mt-2 text-xs leading-5 text-zinc-600">
              O Aura Beat não considera o CNPJ oficialmente validado apenas por estar
              preenchido. A aprovação depende da análise da documentação.
            </p>
          </section>
        )}

        {!moduleReady && (
          <section className="mt-5 rounded-3xl border border-amber-500/30 bg-amber-500/10 p-5 text-amber-100">
            <p className="font-black">Módulo ainda não ativado no banco</p>
            <p className="mt-2 text-sm leading-6 opacity-85">
              A tela está preparada, mas o envio fica bloqueado até a estrutura privada
              da verificação da Casa ser revisada e ativada no Supabase.
            </p>
          </section>
        )}

        {request?.status === "rejected" && request.rejection_reason && (
          <section className="mt-5 rounded-3xl border border-red-500/30 bg-red-500/10 p-5 text-red-100">
            <p className="font-black">Motivo da recusa</p>
            <p className="mt-2 text-sm leading-6 opacity-85">
              {request.rejection_reason}
            </p>
          </section>
        )}

        {message && (
          <div className="mt-5 rounded-2xl border border-emerald-900 bg-emerald-950/30 p-4 text-sm text-emerald-300">
            {message}
          </div>
        )}

        {error && (
          <div className="mt-5 rounded-2xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {!blocked && (
          <div className="mt-6 space-y-5">
            <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
              <p className="text-xs font-black uppercase tracking-wider text-blue-400">
                1. Documento da empresa
              </p>
              <label className="mt-4 block text-sm font-bold text-zinc-300">
                Tipo de documento
              </label>
              <select
                value={businessDocumentType}
                onChange={(event) =>
                  setBusinessDocumentType(event.target.value as BusinessDocumentType)
                }
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none focus:border-blue-500"
              >
                <option value="cnpj_card">Cartão / comprovante de CNPJ</option>
                <option value="social_contract">Contrato social</option>
                <option value="mei_certificate">CCMEI / certificado MEI</option>
                <option value="other">Outro documento empresarial</option>
              </select>

              <label className="mt-4 block text-sm font-bold text-zinc-300">
                Arquivo da empresa
              </label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(event) => handleFile(setBusinessDocument, event)}
                className="mt-2 block w-full rounded-xl border border-zinc-800 bg-black px-3 py-3 text-sm text-zinc-400"
              />
              <p className="mt-2 text-xs text-zinc-600">
                JPG, PNG, WEBP ou PDF, até 10 MB.
              </p>
            </section>

            <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
              <p className="text-xs font-black uppercase tracking-wider text-blue-400">
                2. Documento do responsável
              </p>
              <label className="mt-4 block text-sm font-bold text-zinc-300">
                Tipo de documento
              </label>
              <select
                value={responsibleDocumentType}
                onChange={(event) => {
                  const next = event.target.value as ResponsibleDocumentType;
                  setResponsibleDocumentType(next);
                  if (next === "passport" || next === "other") {
                    setResponsibleBack(null);
                  }
                }}
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none focus:border-blue-500"
              >
                <option value="cnh">CNH</option>
                <option value="rg">RG</option>
                <option value="passport">Passaporte</option>
                <option value="other">Outro documento oficial</option>
              </select>

              <label className="mt-4 block text-sm font-bold text-zinc-300">
                Frente do documento
              </label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(event) => handleFile(setResponsibleFront, event)}
                className="mt-2 block w-full rounded-xl border border-zinc-800 bg-black px-3 py-3 text-sm text-zinc-400"
              />

              {(responsibleDocumentType === "rg" ||
                responsibleDocumentType === "cnh") && (
                <>
                  <label className="mt-4 block text-sm font-bold text-zinc-300">
                    Verso do documento
                  </label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(event) => handleFile(setResponsibleBack, event)}
                    className="mt-2 block w-full rounded-xl border border-zinc-800 bg-black px-3 py-3 text-sm text-zinc-400"
                  />
                </>
              )}
            </section>

            <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
              <p className="text-xs font-black uppercase tracking-wider text-blue-400">
                3. Foto facial do responsável
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                A foto é feita pela câmera neste momento e será comparada durante a
                análise. Esta etapa ainda não é uma prova biométrica de vida.
              </p>

              <input
                ref={selfieInputRef}
                type="file"
                accept="image/*"
                capture="user"
                onChange={(event) => void capturarSelfieNativa(event)}
                className="hidden"
                tabIndex={-1}
                aria-hidden="true"
              />

              {!cameraOpen && !selfie && (
                <button
                  type="button"
                  onClick={() => void abrirCamera()}
                  className="mt-4 w-full rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-3 font-black text-blue-200 transition hover:bg-blue-500/20"
                >
                  Abrir câmera e fazer foto facial
                </button>
              )}

              {cameraOpen && (
                <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-800 bg-black p-3">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="aspect-square w-full rounded-xl object-cover"
                  />
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => void capturarSelfie()}
                      className="rounded-xl bg-blue-500 px-4 py-3 font-black text-white hover:bg-blue-600"
                    >
                      Tirar foto
                    </button>
                    <button
                      type="button"
                      onClick={pararCamera}
                      className="rounded-xl border border-zinc-700 px-4 py-3 font-bold text-zinc-300 hover:bg-zinc-900"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {selfiePreview && selfie && (
                <div className="mt-4 rounded-2xl border border-zinc-800 bg-black p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selfiePreview}
                    alt="Prévia da foto facial do responsável"
                    className="aspect-square w-full rounded-xl object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSelfie(null);
                      setSelfiePreview(null);
                      void abrirCamera();
                    }}
                    className="mt-3 w-full rounded-xl border border-zinc-700 px-4 py-3 font-bold text-zinc-300 hover:bg-zinc-900"
                  >
                    Refazer foto
                  </button>
                </div>
              )}

              {cameraError && (
                <p className="mt-3 text-sm text-red-300">{cameraError}</p>
              )}
            </section>

            <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5">
              <p className="text-sm leading-6 text-zinc-400">
                Ao enviar, os arquivos ficam vinculados à solicitação e não podem ser
                alterados pelo usuário. A aprovação não é feita pelo frontend.
              </p>
              <button
                type="button"
                disabled={sending || !moduleReady}
                onClick={() => void enviar()}
                className="mt-4 w-full rounded-2xl bg-blue-500 py-4 font-black text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? "Enviando com segurança..." : "Enviar para análise"}
              </button>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
