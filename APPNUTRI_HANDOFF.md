# PACOTE TÉCNICO DE HANDOFF — APPNUTRI
## Migração da Engenharia do Gemini/Antigravity para o Codex (Pós-Etapa 8)

> **Data do Handoff**: 09 de Setembro de 2026  
> **Estado do Repositório**: Etapa 8 Concluída com Sucesso  
> **Gate Atual**: 🟢 **AI COMPANION GATE: PASS**  
> **Status da Etapa 9**: 🛑 **ESTRITAMENTE BLOQUEADA** (Aguardando planejamento do Codex e aprovação do responsável pelo produto)  
> **Total de Testes Automatizados**: **423 testes passando em 44 arquivos (100% verde)**  
> **Baseline Histórico**: 386 testes herdados (Etapas 1–7) + 37 testes da Etapa 8 = 423 testes  
> **Todos os 4 Quality Gates**: `npm test` (PASS), `npx tsc --noEmit` (PASS, 0 erros), `npm run lint` (PASS, 0 erros), `npm run build` (PASS, Turbopack exit code 0)

---

## 1. PRODUTO, PÚBLICO E FUNCIONALIDADES

### 1.1. Propósito e Proposta de Valor
O **AppNutri** é uma plataforma SaaS multi-tenant voltada para o acompanhamento clínico-nutricional e prescrição de treinamento físico.
A premissa central de engenharia do sistema é o **determinismo matemático absoluto**:
- **Cálculo Nutricional**: BMR, TDEE e divisão de macronutrientes são calculados por fórmulas matemáticas canônicas (Mifflin-St Jeor, Katch-McArdle, Harris-Benedict) sem intervenção heurística arbitrária.
- **Composição de Dieta (Diet Composer)**: Geração de cardápios semanais por um solver determinístico que respeita estritamente pisos fisiológicos, macronutrientes, alergias, restrições culturais e orçamento em BRL.
- **Motor de Treino (Workout Engine)**: Prescrição e periodização por um solver biomecânico baseado no catálogo canônico oficial (`EXERCISE_CATALOG_CHECKSUM` SHA-256 de 64 caracteres hexadecimais), aplicando progressão dupla (*Double Progression*) e controle estrito de volume semanal.
- **AI Companion (Etapa 8)**: Camada conversacional contextual que explica o plano, orienta a rotina e coleta feedbacks, operando com **Zero Trust** no modelo: o LLM nunca possui autoridade clínica nem permissão de escrita direta no banco de dados.

### 1.2. Perfis de Usuários (RBAC Canônico)
Definidos em `public.roles` e validados via RLS e guards:
1. **`admin`**: Administrador do sistema. Acesso total a governança, catálogo mestre de alimentos e exercícios, auditoria de segurança e permissões.
2. **`nutritionist`**: Nutricionista com registro profissional (CRN). Possui a permissão `nutrition.edit` para prescrever, aprovar e revisar planos alimentares de seus pacientes vinculados. Não possui autoridade para prescrever treinos (`workout.edit` foi segregado).
3. **`influencer`**: Criador de conteúdo / Treinador de comunidade. Gerencia comunidades e programas gerais de exercícios. Não possui autoridade para prescrição dietética clínica (`nutrition.edit` bloqueado) nem aprovação médica.
4. **`patient`**: Paciente / Praticante final. Consome seus próprios planos alimentares e programas de treino, registra logs de execução (`workout_execution_logs`) e interage com o AI Companion (`/patient/assistant`).

