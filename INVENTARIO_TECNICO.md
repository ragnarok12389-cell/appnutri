# INVENTÁRIO TÉCNICO OPERACIONAL — APPNUTRI
## Guia de Instalação, Reprodução de Ambiente e Ordem de Leitura para o Codex

> **Data do Inventário**: 09 de Setembro de 2026  
> **Estado Operacional**: Pós-Etapa 8 (Pronto para início do planejamento da Etapa 9)  
> **Quality Gates Confirmados**: `npm test` (423/423 PASS), `npx tsc --noEmit` (0 erros), `npm run lint` (0 erros), `npm run build` (Turbopack 23 rotas PASS)

---

## 1. ESTADO DE CONTROLE DE VERSÃO E REPOSITÓRIO

- **Situação do Git no Diretório Local**:  
  O diretório de trabalho `c:\Users\pedro\OneDrive\Desktop\appnutri` encontra-se atualmente em pasta sincronizada do OneDrive **sem um repositório `.git` local inicializado** (`fatal: not a git repository`).
- **Recomendação para o Codex / Desenvolvedor**:  
  Ao migrar ou assumir o projeto, inicializar o repositório git (`git init`), configurar o remote oficial e criar o commit de referência inicial contendo o fechamento da Etapa 8:
  ```bash
  git init
  git add .
  git commit -m "feat(etapa-8): fechamento completo do AI Companion com 423 testes verdes"
  ```
- **Estado dos Arquivos**:  
  Todos os arquivos de código-fonte, migrações SQL, testes Vitest e documentações estão consolidados e 100% sincronizados no disco local.

---

## 2. ÁRVORE RESUMIDA DOS ARQUIVOS CRÍTICOS

```text
appnutri/
├── supabase/
│   └── migrations/                         # 17 migrações SQL aplicadas sequencialmente
├── src/
│   ├── app/
│   │   ├── (auth)/                         # Login, Registro, Server Actions de Auth
│   │   ├── (protected)/
│   │   │   ├── admin/                      # Painel administrativo
│   │   │   ├── dashboard/                  # Dashboard multiusuário
│   │   │   ├── patient/
│   │   │   │   ├── assistant/page.tsx      # Interface AI Companion (Etapa 8)
│   │   │   │   ├── nutrition/plan/page.tsx # Visualização de plano alimentar
│   │   │   │   ├── nutrition-profile/      # Questionário de perfil nutricional
│   │   │   │   └── workout/page.tsx        # Visualização e logs de treino
│   │   │   └── professional/               # Painel do nutricionista e influenciador
│   │   └── api/
│   │       └── ai/companion/
│   │           ├── chat/route.ts           # Endpoint POST da conversa contextual
│   │           └── confirm-action/route.ts # Endpoint POST de confirmação por token
│   ├── lib/
│   │   ├── supabase/                       # client.ts, server.ts, admin.ts, middleware.ts
│   │   ├── auth/                           # session.ts, roles.ts, guards.ts
│   │   ├── audit/                          # logger.ts (gravação em audit_logs)
│   │   ├── nutrition/                      # formulas.ts, guardrails.ts, engine.ts (Etapa 4)
│   │   ├── foods/                          # compatibility.ts, pricing.ts, import-pipeline.ts (Etapa 5)
│   │   ├── diet-composer/                  # solver.ts, substitution.ts, variety.ts, budget.ts, engine.ts (Etapa 6)
│   │   ├── workout-engine/                 # catalog.ts, candidate-filter.ts, solver.ts, progression.ts, substitution.ts, engine.ts (Etapa 7)
│   │   └── ai-companion/                   # safety.ts, context-builder.ts, provider.ts, tools.ts, rate-limiter.ts, orchestrator.ts, supabase-service.ts (Etapa 8)
│   └── types/                              # Definições de tipos de todo o sistema
├── tests/                                  # 44 suítes de teste Vitest
├── scripts/
│   └── parse_taco_excel.py                 # Extrator canônico oficial da TACO
├── package.json
├── package-lock.json
├── tsconfig.json
├── next.config.ts
├── vitest.config.mts
├── eslint.config.mjs
└── .env.example
```

---

## 3. COMANDOS DE INSTALAÇÃO, EXECUÇÃO E QUALITY GATES

### 3.1. Instalação de Dependências
```bash
npm install
```

