"use client";

const STORAGE_KEY = "aura-support-alerts";

let audioContext: AudioContext | null = null;

export type SupportAlertStatus =
  | "off"
  | "granted"
  | "denied"
  | "unsupported";

export function supportAlertsEnabled() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "on";
}

export function getSupportAlertStatus(): SupportAlertStatus {
  if (typeof window === "undefined") return "off";

  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return "unsupported";
  }

  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return "off";
}

export async function prepareSupportNotifications() {
  if (
    typeof window === "undefined" ||
    !window.isSecureContext ||
    !("serviceWorker" in navigator)
  ) {
    return;
  }

  await navigator.serviceWorker.register("/sw.js").catch(() => undefined);
}

async function playSound() {
  try {
    const AudioContextClass =
      window.AudioContext ??
      (
        window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;

    if (!AudioContextClass) return;

    const context = audioContext ?? new AudioContextClass();
    audioContext = context;

    if (context.state === "suspended") {
      await context.resume();
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.16);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.23);
  } catch {
    // Navegadores podem bloquear áudio até uma interação do usuário.
  }
}

export async function enableSupportAlerts() {
  if (typeof window === "undefined") {
    return { ok: false, status: "unsupported" as SupportAlertStatus };
  }

  if (!window.isSecureContext) {
    return {
      ok: false,
      status: "unsupported" as SupportAlertStatus,
      error: "Abra o Aura Beat por HTTPS para liberar notificações no celular.",
    };
  }

  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return {
      ok: false,
      status: "unsupported" as SupportAlertStatus,
      error: "Este navegador não oferece notificações web neste modo.",
    };
  }

  await prepareSupportNotifications();

  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    window.localStorage.setItem(STORAGE_KEY, "off");
    return {
      ok: false,
      status:
        permission === "denied"
          ? ("denied" as SupportAlertStatus)
          : ("off" as SupportAlertStatus),
      error:
        permission === "denied"
          ? "As notificações foram bloqueadas nas permissões do navegador."
          : "A permissão de notificações não foi concedida.",
    };
  }

  window.localStorage.setItem(STORAGE_KEY, "on");

  await playSound();

  if ("vibrate" in navigator) {
    navigator.vibrate([70, 40, 70]);
  }

  return {
    ok: true,
    status: "granted" as SupportAlertStatus,
  };
}

export function disableSupportAlerts() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, "off");
}

export async function notifySupportIncoming(
  body: string,
  url: string,
) {
  if (typeof window === "undefined" || !supportAlertsEnabled()) return;

  await playSound();

  if ("vibrate" in navigator) {
    navigator.vibrate([80, 50, 80]);
  }

  if (
    !document.hidden ||
    !window.isSecureContext ||
    !("Notification" in window) ||
    Notification.permission !== "granted" ||
    !("serviceWorker" in navigator)
  ) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    await registration.showNotification("Aura Beat · Suporte", {
      body: body.slice(0, 120),
      icon: "/icons/icon.svg",
      badge: "/icons/icon.svg",
      tag: "aura-support-message",
      data: { url },
    });
  } catch {
    // O alerta visual no próprio app continua funcionando.
  }
}
