# Plano de implementação — Etapa 9

## Objetivo

Transformar check-ins, execução real de treino e feedback estruturado em um histórico confiável de progresso e em propostas auditáveis de ajuste. Nenhuma proposta altera dieta, treino, meta ou restrição automaticamente.

## Estado de entrada

- Etapa 8 aceita localmente após hardening.
- Baseline: 426 testes em 44 arquivos.
- TypeScript, ESLint e build com exit code zero.
- Migration mais recente: `20260909000018_ai_companion_runtime_hardening.sql`.

## Entregas

### 1. Registro de check-ins

- Check-in append-only com peso, fome, energia, sono e aderência percebida.
- Identidade do paciente derivada exclusivamente da sessão.
- Datas futuras e valores fora dos limites são rejeitados.
- Observações livres não são convertidas em diagnóstico.

### 2. Motor determinístico de progresso

- Versão e configuração explícitas.
- Entrada canônica e hash SHA-256 reproduzível.
- Métricas de tendência de peso, aderência informada, treinos realizados e sinais recorrentes.
- Reason codes estruturados e distinção entre dado ausente e resultado favorável.
- Propostas sem prescrição numérica automática.

### 3. Persistência e concorrência

- Snapshot imutável de cada análise.
- Idempotência por hash de entrada e versão do motor.
- Propostas vinculadas à análise e aos eventos que as fundamentam.
- Feedbacks consumidos uma única vez dentro da operação transacional.

### 4. Revisão profissional

- Paciente consulta o próprio progresso e propostas.
- Profissional consulta somente pacientes com vínculo ativo e `progress.view`.
- Nutricionista pode decidir apenas propostas de nutrição.
- Propostas de treino permanecem aguardando profissional habilitado; os papéis atuais não concedem essa autoridade.
- Aprovar uma proposta registra intenção de revisão e não modifica nenhum plano.

### 5. Interface mínima

- Nova rota `/patient/progress` com formulário de check-in, resumo e histórico.
- Acesso pelo painel do paciente.
- Estados explícitos para dados insuficientes e revisão profissional.

## Segurança

- RLS em todas as tabelas novas.
- Histórico append-only protegido por trigger.
- Writes derivados somente por RPCs com `SECURITY DEFINER`, `search_path` vazio, `REVOKE` de `PUBLIC`, `anon` e `authenticated`, e `GRANT` ao `service_role`.
- Validação de vínculo profissional-paciente no banco e no backend.
- Testes negativos cross-tenant, de imutabilidade, autoridade por domínio e idempotência.

## Gates de saída

- Testes do motor puro, schemas e banco.
- Suíte global aprovada.
- TypeScript sem erros.
- ESLint sem erros ou avisos.
- Build aprovado.
- Relatório da Etapa 9 com baseline real, riscos e decisão de gate.

## Fora de escopo

- Alteração automática de calorias, macros, alimentos, cargas ou exercícios.
- Diagnóstico clínico.
- Etapas 10 e 11: produtos, entitlements e pagamentos.
- Redesign final da Etapa 12.