### 3.2. Execução do Servidor de Desenvolvimento
```bash
npm run dev
# Servidor disponível em http://localhost:3000
```

### 3.3. Os Quatro Quality Gates Obrigatórios
```bash
# 1. Suíte de Testes Automatizados (deve passar 423 testes em 44 arquivos)
npm test

# 2. Verificação de Tipos TypeScript (deve sair com código 0 e sem erros)
npx tsc --noEmit

# 3. Análise Estática de Código com ESLint (deve sair com código 0)
npm run lint

# 4. Build de Produção com Next.js Turbopack (deve compilar 23 rotas)
npm run build
```

---

## 4. LISTA DAS 17 MIGRAÇÕES EM ORDEM CRONOLÓGICA DE APLICAÇÃO

As migrações residem em `supabase/migrations/` e devem ser aplicadas estritamente na ordem abaixo:

1. `20260907000001_initial_schema.sql`: 11 tabelas de governança, organizações, perfis, pacientes, vínculos e auditoria.
2. `20260907000002_rbac_and_permissions.sql`: Matriz de permissões canônica e papéis (`admin`, `nutritionist`, `influencer`, `patient`).
3. `20260907000003_rls_policies.sql`: Habilitação de RLS e criação de funções SECURITY DEFINER no schema `private.*` com `SET search_path = ''`.
4. `20260907000004_audit_and_triggers.sql`: Triggers de criação de perfil (`handle_new_user`), imutabilidade de papéis e ledger append-only de `audit_logs`.
5. `20260907000005_seed_initial_data.sql`: Validação e dados iniciais de verificação da fundação.
6. `20260907000006_invites_and_onboarding.sql`: Sistema de convites para profissionais e tabela `invites`.
7. `20260907000007_atomic_enrollment_and_rpc_wrappers.sql`: Funções RPC de matrícula atômica de pacientes.
8. `20260907000008_private_grants_and_email_verification.sql`: Ajustes de privilégios de execução no schema privado e verificação de e-mail.
9. `20260907000009_patient_nutrition_profile.sql`: Tabela `patient_nutrition_profiles` com questionário completo de saúde.
10. `20260908000010_deterministic_nutrition_engine.sql`: Tabela `nutrition_targets` e armazenamento das metas metabólicas.
11. `20260908000011_segregate_clinical_review_and_guardrails.sql`: Segregação de revisão clínica e guardrails de segurança.
12. `20260908000012_food_database_and_pricing.sql`: Tabelas `food_sources`, `food_items`, `food_composition_snapshots`, `food_household_measures`, `food_price_observations`.
13. `20260908000013_food_semantics_and_custom_hardening.sql`: Semântica oficial TACO (colunas analíticas) e isolamento de alimentos customizados.
14. `20260908000014_cross_tenant_and_governance_hardening.sql`: Hardening contra vazamento cross-tenant e importador atômico de alimentos via RPC.
15. `20260908000015_deterministic_diet_plans.sql`: Tabelas `diet_plans`, `diet_plan_days`, `diet_meals`, `diet_meal_items` e RPC atômico `persist_diet_plan_atomic`.
16. `20260909000016_deterministic_workout_engine.sql`: 9 tabelas de treino, catálogo biomecânico com checksum SHA-256 (`bf10a258...`), logs de execução com janela de 1h e RPC `persist_workout_program_atomic`.
17. `20260909000017_ai_companion_and_orchestration.sql`: Tabelas `ai_conversations`, `ai_messages`, `ai_feedback_events`, `ai_tool_executions`, `ai_rate_limits`, trigger de imutabilidade e RLS por paciente.

---

## 5. VARIÁVEIS DE AMBIENTE (SEM VALORES SECRETOS)

O arquivo `.env.example` sanitizado contém:

| Nome da Variável | Escopo | Finalidade |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Público (Browser & Server) | URL da instância do Supabase (ex: `http://127.0.0.1:54321` ou `https://xyz.supabase.co`). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Público (Browser & Server) | Chave anônima (publishable key) do Supabase para requisições sob RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Estritamente Servidor** | Chave de serviço com privilégios administrativos. Bloqueada em browser por verificação em `admin.ts`. |
| `NEXT_PUBLIC_SITE_URL` | Público (Browser & Server) | URL canônica do frontend para redirecionamento e geração de links de convite (ex: `http://localhost:3000`). |
| `GEMINI_API_KEY` | **Estritamente Servidor** | Chave da Google AI Studio / Gemini API para o `GeminiAIProvider`. Opcional em testes (usa `MockAIProvider`). |

