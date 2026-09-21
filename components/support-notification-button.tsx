"use client";

import { useEffect, useState } from "react";
import {
  disableSupportAlerts,
  enableSupportAlerts,
  getSupportAlertStatus,
  prepareSupportNotifications,
  supportAlertsEnabled,
  type SupportAlertStatus,
} from "../lib/support-alerts";

export function SupportNotificationButton() {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<SupportAlertStatus>("off");
  const [error, setError] = useState("");

  useEffect(() => {
    setEnabled(supportAlertsEnabled());
    setStatus(getSupportAlertStatus());
    void prepareSupportNotifications();
  }, []);

  async function toggle() {
    setError("");

    if (enabled) {
      disableSupportAlerts();
      setEnabled(false);
      return;
    }

    const result = await enableSupportAlerts();
    setStatus(result.status);
    setEnabled(result.ok);

    if (!result.ok && result.error) {
      setError(result.error);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        type="button"
        onClick={() => void toggle()}
        className={
          "rounded-xl border px-4 py-2 text-xs font-black transition " +
          (enabled && status === "granted"
            ? "border-green-500/30 bg-green-500/10 text-green-300"
            : "border-zinc-700 bg-black/30 text-zinc-300 hover:border-purple-500/50")
        }
      >
        {enabled && status === "granted"
          ? "🔔 Notificações ativas"
          : "🔔 Ativar notificações"}
      </button>

      {error && (
        <p className="max-w-xs text-xs leading-5 text-amber-300">
          {error}
        </p>
      )}
    </div>
  );
}
