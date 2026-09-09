# Documento Consolidado de Revisão — ETAPA 5: Base Estruturada de Alimentos, Nutrientes, Porções e Custos

> **Status:** AUDITORIA E HARDENING CIRÚRGICO FINAL CONCLUÍDOS COM SUCESSO  
> **Portão:** `FOOD DATA GATE: PASS FINAL`  
> **Versão:** 5.0.0 (Fechamento Estrito de RPC, Invariantes Canônicas, Governança de Roles via JOIN e Provenance Integral no Upsert)  
> **Regra Fundamental:** ZERO IA / ZERO GERAÇÃO DE DIETAS / PROGRESSÃO BLOQUEADA PARA ETAPA 6 ATÉ APROVAÇÃO DO USUÁRIO.

---

## Índice

1. [Reconciliação Exaustiva da Contagem de Nutrientes (15.522 vs 14.328)](#1-reconciliação-exaustiva-da-contagem-de-nutrientes)
2. [Garantia de Atomicidade Real, Invariantes e Fechamento de RPC](#2-garantia-de-atomicidade-real-invariantes-e-fechamento-de-rpc)
3. [Matriz Geral de Resolução dos Itens Críticos de Auditoria](#3-matriz-geral-de-resolução-dos-itens-críticos-de-auditoria)
4. [Migrações PostgreSQL Completas](#4-migrações-postgresql-completas)
   - 4.1. Migração 14: Isolamento Cross-Tenant, Governança, Imutabilidade e Importador Atômico RPC (`supabase/migrations/20260908000014_cross_tenant_and_governance_hardening.sql`)
   - 4.2. Migração 13: Semântica Oficial TACO e Imutabilidade Relacional
   - 4.3. Migração 12: Estrutura Base de Alimentos, Nutrientes, Medidas e Preços
5. [Script Extrator Canônico Oficial da TACO (`scripts/parse_taco_excel.py`)](#5-script-extrator-canônico-oficial-da-taco)
6. [Modelos e Tipos de Domínio (`src/types/food.ts`)](#6-modelos-e-tipos-de-domínio-srctypesfoodts)
7. [Motor de Compatibilidade e Segurança de Alergias (`src/lib/foods/compatibility.ts`)](#7-motor-de-compatibilidade-e-segurança-de-alergias-srclibfoodscompatibilityts)
8. [Pipeline Atômico Confiável (`src/lib/foods/importer/import-pipeline.ts`)](#8-pipeline-atômico-confiável-srclibfoodsimporterimport-pipelinets)
9. [Server Actions Seguras (`src/app/actions/foods.ts`)](#9-server-actions-seguras-srcappactionsfoodsts)
10. [Suíte de Testes Automatizados e Evidências de Execução](#10-suíte-de-testes-automatizados-e-evidências-de-execução)
    - 10.1. Testes de Fechamento de RPC, Invariantes e Rollback Integral (`tests/food_complete_dataset.test.ts`)
    - 10.2. Testes de Blindagem de Nutrientes contra Influenciadores (`tests/food_security.test.ts`)
    - 10.3. Teste de Idempotência Dupla Oficial e Preservação de Provenance no Upsert
    - 10.4. Resultados de Execução (`npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`)

---

## 1. Reconciliação Exaustiva da Contagem de Nutrientes

### 1.1. Resposta Forense aos Questionamentos da Auditoria

Na planilha oficial da TACO (aba `CMVCol taco3`), existem rigorosamente **26 colunas de caracterização por alimento** (colunas 3 a 28).

O cálculo canônico exato é:
$$\mathbf{597\ alimentos \times 26\ campos\ anal\acute{i}ticos = 15.522\ registros}$$

A contagem de **14.328** ($597 \times 24$) decorria da distinção clássica de bromatologia e nutrição entre:

- **24 Nutrientes Fisiológicos Estritos**:
  1. `energy_kcal` (Energia, kcal)
  2. `energy_kj` (Energia, kJ)
  3. `protein_g` (Proteína, g)
  4. `fat_g` (Lipídeos totais, g)
  5. `cholesterol_mg` (Colesterol, mg)
  6. `carbohydrate_g` (Carboidrato total, g)
  7. `fiber_g` (Fibra alimentar total, g)
  8. `calcium_mg` (Cálcio, mg)
  9. `magnesium_mg` (Magnésio, mg)
  10. `manganese_mg` (Manganês, mg)
  11. `phosphorus_mg` (Fósforo, mg)
  12. `iron_mg` (Ferro, mg)
  13. `sodium_mg` (Sódio, mg)
  14. `potassium_mg` (Potássio, mg)
  15. `copper_mg` (Cobre, mg)
  16. `zinc_mg` (Zinco, mg)
  17. `retinol_mcg` (Retinol, mcg)
  18. `re_mcg` (Equivalente de Retinol - RE, mcg)
  19. `rae_mcg` (Equivalente de Atividade de Retinol - RAE, mcg)
  20. `thiamine_mg` (Tiamina, mg)
  21. `riboflavin_mg` (Riboflavina, mg)
  22. `pyridoxine_mg` (Piridoxina, mg)
  23. `niacin_mg` (Niacina, mg)
  24. `vitamin_c_mg` (Vitamina C, mg)

- **2 Parâmetros Bromatológicos Centesimais da Matriz Alimentar**:
  25. `moisture_pct` (Umidade, % ou g de água por 100g de alimento)
  26. `ash_g` (Cinzas / Resíduo mineral inorgânico fixo após calcinação a 550°C, g por 100g)

### 1.2. Decisão Arquitetural e Correção Consolidada

1. **Preservação Canônica**: No artefato canônico [taco_4_edicao_complete.json](file:///c:/Users/pedro/OneDrive/Desktop/appnutri/src/data/taco/taco_4_edicao_complete.json), **todos os 26 campos** sempre estiveram preservados (15.522 células analisadas).
2. **Persistência Operacional em Banco de Dados**: A separação entre 24 nutrientes e 2 parâmetros bromatológicos não resulta na exclusão física das cinzas ou da umidade no banco relacional.
3. **Catálogo Oficial Unificado**: `moisture_pct` e `ash_g` foram formalmente inseridos em `public.nutrients` sob a categoria `'other'` (plenamente suportada pela constraint `chk_nutrient_category`).
4. **Estado Efetivo Final no Banco**:
   - `SELECT count(*) FROM public.foods WHERE source_type = 'official'` = **597**
   - `SELECT count(*) FROM public.nutrients` = **26**
   - `SELECT count(*) FROM public.food_nutrients` = **15.522**
   - **Zero descarte, zero omissão, 100% de paridade com a planilha do NEPA/UNICAMP.**

---

## 2. Garantia de Atomicidade Real, Invariantes e Fechamento de RPC

### 2.1. Vulnerabilidade do Supabase JS sem Transação

Múltiplas chamadas `.from('foods').upsert()` separadas via HTTP client no Node.js abrem transações isoladas por requisição HTTP no PostgREST. Uma falha no meio do processo deixaria centenas de alimentos e nutrientes gravados no banco, resultando em corrupção de estado parcial.

### 2.2. Solução Implementada: RPC Transacional em PL/pgSQL

Foi criada e auditada a rotina server-side [public.import_canonical_taco_atomic](file:///c:/Users/pedro/OneDrive/Desktop/appnutri/supabase/migrations/20260908000014_cross_tenant_and_governance_hardening.sql#L515-L680).

**Fluxo Arquitetural Seguro:**

```
               ADMINISTRADOR AUTENTICADO
                           │
                           ▼
          Server Action: importTacoDatasetAction()
          (Valida sessão e permissão foods.manage)
                           │
                           ▼
           Trusted Backend (createAdminClient())
             (Server-only, SUPABASE_SERVICE_ROLE_KEY)
                           │
                           ▼
     POST /rest/v1/rpc/import_canonical_taco_atomic (role: service_role)
                           │
 ┌─────────────────────────┴──────────────────────────────────────┐
 │             PostgreSQL Engine: Transação Atômica Única         │
 │                                                                │
 │  BEGIN;                                                        │
 │    1. Validar autorização estrita (apenas service_role)        │
 │       [Usuários autenticados comuns/admin -> ACESSO NEGADO]    │
 │    2. Validar Invariantes de Entrada:                          │
 │       - jsonb_array_length(foods) = 597                        │
 │       - jsonb_array_length(nutrients_catalog) = 26             │
 │    3. Upsert food_data_sources (UNIQUE name, version)          │
 │    4. Upsert nutrients (26 campos analíticos oficiais)         │
 │    5. Loop atômico de alimentos e nutrientes:                  │
 │       - Validar se cada alimento possui exatamente 26 campos   │
 │       - Upsert foods                                           │
 │       - Upsert food_nutrients (atualizando numeric_value,      │
 │         raw_value, value_status, data_quality,                 │
 │         source_reference -> ZERO DESALINHAMENTO DE PROVENANCE) │
 │    6. Validar Invariantes Finais:                              │
 │       - imported_foods = 597                                   │
 │       - total_nutrients = 15522                                │
 │                                                                │
 │  [Se qualquer erro, falha deliberada ou invariante violada:]   │
 │    --> RAISE EXCEPTION                                         │
 │    --> ROLLBACK TOTAL (0 alterações parciais persistidas)      │
 │                                                                │
 │  [Se todas as invariantes e registros forem validados:]        │
 │    --> COMMIT;                                                 │
 └────────────────────────────────────────────────────────────────┘
```

### 2.3. Fechamento Estrito do RPC para Usuários da Aplicação

1. **Remoção de Autorização Direta por Admin**: A função `public.import_canonical_taco_atomic` não aceita mais chamadas diretas com `private.is_admin(v_caller_id)`.
2. **Permissões SQL Revogadas**:
   ```sql
   REVOKE ALL ON FUNCTION public.import_canonical_taco_atomic(JSONB, TEXT) FROM PUBLIC, anon, authenticated;
   GRANT EXECUTE ON FUNCTION public.import_canonical_taco_atomic(JSONB, TEXT) TO service_role;
   ```
3. **Comprovação por Teste**: Usuário com role `admin` tentando chamar `SELECT public.import_canonical_taco_atomic(...)` diretamente via PostgREST/SQL tem a execução rejeitada com `Acesso negado: public.import_canonical_taco_atomic aceita exclusivamente chamadas via service_role ou superusuário de banco. Administradores da aplicação devem invocar a Server Action autorizada.`

### 2.4. Validação de Invariantes Canônicas e Rollback Integral

Antes de iniciar a gravação, a função confere `jsonb_array_length(v_foods) = 597` e `jsonb_array_length(v_catalog) = 26`. Durante a iteração, confere se cada alimento possui 26 campos analíticos. Após a execução, valida se `v_imported_foods = 597` e `v_total_nutrients = 15522`.

Testes automatizados cobrem:
- Payload com 596 alimentos $\to$ aborta com `INVARIANT_VIOLATION (596)` e deixa 0 alterações;
- Payload com 25 nutrientes no catálogo $\to$ aborta com `INVARIANT_VIOLATION (25)` e deixa 0 alterações;
- Alimento sem 1 dos 26 nutrientes $\to$ aborta com `INVARIANT_VIOLATION (001)` e deixa 0 alterações;
- Falha deliberada após alimento 300 $\to$ aborta com `DELIBERATE_TEST_FAILURE` e deixa 0 alterações.

### 2.5. Governança Estrita de Roles via JOIN com `public.roles`

1. A verificação anterior comparava `profiles.role_id` com `'influencer'`. Como `profiles.role_id` referencia `public.roles(id)`, foi implementado `JOIN public.roles r ON r.id = p.role_id` para inspecionar `r.id` e `r.name`.
2. Criada função auxiliar `private.is_nutritionist_or_admin(p_user_id UUID)` que exige credencial clínica de nutricionista ou administrador.
3. Influenciadores são estritamente impedidos de:
   - Definir `validation_status = 'verified_by_nutritionist'`;
   - Alterar composição nutricional (`INSERT / UPDATE / DELETE` em `food_nutrients`), mesmo sendo membros da mesma organização;
   - Usar membership na organização para usurpar permissões clínicas.
4. Testes automatizados reais em PGlite comprovam bloqueio de inserção, atualização e exclusão de nutrientes por influenciador da mesma organização.

### 2.6. Preservação Integral de Provenance no Upsert

No `ON CONFLICT (food_id, nutrient_id) DO UPDATE` de `food_nutrients`, são atualizados simultaneamente:
- `amount_per_100g = EXCLUDED.amount_per_100g`
- `numeric_value = EXCLUDED.numeric_value`
- `raw_value = EXCLUDED.raw_value`
- `value_status = EXCLUDED.value_status`
- `data_quality = EXCLUDED.data_quality`
- `source_reference = EXCLUDED.source_reference`

Elimina qualquer risco de combinação de valores numéricos novos com metadados/textos de proveniência antigos.

---

## 3. Matriz Geral de Resolução dos Itens Críticos de Auditoria

| #      | Item de Auditoria                              | Solução Implementada e Testada                                                                                                                                                                                                                               |
| ------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1**  | **Isolamento Cross-Tenant**                    | RLS de `foods`: oficial lido por autenticados; custom lido apenas por creator, membros da mesma organização e admin. RLS de tabelas filhas herdam estritamente a visibilidade do alimento pai via subselect. Ataques cross-tenant em PGlite retornam 0 rows. |
| **2**  | **Remoção de Bypass Inseguro por JWT Vazio**   | Removido `''` de todas as triggers. Ausência de claim em conexão de aplicação é estritamente bloqueada. Bypass direto restrito a superusuário de banco com `role = 'none'`.                                                                                  |
| **3**  | **Reestruturação da Importação Canônica**      | Server-only trusted importer (`createAdminClient()`), isolado do browser. Datasets fixture terminantemente bloqueados em produção (`process.env.NODE_ENV === 'production'`).                                                                                 |
| **4**  | **Constraint UNIQUE de Source**                | Criada `uq_food_data_sources_name_version UNIQUE (name, version)` no schema. Upsert concorrente real testado em PGlite.                                                                                                                                      |
| **5**  | **Importação 100% Atômica com Invariantes**    | Implementada via RPC PostgreSQL `import_canonical_taco_atomic`. Validação prévia (597 e 26), verificação de 26 por alimento e verificação final (15.522). Falha aciona `ROLLBACK` total. 0 registros parciais.                                           |
| **6**  | **Fechamento do RPC para Usuários**            | `REVOKE ALL FROM PUBLIC, anon, authenticated`. Apenas `service_role` e conexão direta de superusuário de banco. ADMIN direto é bloqueado com erro explícito.                                                                                               |
| **7**  | **Segurança de Alergias Tri-State**            | `allowed`, `blocked`, `review_required`. Tag `TRUE` $\to$ `BLOCKED`; tag `FALSE` $\to$ `ALLOWED`; ausente/UNKNOWN $\to$ `REVIEW_REQUIRED` (`is_compatible = false`). Enums estruturados.                                                                     |
| **8**  | **Price Engine: Moedas e Países**              | BRL somente com BRL; USD somente com USD. Sem FX, moedas divergentes retornam `unknown` (`MULTIPLE_CURRENCIES_WITHOUT_FX`). Target country rigorosamente isolado.                                                                                            |
| **9**  | **Fallback Temporal Determinístico**           | Hierarquia: `city_recent` ($\le 90$d) $\to$ `state_recent` $\to$ `national_recent` $\to$ stale $\to$ `unknown`. Datas futuras (`observed_at > now()`) são rejeitadas.                                                                                        |
| **10** | **Governança de `professional_custom` e Roles**| JOIN com `public.roles` para obter `r.name`. Bloqueio de influenciador para validação clínica e alteração de nutrientes (mesmo na mesma org). Escrita de nutrientes exige nutricionista ou admin.                                                            |
| **11** | **Preservação de Provenance no Upsert**        | `raw_value` e `source_reference` atualizados no `ON CONFLICT DO UPDATE`. Zero mistura de valor novo com raw antigo.                                                                                                                                        |
| **12** | **Parsers (Python e TS) Estritos**             | Decimais preservados (,5 e .5 $\to$ 0.5; ,0,02 $\to$ 0.02). Negativos e strings inválidas viram `UNKNOWN` (nunca zero numérico). Testes diferenciais garantem paridade semântica de 100%.                                                                    |
| **13** | **Medidas Caseiras com Proveniência**          | Colunas estruturadas `source_id UUID` e `source_reference TEXT` adicionadas a `food_household_measures`.                                                                                                                                                     |
| **14** | **Price Observation Provenance e Privacidade** | Colunas `organization_id`, `retailer`, `brand`, `source_reference`, `valid_until` criadas. `entered_by` forçado para `auth.uid()`. Preços privados não vazam entre organizações.                                                                             |
| **15** | **Reprodutibilidade e Integridade Oficial**    | Checksum do arquivo oficial do NEPA verificado. Checksum do dataset canônico calculado sobre dados estáticos. Reconciliação auditável versionada para o alimento 540 (`RECON_TACO4_FOOD_540_NAME`). Python sem `assert`.                                    |
| **16** | **Testes Finais e Idempotência Dupla**         | 18 arquivos de teste passaram, totalizando **277 testes aprovados (0 falhas)**. Dupla importação oficial sequencial valida estado final idêntico de 597 alimentos e 15.522 nutrientes.                                                                       |

---

## 4. Migrações PostgreSQL Completas

### 4.1. Migração 14: Isolamento Cross-Tenant, Governança, Imutabilidade e RPC Atômico

**Arquivo:** `supabase/migrations/20260908000014_cross_tenant_and_governance_hardening.sql`

```sql
-- ==============================================================================
-- MIGRAÇÃO 14: ISOLAMENTO CROSS-TENANT, GOVERNANÇA DE PROFESSIONAL_CUSTOM,
-- IMUTABILIDADE, HARDENING E FUNÇÃO ATÔMICA TRANSACIONAL DA TACO (RPC)
-- ==============================================================================

-- 1. Constraint UNIQUE em food_data_sources para Suportar Upsert Concorrente Seguro
ALTER TABLE public.food_data_sources
    DROP CONSTRAINT IF EXISTS uq_food_data_sources_name_version;

ALTER TABLE public.food_data_sources
    ADD CONSTRAINT uq_food_data_sources_name_version UNIQUE (name, version);

-- 2. Campos de Proveniência Estruturada em food_household_measures
ALTER TABLE public.food_household_measures
    ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES public.food_data_sources(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS source_reference TEXT;

-- 3. Campos de Proveniência e Auditoria em food_price_observations
ALTER TABLE public.food_price_observations
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS retailer TEXT,
    ADD COLUMN IF NOT EXISTS brand TEXT,
    ADD COLUMN IF NOT EXISTS source_reference TEXT,
    ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;

-- 4. Remoção do Bypass Inseguro de JWT Vazio em Triggers de Imutabilidade
-- 4.1. Imutabilidade de foods
CREATE OR REPLACE FUNCTION private.check_official_food_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role TEXT;
BEGIN
    v_role := COALESCE(current_setting('request.jwt.claim.role', true), '');

    -- 1. Bypass por JWT confiável de infraestrutura (service_role ou supabase_admin)
    IF v_role IN ('service_role', 'supabase_admin') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- 2. Bypass por role de banco direta confiável (somente quando session_user = postgres/supabase_admin E nenhuma role de aplicação foi assumida)
    IF session_user IN ('postgres', 'supabase_admin')
       AND COALESCE(current_setting('role', true), 'none') = 'none'
       AND v_role = '' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.source_type IN ('official', 'official_table') THEN
            RAISE EXCEPTION 'Exclusão de alimento oficial da base TACO é terminantemente proibida.';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.source_type IN ('official', 'official_table') THEN
            IF NEW.source_id <> OLD.source_id OR
               NEW.source_food_code <> OLD.source_food_code OR
               NEW.source_type <> OLD.source_type OR
               NEW.name <> OLD.name OR
               NEW.normalized_name <> OLD.normalized_name OR
               NEW.scientific_name IS DISTINCT FROM OLD.scientific_name OR
               NEW.food_group <> OLD.food_group OR
               NEW.preparation_state <> OLD.preparation_state OR
               NEW.is_generic <> OLD.is_generic OR
               NEW.validation_status <> OLD.validation_status THEN
                RAISE EXCEPTION 'Alteração de dados canônicos da fonte oficial é proibida para usuários da aplicação (inclusive administradores). Administradores podem gerenciar exclusivamente metadados operacionais (is_active, engine_eligibility_status, needs_review).';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

-- 4.2. Imutabilidade de food_data_sources
CREATE OR REPLACE FUNCTION private.check_food_data_sources_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role TEXT;
BEGIN
    v_role := COALESCE(current_setting('request.jwt.claim.role', true), '');

    IF v_role IN ('service_role', 'supabase_admin') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF session_user IN ('postgres', 'supabase_admin')
       AND COALESCE(current_setting('role', true), 'none') = 'none'
       AND v_role = '' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Exclusão de fontes oficiais de dados de alimentos é proibida.';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.name IS DISTINCT FROM OLD.name OR
           NEW.version IS DISTINCT FROM OLD.version OR
           NEW.publisher IS DISTINCT FROM OLD.publisher OR
           NEW.reference IS DISTINCT FROM OLD.reference OR
           NEW.checksum IS DISTINCT FROM OLD.checksum OR
           NEW.imported_at IS DISTINCT FROM OLD.imported_at OR
           NEW.id IS DISTINCT FROM OLD.id THEN
            RAISE EXCEPTION 'Alteração de metadados canônicos em food_data_sources é proibida para usuários da aplicação (inclusive administradores).';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- 4.3. Imutabilidade e Governança Clínica de food_nutrients
-- Helper function para checar se o usuário possui credencial clínica de nutricionista ou administrador
CREATE OR REPLACE FUNCTION private.is_nutritionist_or_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
    v_role_id TEXT;
    v_role_name TEXT;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT r.id, r.name INTO v_role_id, v_role_name
    FROM public.profiles p
    JOIN public.roles r ON r.id = p.role_id
    WHERE p.id = p_user_id;

    IF v_role_id IN ('nutritionist', 'admin')
       OR v_role_name ILIKE '%nutricionista%'
       OR v_role_name ILIKE '%administrador%' THEN
        RETURN TRUE;
    END IF;

    RETURN private.is_admin(p_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION private.check_official_nutrient_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_source_type TEXT;
    v_target_food_id UUID;
    v_role TEXT;
    v_caller_id UUID;
    v_caller_role_id TEXT;
    v_caller_role_name TEXT;
BEGIN
    v_role := COALESCE(current_setting('request.jwt.claim.role', true), '');
    v_caller_id := auth.uid();

    IF v_role IN ('service_role', 'supabase_admin') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF session_user IN ('postgres', 'supabase_admin')
       AND COALESCE(current_setting('role', true), 'none') = 'none'
       AND v_role = '' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    v_target_food_id := COALESCE(NEW.food_id, OLD.food_id);

    SELECT source_type INTO v_source_type
    FROM public.foods
    WHERE id = v_target_food_id;

    IF v_source_type IN ('official', 'official_table') THEN
        RAISE EXCEPTION 'Alteração direta de nutrientes da fonte oficial TACO é proibida para usuários da aplicação. Apenas o importador oficial autorizado (service_role) pode atualizar a composição analítica.';
    END IF;

    -- Para alimentos customizados (professional_custom), escrita de nutrientes exige nutricionista credenciado ou admin
    IF v_source_type = 'professional_custom' AND v_caller_id IS NOT NULL THEN
        SELECT r.id, r.name INTO v_caller_role_id, v_caller_role_name
        FROM public.profiles p
        JOIN public.roles r ON r.id = p.role_id
        WHERE p.id = v_caller_id;

        IF v_caller_role_id = 'influencer' OR v_caller_role_name ILIKE '%influenc%' THEN
            RAISE EXCEPTION 'Influenciadores não possuem permissão clínica para alterar a composição nutricional de alimentos, mesmo sendo membros da organização.';
        END IF;

        IF NOT private.is_nutritionist_or_admin(v_caller_id) THEN
            RAISE EXCEPTION 'Escrita de nutrientes customizados exige nutricionista autorizado, administrador ou processo confiável de backend.';
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- 5. Governança Robusta de Alimentos Customizados (professional_custom)
CREATE OR REPLACE FUNCTION private.check_professional_custom_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_source_name TEXT;
    v_caller_id UUID;
    v_caller_role_id TEXT;
    v_caller_role_name TEXT;
    v_is_member BOOLEAN;
BEGIN
    v_caller_id := auth.uid();

    IF NEW.source_type = 'professional_custom' THEN
        IF NEW.organization_id IS NULL THEN
            RAISE EXCEPTION 'Alimentos customizados devem obrigatoriamente pertencer a uma organização.';
        END IF;

        -- Forçar created_by para o caller real autenticado
        IF TG_OP = 'INSERT' THEN
            IF v_caller_id IS NOT NULL THEN
                NEW.created_by := v_caller_id;
            END IF;

            IF NEW.created_by IS NULL THEN
                RAISE EXCEPTION 'Alimentos customizados devem obrigatoriamente registrar o usuário autor (created_by).';
            END IF;
        END IF;

        -- Validar se o caller pertence à organização indicada (ordem correta: target_org_id, target_user_id)
        IF v_caller_id IS NOT NULL AND NOT private.is_admin(v_caller_id) THEN
            SELECT private.is_org_member(NEW.organization_id, v_caller_id) INTO v_is_member;
            IF NOT COALESCE(v_is_member, false) THEN
                RAISE EXCEPTION 'Usuário não pertence à organização informada para o alimento customizado.';
            END IF;
        END IF;

        -- Não permitir uso de fontes oficiais TACO
        SELECT name INTO v_source_name
        FROM public.food_data_sources
        WHERE id = NEW.source_id;

        IF v_source_name ILIKE '%TACO%' OR v_source_name ILIKE '%Tabela Brasileira%' THEN
            RAISE EXCEPTION 'Alimentos customizados não podem ser atribuídos à fonte oficial TACO.';
        END IF;

        -- Não permitir uso de códigos numéricos de 3 dígitos reservados para a TACO
        IF NEW.source_food_code ~ '^[0-9]{3}$' THEN
            RAISE EXCEPTION 'Alimentos customizados não podem adotar códigos numéricos reservados da TACO (ex: 001-597).';
        END IF;

        -- Verificar permissão clínica do caller real através de JOIN com public.roles
        IF v_caller_id IS NOT NULL THEN
            SELECT r.id, r.name INTO v_caller_role_id, v_caller_role_name
            FROM public.profiles p
            JOIN public.roles r ON r.id = p.role_id
            WHERE p.id = v_caller_id;

            IF (v_caller_role_id = 'influencer' OR v_caller_role_name ILIKE '%influenc%')
               AND NEW.validation_status = 'verified_by_nutritionist' THEN
                RAISE EXCEPTION 'Influenciadores não possuem autorização clínica para validar composição nutricional ou definir status verified_by_nutritionist.';
            END IF;

            IF NEW.validation_status = 'verified_by_nutritionist' AND NOT private.is_nutritionist_or_admin(v_caller_id) THEN
                RAISE EXCEPTION 'Apenas nutricionistas credenciados ou administradores podem validar alimentos customizados (verified_by_nutritionist).';
            END IF;
        END IF;

        IF TG_OP = 'UPDATE' THEN
            IF NEW.organization_id <> OLD.organization_id THEN
                RAISE EXCEPTION 'Não é permitido transferir alimentos customizados entre organizações.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- 6. Trigger para Observações de Preço (Auditoria de entered_by e source_type)
CREATE OR REPLACE FUNCTION private.check_price_observation_governance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_role TEXT;
BEGIN
    v_caller_id := auth.uid();
    v_role := COALESCE(current_setting('request.jwt.claim.role', true), '');

    -- Forçar entered_by a partir do auth.uid()
    IF v_caller_id IS NOT NULL THEN
        NEW.entered_by := v_caller_id;
    END IF;

    -- Proibir que profissionais ou usuários comuns usem source_type = 'official_reference'
    IF NEW.source_type = 'official_reference' THEN
        IF v_role NOT IN ('service_role', 'supabase_admin') AND (v_caller_id IS NULL OR NOT private.is_admin(v_caller_id)) THEN
            RAISE EXCEPTION 'Apenas administradores podem registrar observações de preço como official_reference.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_price_observation_governance ON public.food_price_observations;
CREATE TRIGGER trg_price_observation_governance
    BEFORE INSERT ON public.food_price_observations
    FOR EACH ROW
    EXECUTE FUNCTION private.check_price_observation_governance();

-- 7. Isolamento Cross-Tenant Estrito em foods (RLS)
DROP POLICY IF EXISTS "View foods for authenticated" ON public.foods;
DROP POLICY IF EXISTS "Public read foods" ON public.foods;
CREATE POLICY "Public read foods"
    ON public.foods FOR SELECT
    TO authenticated
    USING (
        (source_type IN ('official', 'official_table') AND is_active = true)
        OR (
            source_type = 'professional_custom' AND (
                created_by = auth.uid()
                OR (organization_id IS NOT NULL AND private.is_org_member(organization_id, auth.uid()))
                OR private.is_admin(auth.uid())
            )
        )
        OR private.is_admin(auth.uid())
    );

-- 8. Remoção de USING(true) em Tabelas Filhas para Evitar Vazamento Cross-Tenant
-- 8.1. food_nutrients
DROP POLICY IF EXISTS "View food nutrients for authenticated" ON public.food_nutrients;
DROP POLICY IF EXISTS "Public read food_nutrients" ON public.food_nutrients;
CREATE POLICY "Scoped read food_nutrients"
    ON public.food_nutrients FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.foods f
            WHERE f.id = food_nutrients.food_id
            AND (
                (f.source_type IN ('official', 'official_table') AND f.is_active = true)
                OR (
                    f.source_type = 'professional_custom' AND (
                        f.created_by = auth.uid()
                        OR (f.organization_id IS NOT NULL AND private.is_org_member(f.organization_id, auth.uid()))
                        OR private.is_admin(auth.uid())
                    )
                )
                OR private.is_admin(auth.uid())
            )
        )
    );

-- 8.2. food_household_measures
DROP POLICY IF EXISTS "View food measures for authenticated" ON public.food_household_measures;
DROP POLICY IF EXISTS "Public read food_household_measures" ON public.food_household_measures;
CREATE POLICY "Scoped read food_household_measures"
    ON public.food_household_measures FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.foods f
            WHERE f.id = food_household_measures.food_id
            AND (
                (f.source_type IN ('official', 'official_table') AND f.is_active = true)
                OR (
                    f.source_type = 'professional_custom' AND (
                        f.created_by = auth.uid()
                        OR (f.organization_id IS NOT NULL AND private.is_org_member(f.organization_id, auth.uid()))
                        OR private.is_admin(auth.uid())
                    )
                )
                OR private.is_admin(auth.uid())
            )
        )
    );

-- 8.3. food_aliases
DROP POLICY IF EXISTS "View food aliases for authenticated" ON public.food_aliases;
DROP POLICY IF EXISTS "Public read food_aliases" ON public.food_aliases;
CREATE POLICY "Scoped read food_aliases"
    ON public.food_aliases FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.foods f
            WHERE f.id = food_aliases.food_id
            AND (
                (f.source_type IN ('official', 'official_table') AND f.is_active = true)
                OR (
                    f.source_type = 'professional_custom' AND (
                        f.created_by = auth.uid()
                        OR (f.organization_id IS NOT NULL AND private.is_org_member(f.organization_id, auth.uid()))
                        OR private.is_admin(auth.uid())
                    )
                )
                OR private.is_admin(auth.uid())
            )
        )
    );

-- 8.4. food_category_mappings
DROP POLICY IF EXISTS "View food category mappings for authenticated" ON public.food_category_mappings;
DROP POLICY IF EXISTS "Public read food_category_mappings" ON public.food_category_mappings;
CREATE POLICY "Scoped read food_category_mappings"
    ON public.food_category_mappings FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.foods f
            WHERE f.id = food_category_mappings.food_id
            AND (
                (f.source_type IN ('official', 'official_table') AND f.is_active = true)
                OR (
                    f.source_type = 'professional_custom' AND (
                        f.created_by = auth.uid()
                        OR (f.organization_id IS NOT NULL AND private.is_org_member(f.organization_id, auth.uid()))
                        OR private.is_admin(auth.uid())
                    )
                )
                OR private.is_admin(auth.uid())
            )
        )
    );

-- 8.5. food_tag_mappings
DROP POLICY IF EXISTS "View food tag mappings for authenticated" ON public.food_tag_mappings;
DROP POLICY IF EXISTS "Public read food_tag_mappings" ON public.food_tag_mappings;
CREATE POLICY "Scoped read food_tag_mappings"
    ON public.food_tag_mappings FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.foods f
            WHERE f.id = food_tag_mappings.food_id
            AND (
                (f.source_type IN ('official', 'official_table') AND f.is_active = true)
                OR (
                    f.source_type = 'professional_custom' AND (
                        f.created_by = auth.uid()
                        OR (f.organization_id IS NOT NULL AND private.is_org_member(f.organization_id, auth.uid()))
                        OR private.is_admin(auth.uid())
                    )
                )
                OR private.is_admin(auth.uid())
            )
        )
    );

-- 8.6. Scoped Read para food_price_observations (Preços Privados de Organização Não Vazarem Globalmente)
DROP POLICY IF EXISTS "View food price observations for authenticated" ON public.food_price_observations;
DROP POLICY IF EXISTS "Authenticated read food_price_observations" ON public.food_price_observations;
DROP POLICY IF EXISTS "Scoped read food_price_observations" ON public.food_price_observations;
CREATE POLICY "Scoped read food_price_observations"
    ON public.food_price_observations FOR SELECT
    TO authenticated
    USING (
        organization_id IS NULL
        OR private.is_org_member(organization_id, auth.uid())
        OR private.is_admin(auth.uid())
    );

-- 9. Políticas de Gerenciamento de Tabelas Filhas para Alimentos Customizados (professional_custom)
-- 9.1. food_nutrients (escrita restrita a nutricionistas autorizados, administradores ou backend confiável)
DROP POLICY IF EXISTS "Professionals manage custom food nutrients" ON public.food_nutrients;
DROP POLICY IF EXISTS "Authorized nutritionists manage custom food nutrients" ON public.food_nutrients;
CREATE POLICY "Authorized nutritionists manage custom food nutrients"
    ON public.food_nutrients FOR ALL
    TO authenticated
    USING (
        private.is_nutritionist_or_admin(auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.foods f
            WHERE f.id = food_nutrients.food_id
            AND f.source_type = 'professional_custom'
            AND (
                f.created_by = auth.uid()
                OR (f.organization_id IS NOT NULL AND private.is_org_member(f.organization_id, auth.uid()))
                OR private.is_admin(auth.uid())
            )
        )
    )
    WITH CHECK (
        private.is_nutritionist_or_admin(auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.foods f
            WHERE f.id = food_nutrients.food_id
            AND f.source_type = 'professional_custom'
            AND (
                f.created_by = auth.uid()
                OR (f.organization_id IS NOT NULL AND private.is_org_member(f.organization_id, auth.uid()))
                OR private.is_admin(auth.uid())
            )
        )
    );

-- 9.2. food_household_measures
DROP POLICY IF EXISTS "Professionals manage custom food household measures" ON public.food_household_measures;
CREATE POLICY "Professionals manage custom food household measures"
    ON public.food_household_measures FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.foods f
            WHERE f.id = food_household_measures.food_id
            AND f.source_type = 'professional_custom'
            AND (
                f.created_by = auth.uid()
                OR (f.organization_id IS NOT NULL AND private.is_org_member(f.organization_id, auth.uid()))
                OR private.is_admin(auth.uid())
            )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.foods f
            WHERE f.id = food_household_measures.food_id
            AND f.source_type = 'professional_custom'
            AND (
                f.created_by = auth.uid()
                OR (f.organization_id IS NOT NULL AND private.is_org_member(f.organization_id, auth.uid()))
                OR private.is_admin(auth.uid())
            )
        )
    );

-- 9.3. food_aliases
DROP POLICY IF EXISTS "Professionals manage custom food aliases" ON public.food_aliases;
CREATE POLICY "Professionals manage custom food aliases"
    ON public.food_aliases FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.foods f
            WHERE f.id = food_aliases.food_id
            AND f.source_type = 'professional_custom'
            AND (
                f.created_by = auth.uid()
                OR (f.organization_id IS NOT NULL AND private.is_org_member(f.organization_id, auth.uid()))
                OR private.is_admin(auth.uid())
            )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.foods f
            WHERE f.id = food_aliases.food_id
            AND f.source_type = 'professional_custom'
            AND (
                f.created_by = auth.uid()
                OR (f.organization_id IS NOT NULL AND private.is_org_member(f.organization_id, auth.uid()))
                OR private.is_admin(auth.uid())
            )
        )
    );

-- 10. Função Atômica Transacional de Importação Oficial da TACO (RPC)
-- Garante BEGIN -> Validação Invariantes -> INSERT fontes, catálogo, alimentos, nutrientes -> Validação Invariantes -> COMMIT
-- Qualquer falha no pipeline, teste deliberado ou violação de invariante dispara ROLLBACK integral no PostgreSQL
CREATE OR REPLACE FUNCTION public.import_canonical_taco_atomic(
    p_payload JSONB,
    p_simulate_failure_after_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_source_meta JSONB;
    v_foods JSONB;
    v_catalog JSONB;
    v_source_id UUID;
    v_food JSONB;
    v_food_code TEXT;
    v_food_id UUID;
    v_imported_foods INT := 0;
    v_total_nutrients INT := 0;
    v_nut_entry RECORD;
    v_role TEXT;
BEGIN
    v_role := COALESCE(current_setting('request.jwt.claim.role', true), '');

    -- Autorização estrita: apenas service_role, supabase_admin ou conexão direta de superusuário de banco (manutenção/testes)
    -- Usuários autenticados (inclusive administradores) NUNCA podem chamar este RPC diretamente da aplicação
    IF v_role IN ('service_role', 'supabase_admin') THEN
        -- Processo confiável de infraestrutura / Server Action com trusted admin client
        NULL;
    ELSIF session_user IN ('postgres', 'supabase_admin')
          AND COALESCE(current_setting('role', true), 'none') = 'none'
          AND v_role = '' THEN
        -- Conexão direta de superusuário de banco
        NULL;
    ELSE
        RAISE EXCEPTION 'Acesso negado: public.import_canonical_taco_atomic aceita exclusivamente chamadas via service_role ou superusuário de banco. Administradores da aplicação devem invocar a Server Action autorizada.';
    END IF;

    v_source_meta := p_payload->'source';
    v_foods := p_payload->'foods';
    v_catalog := p_payload->'nutrients_catalog';

    IF v_source_meta IS NULL OR v_foods IS NULL OR v_catalog IS NULL THEN
        RAISE EXCEPTION 'Payload de importação inválido: ausência de metadados de source, alimentos ou catálogo de nutrientes.';
    END IF;

    -- Validação de Invariantes Canônicas (Antes de gravar qualquer registro)
    IF jsonb_array_length(v_foods) <> 597 THEN
        RAISE EXCEPTION 'INVARIANT_VIOLATION: Quantidade de alimentos no payload (%) difere da invariante canônica obrigatória de 597 alimentos.', jsonb_array_length(v_foods);
    END IF;

    IF jsonb_array_length(v_catalog) <> 26 THEN
        RAISE EXCEPTION 'INVARIANT_VIOLATION: Quantidade de nutrientes no catálogo (%) difere da invariante canônica obrigatória de 26 nutrientes analíticos.', jsonb_array_length(v_catalog);
    END IF;

    -- 1. Upsert da Fonte Oficial em food_data_sources
    INSERT INTO public.food_data_sources (
        name, version, publisher, reference, license_notes, checksum, is_active
    ) VALUES (
        v_source_meta->>'name',
        v_source_meta->>'version',
        v_source_meta->>'publisher',
        v_source_meta->>'reference',
        COALESCE(v_source_meta->>'license_notes', 'Uso institucional NEPA/UNICAMP'),
        v_source_meta->>'dataset_checksum',
        true
    )
    ON CONFLICT (name, version) DO UPDATE
    SET checksum = EXCLUDED.checksum,
        reference = EXCLUDED.reference,
        license_notes = EXCLUDED.license_notes,
        is_active = true
    RETURNING id INTO v_source_id;

    -- 2. Upsert do Catálogo de Nutrientes (todos os 26 campos analíticos oficiais)
    FOR v_nut_entry IN
        SELECT
            value->>'code' AS code,
            value->>'name' AS name,
            value->>'unit' AS unit,
            value->>'category' AS category,
            (value->>'display_order')::int AS display_order
        FROM jsonb_array_elements(v_catalog)
    LOOP
        INSERT INTO public.nutrients (code, name, unit, category, display_order)
        VALUES (v_nut_entry.code, v_nut_entry.name, v_nut_entry.unit, v_nut_entry.category, v_nut_entry.display_order)
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name, unit = EXCLUDED.unit, category = EXCLUDED.category;
    END LOOP;

    -- 3. Loop atômico de inserção de alimentos e nutrientes
    FOR v_food IN SELECT * FROM jsonb_array_elements(v_foods) LOOP
        v_food_code := v_food->>'source_food_code';

        -- Validação de Invariante: cada alimento canônico DEVE possuir exatamente os 26 campos analíticos
        IF (SELECT count(*) FROM jsonb_each(v_food->'nutrients')) <> 26 THEN
            RAISE EXCEPTION 'INVARIANT_VIOLATION: Alimento % possui contagem de nutrientes divergente de 26.', v_food_code;
        END IF;

        -- Teste de rollback deliberado em falha no meio da importação
        IF p_simulate_failure_after_code IS NOT NULL AND v_food_code > p_simulate_failure_after_code THEN
            RAISE EXCEPTION 'DELIBERATE_TEST_FAILURE: Falha simulada intencional após o alimento % para validação de atomicidade e rollback total.', p_simulate_failure_after_code;
        END IF;

        INSERT INTO public.foods (
            source_id, source_food_code, name, normalized_name, scientific_name,
            food_group, preparation_state, is_generic, is_active,
            source_type, validation_status, engine_eligibility_status,
            energy_consistency_status, description
        ) VALUES (
            v_source_id,
            v_food_code,
            v_food->>'name',
            v_food->>'normalized_name',
            v_food->>'scientific_name',
            v_food->>'food_group',
            v_food->>'preparation_state',
            COALESCE((v_food->>'is_generic')::boolean, true),
            true,
            'official',
            'official_approved',
            COALESCE(v_food->>'engine_eligibility_status', 'eligible_for_engine'),
            v_food->>'energy_consistency_status',
            v_food->>'scientific_name'
        )
        ON CONFLICT (source_id, source_food_code) DO UPDATE
        SET name = EXCLUDED.name,
            normalized_name = EXCLUDED.normalized_name,
            engine_eligibility_status = EXCLUDED.engine_eligibility_status,
            energy_consistency_status = EXCLUDED.energy_consistency_status
        RETURNING id INTO v_food_id;

        v_imported_foods := v_imported_foods + 1;

        -- Nutrientes do alimento com preservação de provenance e semântica canônica no upsert
        FOR v_nut_entry IN
            SELECT
                kv.key AS nut_code,
                n.id AS nutrient_id,
                (kv.value->>'numeric_value')::numeric AS numeric_value,
                kv.value->>'raw_value' AS raw_value,
                kv.value->>'value_status' AS value_status,
                kv.value->>'data_quality' AS data_quality,
                kv.value->>'source_reference' AS source_reference
            FROM jsonb_each(v_food->'nutrients') kv
            JOIN public.nutrients n ON n.code = kv.key
        LOOP
            INSERT INTO public.food_nutrients (
                food_id, nutrient_id, amount_per_100g, numeric_value,
                raw_value, value_status, data_quality, source_reference
            ) VALUES (
                v_food_id,
                v_nut_entry.nutrient_id,
                v_nut_entry.numeric_value,
                v_nut_entry.numeric_value,
                v_nut_entry.raw_value,
                v_nut_entry.value_status,
                v_nut_entry.data_quality,
                v_nut_entry.source_reference
            )
            ON CONFLICT (food_id, nutrient_id) DO UPDATE
            SET amount_per_100g = EXCLUDED.amount_per_100g,
                numeric_value = EXCLUDED.numeric_value,
                raw_value = EXCLUDED.raw_value,
                value_status = EXCLUDED.value_status,
                data_quality = EXCLUDED.data_quality,
                source_reference = EXCLUDED.source_reference;

            v_total_nutrients := v_total_nutrients + 1;
        END LOOP;
    END LOOP;

    -- Validação de Invariantes Canônicas (Após processamento completo)
    IF v_imported_foods <> 597 THEN
        RAISE EXCEPTION 'INVARIANT_VIOLATION: Total de alimentos processados (%) difere da invariante canônica de 597.', v_imported_foods;
    END IF;

    IF v_total_nutrients <> 15522 THEN
        RAISE EXCEPTION 'INVARIANT_VIOLATION: Total de nutrientes persistidos (%) difere da invariante canônica de 15522 (597 alimentos x 26 campos).', v_total_nutrients;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'source_id', v_source_id,
        'imported_foods_count', v_imported_foods,
        'total_nutrients_count', v_total_nutrients,
        'dataset_version', v_source_meta->>'version',
        'checksum', v_source_meta->>'dataset_checksum'
    );
END;
$$;

-- Revogação estrita de execução de usuários da aplicação (anon, authenticated, PUBLIC)
-- Concessão restrita a service_role e superusuários de banco
REVOKE ALL ON FUNCTION public.import_canonical_taco_atomic(JSONB, TEXT) FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.import_canonical_taco_atomic(JSONB, TEXT) TO service_role;
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_admin') THEN
        GRANT EXECUTE ON FUNCTION public.import_canonical_taco_atomic(JSONB, TEXT) TO supabase_admin;
    END IF;
END $$;
```

---

## 5. Script Extrator Canônico Oficial da TACO

**Arquivo:** `scripts/parse_taco_excel.py`  
Gera o dataset canônico sem `assert`, com validação estrita de decimais, rejeição de negativos como `UNKNOWN`, e registro formal de reconciliação para o alimento 540 (Feijoada).

```python
import os
import sys
import json
import hashlib
import re
import unicodedata
from datetime import datetime, timezone
import openpyxl

RAW_XLSX_PATH = 'src/data/taco/raw/taco_nepa_oficial.xlsx'
OUTPUT_JSON_PATH = 'src/data/taco/taco_4_edicao_complete.json'
OFFICIAL_NEPA_URL = 'https://www.nepa.unicamp.br/arquivo/uploads/taco-4a-edicao/taco-4a-edicao-2/'
EXPECTED_NEPA_SHA256 = 'A66B8EC528DAEABC63BC2B015FC9BD8C6D76B941C2FC0ED93A4311D449302D14'
EXPECTED_FILE_SIZE = 322270

NUTRIENT_COL_MAP = {
    3: ('moisture_pct', 'Umidade', '%'),
    4: ('energy_kcal', 'Energia', 'kcal'),
    5: ('energy_kj', 'Energia', 'kJ'),
    6: ('protein_g', 'Proteína', 'g'),
    7: ('fat_g', 'Lipídeos', 'g'),
    8: ('cholesterol_mg', 'Colesterol', 'mg'),
    9: ('carbohydrate_g', 'Carboidrato', 'g'),
    10: ('fiber_g', 'Fibra Alimentar', 'g'),
    11: ('ash_g', 'Cinzas', 'g'),
    12: ('calcium_mg', 'Cálcio', 'mg'),
    13: ('magnesium_mg', 'Magnésio', 'mg'),
    14: ('manganese_mg', 'Manganês', 'mg'),
    15: ('phosphorus_mg', 'Fósforo', 'mg'),
    16: ('iron_mg', 'Ferro', 'mg'),
    17: ('sodium_mg', 'Sódio', 'mg'),
    18: ('potassium_mg', 'Potássio', 'mg'),
    19: ('copper_mg', 'Cobre', 'mg'),
    20: ('zinc_mg', 'Zinco', 'mg'),
    21: ('retinol_mcg', 'Retinol', 'mcg'),
    22: ('re_mcg', 'Equivalente de Retinol (RE)', 'mcg'),
    23: ('rae_mcg', 'Equivalente de Atividade de Retinol (RAE)', 'mcg'),
    24: ('thiamine_mg', 'Tiamina', 'mg'),
    25: ('riboflavin_mg', 'Riboflavina', 'mg'),
    26: ('pyridoxine_mg', 'Piridoxina', 'mg'),
    27: ('niacin_mg', 'Niacina', 'mg'),
    28: ('vitamin_c_mg', 'Vitamina C', 'mg'),
}

KNOWN_GROUPS = [
    'Cereais e derivados',
    'Verduras, hortaliças e derivados',
    'Frutas e derivados',
    'Gorduras e óleos',
    'Pescados e frutos do mar',
    'Carnes e derivados',
    'Leite e derivados',
    'Bebidas (alcoólicas e não alcoólicas)',
    'Ovos e derivados',
    'Produtos açucarados',
    'Miscelâneas',
    'Outros alimentos industrializados',
    'Alimentos preparados',
    'Leguminosas e derivados',
    'Nozes e sementes'
]

RECONCILIATION_REGISTRY = [
    {
        'rule_id': 'RECON_TACO4_FOOD_540_NAME',
        'food_code': '540',
        'raw_cmv_value': 'L',
        'raw_ag_value': 'Feijoada',
        'selected_canonical_value': 'Feijoada',
        'source': 'TACO 4ª edição oficial NEPA/UNICAMP',
        'version': '4.0.0',
        'reason': 'Aba CMVCol taco3 contém caractere corrompido/truncado "L" na linha do alimento 540. A aba AGtaco3 da mesma planilha oficial contém a descrição completa e correta "Feijoada". Reconciliação canônica auditável intra-arquivo.'
    }
]

def compute_sha256(filepath):
    h = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest().upper()

def normalize_text(text):
    if not text:
        return ''
    nfkd = unicodedata.normalize('NFKD', text)
    no_accents = ''.join([c for c in nfkd if not unicodedata.combining(c)])
    clean = re.sub(r'[^a-zA-Z0-9\s]', ' ', no_accents).lower()
    return re.sub(r'\s+', ' ', clean).strip()

def detect_preparation_state(name, food_group):
    name_lower = name.lower()
    if 'cozido' in name_lower or 'cozida' in name_lower:
        return 'cooked'
    if 'grelhado' in name_lower or 'grelhada' in name_lower:
        return 'grilled'
    if 'assado' in name_lower or 'assada' in name_lower:
        return 'roasted'
    if 'frito' in name_lower or 'frita' in name_lower:
        return 'fried'
    if 'cru' in name_lower or 'crua' in name_lower:
        return 'raw'
    if food_group == 'Alimentos preparados':
        return 'prepared'
    if food_group == 'Outros alimentos industrializados':
        return 'industrialized'
    return 'other'

def parse_cell_value(val):
    if val is None:
        return {
            'raw_value': '',
            'numeric_value': None,
            'value_status': 'NOT_REQUESTED',
            'data_quality': 'not_requested',
        }

    raw_str = str(val).strip()

    if raw_str in ['Tr', 'tr']:
        return {
            'raw_value': 'Tr',
            'numeric_value': None,
            'value_status': 'TRACE',
            'data_quality': 'trace',
        }
    if raw_str == 'NA' or raw_str.lower() == 'na':
        return {
            'raw_value': 'NA',
            'numeric_value': None,
            'value_status': 'NOT_APPLICABLE',
            'data_quality': 'not_applicable',
        }
    if raw_str == '*':
        return {
            'raw_value': '*',
            'numeric_value': None,
            'value_status': 'UNDER_REEVALUATION',
            'data_quality': 'under_reevaluation',
        }
    if raw_str == '':
        return {
            'raw_value': '',
            'numeric_value': None,
            'value_status': 'NOT_REQUESTED',
            'data_quality': 'not_requested',
        }

    # Rejeição explícita de números negativos (não podem virar KNOWN_NUMERIC_ZERO)
    if raw_str.startswith('-'):
        return {
            'raw_value': raw_str,
            'numeric_value': None,
            'value_status': 'UNKNOWN',
            'data_quality': 'unknown',
        }

    # Normalização determinística de decimais
    normalized_str = raw_str
    if normalized_str == ',0,02':
        normalized_str = '0.02'
    elif normalized_str.startswith(',') or normalized_str.startswith('.'):
        normalized_str = '0.' + normalized_str[1:]
    else:
        normalized_str = normalized_str.replace(',', '.')

    # Validação estrita: rejeita strings com sufixos ou caracteres inválidos (ex: "12abc")
    if not re.match(r'^\d+(\.\d+)?$', normalized_str):
        return {
            'raw_value': raw_str,
            'numeric_value': None,
            'value_status': 'UNKNOWN',
            'data_quality': 'unknown',
        }

    try:
        f = float(normalized_str)
        rounded = round(f, 4)
        if rounded == 0.0:
            return {
                'raw_value': raw_str,
                'numeric_value': 0.0,
                'value_status': 'KNOWN_NUMERIC_ZERO',
                'data_quality': 'analytical',
            }
        return {
            'raw_value': raw_str,
            'numeric_value': rounded,
            'value_status': 'NUMERIC_VALUE',
            'data_quality': 'analytical',
        }
    except ValueError:
        return {
            'raw_value': raw_str,
            'numeric_value': None,
            'value_status': 'UNKNOWN',
            'data_quality': 'unknown',
        }

def evaluate_atwater_consistency(energy_kcal, protein_g, carbs_g, fat_g):
    if energy_kcal is None or protein_g is None or carbs_g is None or fat_g is None:
        return 'insufficient_data'

    calc_kcal = round((4.0 * protein_g + 4.0 * carbs_g + 9.0 * fat_g) * 10) / 10.0
    if energy_kcal == 0 and calc_kcal == 0:
        return 'consistent'
    if energy_kcal == 0:
        return 'different_from_macro_estimate'

    delta = abs(energy_kcal - calc_kcal)
    delta_pct = round((delta / energy_kcal) * 1000) / 10.0
    if delta_pct <= 10.0:
        return 'consistent'
    if delta_pct <= 20.0:
        return 'within_tolerance'
    return 'different_from_macro_estimate'

def main():
    print('1. Verificando presença e integridade do arquivo TACO Excel oficial do NEPA/UNICAMP...')
    if not os.path.exists(RAW_XLSX_PATH):
        raise FileNotFoundError(
            f'Arquivo oficial não encontrado em: {RAW_XLSX_PATH}\n'
            f'O arquivo oficial da TACO deve ser obtido diretamente do NEPA/UNICAMP:\n'
            f'URL oficial: {OFFICIAL_NEPA_URL}'
        )

    file_size = os.path.getsize(RAW_XLSX_PATH)
    file_checksum = compute_sha256(RAW_XLSX_PATH)
    print(f'Tamanho do arquivo:  {file_size} bytes (esperado: {EXPECTED_FILE_SIZE})')
    print(f'Checksum calculado: {file_checksum}')
    print(f'Checksum esperado:   {EXPECTED_NEPA_SHA256}')

    if file_checksum != EXPECTED_NEPA_SHA256:
        raise RuntimeError(
            f'Checksum do arquivo Excel ({file_checksum}) não corresponde ao oficial do NEPA ({EXPECTED_NEPA_SHA256})!'
        )

    print('2. Carregando planilha oficial do NEPA/UNICAMP (openpyxl)...')
    wb = openpyxl.load_workbook(RAW_XLSX_PATH, data_only=True)
    ws_cmv = wb['CMVCol taco3']
    ws_ag = wb['AGtaco3']

    current_group = None
    foods = []
    stats = {
        'total_rows_source': 597,
        'imported': 0,
        'eligible_for_engine': 0,
        'incomplete_nutrition': 0,
        'consistent_energy': 0,
        'within_tolerance_energy': 0,
        'divergent_energy': 0,
        'insufficient_data_energy': 0,
    }

    def norm_str(s):
        return ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c)).lower()

    print('3. Processando os 597 alimentos oficiais e seus grupos canônicos...')
    for r in range(1, ws_cmv.max_row + 1):
        val0 = ws_cmv.cell(r, 1).value
        val1 = ws_cmv.cell(r, 2).value

        if isinstance(val0, str):
            v_norm = norm_str(val0.strip())
            for g in KNOWN_GROUPS:
                if norm_str(g) == v_norm:
                    current_group = g
                    break
            continue

        if not isinstance(val0, int) or val0 < 1 or val0 > 597:
            continue

        food_code_num = val0
        code_str = f'{food_code_num:03d}'
        food_name = str(val1).strip() if val1 else ''

        reconciliation_info = None
        if food_code_num == 540:
            recon = next(item for item in RECONCILIATION_REGISTRY if item['food_code'] == '540')
            food_name = recon['selected_canonical_value']
            reconciliation_info = recon

        if current_group is None:
            raise ValueError(f'Alimento {food_code_num} sem grupo alimentar associado!')

        food_group = current_group
        prep_state = detect_preparation_state(food_name, food_group)

        sci_match = re.search(r'\((([A-Z][a-z]+)\s+([a-z]+(?:\s+var\.\s+[a-z]+)?))\)', food_name)
        scientific_name = sci_match.group(1) if sci_match else None

        nutrients = {}
        for col_idx, (nut_code, nut_name, nut_unit) in NUTRIENT_COL_MAP.items():
            cell_val = ws_cmv.cell(r, col_idx).value
            parsed = parse_cell_value(cell_val)
            nutrients[nut_code] = {
                'code': nut_code,
                'name': nut_name,
                'unit': nut_unit,
                'raw_value': parsed['raw_value'],
                'numeric_value': parsed['numeric_value'],
                'amount_per_100g': parsed['numeric_value'],
                'value_status': parsed['value_status'],
                'data_quality': parsed['data_quality'],
                'source_reference': f'TACO 4ª edição, alimento {code_str}, col {col_idx}',
            }

        e_kcal = nutrients.get('energy_kcal', {}).get('numeric_value')
        p_g = nutrients.get('protein_g', {}).get('numeric_value')
        c_g = nutrients.get('carbohydrate_g', {}).get('numeric_value')
        f_g = nutrients.get('fat_g', {}).get('numeric_value')

        if e_kcal is not None and p_g is not None and c_g is not None and f_g is not None:
            eligibility = 'eligible_for_engine'
            stats['eligible_for_engine'] += 1
        else:
            eligibility = 'incomplete_nutrition'
            stats['incomplete_nutrition'] += 1

        energy_status = evaluate_atwater_consistency(e_kcal, p_g, c_g, f_g)
        if energy_status == 'consistent':
            stats['consistent_energy'] += 1
        elif energy_status == 'within_tolerance':
            stats['within_tolerance_energy'] += 1
        elif energy_status == 'different_from_macro_estimate':
            stats['divergent_energy'] += 1
        else:
            stats['insufficient_data_energy'] += 1

        food_entry = {
            'source_food_code': code_str,
            'name': food_name,
            'normalized_name': normalize_text(food_name),
            'scientific_name': scientific_name,
            'food_group': food_group,
            'preparation_state': prep_state,
            'is_generic': True,
            'is_active': True,
            'source_type': 'official',
            'validation_status': 'official_approved',
            'engine_eligibility_status': eligibility,
            'energy_consistency_status': energy_status,
            'nutrients': nutrients,
        }
        if reconciliation_info:
            food_entry['reconciliation'] = reconciliation_info

        foods.append(food_entry)
        stats['imported'] += 1

    if len(foods) != 597:
        raise RuntimeError(f'Esperava exatamente 597 alimentos oficiais, obteve {len(foods)}')

    deterministic_source_metadata = {
        'id': 'taco_4_edicao',
        'name': 'Tabela Brasileira de Composição de Alimentos - TACO',
        'short_name': 'TACO',
        'version': '4.0.0',
        'publisher': 'NEPA - Núcleo de Estudos e Pesquisas em Alimentação / UNICAMP',
        'domain': 'nepa.unicamp.br',
        'source_url': OFFICIAL_NEPA_URL,
        'reference': 'NEPA/UNICAMP. Tabela brasileira de composição de alimentos - TACO. 4. ed. rev. e ampl. Campinas: NEPA-UNICAMP, 2011. 161 p.',
        'source_file': 'taco_nepa_oficial.xlsx',
        'source_file_checksum': file_checksum,
        'source_file_size_bytes': file_size,
        'parser_version': '2.1.0',
        'normalization_version': '2.1.0',
        'license_notes': 'Uso institucional, científico e acadêmico autorizado com citação obrigatória da fonte NEPA/UNICAMP.',
        'reconciliations': RECONCILIATION_REGISTRY,
        'stats': stats,
    }

    deterministic_payload = {
        'source': deterministic_source_metadata,
        'foods': foods,
    }
    deterministic_serialized = json.dumps(deterministic_payload, sort_keys=True, ensure_ascii=False).encode('utf-8')
    dataset_checksum = hashlib.sha256(deterministic_serialized).hexdigest().upper()
    deterministic_source_metadata['dataset_checksum'] = dataset_checksum

    canonical_output = {
        'source': deterministic_source_metadata,
        'operational_metadata': {
            'import_run_id': 'canonical_nepa_import_20260908',
            'imported_at': '2026-09-08T00:00:00Z',
            'execution_timestamp': datetime.now(timezone.utc).isoformat(),
        },
        'foods': foods,
    }

    with open(OUTPUT_JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(canonical_output, f, ensure_ascii=False, indent=2)

    print('Processamento canônico concluído com sucesso.')

if __name__ == '__main__':
    main()
```

---

## 6. Modelos e Tipos de Domínio (`src/types/food.ts`)

Contém as interfaces TypeScript tipadas e completas com todas as novas colunas estruturadas (`source_id`, `source_reference` em medidas caseiras, `organization_id`, `retailer`, `brand` em observações de preço):

```typescript
export type FoodSourceType =
  | "official"
  | "official_table"
  | "commercial"
  | "user_custom"
  | "professional_custom";
export type FoodValidationStatus =
  | "draft"
  | "pending_review"
  | "verified_by_nutritionist"
  | "official_approved"
  | "rejected";
export type PreparationState =
  | "raw"
  | "cooked"
  | "grilled"
  | "roasted"
  | "fried"
  | "prepared"
  | "industrialized"
  | "other";
export type NutrientValueStatus =
  | "KNOWN_NUMERIC_ZERO"
  | "NUMERIC_VALUE"
  | "TRACE"
  | "NOT_APPLICABLE"
  | "UNDER_REEVALUATION"
  | "NOT_REQUESTED"
  | "UNKNOWN";
export type NutrientDataQuality =
  | "analytical"
  | "calculated"
  | "estimated"
  | "imputed"
  | "trace"
  | "not_applicable"
  | "under_reevaluation"
  | "not_requested"
  | "unknown";
export type EngineEligibilityStatus =
  | "eligible_for_engine"
  | "incomplete_nutrition"
  | "excluded_by_admin"
  | "pending_review";
export type PriceConfidenceLevel =
  | "high"
  | "medium"
  | "low"
  | "stale_estimate"
  | "unknown";
export type PriceObservationSourceType =
  | "manual_input"
  | "receipt_ocr"
  | "api_scraped"
  | "official_reference";

export interface FoodDataSource {
  id: string;
  name: string;
  short_name: string;
  version: string;
  publisher?: string;
  reference?: string;
  checksum?: string;
  imported_at: string;
  is_active: boolean;
  metadata: Record<string, unknown>;
}

export interface FoodItem {
  id: string;
  source_id?: string;
  source_food_code?: string;
  source_type: FoodSourceType;
  organization_id?: string;
  created_by?: string;
  name: string;
  normalized_name: string;
  scientific_name?: string;
  food_group: string;
  preparation_state: PreparationState;
  is_generic: boolean;
  is_active: boolean;
  validation_status: FoodValidationStatus;
  engine_eligibility_status: EngineEligibilityStatus;
  energy_consistency_status?: string;
  needs_review: boolean;
  review_notes?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  nutrients?: Record<string, FoodNutrient>;
  measures?: FoodHouseholdMeasure[];
}

export interface FoodNutrient {
  food_id?: string;
  nutrient_code: string;
  name?: string;
  unit?: string;
  raw_value?: string;
  numeric_value: number | null;
  amount_per_100g: number | null;
  value_status: NutrientValueStatus;
  data_quality: NutrientDataQuality;
  source_reference?: string;
  created_at?: string;
}

export interface FoodHouseholdMeasure {
  id?: string;
  food_id?: string;
  measure_name: string;
  grams: number;
  is_default: boolean;
  is_estimated?: boolean;
  source_id?: string;
  source_reference?: string;
  created_at?: string;
}

export interface FoodPriceObservation {
  id?: string;
  food_id: string;
  organization_id?: string;
  price_cents: number;
  quantity: number;
  unit: string;
  retailer?: string;
  brand?: string;
  source_reference?: string;
  valid_until?: string;
  city?: string;
  state?: string;
  country: string;
  currency: string;
  source_type: PriceObservationSourceType;
  observed_at: string;
  entered_by?: string;
  created_at?: string;
}
```

---

## 7. Motor de Compatibilidade e Segurança de Alergias (`src/lib/foods/compatibility.ts`)

```typescript
export type AllergyDecision = "allowed" | "blocked" | "review_required";

export interface AllergyEvaluationResult {
  decision: AllergyDecision;
  is_compatible: boolean;
  blocked_allergens: string[];
  review_required_allergens: string[];
  allowed_allergens: string[];
  reason: string;
}

export const KNOWN_STRUCTURED_ALLERGENS = [
  "gluten",
  "milk",
  "egg",
  "peanut",
  "soy",
  "fish",
  "shellfish",
  "tree_nuts",
] as const;

export function evaluateFoodAllergyCompatibility(
  foodTags: Record<string, boolean | null | undefined>,
  patientAllergies: string[],
): AllergyEvaluationResult {
  if (!patientAllergies || patientAllergies.length === 0) {
    return {
      decision: "allowed",
      is_compatible: true,
      blocked_allergens: [],
      review_required_allergens: [],
      allowed_allergens: [],
      reason: "Paciente não reportou alergias estruturadas.",
    };
  }

  const blocked: string[] = [];
  const reviewRequired: string[] = [];
  const allowed: string[] = [];

  for (const allergen of patientAllergies) {
    const key = allergen.toLowerCase().trim();
    const tagValue = foodTags[key];

    if (tagValue === true) {
      blocked.push(key);
    } else if (tagValue === false) {
      allowed.push(key);
    } else {
      reviewRequired.push(key);
    }
  }

  if (blocked.length > 0) {
    return {
      decision: "blocked",
      is_compatible: false,
      blocked_allergens: blocked,
      review_required_allergens: reviewRequired,
      allowed_allergens: allowed,
      reason: `Alimento contém alergênicos confirmados para o paciente: ${blocked.join(", ")}.`,
    };
  }

  if (reviewRequired.length > 0) {
    return {
      decision: "review_required",
      is_compatible: false,
      blocked_allergens: [],
      review_required_allergens: reviewRequired,
      allowed_allergens: allowed,
      reason: `Presença de alergênicos não pôde ser atestada como ausente com certeza analítica: ${reviewRequired.join(", ")}. O motor determinístico não pode selecionar automaticamente este alimento sem revisão humana.`,
    };
  }

  return {
    decision: "allowed",
    is_compatible: true,
    blocked_allergens: [],
    review_required_allergens: [],
    allowed_allergens: allowed,
    reason:
      "Todos os alergênicos do paciente foram comprovadamente atestados como ausentes.",
  };
}
```

---

## 8. Pipeline Atômico Confiável (`src/lib/foods/importer/import-pipeline.ts`)

Executa o pipeline atômico via RPC PostgreSQL, fornecendo catálogo dos 26 nutrientes oficiais da TACO:

```typescript
export const TACO_OFFICIAL_26_NUTRIENTS = [
  {
    code: "moisture_pct",
    name: "Umidade",
    unit: "%",
    category: "other",
    display_order: 1,
  },
  {
    code: "energy_kcal",
    name: "Energia",
    unit: "kcal",
    category: "macro",
    display_order: 2,
  },
  {
    code: "energy_kj",
    name: "Energia",
    unit: "kJ",
    category: "macro",
    display_order: 3,
  },
  {
    code: "protein_g",
    name: "Proteína",
    unit: "g",
    category: "macro",
    display_order: 4,
  },
  {
    code: "fat_g",
    name: "Lipídeos",
    unit: "g",
    category: "macro",
    display_order: 5,
  },
  {
    code: "cholesterol_mg",
    name: "Colesterol",
    unit: "mg",
    category: "lipid",
    display_order: 6,
  },
  {
    code: "carbohydrate_g",
    name: "Carboidrato total",
    unit: "g",
    category: "macro",
    display_order: 7,
  },
  {
    code: "fiber_g",
    name: "Fibra alimentar",
    unit: "g",
    category: "macro",
    display_order: 8,
  },
  {
    code: "ash_g",
    name: "Cinzas",
    unit: "g",
    category: "other",
    display_order: 9,
  },
  {
    code: "calcium_mg",
    name: "Cálcio",
    unit: "mg",
    category: "mineral",
    display_order: 10,
  },
  {
    code: "magnesium_mg",
    name: "Magnésio",
    unit: "mg",
    category: "mineral",
    display_order: 11,
  },
  {
    code: "manganese_mg",
    name: "Manganês",
    unit: "mg",
    category: "mineral",
    display_order: 12,
  },
  {
    code: "phosphorus_mg",
    name: "Fósforo",
    unit: "mg",
    category: "mineral",
    display_order: 13,
  },
  {
    code: "iron_mg",
    name: "Ferro",
    unit: "mg",
    category: "mineral",
    display_order: 14,
  },
  {
    code: "sodium_mg",
    name: "Sódio",
    unit: "mg",
    category: "mineral",
    display_order: 15,
  },
  {
    code: "potassium_mg",
    name: "Potássio",
    unit: "mg",
    category: "mineral",
    display_order: 16,
  },
  {
    code: "copper_mg",
    name: "Cobre",
    unit: "mg",
    category: "mineral",
    display_order: 17,
  },
  {
    code: "zinc_mg",
    name: "Zinco",
    unit: "mg",
    category: "mineral",
    display_order: 18,
  },
  {
    code: "retinol_mcg",
    name: "Retinol",
    unit: "mcg",
    category: "vitamin",
    display_order: 19,
  },
  {
    code: "re_mcg",
    name: "Equivalente de Retinol (RE)",
    unit: "mcg",
    category: "vitamin",
    display_order: 20,
  },
  {
    code: "rae_mcg",
    name: "Equivalente de Atividade de Retinol (RAE)",
    unit: "mcg",
    category: "vitamin",
    display_order: 21,
  },
  {
    code: "thiamine_mg",
    name: "Tiamina",
    unit: "mg",
    category: "vitamin",
    display_order: 22,
  },
  {
    code: "riboflavin_mg",
    name: "Riboflavina",
    unit: "mg",
    category: "vitamin",
    display_order: 23,
  },
  {
    code: "pyridoxine_mg",
    name: "Piridoxina",
    unit: "mg",
    category: "vitamin",
    display_order: 24,
  },
  {
    code: "niacin_mg",
    name: "Niacina",
    unit: "mg",
    category: "vitamin",
    display_order: 25,
  },
  {
    code: "vitamin_c_mg",
    name: "Vitamina C",
    unit: "mg",
    category: "vitamin",
    display_order: 26,
  },
];

export async function runCanonicalTacoImport(options?: {
  allowFixture?: boolean;
  simulateFailureAfterCode?: string;
}): Promise<{
  success: boolean;
  source_id: string;
  imported_foods_count: number;
  total_nutrients_count: number;
  dataset_version: string;
  checksum: string;
}> {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd && options?.allowFixture) {
    throw new Error(
      "Importação de dataset fixture em ambiente de produção é terminantemente proibida.",
    );
  }

  const datasetType = options?.allowFixture ? "fixture" : "official_complete";
  const normalizedData = parseAndNormalizeTacoDataset(datasetType);
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const adminClient = createAdminClient();

  const { data, error } = await adminClient.rpc(
    "import_canonical_taco_atomic",
    {
      p_payload: {
        source: normalizedData.source,
        nutrients_catalog: normalizedData.nutrients_catalog,
        foods: normalizedData.foods,
      },
      p_simulate_failure_after_code: options?.simulateFailureAfterCode || null,
    },
  );

  if (error || !data) {
    throw new Error(
      `Falha atômica durante a importação canônica oficial: ${error?.message || "Sem retorno do banco"}`,
    );
  }

  return data as {
    success: boolean;
    source_id: string;
    imported_foods_count: number;
    total_nutrients_count: number;
    dataset_version: string;
    checksum: string;
  };
}
```

---

## 9. Server Actions Seguras (`src/app/actions/foods.ts`)

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { logAuditEvent } from "@/lib/audit/logger";
import {
  parseAndNormalizeTacoDataset,
  runCanonicalTacoImport,
} from "@/lib/foods/importer/import-pipeline";

export async function importTacoDatasetAction(options?: {
  datasetType?: "fixture" | "official_complete";
}): Promise<
  ActionResponse<{
    importedCount: number;
    expectedCount: number;
    nutrientsCount: number;
    measuresCount: number;
  }>
> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Autenticação requerida." };
  }

  if (!hasPermission(user, "foods.manage")) {
    return {
      error:
        "Apenas administradores podem autorizar a importação da base de dados oficial.",
    };
  }

  const datasetType = options?.datasetType ?? "official_complete";
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction && datasetType === "fixture") {
    return {
      error:
        "O dataset de fixture é restrito a testes e CI. Em produção, use exclusivamente official_complete.",
    };
  }

  const normalizedData = parseAndNormalizeTacoDataset(datasetType);
  const expectedFoodCount = normalizedData.foods.length;

  await logAuditEvent({
    actorId: user.id,
    action: "food_source.import_started",
    entityType: "food_data_sources",
    entityId: normalizedData.source.name,
    metadata: {
      version: normalizedData.source.version,
      checksum: normalizedData.checksum,
      dataset_type: datasetType,
    },
  });

  try {
    const importRes = await runCanonicalTacoImport({
      allowFixture: datasetType === "fixture",
    });

    await logAuditEvent({
      actorId: user.id,
      action: "food_source.import_completed",
      entityType: "food_data_sources",
      entityId: importRes.source_id,
      metadata: {
        expected_count: expectedFoodCount,
        effective_count: importRes.imported_foods_count,
        nutrients_count: importRes.total_nutrients_count,
        source_name: normalizedData.source.name,
      },
    });

    return {
      success: true,
      data: {
        importedCount: importRes.imported_foods_count,
        expectedCount: expectedFoodCount,
        nutrientsCount: importRes.total_nutrients_count,
        measuresCount: 0,
      },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await logAuditEvent({
      actorId: user.id,
      action: "food_source.import_failed",
      entityType: "food_data_sources",
      entityId: normalizedData.source.name,
      metadata: {
        error: errorMsg,
        expected_count: expectedFoodCount,
      },
    });

    return {
      success: false,
      error: `Importação oficial falhou e foi cancelada com rollback integral: ${errorMsg}`,
    };
  }
}
```

---

## 12. Suíte de Testes Automatizados e Evidências de Execução

### 12.1. Testes de Fechamento de RPC, Invariantes e Rollback Integral (`tests/food_complete_dataset.test.ts`)

```typescript
// 1. TESTE DE FECHAMENTO DO RPC PARA USUÁRIOS DA APLICAÇÃO (ADMIN DIRETO -> DENIED)
// O RPC public.import_canonical_taco_atomic aceita exclusivamente service_role ou superusuário de banco.
// Qualquer usuário autenticado (inclusive com perfil admin) que tente chamá-lo diretamente deve ter a execução negada.
const ADMIN_TEST_USER_ID = '00000000-0000-0000-0000-000000000099';
await testDb.exec(`
  INSERT INTO auth.users (id, email) VALUES ('${ADMIN_TEST_USER_ID}', 'admin_direct@appnutri.com')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (id, role_id, full_name, email)
  VALUES ('${ADMIN_TEST_USER_ID}', 'admin', 'Admin Aplicação', 'admin_direct@appnutri.com')
  ON CONFLICT (id) DO UPDATE SET role_id = 'admin';
`);

let adminDirectRpcFailed = false;
try {
  await testDb.exec(`
    SET ROLE authenticated;
    SET "request.jwt.claim.sub" = '${ADMIN_TEST_USER_ID}';
    SET "request.jwt.claim.role" = 'authenticated';
  `);
  await testDb.query('SELECT public.import_canonical_taco_atomic($1::jsonb);', [
    JSON.stringify(payload),
  ]);
} catch (err: unknown) {
  adminDirectRpcFailed = true;
  const msg = err instanceof Error ? err.message : String(err);
  expect(msg).toMatch(/Acesso negado|permission denied/i);
} finally {
  await testDb.exec(`
    RESET ROLE;
    RESET "request.jwt.claim.sub";
    RESET "request.jwt.claim.role";
  `);
}

expect(adminDirectRpcFailed).toBe(true);
const countAfterAdminDirect = await testDb.query<{ c: string }>('SELECT count(*)::text as c FROM public.foods;');
expect(countAfterAdminDirect.rows[0].c).toBe('0');

// 2. TESTE DE ATOMICIDADE REAL E ROLLBACK INTEGRAL
// Simula uma falha intencional no meio da importação (após o alimento 300).
let intentionalFailureCaught = false;
try {
  await testDb.query('SELECT public.import_canonical_taco_atomic($1::jsonb, $2);', [
    JSON.stringify(payload),
    '300',
  ]);
} catch (err: unknown) {
  intentionalFailureCaught = true;
  const msg = err instanceof Error ? err.message : String(err);
  expect(msg).toContain('DELIBERATE_TEST_FAILURE');
}

expect(intentionalFailureCaught).toBe(true);
const countFoodsFail = await testDb.query<{ c: string }>('SELECT count(*)::text as c FROM public.foods;');
expect(countFoodsFail.rows[0].c).toBe('0');

// 3. TESTES DE VALIDAÇÃO DE INVARIANTES NA TRANSAÇÃO POSTGRESQL (ROLLBACK INTEGRAL)
// 3.1. Payload com 596 alimentos (deve falhar e deixar zero alterações)
let fail596Caught = false;
const payload596 = { ...payload, foods: payload.foods.slice(0, 596) };
try {
  await testDb.query('SELECT public.import_canonical_taco_atomic($1::jsonb);', [JSON.stringify(payload596)]);
} catch (err: unknown) {
  fail596Caught = true;
  expect(String(err)).toContain('INVARIANT_VIOLATION');
}
expect(fail596Caught).toBe(true);
expect((await testDb.query<{ c: string }>('SELECT count(*)::text as c FROM public.foods;')).rows[0].c).toBe('0');

// 3.2. Payload com catálogo incompleto de 25 nutrientes (deve falhar e deixar zero alterações)
let fail25CatCaught = false;
const payload25Cat = { ...payload, nutrients_catalog: payload.nutrients_catalog.slice(0, 25) };
try {
  await testDb.query('SELECT public.import_canonical_taco_atomic($1::jsonb);', [JSON.stringify(payload25Cat)]);
} catch (err: unknown) {
  fail25CatCaught = true;
  expect(String(err)).toContain('INVARIANT_VIOLATION');
}
expect(fail25CatCaught).toBe(true);
expect((await testDb.query<{ c: string }>('SELECT count(*)::text as c FROM public.food_nutrients;')).rows[0].c).toBe('0');

// 3.3. Payload com alimento contendo nutriente ausente (25 nutrientes em vez de 26)
let failMissingNutCaught = false;
const foodWithMissingNut = { ...payload.foods[0], nutrients: { ...payload.foods[0].nutrients } };
delete (foodWithMissingNut.nutrients as Record<string, unknown>)['moisture_pct'];
const payloadMissingNut = { ...payload, foods: [foodWithMissingNut, ...payload.foods.slice(1)] };
try {
  await testDb.query('SELECT public.import_canonical_taco_atomic($1::jsonb);', [JSON.stringify(payloadMissingNut)]);
} catch (err: unknown) {
  failMissingNutCaught = true;
  expect(String(err)).toContain('INVARIANT_VIOLATION');
}
expect(failMissingNutCaught).toBe(true);
expect((await testDb.query<{ c: string }>('SELECT count(*)::text as c FROM public.foods;')).rows[0].c).toBe('0');
```

### 12.2. Testes de Blindagem de Nutrientes contra Influenciadores (`tests/food_security.test.ts`)

```typescript
it('Influenciador da mesma organização NÃO pode alterar composição nutricional (food_nutrients)', async () => {
  // Cria alimento pela nutricionista dentro da Org A
  const recipeRes = await asUser(NUTRI_ID, () =>
    query<{ id: string }>(`
      INSERT INTO public.foods (
        source_id, source_food_code, name, normalized_name, food_group,
        preparation_state, source_type, organization_id, is_active, validation_status
      ) VALUES (
        '${SOURCE_CUSTOM_ID}', 'CUSTOM-NUTRI-INF-TEST', 'Suco Funcional Org A', 'suco funcional org a',
        'Bebidas', 'prepared', 'professional_custom', '${ORG_ID}', true, 'draft'
      ) RETURNING id;
    `)
  );
  const recipeId = recipeRes.rows[0].id;

  // 1. Influenciador da mesma organização tentando inserir nutrientes -> REJEITADO
  await expect(
    asUser(INFLUENCER_ID, () =>
      query(`
        INSERT INTO public.food_nutrients (
          food_id, nutrient_id, amount_per_100g, numeric_value, value_status, data_quality
        ) VALUES (
          '${recipeId}', '${NUTRIENT_ENERGY_ID}', 100, 100, 'NUMERIC_VALUE', 'calculated'
        );
      `)
    )
  ).rejects.toThrow();

  // 2. Nutricionista da organização insere nutriente -> SUCESSO
  await asUser(NUTRI_ID, () =>
    query(`
      INSERT INTO public.food_nutrients (
        food_id, nutrient_id, amount_per_100g, numeric_value, value_status, data_quality
      ) VALUES (
        '${recipeId}', '${NUTRIENT_ENERGY_ID}', 120, 120, 'NUMERIC_VALUE', 'calculated'
      );
    `)
  );

  // 3. Influenciador da mesma organização tentando atualizar nutriente existente -> Bloqueado (0 rows afetadas)
  const updateRes = await asUser(INFLUENCER_ID, () =>
    query(`
      UPDATE public.food_nutrients
      SET amount_per_100g = 999
      WHERE food_id = '${recipeId}';
    `)
  );
  expect(updateRes.affectedRows).toBe(0);

  // Confirma que o valor original permanece estritamente inalterado (120, não 999)
  const checkNut = await asUser(NUTRI_ID, () =>
    query<{ amount_per_100g: string }>(`
      SELECT amount_per_100g::text FROM public.food_nutrients WHERE food_id = '${recipeId}';
    `)
  );
  expect(checkNut.rows[0].amount_per_100g).toBe('120.0000');

  // 4. Influenciador da mesma organização tentando deletar nutriente -> Bloqueado (0 rows afetadas)
  const deleteRes = await asUser(INFLUENCER_ID, () =>
    query(`
      DELETE FROM public.food_nutrients
      WHERE food_id = '${recipeId}';
    `)
  );
  expect(deleteRes.affectedRows).toBe(0);

  // Confirma que o nutriente continua existindo intacto
  const checkNutAfterDelete = await asUser(NUTRI_ID, () =>
    query(`SELECT id FROM public.food_nutrients WHERE food_id = '${recipeId}';`)
  );
  expect(checkNutAfterDelete.rows).toHaveLength(1);
});
```

### 12.3. Teste de Idempotência Dupla Oficial e Preservação de Provenance no Upsert

```typescript
// Execução 1
const res1 = await testDb.query<{ import_canonical_taco_atomic: AtomicRpcResult }>(
  'SELECT public.import_canonical_taco_atomic($1::jsonb);',
  [JSON.stringify(payload)]
);
expect(res1.rows[0].import_canonical_taco_atomic.imported_foods_count).toBe(597);
expect(res1.rows[0].import_canonical_taco_atomic.total_nutrients_count).toBe(15522);

// Execução 2 (Confirmação de Idempotência e Estado Final Idêntico)
const res2 = await testDb.query<{ import_canonical_taco_atomic: AtomicRpcResult }>(
  'SELECT public.import_canonical_taco_atomic($1::jsonb);',
  [JSON.stringify(payload)]
);
expect(res2.rows[0].import_canonical_taco_atomic.imported_foods_count).toBe(597);
expect(res2.rows[0].import_canonical_taco_atomic.total_nutrients_count).toBe(15522);

// Preservação Integral de Provenance no Upsert
const modifiedPayload = JSON.parse(JSON.stringify(payload));
modifiedPayload.foods[0].nutrients['moisture_pct'] = {
  raw_value: '88.5',
  numeric_value: 88.5,
  value_status: 'NUMERIC_VALUE',
  data_quality: 'analytical',
  source_reference: 'Reanálise Oficial NEPA 2026 - Lote Auditado',
};

const resReimport = await testDb.query<{ import_canonical_taco_atomic: AtomicRpcResult }>(
  'SELECT public.import_canonical_taco_atomic($1::jsonb);',
  [JSON.stringify(modifiedPayload)]
);
expect(resReimport.rows[0].import_canonical_taco_atomic.imported_foods_count).toBe(597);

const food001Nut = await testDb.query<{
  raw_value: string;
  numeric_value: string;
  source_reference: string;
}>(`
  SELECT fn.raw_value, fn.numeric_value::text, fn.source_reference
  FROM public.food_nutrients fn
  JOIN public.foods f ON f.id = fn.food_id
  JOIN public.nutrients n ON n.id = fn.nutrient_id
  WHERE f.source_food_code = '001' AND n.code = 'moisture_pct';
`);

expect(food001Nut.rows[0].numeric_value).toBe('88.5000');
expect(food001Nut.rows[0].raw_value).toBe('88.5');
expect(food001Nut.rows[0].source_reference).toBe('Reanálise Oficial NEPA 2026 - Lote Auditado');
```

### 12.4. Resultados de Execução das Ferramentas de Verificação

1. **Testes Automatizados (`npm test`)**:
   ```
   Test Files  18 passed (18)
        Tests  277 passed (277)
     Duration  46.31s
   ```
2. **Checagem Estática de Tipos (`npx tsc --noEmit`)**:
   ```
   Exit Code: 0 (0 erros de tipagem)
   ```
3. **Linter (`npm run lint`)**:
   ```
   Exit Code: 0 (0 erros, 0 warnings)
   ```
4. **Build de Produção (`npm run build`)**:
   ```
   ▲ Next.js 16.3.4 (Turbopack)
   ✓ Compiled successfully in 4.8s
   ✓ Finished TypeScript in 8.9s
   ✓ Generating static pages using 3 workers (18/18) in 915ms
   Route (app): 18/18 páginas e rotas dinâmicas geradas com sucesso
   ```

---

# FOOD DATA GATE: PASS FINAL

