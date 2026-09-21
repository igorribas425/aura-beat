import Link from "next/link";

export const metadata = {
  title: "Termos de Uso | Aura Beat",
  description: "Termos de Uso da plataforma Aura Beat.",
};

export default function TermosPage() {
  return (
    <main className="min-h-screen bg-[#050507] text-white">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
        <Link
          href="/login"
          className="text-sm font-bold text-zinc-400 transition hover:text-white"
        >
          ← Voltar
        </Link>

        <header className="mt-8 rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-950 to-purple-950/20 p-6 sm:p-8">
          <p className="text-xs font-black tracking-[0.2em] text-purple-400">
            AURA BEAT
          </p>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">Termos de Uso</h1>
          <p className="mt-3 text-sm text-zinc-400">
            Última atualização: 21 de setembro de 2026.
          </p>
        </header>

        <div className="mt-6 space-y-6 text-sm leading-7 text-zinc-300">
          <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-xl font-black text-white">1. Uso da plataforma</h2>
            <p className="mt-3">
              A Aura Beat conecta artistas, casas e contratantes e oferece
              recursos de descoberta, perfil profissional, propostas,
              comunicação, agenda, suporte e cobrança. Ao usar a plataforma,
              o usuário concorda em fornecer informações verdadeiras e manter
              sua conta protegida.
            </p>
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-xl font-black text-white">2. Perfis e conteúdo</h2>
            <p className="mt-3">
              O usuário é responsável pelo conteúdo que publica e deve possuir
              autorização para usar fotos, vídeos, marcas, músicas, textos e
              demais materiais enviados. Conteúdo ilegal, fraudulento, abusivo
              ou que viole direitos de terceiros poderá ser removido e a conta
              poderá ter o acesso restringido.
            </p>
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-xl font-black text-white">3. Contratações</h2>
            <p className="mt-3">
              Artistas e contratantes são responsáveis pelas informações,
              condições e obrigações assumidas em cada contratação. A Aura Beat
              fornece a infraestrutura digital e os registros do fluxo, mas não
              substitui os deveres profissionais, fiscais, trabalhistas ou civis
              das partes.
            </p>
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-xl font-black text-white">4. Planos e taxas</h2>
            <p className="mt-3">
              Valores de planos, mensalidades e taxas são apresentados antes da
              cobrança. Recursos pagos permanecem sujeitos às condições e ao
              período exibidos no momento da contratação. A confirmação de
              pagamento pode depender do provedor responsável pelo processamento.
            </p>
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-xl font-black text-white">5. Segurança e acesso</h2>
            <p className="mt-3">
              É proibido tentar acessar contas, dados, áreas administrativas ou
              recursos sem autorização, explorar falhas, automatizar abuso,
              fraudar pagamentos ou interferir no funcionamento da plataforma.
            </p>
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-xl font-black text-white">6. Disponibilidade</h2>
            <p className="mt-3">
              Podemos realizar manutenções, correções e atualizações. Serviços
              externos de autenticação, pagamentos, mapas, e-mail e hospedagem
              também podem sofrer indisponibilidades fora do controle direto da
              Aura Beat.
            </p>
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-xl font-black text-white">7. Encerramento da conta</h2>
            <p className="mt-3">
              O usuário pode solicitar exclusão da conta. A plataforma também
              poderá restringir ou encerrar acesso em caso de fraude, abuso,
              risco de segurança ou violação destes termos, respeitando
              obrigações legais aplicáveis.
            </p>
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-xl font-black text-white">8. Privacidade</h2>
            <p className="mt-3">
              O tratamento de dados pessoais é explicado na{" "}
              <Link href="/privacidade" className="font-bold text-purple-400 hover:text-purple-300">
                Política de Privacidade
              </Link>
              .
            </p>
          </section>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/privacidade"
              className="rounded-xl border border-zinc-700 px-4 py-3 font-bold hover:bg-zinc-900"
            >
              Política de Privacidade
            </Link>
            <Link
              href="/excluir-conta"
              className="rounded-xl border border-red-900 px-4 py-3 font-bold text-red-400 hover:bg-red-950/30"
            >
              Exclusão de conta
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