### 1.3. Fluxos Principais
- **Cadastro e Onboarding**: Todo autocadastro público recebe incondicionalmente o papel `patient` via trigger de banco (`handle_new_user`). Papéis profissionais e administrativos exigem convites tokenizados seguros (`invites`).
- **Vínculo Profissional-Paciente**: Estabelecido em `public.professional_patient_links` com status `active`, `inactive` ou `transferred`. Acesso clínico do profissional ao paciente depende em tempo real de `private.can_access_patient(prof_id, pat_id)`.
- **Geração e Aprovação de Dieta**: Nutricionista submete parâmetros de restrição e metas; o motor gera a dieta em memória; persistência ocorre exclusivamente via RPC atômico `public.persist_diet_plan_atomic` com advisory lock; se aprovada, torna-se ativa.
- **Geração e Execução de Treino**: Programa gerado pelo motor de treino; persistido via RPC atômico `public.persist_workout_program_atomic`; paciente visualiza sua sessão diária e registra pesos e repetições em `workout_execution_logs` (com janela de correção auditável de 1 hora).
- **Atendimento Conversacional AI**: Paciente envia dúvidas no chat; o pipeline valida rate limit, executa o safety classifier independente pré-LLM (`SYMPTOM != DIAGNOSIS`), monta o contexto mínimo do paciente, consulta ferramentas autorizadas e responde de forma humanizada sem alterar dados sem confirmação explícita.

---

## 2. ARQUITETURA, STACK TECNOLÓGICA E ESTRUTURA

### 2.1. Stack e Versões Auditadas
- **Framework**: Next.js 16.3.4 (App Router, Turbopack)
- **Runtime / UI**: React 19, TypeScript 5.x
- **Estilização**: Tailwind CSS 4 + CSS Vanilla estruturado
- **Banco de Dados**: PostgreSQL 15+ gerenciado via Supabase (com migrações declarativas)
- **Sessões e Auth**: `@supabase/ssr` (0.5.2) com cookies HTTP-only, `supabase-js` (2.49.1)
- **Validação de Schemas**: Zod (3.24.2)
- **Ícones e Design**: Lucide React (1.16.0)
- **Testes & Engine de Banco Local**: Vitest (5.0.0) com `@electric-sql/pglite` (0.2.17) para testes em banco PostgreSQL real em memória
- **Segurança Criptográfica**: Node.js `crypto` nativo para hashes SHA-256 e geração de tokens

### 2.2. Versões de Domínio Congeladas
- `NUTRITION_ENGINE_VERSION = '1.0.0'`
- `DIET_COMPOSER_VERSION = '1.0.0'`
- `WORKOUT_ENGINE_VERSION = '1.0.0'`
- `EXERCISE_CATALOG_VERSION = '1.0.0'`
- `EXERCISE_CATALOG_SCHEMA_VERSION = '1.0.0'`
- `EXERCISE_CATALOG_CHECKSUM = 'bf10a258c98430fd146f6397f76a57e938628587942e618400421158d221fa2b'` (SHA-256 canônico de 64 caracteres)
- `AI_COMPANION_VERSION = '1.0.0'`

