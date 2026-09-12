"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Mode = "artist" | "venue";
const publicPaths = new Set(["/", "/login", "/cadastro", "/cadastro/login"]);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!alive || !data.user) return;
      setAuthenticated(true);
      const { data: profile } = await supabase.from("profiles").select("default_mode").eq("id", data.user.id).maybeSingle();
      if (alive) setMode(profile?.default_mode === "venue" ? "venue" : "artist");
    });
    return () => { alive = false; };
  }, [pathname]);

  async function switchMode() {
    const next: Mode = mode === "venue" ? "artist" : "venue";
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const table = next === "artist" ? "artist_profiles" : "venue_profiles";
    const owner = next === "artist" ? "user_id" : "owner_user_id";
    const { data: profile } = await supabase.from(table).select("id").eq(owner, user.id).maybeSingle();
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
    [home, "⌂", "Home"], ["/buscar", "⌕", "Buscar"], [offers, "◈", "Ofertas"],
    [events, "◆", "Eventos"], ["/chat", "●", "Chat"], ["/notificacoes", "♢", "Alertas"],
  ];
  return <div className="min-h-screen bg-[#050507] text-white">
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#08080b]/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link href={home} className="font-black tracking-tight">AURA <span className="text-red-500">BEAT</span></Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Navegação principal">
          {items.map(([href,, label]) => <Link key={href} href={href} className={`rounded-xl px-3 py-2 text-sm ${pathname === href ? "bg-red-500 text-white" : "text-zinc-400 hover:bg-zinc-900 hover:text-white"}`}>{label}</Link>)}
          {mode === "artist" && <Link href="/agenda" className="rounded-xl px-3 py-2 text-sm text-zinc-400 hover:text-white">Agenda</Link>}
        </nav>
        <div className="flex items-center gap-2">
          <button onClick={switchMode} className="rounded-xl border border-purple-500/40 bg-purple-500/10 px-3 py-2 text-xs font-semibold">Modo {mode === "venue" ? "Casa" : "Artista"} ⇄</button>
          <Link href={profile} aria-label="Perfil" className="rounded-xl border border-zinc-800 px-3 py-2">◉</Link>
          <Link href="/configuracoes" aria-label="Configurações" className="rounded-xl border border-zinc-800 px-3 py-2">⚙</Link>
        </div>
      </div>
    </header>
    <div className="pb-20 lg:pb-0">{children}</div>
    <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-6 border-t border-white/10 bg-[#09090c]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Navegação mobile">
      {items.map(([href, icon, label]) => <Link key={href} href={href} className={`flex min-h-16 flex-col items-center justify-center text-[10px] ${pathname === href ? "text-red-400" : "text-zinc-500"}`}><span className="text-xl">{icon}</span>{label}</Link>)}
    </nav>
  </div>;
}
