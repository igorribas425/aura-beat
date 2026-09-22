# Aura Beat — preparação para Google Play

Objetivo: publicar o Aura Beat como aplicativo Android mantendo o mesmo sistema, os mesmos usuários e o mesmo Supabase usados pelo site.

## Host provisório configurado

O app está preparado para usar, por enquanto:

```text
https://aura-beat-woad.vercel.app
```

O link enviado tinha `/buscar`, mas o aplicativo não deve ficar preso nessa tela. A abertura padrão continua em `/abrir`, e depois o próprio Aura Beat decide a tela correta conforme login/perfil.

Quando o domínio oficial for comprado, trocaremos apenas o host e a associação do Android. O package ID continua o mesmo.

## Identidade Android definida

- Nome: Aura Beat
- Package ID: `com.aurabeat.app`
- Start URL: `/abrir`
- Host provisório: `aura-beat-woad.vercel.app`
- Cor principal: `#050507`
- Orientação: portrait-primary
- Idioma principal da loja: pt-BR

O package ID deve ser tratado como permanente depois que o aplicativo for publicado na Play Store.

## Gerar a configuração local

Com o repositório atualizado:

```bash
npm run play:prepare
```

O comando lê `play-store/app.config.json` e cria `play-store/generated/twa-manifest.json`.

Quando a chave de assinatura existir, também será possível gerar o Digital Asset Links:

```bash
npm run play:prepare -- --sha256 AA:BB:CC:...
```

## Etapas seguintes

1. Criar a conta Google Play Console.
2. Gerar a chave de assinatura Android fora do GitHub.
3. Obter o SHA-256 do certificado de assinatura.
4. Publicar `/.well-known/assetlinks.json` com o package ID e o SHA-256 corretos.
5. Gerar o Android App Bundle (.aab).
6. Enviar primeiro para uma faixa de testes da Play Console.
7. Validar login, câmera, localização, mapa, mídia, chat, ofertas, agenda e retomada do app.

## Segurança

Arquivos de assinatura nunca devem entrar no repositório. O `.gitignore` bloqueia formatos de keystore Android.

## Cobranças

Antes de habilitar assinatura digital paga dentro do app, revisar as regras vigentes do Google Play Billing para o tipo de produto oferecido pelo Aura Beat.
