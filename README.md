This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Aura Beat — configuração de produção

1. Copie `.env.example` para `.env.local` e use a URL e a chave **publishable** do Supabase.
2. Aplique as migrations de `supabase/migrations` primeiro em staging. Elas não são aplicadas automaticamente por este repositório.
3. Configure no cofre de segredos do servidor: `SUPABASE_SERVICE_ROLE_KEY`, `ASAAS_API_KEY`, `ASAAS_API_URL`, `ASAAS_PIX_FEE` e `ASAAS_WEBHOOK_TOKEN`. Nunca exponha essas variáveis com o prefixo `NEXT_PUBLIC_`.
4. A integração de Pix usa o ASAAS nas rotas `/api/payments/asaas/*` e `/api/subscriptions/asaas/*`.
5. No ASAAS, configure o webhook para `POST /api/payments/webhook` no domínio de produção do Aura Beat. O token configurado no ASAAS deve ser exatamente o mesmo valor de `ASAAS_WEBHOOK_TOKEN`, enviado no header `asaas-access-token`.
6. O webhook valida o pagamento pelo ID do ASAAS, referência externa e valor antes de atualizar cobranças ou mensalidades.

### Limitação de localização na PWA

O rastreamento usa a API de geolocalização do navegador enquanto a página do evento está ativa. Sistemas móveis podem suspender páginas em segundo plano; a interface não deve prometer rastreamento contínuo e deve orientar o artista a manter a tela aberta durante o deslocamento. Para rastreamento garantido em segundo plano, será necessário um aplicativo nativo e consentimento explícito.