### 2.3. Estrutura de Pastas do Projeto
```text
appnutri/
├── supabase/
│   └── migrations/                  # 17 migrações SQL aplicadas sequencialmente
│       ├── 20260907000001_initial_schema.sql
│       ├── 20260907000002_rbac_and_permissions.sql
│       ├── 20260907000003_rls_policies.sql
│       ├── 20260907000004_audit_and_triggers.sql
│       ├── 20260907000005_seed_initial_data.sql
│       ├── 20260907000006_invites_and_onboarding.sql
│       ├── 20260907000007_atomic_enrollment_and_rpc_wrappers.sql
│       ├── 20260907000008_private_grants_and_email_verification.sql
│       ├── 20260907000009_patient_nutrition_profile.sql
│       ├── 20260908000010_deterministic_nutrition_engine.sql
│       ├── 20260908000011_segregate_clinical_review_and_guardrails.sql
│       ├── 20260908000012_food_database_and_pricing.sql
│       ├── 20260908000013_food_semantics_and_custom_hardening.sql
│       ├── 20260908000014_cross_tenant_and_governance_hardening.sql
│       ├── 20260908000015_deterministic_diet_plans.sql
│       ├── 20260909000016_deterministic_workout_engine.sql
│       └── 20260909000017_ai_companion_and_orchestration.sql
├── src/
│   ├── app/                         # App Router
│   │   ├── (auth)/                  # Rotas de login, registro e ações de auth
│   │   ├── (protected)/             # Rotas protegidas por guards de papel
│   │   │   ├── admin/               # Painel administrativo
│   │   │   ├── dashboard/           # Dashboard comum
│   │   │   ├── patient/             # Portal do paciente
│   │   │   │   ├── assistant/       # Interface do AI Companion (/patient/assistant)
│   │   │   │   ├── workout/         # Visualização de treino e execução
│   │   │   │   └── nutrition/       # Planos nutricionais ativos
│   │   │   └── professional/        # Portal do nutricionista / influenciador
│   │   └── api/
│   │       └── ai/companion/
│   │           ├── chat/route.ts    # POST /api/ai/companion/chat
│   │           └── confirm-action/  # POST /api/ai/companion/confirm-action
│   ├── lib/
│   │   ├── supabase/                # Clientes Supabase (client, server, admin, middleware)
│   │   ├── auth/                    # Guards, verificação de sessão e RBAC
│   │   ├── audit/                   # Logger de auditoria imutável
│   │   ├── nutrition/               # Motor determinístico de BMR, TDEE e macros (Etapa 4)
│   │   ├── foods/                   # TACO dataset, compatibilidade de alergias, pipeline (Etapa 5)
│   │   ├── diet-composer/           # Solver determinístico de dietas e cardápios (Etapa 6)
│   │   ├── workout-engine/          # Solver determinístico biomecânico de treinos (Etapa 7)
│   │   └── ai-companion/            # Orquestrador, Safety, ContextBuilder, Tools, RateLimiter (Etapa 8)
│   └── types/                       # Contratos TypeScript e Schemas Zod de todo o domínio
├── tests/                           # 44 suítes de teste Vitest
├── scripts/                         # Extrator TACO oficial (parse_taco_excel.py)
├── package.json
└── tsconfig.json
```

---

## 3. MODELO DE DADOS, ENTIDADES E MULTI-TENANCY

### 3.1. Arquitetura de Tenant e Identidade
O sistema adota o padrão de **Table Inheritance / Shared Primary Key (1:1)** para a identidade:
```text
auth.users (id UUID PRIMARY KEY)
    ↑
public.profiles (id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE)
    ↑
public.patients (id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE)
```
- A chave primária `id` em `profiles` e `patients` é **rigorosamente a mesma** que `auth.users.id`.
- Isso elimina o risco de forjar IDs distintos em payloads.
- O isolamento é comprovado e testado em banco real via função `private.is_patient_owner(patient_id, auth.uid())`.

### 3.2. Catálogo das 26 Tabelas Principais
1. **Governança & RBAC**: `roles`, `permissions`, `role_permissions`, `profiles`, `user_permissions`, `invites`, `audit_logs`.
2. **Organizações & Vínculos**: `organizations`, `organization_members`, `professional_profiles`, `patients`, `professional_patient_links`.
3. **Nutrição & Alimentos**: `patient_nutrition_profiles`, `nutrition_targets`, `food_sources`, `food_items`, `food_composition_snapshots`, `food_household_measures`, `food_price_observations`.
4. **Composição de Dieta**: `diet_plans`, `diet_plan_days`, `diet_meals`, `diet_meal_items`.
5. **Treinamento Biomecânico**: `exercise_catalog`, `workout_programs`, `workout_program_days`, `workout_sessions`, `workout_exercises`, `workout_exercise_sets`, `workout_execution_logs`, `workout_progression_events`, `workout_reviews`.
6. **AI Companion**: `ai_conversations`, `ai_messages`, `ai_feedback_events`, `ai_tool_executions`, `ai_rate_limits`.

---

## 4. SEGURANÇA MULTI-TENANT, RLS E DEFENSE IN DEPTH