---

## 6. DEPENDÊNCIAS EXTERNAS E REPRODUÇÃO DO AMBIENTE

- **Node.js**: Versão recomendada `>= 20.x` (LTS).
- **Python (Opcional)**: Versão `>= 3.10` caso necessite rodar o extrator da TACO (`scripts/parse_taco_excel.py`). O dataset extraído já se encontra consolidado no repositório.
- **Banco de Dados Local nos Testes**:
  - Utiliza `@electric-sql/pglite` (WebAssembly). **Não requer Docker nem PostgreSQL local rodando para executar a suíte de testes (`npm test`)**.
  - O banco de dados para testes sobe em memória de forma determinística em cada arquivo de teste.

---

## 7. ORDEM DE LEITURA RECOMENDADA PARA O CODEX

Para que o Codex compreenda o projeto sem desfazer decisões consolidadas, a leitura deve seguir esta ordem estrita:

1. [`APPNUTRI_HANDOFF.md`](file:///c:/Users/pedro/OneDrive/Desktop/appnutri/APPNUTRI_HANDOFF.md): Visão completa de regras de negócio, arquitetura, segregação de papéis e o que deve ser preservado.
2. [`ROADMAP_E_DECISOES.md`](file:///c:/Users/pedro/OneDrive/Desktop/appnutri/ROADMAP_E_DECISOES.md): Planejamento das Etapas 9 a 12 e decisões arquiteturais consolidadas.
3. [`src/types/`](file:///c:/Users/pedro/OneDrive/Desktop/appnutri/src/types/):
   - `roles.ts` e `permissions.ts` (RBAC)
   - `nutrition-engine.ts` (Perfil, fórmulas metabólicas e restrições)
   - `diet-plan.ts` (Cardápios, macros, substituição de alimentos)
   - `workout-engine.ts` (Biomecânica, Double Progression, snapshots de treino)
   - `ai-companion.ts` (Context packs, contratos de tools, segurança de IA)
4. [`src/lib/ai-companion/`](file:///c:/Users/pedro/OneDrive/Desktop/appnutri/src/lib/ai-companion/): Compreender a cadeia de orquestração segura (Safety -> Context -> Provider -> Tools -> Audit).
5. [`supabase/migrations/`](file:///c:/Users/pedro/OneDrive/Desktop/appnutri/supabase/migrations/): Especialmente as migrações 15 (`persist_diet_plan_atomic`), 16 (`deterministic_workout_engine`) e 17 (`ai_companion_and_orchestration`).
6. [`tests/`](file:///c:/Users/pedro/OneDrive/Desktop/appnutri/tests/): Revisar testes de segurança RLS (`*_security_rls.test.ts`) para entender as garantias contra IDOR e cross-tenant.

---

## 8. LISTA EXPLÍCITA DE INFORMAÇÕES NÃO LOCALIZADAS NO REPOSITÓRIO

Em conformidade com as diretrizes de integridade, declara-se que as seguintes informações **NÃO foram localizadas** em nenhum documento existente no repositório:

1. **Escopo Detalhado da Etapa 10**: Não há especificação sobre o que constitui a Etapa 10 (se integrações financeiras, relatórios em PDF, prontuário eletrônico avançado ou outro módulo).
2. **Escopo Detalhado da Etapa 11**: Não há especificação sobre o que constitui a Etapa 11 (se notificações push, aplicativo mobile / PWA, sincronização com wearables ou outro tema).
3. **Repositório Git Remoto Oficial**: Não foi localizada URL de repositório Git remoto (GitHub / GitLab / Bitbucket) no código ou nos manifestos.
4. **Configuração de Gateway de Pagamentos / Assinaturas**: Não há código de checkout, webhook de pagamento (Stripe, Asaas, Pagar.me) nem tabelas de billing implementadas até o momento.
5. **Configuração de SMTP / Envio Real de E-mails**: Os fluxos de e-mail utilizam mocks e URLs de redirecionamento locais; não há integração ativa configurada com Resend, SendGrid ou Amazon SES.
