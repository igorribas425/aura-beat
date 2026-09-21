import Link from "next/link";

export const metadata = {
  title: "Política de Privacidade | Aura Beat",
  description: "Política de Privacidade da plataforma Aura Beat.",
};

export default function PrivacidadePage() {
  return (
    <main className="min-h-screen bg-[#050507] text-white">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
        <Link
          href="/login"
          className="text-sm font-bold text-zinc-400 transition hover:text-white"
        >
          ← Voltar
        </Link>

        <header className="mt-8 rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-950 to-red-950/20 p-6 sm:p-8">
          <p className="text-xs font-black tracking-[0.2em] text-red-500">
            AURA BEAT
          </p>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">
            Política de Privacidade
          </h1>
          <p className="mt-3 text-sm text-zinc-400">
            Última atualização: 21 de setembro de 2026.
          </p>
        </header>

        <div className="mt-6 space-y-6 text-sm leading-7 text-zinc-300">
          <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-xl font-black text-white">1. Sobre esta política</h2>
            <p className="mt-3">
              Esta política explica como a Aura Beat trata dados pessoais de
              artistas, casas, contratantes e demais usuários da plataforma.
              O tratamento é feito para permitir cadastro, perfis, descoberta,
              contratação, comunicação, suporte, segurança e cobrança.
            </p>
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-xl font-black text-white">2. Dados que podemos tratar</h2>
            <p className="mt-3">
              Podemos tratar dados de conta e contato, informações de perfil
              profissional, mídia enviada pelo usuário, dados de eventos e
              contratações, mensagens, registros de segurança e informações
              necessárias para cobrança. Documentos de cobrança podem ser
              armazenados em área privada e usados somente nos fluxos que
              exigem faturamento ou pagamento.
            </p>
            <p className="mt-3">
              Quando um artista ativa o compartilhamento de localização, a
              plataforma pode usar a localização fornecida pelo aparelho para
              recursos de mapa e disponibilidade. A exibição pública deve usar
              localização aproximada, e o compartilhamento pode ser desligado
              pelo próprio usuário.
            </p>
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-xl font-black text-white">3. Pagamentos</h2>
            <p className="mt-3">
              Cobranças Pix e outros serviços de pagamento podem ser processados
              por provedores externos, como o ASAAS. A Aura Beat recebe e guarda
              apenas os dados necessários para identificar a cobrança, acompanhar
              seu status e liberar os recursos contratados.
            </p>
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-xl font-black text-white">4. Compartilhamento e fornecedores</h2>
            <p className="mt-3">
              Dados podem ser tratados por fornecedores de infraestrutura,
              banco de dados, autenticação, pagamentos, entrega de e-mail,
              segurança e conectividade estritamente para viabilizar a
              plataforma. Também poderemos compartilhar informações quando
              houver obrigação legal ou ordem válida de autoridade competente.
            </p>
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-xl font-black text-white">5. Segurança e retenção</h2>
            <p className="mt-3">
              Aplicamos controles técnicos e de acesso para reduzir riscos de
              acesso indevido. Mantemos os dados pelo período necessário para
              prestar o serviço, proteger a plataforma e cumprir obrigações
              legais, regulatórias, fiscais ou de prevenção a fraude.
            </p>
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-xl font-black text-white">6. Seus direitos</h2>
            <p className="mt-3">
              Nos termos da LGPD, o titular pode solicitar informações sobre
              seus dados, correção, portabilidade quando aplicável, oposição,
              revogação de consentimento e exclusão nos casos permitidos por lei.
              Algumas informações podem ser mantidas quando houver fundamento
              legal para retenção.
            </p>
            <p className="mt-3">
              Para solicitar exclusão de conta, acesse{" "}
              <Link href="/excluir-conta" className="font-bold text-red-400 hover:text-red-300">
                Exclusão de conta
              </Link>
              .
            </p>
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-xl font-black text-white">7. Contato</h2>
            <p className="mt-3">
              Para questões de privacidade e proteção de dados, entre em contato
              pelo e-mail{" "}
              <a
                href="mailto:igorribas425@gmail.com"
                className="font-bold text-red-400 hover:text-red-300"
              >
                igorribas425@gmail.com
              </a>
              .
            </p>
          </section>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/termos"
              className="rounded-xl border border-zinc-700 px-4 py-3 font-bold hover:bg-zinc-900"
            >
              Termos de Uso
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