### 4.1. Funções em Schema Privado (`private.*`)
Todas as funções críticas de resolução de autorização residem no schema isolado `private`, com `SET search_path = ''` para eliminar completamente vulnerabilidades de *Search Path Hijacking* (CWE-426):
- `private.is_patient_owner(p_patient_id UUID, p_user_id UUID)`: Valida se o usuário autenticado é o titular do paciente.
- `private.can_access_patient(p_prof_id UUID, p_patient_id UUID)`: Valida se há vínculo ativo em `professional_patient_links`.
- `private.is_admin(p_user_id UUID)`: Valida se o usuário tem a role `admin`.
- `private.is_professional(p_user_id UUID)`: Valida se é `nutritionist` ou `influencer`.
- `private.can_manage_workout_program(p_user_id UUID, p_program_id UUID)`: Impede nutricionistas e influenciadores de aprovarem programas de treino com status `review_required`.
- Permissões revogadas: `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;`
- Concedido apenas `EXECUTE` estritamente necessário aos roles `authenticated` e `service_role`.

### 4.2. RPCs Atômicos com Fechamento de Segurança
- `public.persist_diet_plan_atomic` (Migration 15):
  - `REVOKE ALL FROM PUBLIC, anon, authenticated; GRANT EXECUTE TO service_role;`
  - Utiliza `pg_advisory_xact_lock` para serialização de concorrência.
  - Valida se o paciente existe e se o perfil nutricional pertence a ele.
  - Bloqueia planos em `infeasible` de serem marcados como ativos.
- `public.persist_workout_program_atomic` (Migration 16):
  - `REVOKE ALL FROM PUBLIC, anon, authenticated; GRANT EXECUTE TO service_role;`
  - Serialização via `pg_advisory_xact_lock(hashtext('workout_program_patient_' || v_patient_id))`.
  - Impede ativação direta de programas em `review_required` ou `infeasible`.
  - Congela snapshots completos de cada exercício (`exercise_snapshot_hash`).

### 4.3. Triggers de Imutabilidade
- `audit_logs`: Trigger statement-level `trg_prevent_audit_tampering` bloqueia UPDATE e DELETE para qualquer usuário da aplicação.
- `workout_execution_logs`: Trigger row-level `trg_workout_execution_log_immutability` bloqueia alteração de `id`, `patient_id`, `workout_exercise_id`, `created_at` e deleção. A janela de correção permitida é de **1 hora a partir do `created_at` gerado pelo PostgreSQL**.
- `ai_messages`: Trigger row-level `trg_ai_message_immutability` impede UPDATE e DELETE, garantindo conformidade append-only.

### 4.4. Proteção da Chave `SUPABASE_SERVICE_ROLE_KEY`
Isolada em `src/lib/supabase/admin.ts`. Possui trava de execução:
```typescript
if (typeof window !== 'undefined') {
  throw new Error('Security Violation: createAdminClient invoked in browser environment.');
}
```

---

## 5. HISTÓRICO DAS ETAPAS 1 A 7 (ENTREGAS E GATES)

### ETAPA 1 — Fundação, Domínio e Multi-Tenant
- **Objetivo**: Estrutura base de dados, RBAC canônico, 11 tabelas fundamentais, isolamento RLS e auditoria append-only.
- **Migrations**: `20260907000001_initial_schema.sql` a `20260907000005_seed_initial_data.sql`.
- **Arquivos-chave**: `src/lib/auth/roles.ts`, `src/lib/auth/guards.ts`, `src/lib/audit/logger.ts`.
- **Testes**: `tests/rbac.test.ts`, `tests/validation.test.ts`, `tests/security_gate.test.ts` (36 testes).
- **Gate Final**: `SECURITY GATE: PASS`

### ETAPA 2 — Convites, Onboarding e Vínculos de Pacientes
- **Objetivo**: Sistema de convites tokenizados para profissionais, cadastro seguro, prevenção de autoelevação e matrícula atômica.
- **Migrations**: `20260907000006_invites_and_onboarding.sql` a `20260907000008_private_grants_and_email_verification.sql`.
- **Arquivos-chave**: `src/app/(auth)/actions.ts`, `src/lib/validations/auth.ts`.
- **Testes**: `tests/invites.test.ts`, `tests/security_gate_etapa2.test.ts` (51 testes).
- **Gate Final**: `ONBOARDING GATE: PASS`

