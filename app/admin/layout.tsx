import Link from "next/link";

const items = [
  { href: "/admin", label: "Central" },
  { href: "/admin/financeiro", label: "Financeiro" },
  { href: "/admin/verificacoes", label: "Verificações" },
  { href: "/admin/planos", label: "Planos" },
  { href: "/admin/suporte", label: "Suporte" },
  { href: "/admin/equipe-aura", label: "Equipe Aura" },
  { href: "/admin/cnpj", label: "CNPJ" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-50 border-b border-zinc-900 bg-black/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-3">
            <img
              src="/aura-beat-logo.webp"
              alt=""
              className="h-10 w-10 object-contain"
            />
            <div>
              <p className="text-xs font-black tracking-[0.24em] text-red-500">
                AURA BEAT
              </p>
              <p className="text-sm font-black text-white">
                Central Administrativa
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/home-artista"
              className="rounded-xl border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs font-black text-purple-300 transition hover:bg-purple-500/20"
            >
              Modo DJ
            </Link>

            <nav
              className="hidden items-center gap-1 xl:flex"
              aria-label="Navegação administrativa"
            >
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl px-3 py-2 text-sm font-semibold text-zinc-400 transition hover:bg-zinc-900 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
            </nav>
          </div>

          <Link
            href="/admin"
            className="rounded-xl border border-zinc-800 px-3 py-2 text-xs font-black text-zinc-300 transition hover:bg-zinc-900 xl:hidden"
          >
            Menu Admin
          </Link>
        </div>
      </header>

      {children}
    </div>
  );
}
