"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

function detectStandalone() {
  if (typeof window === "undefined") return false;

  const iosStandalone =
    "standalone" in window.navigator &&
    Boolean(
      (window.navigator as Navigator & {
        standalone?: boolean;
      }).standalone,
    );

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    iosStandalone
  );
}

function detectIos() {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function InstallAppCard() {
  const [promptEvent, setPromptEvent] =
    useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setInstalled(detectStandalone());
    setIos(detectIos());
    setReady(true);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };

    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      setStatus("");
    };

    window.addEventListener(
      "beforeinstallprompt",
      onBeforeInstallPrompt,
    );
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        onBeforeInstallPrompt,
      );
      window.removeEventListener(
        "appinstalled",
        onInstalled,
      );
    };
  }, []);

  async function instalar() {
    if (!promptEvent) return;

    setStatus("");
    await promptEvent.prompt();

    const choice = await promptEvent.userChoice;

    if (choice.outcome === "accepted") {
      setStatus("Instalação iniciada.");
    } else {
      setStatus("Instalação cancelada.");
    }

    setPromptEvent(null);
  }

  // O card só aparece quando existe uma ação útil:
  // - botão nativo de instalação disponível; ou
  // - instrução específica para iPhone/iPad.
  // Se já estiver instalado ou o navegador ainda não oferecer instalação,
  // não mostramos um aviso técnico/incompleto ao usuário.
  if (!ready || installed || (!promptEvent && !ios)) {
    return null;
  }

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
      <p className="text-xs font-black text-red-500">
        APLICATIVO
      </p>

      <div className="mt-2 flex items-start gap-4">
        <img
          src="/icons/icon.svg"
          alt=""
          className="h-16 w-16 rounded-2xl border border-zinc-800 bg-black object-cover"
        />

        <div className="min-w-0">
          <h2 className="text-2xl font-black">
            Instalar Aura Beat
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            Instale o Aura Beat no celular para abrir como
            aplicativo, com ícone próprio e sem depender de uma
            aba do navegador.
          </p>
        </div>
      </div>

      {promptEvent ? (
        <button
          type="button"
          onClick={() => void instalar()}
          className="mt-5 w-full rounded-2xl bg-red-500 px-5 py-4 font-black transition hover:bg-red-600"
        >
          Instalar Aura Beat
        </button>
      ) : (
        <div className="mt-5 rounded-2xl border border-zinc-800 bg-black/30 p-4 text-sm leading-6 text-zinc-400">
          No iPhone/iPad, abra o menu de compartilhamento do
          Safari e escolha{" "}
          <strong className="text-white">
            Adicionar à Tela de Início
          </strong>
          .
        </div>
      )}

      {status && (
        <p className="mt-3 text-xs font-bold text-zinc-400">
          {status}
        </p>
      )}
    </section>
  );
}