### ETAPA 3 — Perfil Nutricional Abrangente do Paciente
- **Objetivo**: Coleta e persistência estruturada de dados antropométricos, histórico clínico, alergias, restrições culturais e hábitos.
- **Migrations**: `20260907000009_patient_nutrition_profile.sql`.
- **Arquivos-chave**: `src/types/nutrition-engine.ts`, `src/app/(protected)/patient/nutrition-profile/page.tsx`.
- **Testes**: `tests/nutrition_profile.test.ts` (18 testes).
- **Gate Final**: `NUTRITION PROFILE GATE: PASS`

### ETAPA 4 — Motor Determinístico de Nutrição (BMR, TDEE, Macros)
- **Objetivo**: Motor matemático de cálculo metabólico versionado (`1.0.0`), sem IA, com segregação de revisão clínica e guardrails de segurança.
- **Migrations**: `20260908000010_deterministic_nutrition_engine.sql`, `20260908000011_segregate_clinical_review_and_guardrails.sql`.
- **Arquivos-chave**: `src/lib/nutrition/engine.ts`, `src/lib/nutrition/formulas.ts`, `src/lib/nutrition/guardrails.ts`.
- **Testes**: `tests/nutrition_engine_math.test.ts`, `tests/nutrition_engine_safety.test.ts`, `tests/nutrition_engine_security.test.ts`, `tests/nutrition_engine_grid.test.ts` (51 testes, incluindo grid de 16.200 casos).
- **Gate Final**: `NUTRITION ENGINE GATE: PASS`

### ETAPA 5 — Base Estruturada de Alimentos (TACO), Nutrientes e Preços
- **Objetivo**: Ingestão canônica oficial da tabela TACO (597 alimentos, 15.522 dados analíticos), normalização de medidas caseiras, observações de preços em BRL e motor de compatibilidade de alergias.
- **Migrations**: `20260908000012_food_database_and_pricing.sql` a `20260908000014_cross_tenant_and_governance_hardening.sql`.
- **Arquivos-chave**: `scripts/parse_taco_excel.py`, `src/lib/foods/compatibility.ts`, `src/lib/foods/importer/import-pipeline.ts`.
- **Testes**: `tests/food_import.test.ts`, `tests/food_nutrition.test.ts`, `tests/food_pricing.test.ts`, `tests/food_money_precision.test.ts`, `tests/food_differential_parser.test.ts`, `tests/food_complete_dataset.test.ts`, `tests/food_security.test.ts` (100 testes).
- **Gate Final**: `FOOD DATA GATE: PASS FINAL`

### ETAPA 6 — Motor Determinístico de Dieta (Diet Composer)
- **Objetivo**: Solver determinístico de cardápios semanais (7 dias, 28 refeições), balanceamento de macros, tolerância a custos, penalidade de variedade e troca inteligente determinística.
- **Migrations**: `20260908000015_deterministic_diet_plans.sql`.
- **Arquivos-chave**: `src/lib/diet-composer/solver.ts`, `src/lib/diet-composer/substitution.ts`, `src/lib/diet-composer/hash.ts`, `src/lib/diet-composer/engine.ts`.
- **Testes**: 10 arquivos dedicados de testes (`tests/diet_composer_*.test.ts`, totalizando 47 testes).
- **Gate Final**: `DIET COMPOSER GATE: PASS`

### ETAPA 7 — Motor Determinístico de Treino (Workout Engine)
- **Objetivo**: Solver biomecânico determinístico, catálogo de exercícios com checksum SHA-256 (`bf10a258...`), Double Progression com incrementos reais por equipamento (kg/lb), logs de execução com janela de 1h em `created_at` e RPC atômico seguro.
- **Migrations**: `20260909000016_deterministic_workout_engine.sql`.
- **Arquivos-chave**: `src/lib/workout-engine/catalog.ts`, `src/lib/workout-engine/candidate-filter.ts`, `src/lib/workout-engine/solver.ts`, `src/lib/workout-engine/progression.ts`, `src/lib/workout-engine/substitution.ts`, `src/lib/workout-engine/hash.ts`.
- **Testes**: 9 arquivos dedicados (`tests/workout_engine_*.test.ts`, totalizando 62 testes).
- **Gate Final**: `WORKOUT COMPOSER GATE: PASS`

