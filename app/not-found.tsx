import Link from "next/link";

export default function NotFound() {
  return (
    <main className="aura-page flex min-h-screen items-center justify-center px-4 py-10">
      <section className="aura-hero aura-artist-hero w-full max-w-xl rounded-[2rem] p-8 text-center sm:p-12">
        <p className="aura-kicker">Erro 404</p>
        <h1 className="mt-3 text-4xl font-black sm:text-5xl">Essa batida saiu da rota.</h1>
        <p className="mx-auto mt-4 max-w-md text-zinc-400">
          A página não existe ou mudou de endereço. Volte ao Aura Beat para continuar.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/login" className="rounded-xl bg-red-500 px-5 py-3 font-black text-white hover:bg-red-600">
            Ir para o Aura Beat
          </Link>
          <Link href="/buscar" className="rounded-xl border border-zinc-700 px-5 py-3 font-bold hover:border-purple-500/50">
            Explorar
          </Link>
        </div>
      </section>
    </main>
  );
}
