# Etapa 9 — Progresso, Feedback e Ajustes Contínuos

**Data:** 9 de setembro de 2026  
**Responsável:** Codex  
**Status:** PASS local  
**Baseline de entrada:** 426 testes em 44 arquivos  
**Baseline de saída:** 440 testes em 46 arquivos

## Resultado funcional

A Etapa 9 transforma check-ins, execuções de treino e feedbacks estruturados do AI Companion em análises reproduzíveis e propostas de revisão. O fluxo não altera metas, dieta ou treino automaticamente.

Foram entregues:

- check-in diário com peso, fome, energia, sono e aderência percebida;
- sinalização explícita de sintoma ou desconforto, sem interpretação diagnóstica;
- motor determinístico de progresso com versões, hashes SHA-256 e reason codes;
- tendência de peso, médias recentes, sessões realizadas e qualidade dos dados;
- propostas de revisão por padrões recorrentes;
- persistência idempotente e transacional das análises;
- consumo dos feedbacks da Etapa 8 pelo motor da Etapa 9;
- painel do paciente em `/patient/progress`;
- painel de acompanhamento em `/professional/patients/[patientId]/progress`;
- revisão nutricional que registra uma intenção de análise sem modificar a prescrição.

## Motor determinístico

- `PROGRESS_ENGINE_VERSION = '1.0.0'`
- `PROGRESS_CONFIG_VERSION = 'progress-config-1.0.0'`
- mesmo snapshot semântico produz os mesmos hashes;
- ordenação de check-ins, sessões e feedbacks é canônica;
- mudanças semânticas alteram os hashes;
- ausência de dados é representada como `insufficient`, nunca como resultado favorável;
- o motor não gera alvos calóricos, macros, pesos de treino ou diagnósticos.

Os padrões atuais podem abrir propostas para saciedade, aderência nutricional, aderência ao treino, desconforto em exercício, rotina incompatível e contato profissional.

## Banco de dados

A migration `20260909000019_progress_feedback_adjustments.sql` adiciona:

- `patient_check_ins`;
- `progress_analyses`;
- `adjustment_proposals`;
- `adjustment_proposal_reviews`;
- `private.can_view_patient_progress`;
- `public.persist_progress_analysis_atomic`;
- `public.review_adjustment_proposal`.

Check-ins, análises e revisões são append-only. O RPC de persistência usa advisory lock e chave única por paciente, versões e hash de entrada. Uma repetição do mesmo processamento retorna a análise existente.

## Segurança e papéis

- `patient_id` do check-in vem da sessão autenticada;
- RLS bloqueia leitura e escrita cross-tenant;
- nutricionista precisa de vínculo ativo para visualizar progresso individual;
- influencer não recebe check-ins, snapshots ou observações individuais;
- nutricionista pode decidir somente propostas de nutrição ou acompanhamento geral;
- propostas de treino não podem ser decididas por nutricionista ou influencer;
- os papéis atuais ainda não incluem profissional de Educação Física com autoridade de revisão;
- RPCs de persistência e revisão foram revogadas de `PUBLIC`, `anon` e `authenticated` e concedidas somente ao `service_role`;
- aceitar uma proposta não altera o plano do paciente.

Também foi corrigida uma divergência anterior: a matriz TypeScript ainda concedia `workout.edit` ao nutricionista, embora a migration da Etapa 7 já tivesse revogado essa permissão. A matriz, o teste RBAC e o texto da interface foram reconciliados com a decisão canônica.

## Integração com o AI Companion

Feedbacks registrados pelo Companion acionam a análise determinística. Se o processamento derivado falhar, o feedback permanece com status `recorded` para nova tentativa no próximo check-in. O contexto do Companion passa a consumir métricas da análise persistida e a quantidade de propostas pendentes.

## Gates

| Gate | Resultado |
|---|---|
| `npm test` | 46 arquivos e 440 testes aprovados, exit code 0 |
| `npx tsc --noEmit` | 0 erros, exit code 0 |
| `npm run lint` | 0 erros e 0 avisos, exit code 0 |
| `npm run build` | 24 páginas/rotas geradas, exit code 0 |

O build mantém o aviso conhecido de descontinuação da convenção `middleware` no Next.js 16.3.4.

## Riscos e próximos passos

1. Aplicar as 19 migrations no Supabase de homologação e repetir RLS, RPCs e concorrência com Auth/JWT/PostgREST reais.
2. O reprocessamento após falha está ligado ao próximo check-in; produção deverá ter fila ou job de retry observável.
3. O modelo atual aceita um check-in imutável por paciente e data. Uma correção futura deve usar evento de superseding, sem editar o histórico.
4. Criar um papel profissional de Educação Física e seu fluxo de credenciamento antes de liberar revisão de propostas de treino.
5. A aprovação `accepted_for_review` representa triagem profissional; uma alteração futura continuará passando pelos motores determinísticos e seus fluxos versionados.
6. A Etapa 10 deve começar somente após plano próprio para produtos e entitlements.

## Gate final

**PROGRESS + FEEDBACK + ADJUSTMENTS GATE: PASS LOCAL**

A Etapa 10 não foi iniciada neste pacote.
