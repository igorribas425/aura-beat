"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Mode = "artist" | "venue";
type ThemePreference = "system" | "dark" | "light";
type ResolvedTheme = "dark" | "light";

const publicPaths = new Set(["/", "/login", "/cadastro", "/cadastro/login"]);

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "dark" || preference === "light") return preference;

  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches) {
    return "light";
  }

  return "dark";
}

function applyTheme(preference: ThemePreference) {
  if (typeof document === "undefined") return;

  const resolved = resolveTheme(preference);
  const root = document.documentElement;

  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolved;

  let metaTheme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!metaTheme) {
    metaTheme = document.createElement("meta");
    metaTheme.name = "theme-color";
    document.head.appendChild(metaTheme);
  }

  metaTheme.content = resolved === "light" ? "#f5f5f8" : "#050507";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let alive = true;

    async function loadSessionContext() {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;

      if (!data.user) {
        setAuthenticated(false);
        setMode(null);
        setTheme("system");
        applyTheme("system");
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
        profile?.theme === "light" || profile?.theme === "dark" ? profile.theme : "system";

      setMode(nextMode);
      setTheme(nextTheme);
      applyTheme(nextTheme);
    }

    void loadSessionContext();

    return () => {
      alive = false;
    };
  }, [pathname]);

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
              applyTheme(updated.theme);
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
  const profile = mode === "venue" ? "/perfil-casa" : "/perfil-artista";
  const items = [
    [home, "⌂", "Home"],
    ["/buscar", "⌕", "Explorar"],
    [offers, "◈", "Ofertas"],
    [events, "◆", "Eventos"],
    ["/chat", "●", "Chat"],
    ["/notificacoes", "♢", "Alertas"],
  ];

  return (
    <div className="aura-shell min-h-screen">
      <header className="aura-shell-header sticky top-0 z-50 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href={home} className="font-black tracking-tight">
            AURA <span className="text-red-500">BEAT</span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Navegação principal">
            {items.map(([href, , label]) => (
              <Link
                key={href}
                href={href}
                className={`rounded-xl px-3 py-2 text-sm transition ${
                  pathname === href
                    ? "bg-red-500 text-white"
                    : "aura-nav-link"
                }`}
              >
                {label}
              </Link>
            ))}

            {mode === "artist" && (
              <Link href="/agenda" className="aura-nav-link rounded-xl px-3 py-2 text-sm transition">
                Agenda
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={switchMode}
              className="rounded-xl border border-purple-500/40 bg-purple-500/10 px-3 py-2 text-xs font-semibold text-purple-500"
            >
              Modo {mode === "venue" ? "Casa" : "Artista"} ⇄
            </button>

            <Link href={profile} aria-label="Perfil" className="aura-icon-button rounded-xl px-3 py-2">
              ◉
            </Link>

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

      <div className="pb-20 lg:pb-0">{children}</div>

      <nav
        className="aura-mobile-nav fixed inset-x-0 bottom-0 z-50 grid grid-cols-6 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="Navegação mobile"
      >
        {items.map(([href, icon, label]) => (
          <Link
            key={href}
            href={href}
            className={`flex min-h-16 flex-col items-center justify-center text-[10px] ${
              pathname === href ? "text-red-500" : "aura-mobile-link"
            }`}
          >
            <span className="text-xl">{icon}</span>
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
