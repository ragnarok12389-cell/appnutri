# RELATÓRIO OFICIAL DE FECHAMENTO CIRÚRGICO FINAL — ETAPA 7
## MOTOR DETERMINÍSTICO DE TREINO, BIOMECÂNICA E PROGRESSÃO (AppNutri)

> **Documento Original**: Preservado a partir de `REVISAO_ETAPA_7_COMPLETA.md` e complementado com auditoria técnica pós-fechamento  
> **Data Original do Fechamento**: 09 de Setembro de 2026  
> **Status Oficial da Etapa 7**: 🟢 **WORKOUT COMPOSER GATE: PASS**  
> **Versão do Motor de Treino**: `WORKOUT_ENGINE_VERSION = '1.0.0'`  
> **Versão da Configuração**: `WORKOUT_CONFIG_VERSION = 'config-1.0.0'`  
> **Versão do Catálogo**: `EXERCISE_CATALOG_VERSION = '1.0.0'`  
> **Versão do Schema do Catálogo**: `EXERCISE_CATALOG_SCHEMA_VERSION = '1.0.0'`  
> **Total de Testes do Fechamento da Etapa 7**: **386 testes passando em 37 arquivos (100% verde)**  
> **Reconciliação Auditada**: 324 testes herdados (Etapas 1–6) + 62 testes adicionados na Etapa 7 = 386 testes  
> **Exit Code de Todos os Comandos no Fechamento**: `0`

---

### 1. RECONCILIAÇÃO REAL E DEFINITIVA DE BASELINE E TESTES (HISTÓRICO DA ETAPA 7)

A contagem foi formalmente auditada e confirmada via execução real de `npm test` (`vitest run`) no momento de fechamento da Etapa 7:

| Métrica | Valor Real | Detalhamento |
|---|---|---|
| **Número real final de testes na Etapa 7** | **386** | 324 do baseline confirmado da Etapa 6 + 62 da Etapa 7 |
| **Número real de arquivos de teste** | **37** | 28 arquivos herdados + 9 arquivos dedicados da Etapa 7 |
| **Testes pertencentes à Etapa 7** | **62** | 61 testes nos 9 arquivos de treino + 1 teste na Migration 16 em `migrations.test.ts` |
| **Exit Code no Fechamento da Etapa 7** | **0** | Sucesso absoluto em 100% dos testes executados |

#### Distribuição dos 62 Testes da Etapa 7:
1. `tests/workout_engine_security_rls.test.ts`: **26 testes** (PGlite: RLS de logs, comprovação de FK Auth/Profile/Patient, blindagem de `created_at`, trigger de imutabilidade, segregação CREF, integridade do RPC atômico)
2. `tests/workout_engine_determinism.test.ts`: **9 testes** (reprodutibilidade em 100 iterações, 4 testes de auditoria criptográfica do catálogo canônico SHA-256 e congelamento de snapshots)
3. `tests/workout_engine_constraints.test.ts`: **6 testes** (hard constraints, SYMPTOM != AUTOMATIC DIAGNOSIS, UNKNOWN != SAFE)
4. `tests/workout_engine_infeasible.test.ts`: **5 testes** (inviabilidade estruturada e reason codes para perfil incompleto)
5. `tests/workout_engine_math.test.ts`: **5 testes** (volume, séries, faixas de repetições e scoring contínuo de ordem)
6. `tests/workout_engine_progression.test.ts`: **5 testes** (Double Progression com incrementos de equipamento kg/lb e caso desconhecido)
7. `tests/workout_engine_substitution.test.ts`: **3 testes** (troca inteligente determinística respeitando padrão biomecânico)
8. `tests/workout_engine_grid.test.ts`: **1 teste** (grade combinatória de 75 cenários preservando invariantes)
9. `tests/workout_engine_performance.test.ts`: **1 teste** (benchmark de 6 dias em ~6.6ms; meta: < 200ms)
10. `tests/migrations.test.ts`: **1 teste adicional** (validação sintática e de integridade da Migration 16)

---

### 2. AUDITORIA DOS TRÊS PONTOS OBRIGATÓRIOS DO FECHAMENTO CIRÚRGICO

#### PONTO 1: Checksum SHA-256 Real e Determinístico do Catálogo de Exercícios
- **Substituição Definitiva do Placeholder**: O valor estático `'checksum-1.0.0'` foi completamente removido do motor, dos testes e do schema.
- **Implementação Criptográfica Canônica**: Implementada a função `computeCatalogChecksum(catalog: Exercise[] = CURATED_EXERCISE_CATALOG): string` em `src/lib/workout-engine/catalog.ts`.
- **Serialização Estrita e Determinística**:
  - Os exercícios são previamente ordenados de forma determinística por `id` (`sortedExercises = [...catalog].sort((a, b) => a.id.localeCompare(b.id))`).
  - Para cada exercício, os campos semanticamente relevantes são extraídos e suas listas internas ordenadas lexicograficamente:
    - `id` (código/id canônico)
    - `code`
    - `name`
    - `aliases` (ordenados)
    - `movement_pattern`
    - `primary_muscle_groups` (ordenados)
    - `secondary_muscle_groups` (ordenados)
    - `required_equipment` (ordenados)
    - `complexity_level`
    - `is_unilateral`
    - `is_compound`
    - `safety_contraindications` (ordenadas)
    - `schema_version`
    - `source_version`
  - A serialização JSON é normalizada recursivamente via `canonicalJsonStringifyCatalog` (chaves dos objetos ordenadas alfabeticamente).