---

## 6. MOTORES DETERMINÍSTICOS EM DETALHES TÉCNICOS

### 6.1. Motor Nutricional (`src/lib/nutrition/`)
- **Fórmulas**: Mifflin-St Jeor (padrão), Katch-McArdle (quando % de gordura informada), Harris-Benedict revisada.
- **Unidades & Arredondamentos**: Calorias arredondadas para inteiros mais próximos (`Math.round`). Gramas de macronutrientes arredondadas com 1 casa decimal.
- **Princípio UNKNOWN != SAFE**: Alergias marcadas como `unknown` são tratadas preventivamente como positivas para exclusão.
- **Guardrails de Segurança**: Piso de 1.200 kcal para mulheres e 1.500 kcal para homens. Tetos de segurança aplicados com reason codes estruturados.

### 6.2. Motor de Composição de Dieta (`src/lib/diet-composer/`)
- **Solver**: Resolução por blocos funcionais (`protein`, `carb`, `vegetable`, `fruit`, `lipid`, `legume`). Ajuste numérico determinístico das porções para convergência dentro da tolerância (padrão $\pm 5\%$).
- **Troca Inteligente (`substitution.ts`)**: Procura alternativas no catálogo com o mesmo papel biológico (`role`), recalcula as gramas necessárias para igualar a proteína/calorias do item substituído e descarta alimentos incompatíveis com as alergias do paciente.
- **Hash de Proveniência**: Calculado sobre a estrutura canônica dos dias, refeições e gramas, com timestamp de referência congelado (`generation_reference_at`).

### 6.3. Motor de Treinamento (`src/lib/workout-engine/`)
- **Catálogo Biomecânico Canônico (`catalog.ts`)**: 40+ exercícios curados. Checksum SHA-256 canônico gerado via `computeCatalogChecksum` ordenando registros por `id` e chaves alfabeticamente:
  `bf10a258c98430fd146f6397f76a57e938628587942e618400421158d221fa2b`
- **Double Progression (`progression.ts`)**: O praticante progride primeiro em repetições até o topo da faixa (ex: 8-12 reps). Ao atingir o teto em todas as séries, a carga é incrementada com base no equipamento configurado (`equipment_increment_value` e `equipment_increment_unit`). Se desconhecido, emite `unquantified_load_increase` com incremento nulo, sem inventar números.
- **Ordenação Contínua (`solver.ts`)**: Heurística multivariada `calculateExerciseOrderScore` priorizando exercícios compostos antes de isoladores, cadeias cinéticas mais complexas primeiro e músculos maiores no início da sessão.

---

## 7. ETAPA 8 — AI COMPANION (IMPLEMENTAÇÃO E AUDITORIA)

### 7.1. Escopo e Princípios
O AI Companion foi planejado e entregue seguindo o princípio de **Zero Trust**:
- O modelo não tem credenciais de banco de dados.
- O modelo não define `patient_id` nem escolhe `tenant`.
- O modelo atua como orientador e explicador, nunca autoridade clínica.
- Princípio médico inviolável: **`SYMPTOM != DIAGNOSIS`**. Sintomas clínicos são orientados para encaminhamento profissional.

### 7.2. Arquitetura de Componentes
1. **Safety Classifier Pré-LLM (`src/lib/ai-companion/safety.ts`)**:
   - Analisa a mensagem do usuário antes de qualquer chamada ao LLM.
   - Detecta emergências médicas (dor torácica, falta de ar, desmaio), ideação autolesiva, consultas sobre medicamentos e transtornos alimentares.
   - Realiza short-circuit seguro imediato.
2. **Context Builder Mínimo (`src/lib/ai-companion/context-builder.ts`)**:
   - Monta context packs mínimos e higienizados (`profile`, `diet`, `workout`, `progress`, `conversation`).
   - Bloqueia tokens, secrets, senhas e dados de outros pacientes.
