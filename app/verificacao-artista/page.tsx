"use client";

import {
  ChangeEvent,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { isIosCameraDevice, normalizeCapturedImage } from "../../lib/camera-capture";
import { supabase } from "../../lib/supabase";

type VerificationStatus = "pending" | "verified" | "rejected";
type DocumentType = "rg" | "cnh" | "passport" | "other";

type ArtistProfile = {
  id: string;
  stage_name: string;
  verification_status: string | null;
};

type VerificationRequest = {
  id: string;
  status: VerificationStatus;
  document_type: DocumentType;
  rejection_reason: string | null;
  submitted_at: string;
  reviewed_at: string | null;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

function descricaoStatus(status: string | null) {
  if (status === "verified") {
    return {
      title: "Artista Verificado",
      body: "Sua identidade foi aprovada. O selo de verificação pode ser exibido no Aura Beat.",
      className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
      icon: "✓",
    };
  }

  if (status === "pending") {
    return {
      title: "Verificação em análise",
      body: "Seus documentos foram enviados e estão aguardando análise.",
      className: "border-amber-500/30 bg-amber-500/10 text-amber-100",
      icon: "⌛",
    };
  }

  if (status === "rejected") {
    return {
      title: "Verificação recusada",
      body: "Revise o motivo informado e envie uma nova solicitação com documentos legíveis.",
      className: "border-red-500/30 bg-red-500/10 text-red-200",
      icon: "!",
    };
  }

  return {
    title: "Identidade ainda não verificada",
    body: "Envie um documento oficial e faça uma foto facial pela câmera para solicitar a verificação.",
    className: "border-purple-500/30 bg-purple-500/10 text-purple-100",
    icon: "◇",
  };
}

function nomeArquivoSeguro(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  return `${crypto.randomUUID()}.${extension}`;
}

function validarArquivo(file: File | null, label: string, obrigatorio = true) {
  if (!file) {
    return obrigatorio ? `Selecione ${label}.` : null;
  }

  if (!ACCEPTED_TYPES.includes(file.type)) {
    return `${label} precisa ser JPG, PNG, WEBP ou PDF.`;
  }

  if (file.size > MAX_FILE_SIZE) {
    return `${label} deve ter no máximo 10 MB.`;
  }

  return null;
}

export default function VerificacaoArtistaPage() {
  const router = useRouter();
  const [artist, setArtist] = useState<ArtistProfile | null>(null);
  const [request, setRequest] = useState<VerificationRequest | null>(null);
  const [documentType, setDocumentType] = useState<DocumentType>("cnh");
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
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
  const selfieInputRef = useRef<HTMLInputElement | null>(null);

  function isIosDevice() {
    if (typeof navigator === "undefined") return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  const carregarEffect = useEffectEvent(() => {
    void carregar();
  });

  useEffect(() => {
    carregarEffect();
  }, []);

  useEffect(() => {
    if (!cameraOpen || !videoRef.current || !streamRef.current) return;

    const video = videoRef.current;
    video.srcObject = streamRef.current;
    void video.play().catch(() => {
      setCameraError("Não foi possível iniciar a visualização da câmera.");
    });
  }, [cameraOpen]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

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

      const { data: artistData, error: artistError } = await supabase
        .from("artist_profiles")
        .select("id,stage_name,verification_status")
        .eq("user_id", user.id)
        .maybeSingle();

      if (artistError) {
        throw artistError;
      }

      if (!artistData) {
        router.replace("/perfil-artista");
        return;
      }

      const currentArtist = artistData as ArtistProfile;
      setArtist(currentArtist);

      const { data: requestData, error: requestError } = await supabase
        .from("artist_verification_requests")
        .select("id,status,document_type,rejection_reason,submitted_at,reviewed_at")
        .eq("artist_id", currentArtist.id)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (requestError) {
        const text = `${requestError.code || ""} ${requestError.message || ""}`.toLowerCase();
        const missingModule =
          text.includes("42p01") ||
          text.includes("pgrst205") ||
          text.includes("artist_verification_requests");

        if (missingModule) {
          setModuleReady(false);
          return;
        }

        throw requestError;
      }

      setModuleReady(true);
      setRequest((requestData as VerificationRequest | null) ?? null);
    } catch (err) {
      console.error(err);
      setError("Não foi possível carregar a verificação de identidade.");
    } finally {
      setLoading(false);
    }
  }

  const status = useMemo(
    () => descricaoStatus(request?.status || artist?.verification_status || null),
    [request?.status, artist?.verification_status],
  );

  const blocked = request?.status === "pending" || artist?.verification_status === "verified";

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

    // No iPhone/iPad usamos o capturador nativo do iOS. Isso evita a
    // visualização preta que pode ocorrer com getUserMedia no Safari/PWA.
    if (isIosDevice()) {
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
      setCameraError("Não foi possível abrir a câmera. Confira a permissão da câmera no navegador e tente novamente.");
    }
  }

  function capturarSelfieNativa(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setCameraError("A foto facial precisa ser uma imagem.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setCameraError("A foto facial deve ter no máximo 10 MB.");
      return;
    }

    setSelfie(file);
    setSelfiePreview(URL.createObjectURL(file));
    setCameraError("");
    pararCamera();
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

    const file = new File([blob], `foto-facial-${Date.now()}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });

    setSelfie(file);
    setSelfiePreview(canvas.toDataURL("image/jpeg", 0.86));
    pararCamera();
  }

  async function uploadDocument(userId: string, requestId: string, kind: string, file: File) {
    const path = `artist/${userId}/${requestId}/${kind}-${nomeArquivoSeguro(file)}`;
    const { error: uploadError } = await supabase.storage
      .from("verification-documents")
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });

    if (uploadError) {
      throw uploadError;
    }

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
      setError("O módulo seguro de verificação ainda não foi ativado no banco.");
      return;
    }

    if (!artist) {
      setError("Perfil de Artista não encontrado.");
      return;
    }

    if (blocked) {
      setError("Esta verificação não pode receber um novo envio agora.");
      return;
    }

    const frontError = validarArquivo(front, "a frente do documento");
    const selfieError = validarArquivo(selfie, "a foto facial");
    const backRequired = documentType === "rg" || documentType === "cnh";
    const backError = validarArquivo(back, "o verso do documento", backRequired);

    const validationError = frontError || selfieError || backError;
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!front || !selfie) return;

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
        const frontPath = await uploadDocument(user.id, requestId, "front", front);
        uploaded.push(frontPath);

        let backPath: string | null = null;
        if (back) {
          backPath = await uploadDocument(user.id, requestId, "back", back);
          uploaded.push(backPath);
        }

        const selfiePath = await uploadDocument(user.id, requestId, "selfie", selfie);
        uploaded.push(selfiePath);

        const { error: insertError } = await supabase
          .from("artist_verification_requests")
          .insert({
            id: requestId,
            artist_id: artist.id,
            user_id: user.id,
            document_type: documentType,
            document_front_path: frontPath,
            document_back_path: backPath,
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

      setFront(null);
      setBack(null);
      setSelfie(null);
      setSelfiePreview(null);
      setMessage("Documentos e foto facial enviados com segurança. Sua verificação entrou em análise.");
      await carregar();
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
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-zinc-800 border-t-purple-500" />
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
          onClick={() => router.push("/perfil-artista")}
          className="mb-6 rounded-xl border border-zinc-800 px-4 py-2 text-sm font-bold text-zinc-300 transition hover:border-purple-500/40 hover:bg-zinc-900"
        >
          ← Voltar ao perfil
        </button>

        <div className="mb-7">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-purple-400">Segurança Aura Beat</p>
          <h1 className="mt-2 text-3xl font-black">Verificação de identidade</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            A verificação protege Artistas e Casas nas contratações. Seus documentos não aparecem no perfil público.
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

        {!moduleReady && (
          <section className="mt-5 rounded-3xl border border-amber-500/30 bg-amber-500/10 p-5 text-amber-100">
            <p className="font-black">Módulo ainda não ativado no banco</p>
            <p className="mt-2 text-sm leading-6 opacity-85">
              A tela já está preparada, mas o envio permanece bloqueado até a estrutura privada de documentos ser revisada e ativada no Supabase.
            </p>
          </section>
        )}

        {request?.status === "rejected" && request.rejection_reason && (
          <section className="mt-5 rounded-3xl border border-red-500/30 bg-red-500/10 p-5 text-red-100">
            <p className="text-xs font-black uppercase tracking-[0.16em]">Motivo da recusa</p>
            <p className="mt-2 text-sm leading-6">{request.rejection_reason}</p>
          </section>
        )}

        <section className="mt-5 rounded-3xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
          <div className="mb-5">
            <h2 className="text-xl font-black">Documento + foto facial</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Os dois são necessários. Envie o documento e faça a foto facial na hora usando a câmera do aparelho. Para RG ou CNH, envie frente e verso.
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-bold">Documento oficial</label>
              <select
                value={documentType}
                onChange={(event) => setDocumentType(event.target.value as DocumentType)}
                disabled={blocked || !moduleReady}
                className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3.5 outline-none focus:border-purple-500 disabled:opacity-50"
              >
                <option value="cnh">CNH</option>
                <option value="rg">RG</option>
                <option value="passport">Passaporte</option>
                <option value="other">Outro documento oficial</option>
              </select>
            </div>

            <FileField
              label="Frente do documento"
              hint="JPG, PNG, WEBP ou PDF · até 10 MB"
              disabled={blocked || !moduleReady}
              onChange={(event) => handleFile(setFront, event)}
              fileName={front?.name}
            />

            <FileField
              label={`Verso do documento${documentType === "passport" || documentType === "other" ? " (opcional)" : ""}`}
              hint="JPG, PNG, WEBP ou PDF · até 10 MB"
              disabled={blocked || !moduleReady}
              onChange={(event) => handleFile(setBack, event)}
              fileName={back?.name}
            />

            <div>
              <label className="mb-2 block text-sm font-bold">Foto facial para conferência</label>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-sm leading-6 text-zinc-400">
                  A foto é feita agora pela câmera. Não é necessário procurar uma selfie na galeria do celular.
                </p>

                {selfiePreview && (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-emerald-500/30 bg-black">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selfiePreview}
                      alt="Foto facial capturada"
                      className="mx-auto aspect-square max-h-72 w-full object-cover"
                    />
                  </div>
                )}

                <input
                  ref={selfieInputRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={capturarSelfieNativa}
                  className="hidden"
                  tabIndex={-1}
                />

                <input
                  ref={selfieInputRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={(event) => void handleNativeSelfie(event)}
                  className="hidden"
                  tabIndex={-1}
                  aria-hidden="true"
                />

                <button
                  type="button"
                  onClick={() => void abrirCamera()}
                  disabled={blocked || !moduleReady || cameraOpen}
                  className="mt-4 w-full rounded-2xl border border-purple-500/40 bg-purple-500/10 px-4 py-3.5 font-black text-purple-200 transition hover:bg-purple-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {selfie ? "Refazer foto facial" : "Abrir câmera e fazer foto facial"}
                </button>

                {selfie && !cameraOpen && (
                  <p className="mt-3 text-center text-xs font-bold text-emerald-300">
                    ✓ Foto facial capturada neste aparelho
                  </p>
                )}

                {cameraOpen && (
                  <div className="mt-4 rounded-2xl border border-purple-500/30 bg-black p-3">
                    <div className="overflow-hidden rounded-xl bg-black">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="aspect-square w-full object-cover [transform:scaleX(-1)]"
                      />
                    </div>

                    <p className="mt-3 text-center text-xs leading-5 text-zinc-400">
                      Centralize o rosto, retire óculos escuros e evite pouca luz.
                    </p>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={capturarSelfie}
                        className="rounded-xl bg-gradient-to-r from-purple-600 to-red-500 px-4 py-3 font-black text-white"
                      >
                        Capturar foto
                      </button>
                      <button
                        type="button"
                        onClick={pararCamera}
                        className="rounded-xl border border-zinc-700 px-4 py-3 font-bold text-zinc-300"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {cameraError && (
                  <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs leading-5 text-red-200">
                    {cameraError}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 text-xs leading-5 text-zinc-400">
              🔒 Documento e foto facial são necessários para a análise. Os arquivos ficam no bucket privado e o cliente não possui permissão para aprovar a própria conta.
            </div>

            <button
              type="button"
              onClick={enviar}
              disabled={sending || blocked || !moduleReady}
              className="w-full rounded-2xl bg-gradient-to-r from-purple-600 to-red-500 py-4 font-black text-white shadow-lg transition hover:from-purple-500 hover:to-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending
                ? "Enviando com segurança..."
                : artist?.verification_status === "verified"
                  ? "Identidade já verificada"
                  : request?.status === "pending"
                    ? "Verificação em análise"
                    : "Enviar para análise"}
            </button>

            {message && (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                {message}
              </div>
            )}

            {error && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
                {error}
              </div>
            )}
          </div>
        </section>

        <p className="mt-5 text-center text-xs leading-5 text-zinc-500">
          Nunca envie documentos pelo chat entre usuários. A verificação deve acontecer somente por este fluxo privado.
        </p>
      </div>
    </main>
  );
}

function FileField({
  label,
  hint,
  disabled,
  onChange,
  fileName,
  accept = "image/jpeg,image/png,image/webp,application/pdf",
}: {
  label: string;
  hint: string;
  disabled: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  fileName?: string;
  accept?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold">{label}</label>
      <label className={`block rounded-2xl border border-dashed border-zinc-700 bg-zinc-900 p-4 transition ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-purple-500/50"}`}>
        <input
          type="file"
          accept={accept}
          disabled={disabled}
          onChange={onChange}
          className="sr-only"
        />
        <span className="block text-sm font-bold text-zinc-200">
          {fileName || "Selecionar arquivo"}
        </span>
        <span className="mt-1 block text-xs text-zinc-500">{hint}</span>
      </label>
    </div>
  );
}
