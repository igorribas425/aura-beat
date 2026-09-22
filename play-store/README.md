# Aura Beat — preparação para Google Play

Objetivo: publicar o Aura Beat como aplicativo Android mantendo o mesmo sistema, os mesmos usuários e o mesmo Supabase usados pelo site.

## Estratégia

A primeira publicação será baseada na PWA existente usando Trusted Web Activity (TWA). Isso permite abrir o Aura Beat como aplicativo instalado, em tela cheia, usando a aplicação web de produção.

O projeto já possui:

- manifest PWA em `app/manifest.ts`;
- ícones 192, 512, maskable e Apple Touch;
- service worker;
- HTTPS via hospedagem;
- fluxo de login, Artista e Casa no mesmo backend.

## Identidade Android definida

- Nome: Aura Beat
- Package ID: `com.aurabeat.app`
- Start URL: `/abrir`
- Cor principal: `#050507`
- Orientação: portrait-primary
- Idioma principal da loja: pt-BR

O package ID deve ser tratado como permanente depois que o aplicativo for publicado na Play Store.

## Preparar usando um domínio provisório

Enquanto o domínio definitivo não for comprado, podemos preparar o projeto com um host HTTPS temporário/fixo da Vercel. Não use um domínio inventado nem um túnel temporário que muda de endereço.

Quando houver um host válido, rode:

```bash
npm run play:prepare -- --host SEU_HOST
```

Exemplo de formato:

```bash
npm run play:prepare -- --host projeto.vercel.app
```

O comando cria somente arquivos locais em `play-store/generated/`, que ficam ignorados pelo Git.

Quando a chave de assinatura existir, também será possível gerar o modelo de Digital Asset Links:

```bash
npm run play:prepare -- --host SEU_HOST --sha256 AA:BB:CC:...
```

## Etapas que ainda dependem de informação externa

1. Confirmar um host HTTPS estável de produção ou provisório.
2. Criar a conta Google Play Console.
3. Gerar a chave de assinatura Android fora do GitHub.
4. Obter o SHA-256 do certificado de assinatura.
5. Publicar `/.well-known/assetlinks.json` com o package ID e o SHA-256 corretos.
6. Gerar o Android App Bundle (.aab).
7. Enviar primeiro para uma faixa de testes da Play Console.
8. Preencher Data safety, classificação indicativa, público-alvo e declarações exigidas pela Play Store.

## Segurança

Arquivos de assinatura nunca devem entrar no repositório. O `.gitignore` bloqueia formatos de keystore Android.

Os arquivos em `play-store/generated/` são auxiliares locais e não devem ser tratados como chave ou assinatura.

## Funcionalidades que precisam ser validadas no Android antes da produção

- login e recuperação de acesso;
- criação de Artista e Casa;
- câmera e upload na verificação;
- localização e mapa;
- upload de fotos e vídeos;
- chat;
- ofertas, agenda e booking;
- financeiro sem cobrança real por enquanto;
- instalação, ícone, splash e retomada do app;
- links externos e WhatsApp.

## Cobranças

Antes de habilitar assinatura digital paga dentro do app, revisar as regras vigentes do Google Play Billing para o tipo de produto oferecido pelo Aura Beat.