- **SHA-256 Efetivo Utilizado**:
  ```text
  bf10a258c98430fd146f6397f76a57e938628587942e618400421158d221fa2b
  ```
  *(Exatamente 64 caracteres hexadecimais minúsculos, calculado sobre o catálogo curado oficial).*
- **Propagação Integral**:
  - `EXERCISE_CATALOG_CHECKSUM` é avaliado dinamicamente na inicialização do módulo.
  - O motor de treino injeta este hash em `workout_programs.catalog_checksum`.
  - A função `computeWorkoutInputHash` e os snapshots históricos dos exercícios preservam e auditam este valor real.
- **Testes de Mutação do Catálogo** (`tests/workout_engine_determinism.test.ts`):
  1. *Formato Criptográfico*: Comprova correspondência estrita com regex `/^[a-f0-9]{64}$/` e extensão de 64 caracteres.
  2. *Determinismo Absoluto*: Mesmo catálogo (cópia estrutural profunda) produz exatamente o mesmo checksum SHA-256.
  3. *Invariância de Ordem da Lista*: Catálogo com ordem invertida ou embaralhada aleatoriamente gera o mesmo checksum, comprovando a ordenação canônica interna por `id`.
  4. *Detecção de Mutação Semântica*: Qualquer alteração semântica (adição de grupo muscular primário, alteração de nome ou modificação de contraindicação de segurança) produz checksum diferente com 100% de precisão.

---

#### PONTO 2: Blindagem da Janela de Correção de `workout_execution_logs`
- **Auditoria de Controle Temporal**:
  - O campo `logged_at` representa o momento fático em que o exercício foi executado pelo praticante, podendo ser informado pelo cliente.
  - Contudo, **a autorização de correção (UPDATE) NÃO depende de `logged_at`**.
  - A janela de correção depende **exclusiva e imutavelmente do timestamp `created_at` gerado pelo PostgreSQL** no servidor:
    ```sql
    now() <= created_at + INTERVAL '1 hour'
    ```
- **Trigger de Imutabilidade e Integridade** (`trg_workout_execution_log_immutability`):
  Criada a função `private.check_workout_execution_log_immutability()` aplicada em `BEFORE INSERT OR UPDATE OR DELETE`:
  - **No INSERT**: Força `NEW.created_at := pg_catalog.timezone('utc', pg_catalog.now())` e `NEW.updated_at := pg_catalog.timezone('utc', pg_catalog.now())`, ignorando qualquer timestamp arbitrário fornecido no payload.
  - **No UPDATE**: Bloqueia categoricamente qualquer tentativa de alteração de campos de identidade e ownership:
    ```sql
    IF NEW.id <> OLD.id THEN RAISE EXCEPTION 'Cannot modify identity primary key id of workout_execution_logs.'; END IF;
    IF NEW.patient_id <> OLD.patient_id THEN RAISE EXCEPTION 'Cannot modify patient_id of workout_execution_logs.'; END IF;
    IF NEW.workout_exercise_id <> OLD.workout_exercise_id THEN RAISE EXCEPTION 'Cannot modify workout_exercise_id of workout_execution_logs.'; END IF;
    IF NEW.created_at <> OLD.created_at THEN RAISE EXCEPTION 'Cannot modify created_at timestamp of workout_execution_logs.'; END IF;
    ```
  - **No DELETE**: Dispara exceção direta impedindo apagamento de registros históricos por usuários autenticados.
- **Política RLS de UPDATE Blindada**:
  ```sql
  CREATE POLICY "Patients update own workout logs within correction window"
      ON public.workout_execution_logs FOR UPDATE
      TO authenticated
      USING (
          private.is_patient_owner(patient_id, auth.uid())
          AND pg_catalog.timezone('utc', pg_catalog.now()) <= created_at + INTERVAL '1 hour'
      )
      WITH CHECK (
          private.is_patient_owner(patient_id, auth.uid())
          AND pg_catalog.timezone('utc', pg_catalog.now()) <= created_at + INTERVAL '1 hour'
      );
  ```
