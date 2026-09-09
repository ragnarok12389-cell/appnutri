# Etapa 10 — Produtos e Entitlements

**Data:** 9 de setembro de 2026  
**Responsável:** Codex  
**Status:** PASS local  
**Baseline de entrada:** 440 testes em 46 arquivos  
**Baseline de saída:** 446 testes em 47 arquivos

## Entrega

- catálogo de produtos e recursos;
- produto `appnutri_core` concedido automaticamente a pacientes atuais e futuros;
- produto `appnutri_premium` preparado para comercialização;
- entitlement individual com snapshot imutável dos recursos;
- concessão idempotente por referência externa;
- revogação sem apagar histórico;
- função segura para o paciente consultar o próprio recurso;
- painel administrativo em `/admin/products`;
- integração preparada para a Etapa 11 sem confiar em estado de pagamento vindo do frontend.

## Segurança

- RLS isola entitlements por paciente;
- clientes autenticados possuem somente leitura autorizada;
- concessão e revogação passam por RPCs exclusivas do `service_role`;
- o RPC valida que o ator é administrador;
- o paciente não consegue simular uma concessão chamando o RPC;
- eventos são append-only;
- snapshots impedem que uma edição posterior do produto altere silenciosamente direitos já concedidos;
- expiração e revogação retiram o recurso da função de autorização.

## Migration

`20260909000020_products_and_entitlements.sql` adiciona:

- `products`;
- `product_features`;
- `user_entitlements`;
- `entitlement_events`;
- `private.has_active_entitlement`;
- `public.has_my_entitlement`;
- `public.grant_user_entitlement`;
- `public.revoke_user_entitlement`.

## Gates

| Gate | Resultado |
|---|---|
| `npm test` | 47 arquivos e 446 testes aprovados, exit code 0 |
| `npx tsc --noEmit` | 0 erros, exit code 0 |
| `npm run lint` | 0 erros e 0 avisos, exit code 0 |
| `npm run build` | 25 páginas/rotas geradas, exit code 0 |

Permanece somente o aviso conhecido de descontinuação da convenção `middleware` do Next.js.

## Limites e próxima etapa

- Nenhum pagamento foi simulado ou aceito pelo frontend.
- O pacote premium ainda não é concedido por checkout; isso pertence à Etapa 11.
- Preço, moeda, assinatura Founder, refunds, chargebacks e webhook financeiro entram no próximo modelo.
- As migrations precisam ser homologadas no Supabase real antes de produção.

**PRODUCTS + ENTITLEMENTS GATE: PASS LOCAL**