3. **Provider Abstraction (`src/lib/ai-companion/provider.ts`)**:
   - Interface `AIProvider`. Implementações: `MockAIProvider` (para testes determinísticos offline) e `GeminiAIProvider` (para integração via Google Generative Language REST API server-side).
4. **Tool Registry & Two-Phase Write (`src/lib/ai-companion/tools.ts`)**:
   - 10 ferramentas com schemas Zod rígidos:
     - Leitura: `getActiveDietPlan`, `getTodayMeals`, `getActiveWorkoutProgram`, `getTodayWorkout`, `getProgressSummary`, `getFoodSubstitutionOptions`, `getExerciseSubstitutionOptions`.
     - Feedback: `recordUserFeedback`.
     - Escrita (Two-Phase): `proposeFoodSubstitution` (gera token de uso único com TTL de 15 minutos) e `applyAuthorizedFoodSubstitution` (efetiva após confirmação explícita do usuário).
5. **Rate Limiting & Anti-Loop (`src/lib/ai-companion/rate-limiter.ts`)**:
   - Limite de 20 mensagens por janela de 10 minutos. Limite de tamanho de entrada de 1.000 caracteres. Detecção e corte de loops de chamadas repetitivas de ferramentas (`MAX_TOOL_IDENTICAL_REPETITIONS = 2`).
6. **Interface do Usuário (`src/app/(protected)/patient/assistant/page.tsx`)**:
   - Interface com design escuro moderno, balões de chat humanizados, cards de confirmação interativos, status de loading e tratamento amigável de erros.

### 7.3. Suíte de Testes da Etapa 8 (37 Testes / 8 Arquivos)
- `tests/ai_companion_safety.test.ts` (5 testes)
- `tests/ai_companion_context.test.ts` (4 testes)
- `tests/ai_companion_confirmation.test.ts` (5 testes)
- `tests/ai_companion_tools.test.ts` (6 testes)
- `tests/ai_companion_prompt_injection.test.ts` (4 testes)
- `tests/ai_companion_failure_modes.test.ts` (4 testes)
- `tests/ai_companion_security_rls.test.ts` (8 testes com PGlite)
- `tests/migrations.test.ts` (1 teste adicional para Migration 17)

---

## 8. ROADMAP DAS ETAPAS 9 A 12

Com base nas referências documentadas e nos prompts do projeto:
- **ETAPA 9 — Motor de Feedback, Aderência e Ajuste Contínuo de Planos**:
  - *Mencionado no prompt da Etapa 8*: os eventos de `ai_feedback_events` registrados pelo Companion serão a base de entrada da Etapa 9 para ajuste assistido ou recomendações aos profissionais.
- **ETAPA 10**: `[NÃO LOCALIZADO NO REPOSITÓRIO — A DEFINIR COM O RESPONSÁVEL DE PRODUTO]`
- **ETAPA 11**: `[NÃO LOCALIZADO NO REPOSITÓRIO — A DEFINIR COM O RESPONSÁVEL DE PRODUTO]`
- **ETAPA 12 — Design Final de Interface, Polimento de UX e Acabamento Visual**:
  - *Mencionado no prompt da Etapa 8*: o design final e completo das interfaces fica reservado para a Etapa 12.

---

## 9. CONVENÇÕES DE DESENVOLVIMENTO E POLÍTICA DE GATES

### 9.1. Comandos Obrigatórios de Qualidade
Para qualquer alteração ou novo gate, todos os 4 comandos a seguir devem retornar **código de saída 0**:
1. `npm test`: Executa os 423 testes via Vitest.
2. `npx tsc --noEmit`: Compilação TypeScript sem emissão (0 erros tolerados).
3. `npm run lint`: ESLint com regras do Next.js e React 19 (0 erros tolerados).
4. `npm run build`: Build de produção Turbopack otimizado.

### 9.2. Política de Migrações SQL
- Cada migração deve ser estritamente sequencial, com prefixo de timestamp UTC (ex: `20260909000018_nome.sql`).
- Funções auxiliares sensíveis sempre no schema `private.*` com `SET search_path = ''`.
- RLS obrigatório em 100% das novas tabelas.
- Toda nova migração deve ser adicionada à lista esperada em `tests/migrations.test.ts`.

