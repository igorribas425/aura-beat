"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  AURA_THEME_EVENT,
  applyTheme,
  getStoredTheme,
  isThemePreference,
  setThemePreference,
  type ThemePreference,
} from "../lib/theme";

type Mode = "artist" | "venue";
type NavIcon = "home" | "explore" | "offers" | "events" | "chat" | "alerts" | "calendar";

const publicPaths = new Set(["/", "/login", "/cadastro", "/cadastro/login"]);

function NavigationIcon({ name }: { name: NavIcon }) {
  const paths: Record<NavIcon, React.ReactNode> = {
    home: <path d="M3 10.8 12 3l9 7.8V21h-6v-6H9v6H3V10.8Z" />,
    explore: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4m-2-8-2 6-6 2 2-6 6-2Z" /></>,
    offers: <><path d="M4 5h16v14H4z" /><path d="M8 9h8M8 13h5" /></>,
    events: <><path d="M12 3 4 7v5c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V7l-8-4Z" /><path d="m9 12 2 2 4-4" /></>,
    chat: <path d="M4 5h16v11H9l-5 4V5Z" />,
    alerts: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" /><path d="M10 21h4" /></>,
    calendar: <><path d="M4 6h16v15H4zM8 3v6m8-6v6M4 11h16" /></>,
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [authenticated, setAuthenticated] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [unreadAlertCount, setUnreadAlertCount] = useState(0);

  useEffect(() => {
    const savedTheme = getStoredTheme();
    setTheme(savedTheme);
    applyTheme(savedTheme);

    const onThemeChange = (event: Event) => {
      const nextTheme = (event as CustomEvent<unknown>).detail;
      if (isThemePreference(nextTheme)) setTheme(nextTheme);
    };

    window.addEventListener(AURA_THEME_EVENT, onThemeChange);
    return () => window.removeEventListener(AURA_THEME_EVENT, onThemeChange);
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadSessionContext() {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;

      if (!data.user) {
        setAuthenticated(false);
        setMode(null);

        const nextTheme = getStoredTheme();
        setTheme(nextTheme);
        applyTheme(nextTheme);
        return;
      }

      setAuthenticated(true);

      const { data: profile } = await supabase
        .from("profiles")
        .select("default_mode,theme")
        .eq("id", data.user.id)
        .maybeSingle();

      if (!alive) return;

      const nextMode: Mode = profile?.default_mode === "venue" ? "venue" : "artist";
      const nextTheme: ThemePreference =
        profile?.theme === "light" || profile?.theme === "dark" || profile?.theme === "system"
          ? profile.theme
          : "system";

      setMode(nextMode);
      setTheme(nextTheme);
      setThemePreference(nextTheme);
    }

    void loadSessionContext();

    return () => {
      alive = false;
    };
  }, [pathname]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let active = true;

    async function refreshUnread(userId: string) {
      const { count, error } = await supabase
        .from("direct_messages")
        .select("id", { count: "exact", head: true })
        .is("read_at", null)
        .neq("sender_user_id", userId);

      if (!active || error) return;
      setUnreadChatCount(count ?? 0);
    }

    void supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user) {
        setUnreadChatCount(0);
        return;
      }

      const userId = data.user.id;
      void refreshUnread(userId);

      channel = supabase
        .channel(`direct-unread-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "direct_messages",
          },
          () => {
            void refreshUnread(userId);
          },
        )
        .subscribe();
    });

    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let active = true;

    async function refreshUnreadAlerts(userId: string) {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("read_at", null);

      if (!active || error) return;
      setUnreadAlertCount(count ?? 0);
    }

    void supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user) {
        setUnreadAlertCount(0);
        return;
      }

      const userId = data.user.id;
      void refreshUnreadAlerts(userId);

      channel = supabase
        .channel(`notification-unread-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            void refreshUnreadAlerts(userId);
          },
        )
        .subscribe();
    });

    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    applyTheme(theme);

    if (theme !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);

    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;

      channel = supabase
        .channel(`profile-preferences-${data.user.id}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "profiles",
            filter: `id=eq.${data.user.id}`,
          },
          (payload) => {
            const updated = payload.new as {
              default_mode?: string;
              theme?: string;
            };

            if (updated.default_mode === "artist" || updated.default_mode === "venue") {
              setMode(updated.default_mode);
            }

            if (updated.theme === "light" || updated.theme === "dark" || updated.theme === "system") {
              setTheme(updated.theme);
              setThemePreference(updated.theme);
            }
          },
        )
        .subscribe();
    });

    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  async function switchMode() {
    const next: Mode = mode === "venue" ? "artist" : "venue";
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const table = next === "artist" ? "artist_profiles" : "venue_profiles";
    const owner = next === "artist" ? "user_id" : "owner_user_id";
    const { data: profile } = await supabase
      .from(table)
      .select("id")
      .eq(owner, user.id)
      .maybeSingle();

    if (!profile) {
      router.push(next === "artist" ? "/perfil-artista" : "/perfil-casa");
      return;
    }

    await supabase.from("profiles").update({ default_mode: next }).eq("id", user.id);
    setMode(next);
    router.push(next === "artist" ? "/home-artista" : "/home-casa");
  }

  if (publicPaths.has(pathname) || !authenticated) return <>{children}</>;

  const home = mode === "venue" ? "/home-casa" : "/home-artista";
  const offers = mode === "venue" ? "/ofertas" : "/ofertas-artista";
  const events = mode === "venue" ? "/eventos-casa" : "/eventos-artista";
  const items: Array<{ href: string; icon: NavIcon; label: string }> = [
    { href: home, icon: "home", label: "Home" },
    { href: "/buscar", icon: "explore", label: "Explorar" },
    { href: offers, icon: "offers", label: "Ofertas" },
    { href: events, icon: "events", label: "Eventos" },
    { href: "/chat-direto", icon: "chat", label: "Chat" },
    { href: "/notificacoes", icon: "alerts", label: "Alertas" },
  ];

  return (
    <div className="aura-shell min-h-screen">
      <header className="aura-shell-header sticky top-0 z-50 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link
            href={home}
            className="flex items-center"
            aria-label="Aura Beat — Home"
            title="Aura Beat"
          >
            <img
              src="/aura-beat-logo.webp"
              alt="Aura Beat"
              className="h-12 w-16 object-contain sm:h-14 sm:w-20"
            />
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Navegação principal">
            {items.map(({ href, icon, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname === href ? "page" : undefined}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
                  pathname === href
                    ? "bg-red-500 text-white"
                    : "aura-nav-link"
                }`}
              >
                <span className="relative inline-flex">
                  <NavigationIcon name={icon} />
                  {href === "/chat-direto" && unreadChatCount > 0 && (
                    <span
                      className="absolute -right-2 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-white px-1 text-[9px] font-black leading-none text-red-600"
                      aria-label={`${unreadChatCount} mensagem(ns) não lida(s)`}
                    >
                      {unreadChatCount > 99 ? "99+" : unreadChatCount}
                    </span>
                  )}
                  {href === "/notificacoes" && unreadAlertCount > 0 && (
                    <span
                      className="absolute -right-2 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-white px-1 text-[9px] font-black leading-none text-red-600"
                      aria-label={`${unreadAlertCount} alerta(s) não lido(s)`}
                    >
                      {unreadAlertCount > 99 ? "99+" : unreadAlertCount}
                    </span>
                  )}
                </span>
                {label}
              </Link>
            ))}

            {mode === "artist" && (
              <Link href="/agenda" className="aura-nav-link flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition">
                <NavigationIcon name="calendar" />
                Agenda
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={switchMode}
              aria-label={`Alternar do modo ${mode === "venue" ? "Casa" : "Artista"}`}
              className={`aura-mode-switch rounded-xl border px-3 py-2 text-xs font-bold ${
                mode === "venue"
                  ? "border-red-500/40 bg-red-500/10 text-red-500"
                  : "border-purple-500/40 bg-purple-500/10 text-purple-500"
              }`}
            >
              {mode === "venue" ? "Casa" : "Artista"} <span aria-hidden="true">⇄</span>
            </button>


            <Link
              href="/configuracoes"
              aria-label="Configurações"
              className="aura-icon-button rounded-xl px-3 py-2"
            >
              ⚙
            </Link>
          </div>
        </div>
      </header>

      <div key={pathname} className="pb-20 lg:pb-0">
        {children}
      </div>

      <nav
        className="aura-mobile-nav fixed inset-x-0 bottom-0 z-50 grid grid-cols-6 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="Navegação mobile"
      >
        {items.map(({ href, icon, label }) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
            className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[10px] font-semibold ${
              pathname === href ? "text-red-500" : "aura-mobile-link"
            }`}
          >
            <span className="relative inline-flex">
              <NavigationIcon name={icon} />
              {href === "/chat-direto" && unreadChatCount > 0 && (
                <span
                  className="absolute -right-2.5 -top-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] font-black leading-none text-white"
                  aria-label={`${unreadChatCount} mensagem(ns) não lida(s)`}
                >
                  {unreadChatCount > 99 ? "99+" : unreadChatCount}
                </span>
              )}
              {href === "/notificacoes" && unreadAlertCount > 0 && (
                <span
                  className="absolute -right-2.5 -top-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] font-black leading-none text-white"
                  aria-label={`${unreadAlertCount} alerta(s) não lido(s)`}
                >
                  {unreadAlertCount > 99 ? "99+" : unreadAlertCount}
                </span>
              )}
            </span>
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
