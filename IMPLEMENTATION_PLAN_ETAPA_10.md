# Plano de implementação — Etapa 10

## Objetivo

Criar o catálogo server-side de produtos, recursos e entitlements individuais que determinará quais capacidades cada usuário pode acessar. O frontend apenas consulta o estado efetivo; não concede acesso.

## Entregas

- catálogo versionado de produtos e recursos;
- entitlement por paciente com snapshot dos recursos concedidos;
- produto gratuito base concedido no cadastro e retroativamente aos pacientes existentes;
- histórico append-only de concessão, revogação e expiração;
- funções server-side idempotentes para conceder e revogar;
- consulta segura dos próprios recursos;
- gestão administrativa mínima;
- testes de RLS, falsificação pelo cliente, idempotência e revogação.

## Regras

- pagamentos ainda não fazem parte desta etapa;
- nenhum client pode declarar que comprou ou possui um produto;
- `service_role` permanece somente no servidor;
- uma alteração futura no produto não muda silenciosamente direitos já concedidos: o entitlement guarda snapshot;
- revogação preserva o histórico;
- recursos atuais permanecem disponíveis pelo produto base para evitar regressão funcional.

## Gate

Suíte global, TypeScript, ESLint e build com exit code zero, seguida de relatório e commit próprios antes da Etapa 11.