---

## 10. DIRETRIZES ESTATUTÁRIAS PARA O CODEX

### 10.1. O que o Codex DEVE PRESERVAR OBRIGATORIAMENTE
1. **O Baseline de 423 Testes**: Nenhum teste existente pode ser deletado ou relaxado para contornar falhas.
2. **Determinismo dos Motores**: Jamais permitir que um LLM calcule macros, calorias, cargas ou substituições sem invocar os motores determinísticos.
3. **Segregação de Papéis e CRN/CREF**: Nutricionistas e influenciadores não prescrevem treinos; influenciadores não prescrevem dietas.
4. **Isolamento de Tenant e RLS**: Toda query deve respeitar a sessão autenticada. Nunca confiar em `patient_id` vindo do payload do cliente.
5. **Imutabilidade de Histórico**: Logs de auditoria, histórico de mensagens e logs de execução (após 1 hora) não podem sofrer UPDATE ou DELETE.

### 10.2. O que o Codex PODE MODIFICAR
- Adicionar novas migrações sequenciais (a partir da Migration 18).
- Implementar novas páginas de interface ou endpoints auxiliares para as Etapas 9 a 12.
- Adicionar novos provedores na abstração `AIProvider` (ex: OpenAI, Anthropic, Ollama).
- Expandir testes automatizados mantendo os anteriores verdes.

### 10.3. O que Exige DECISÃO EXPLÍCITA do Responsável pelo Produto
- Modificação dos limites de tolerância de macronutrientes ($\pm 5\%$).
- Alteração das fórmulas de BMR/TDEE ou dos guardrails mínimos (1.200/1.500 kcal).
- Alteração do catálogo de exercícios curados ou recalculo do checksum do catálogo.
- Mudança na regra de 1 hora de correção de logs de treino.

---

## 11. LIMITAÇÕES CONHECIDAS E CHECKLIST DE ENTRADA DO CODEX

### 11.1. Limitações e Débitos Técnicos Documentados
1. **Git Repository Não Inicializado**: A pasta de trabalho no OneDrive não possui um repositório `.git` local ativo. O Codex deve verificar ou inicializar o repositório git se desejado.
2. **PostgreSQL Real com PostgREST vs PGlite**:
   - Os testes rodam sobre PGlite (PostgreSQL em WebAssembly/in-memory), onde claims de JWT são simuladas via `set_config`.
   - Resta validar em ambiente de homologação/staging no Supabase Cloud a interação com os tokens JWT reais emitidos pelo GoTrue e endpoints do PostgREST.
3. **Timestamps `timezone('utc', now())`**:
   - Nas migrations, usa-se `pg_catalog.timezone('utc', pg_catalog.now())` atribuído a colunas `TIMESTAMPTZ`. Em PostgreSQL, `timezone('utc', now())` retorna `timestamp without time zone` (horário de parede UTC), que é convertido implicitamente para `timestamptz` usando o fuso horário da sessão. Em produção, garanta que a sessão do Supabase opere em UTC (`SET timezone = 'UTC'`).

### 11.2. Checklist de Entrada para o Codex
- [ ] Clonar/abrir o workspace e verificar a presença de `package.json` e `supabase/migrations/`.
- [ ] Executar `npm install` para restaurar `node_modules`.
- [ ] Criar `.env.local` a partir do `.env.example` sanitizado fornecido.
- [ ] Rodar `npm test` e confirmar os **423 testes verdes em 44 arquivos**.
- [ ] Rodar `npx tsc --noEmit` e confirmar 0 erros.
- [ ] Rodar `npm run lint` e confirmar 0 erros.
- [ ] Rodar `npm run build` e confirmar compilação Turbopack com código de saída 0.
- [ ] Ler este `APPNUTRI_HANDOFF.md` e `INVENTARIO_TECNICO.md` antes de escrever qualquer código para a Etapa 9.
