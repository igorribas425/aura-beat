# Aura Beat — controle de custos operacionais

Atualizado em 22/09/2026.

Este arquivo serve como referência para separar custos da plataforma antes de distribuir lucros. Valores em dólar ou variáveis devem ser conferidos no painel do fornecedor no momento da contratação.

| Item | Situação inicial | Referência de custo | Quando vira custo |
| --- | --- | --- | --- |
| Supabase | Pode permanecer no Free enquanto estiver dentro das cotas | Free: US$ 0. A documentação pública do Supabase informa Pro a partir de US$ 25/mês, com cobranças adicionais por compute/uso quando aplicáveis | Quando as cotas do Free deixarem de atender ou for necessário recurso pago |
| Vercel | Manter no plano atual enquanto atender e estiver adequado ao uso do projeto | Verificar o preço atual do plano no painel antes de fazer upgrade | Quando tráfego, recursos ou condições de uso exigirem plano pago |
| Domínio | Renovação anual | Depende do registrador e do domínio escolhido | Na renovação anual |
| Google Play Console | Conta de desenvolvedor necessária para publicar na Play Store | O valor atual deve ser confirmado no cadastro do Google Play Console antes do pagamento | Uma vez, na abertura da conta, se a política vigente continuar como taxa única |
| App Android | Código pode ser preparado sem mensalidade própria | Desenvolvimento interno; publicação depende da conta Play Console | Sem custo recorrente obrigatório só por existir o app |
| ASAAS / PIX | Adiado por enquanto | Taxa por transação conforme contrato vigente | Somente quando começarmos a cobrar de verdade |
| E-mail transacional | Pode começar em faixa gratuita, conforme provedor | Variável por volume | Quando o volume de e-mails superar a franquia gratuita |
| Armazenamento de fotos e vídeos | Usa Supabase Storage | Incluído até a cota do plano; excedente é cobrado | Conforme crescimento de mídia |
| Marketing | Variável | Definir orçamento mensal separado | Quando começarem anúncios pagos |

## Regra de caixa sugerida

Antes de considerar o valor recebido como lucro, separar nesta ordem:

1. taxas do meio de pagamento;
2. custos fixos do mês;
3. reserva de infraestrutura;
4. reserva para impostos/contabilidade;
5. verba de marketing;
6. somente o restante entra como lucro disponível.

## Reserva operacional

Enquanto o Aura Beat ainda estiver pequeno, manter uma reserva mensal mesmo que os serviços estejam em faixa gratuita. A reserva evita que um aumento de uso em Supabase, hospedagem, e-mail ou armazenamento vire uma despesa inesperada.

## Observações

- Não ativar recursos pagos automaticamente sem conferir o preço no painel.
- PIX e cobrança ficam fora do lançamento inicial até o teste real.
- A conta da Play Store e a assinatura do app devem ficar em nome do responsável pelo Aura Beat.
- Nunca salvar senha, token, chave privada, arquivo .jks ou .keystore no GitHub.