- **Testes Automatizados Comprovando a Blindagem** (`tests/workout_engine_security_rls.test.ts`):
  - *Tentativa de Fraude Temporal (`logged_at` no futuro)*: Inserção de `logged_at` 10 dias no futuro com `created_at` expirado (> 1 hora) resulta em **0 linhas atualizadas** no UPDATE. O timestamp futuro NÃO estende a permissão.
  - *Edição Legítima*: Alterações em campos permitidos (`reps_completed`, `notes`) funcionam perfeitamente dentro da janela de 1 hora de `created_at`.
  - *Tentativa de Mover Log entre Pacientes*: UPDATE de `patient_id` é abortado com exceção pelo trigger.
  - *Tentativa de Mover Log entre Exercícios/Programas*: UPDATE de `workout_exercise_id` é abortado com exceção pelo trigger.
  - *Tentativa de Alterar `created_at` ou `id`*: Abortado com exceção imediata pelo trigger.
  - *Tentativa de DELETE Direto*: RLS bloqueia e assegura persistência de 100% dos dados.

---

#### PONTO 3: Comprovação Estrutural de Ownership Patient / Auth
- **Arquitetura de Banco de Dados Documentada**:
  O schema do AppNutri utiliza **Table Inheritance / Shared Primary Key (1:1)** entre Auth e Domínio:
  ```text
  auth.users (id UUID PRIMARY KEY)
      ↑
  public.profiles (id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE)
      ↑
  public.patients (id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE)
  ```
- **Função Privada de Resolução de Titularidade**:
  Para não assumir igualdade de UUIDs sem garantia estrutural em runtime, foi formalizada a função de segurança:
  ```sql
  CREATE OR REPLACE FUNCTION private.is_patient_owner(p_patient_id UUID, p_user_id UUID)
  RETURNS BOOLEAN
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
  AS $$
      SELECT EXISTS (
          SELECT 1 
          FROM public.patients pat
          JOIN public.profiles pr ON pr.id = pat.id
          WHERE pat.id = p_patient_id 
            AND pr.id = p_user_id
      );
  $$;
  ```
- **Aplicação Rigorosa nas Políticas RLS**:
  As políticas de `workout_programs`, `workout_execution_logs` e `workout_progression_events` utilizam formalmente `private.is_patient_owner(patient_id, auth.uid())`.
- **Testes Estruturais Automatizados** (`tests/workout_engine_security_rls.test.ts`):
  - Consulta ativa ao `information_schema.table_constraints` confirmando as duas Foreign Keys estruturais (`patients.id -> profiles.id` e `profiles.id -> users.id`).
  - Verificação de que `private.is_patient_owner` retorna `true` para o próprio paciente e `false` para usuários cruzados (outro paciente, administrador ou UUID inexistente).

---

### 3. RESULTADOS DOS QUATRO COMANDOS NO FECHAMENTO HISTÓRICO DA ETAPA 7

Execução real realizada em 09/09/2026:

| Verificação | Comando | Resultado Histórico da Etapa 7 | Exit Code | Status |
|---|---|---|---|---|
| **Suíte de Testes** | `npm test` | **386 passed across 37 test files** | `0` | 🟢 PASS |
| **Tipagem Estrita** | `npx tsc --noEmit` | **0 erros** | `0` | 🟢 PASS |
| **Linter** | `npm run lint` | **0 erros, 0 warnings** | `0` | 🟢 PASS |
| **Build de Produção** | `npm run build` | **Turbopack compilou 20 rotas com sucesso** | `0` | 🟢 PASS |

---

### 4. PENDÊNCIAS TÉCNICAS E RESSALVAS PARA O SUPABASE CLOUD (HOMOLOGAÇÃO)

1. **Nuance do Timestamp `timezone('utc', now())` em Colunas `TIMESTAMPTZ`**:
   - No PostgreSQL, `now()` retorna `TIMESTAMPTZ`. A chamada `timezone('utc', now())` converte o valor para `TIMESTAMP WITHOUT TIME ZONE` (horário de parede UTC).
   - Quando inserido em uma coluna declarada como `TIMESTAMPTZ`, o PostgreSQL implicitamente assume que o valor está no fuso horário da sessão (`TimeZone` setting) e o converte novamente.
   - Nos testes locais (PGlite), a sessão roda em UTC, gerando valores idênticos.
   - **Recomendação para Produção / Supabase Cloud**: Assegurar que a conexão do pooler (PgBouncer/Supavisor) e as sessões de banco operem com `SET timezone = 'UTC'`. Alternativamente, migrações futuras podem padronizar para `pg_catalog.now()` direto nas colunas `TIMESTAMPTZ`.
2. **Validações Pendentes no Supabase Real (Auth / JWT / PostgREST)**:
   - Os testes de RLS executados na Etapa 7 utilizam PGlite em memória com simulação de claims via `set_config('request.jwt.claim.sub', ...)` e `set_config('request.jwt.claim.role', ...)`.
   - O que resta validar no Supabase Cloud:
     - Validação real de cabeçalhos HTTP `Authorization: Bearer <jwt>` gerados pelo GoTrue.
     - Comportamento de cache de permissões do PostgREST sob alto volume de requisições concorrentes.
     - Validação de expiração de token e refresh automático via cookies pelo `@supabase/ssr` em navegadores reais.
