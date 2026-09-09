-- ==============================================================================
-- MIGRATION: 20260908000011_segregate_clinical_review_and_guardrails.sql
-- DESCRIPTION: Segregação Física de Reason Codes Clínicos em Tabela Dedicada,
--              Adição de Flag Estruturada de Condição Clínica, Guardrails Operacionais,
--              Auditoria de Clamping e Estratégia de Peso de Referência para Macros
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ADIÇÃO DE FLAG ESTRUTURADA DE CONDIÇÃO CLÍNICA (SEM TEXTO LIVRE)
-- ------------------------------------------------------------------------------
ALTER TABLE public.patient_nutrition_sensitive
    ADD COLUMN IF NOT EXISTS has_reported_clinical_condition BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.patient_nutrition_sensitive.has_reported_clinical_condition IS 'Flag booleana estruturada indicando se o paciente relatou condição clínica diagnosticada (não depende de parsing de texto livre).';

-- ------------------------------------------------------------------------------
-- 2. TABELA DEDICADA DE REVISÃO CLÍNICA (SEGREGAÇÃO FÍSICA DE REASON CODES)
-- ------------------------------------------------------------------------------
-- Movemos os dados clínicos/sensíveis da execução para uma tabela separada.
-- Influenciadores terão ZERO acesso a esta tabela via RLS no PostgreSQL.
CREATE TABLE IF NOT EXISTS public.nutrition_engine_clinical_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engine_run_id UUID NOT NULL UNIQUE REFERENCES public.nutrition_engine_runs(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    requires_professional_review BOOLEAN NOT NULL DEFAULT FALSE,
    clinical_reason_codes TEXT[] NOT NULL DEFAULT '{}',
    clinical_review_notes TEXT,
    reviewed_by UUID REFERENCES public.profiles(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now())
);

CREATE INDEX IF NOT EXISTS idx_clinical_reviews_patient ON public.nutrition_engine_clinical_reviews(patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_reviews_run ON public.nutrition_engine_clinical_reviews(engine_run_id);

COMMENT ON TABLE public.nutrition_engine_clinical_reviews IS 'Tabela isolada para dados de revisão clínica e reason codes médicos, acessível apenas por nutricionista vinculado ativo e paciente.';

-- Remove reason codes e notas clínicas da tabela geral nutrition_engine_runs para impedir vazamento
ALTER TABLE public.nutrition_engine_runs
    DROP COLUMN IF EXISTS review_reason_codes,
    DROP COLUMN IF EXISTS clinical_review_notes;

-- ------------------------------------------------------------------------------
-- 3. AUDITORIA DE CLAMPING, GUARDRAILS E ESTRATÉGIA DE PESO EM NUTRITION_TARGETS
-- ------------------------------------------------------------------------------
ALTER TABLE public.nutrition_targets
    ADD COLUMN IF NOT EXISTS raw_target_calories_nominal_kcal NUMERIC(7,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS target_was_clamped BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS clamp_reason TEXT,
    ADD COLUMN IF NOT EXISTS macro_reference_weight_kg NUMERIC(6,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS macro_reference_weight_strategy TEXT NOT NULL DEFAULT 'actual_weight',
    ADD COLUMN IF NOT EXISTS raw_goal_adjustment_kcal NUMERIC(6,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS goal_adjustment_percentage NUMERIC(5,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.nutrition_targets.raw_target_calories_nominal_kcal IS 'Valor calórico calculado antes da aplicação de guardrails operacionais.';
COMMENT ON COLUMN public.nutrition_targets.target_was_clamped IS 'Indica se a meta calórica nominal sofreu clamp por guardrail operacional.';
COMMENT ON COLUMN public.nutrition_targets.clamp_reason IS 'Identificador do guardrail aplicado (ex: GUARDRAIL_MIN_FLOOR_FEMALE, GUARDRAIL_MAX_CEILING).';
COMMENT ON COLUMN public.nutrition_targets.macro_reference_weight_strategy IS 'Estratégia adotada para cálculo de macros (actual_weight, adjusted_weight, etc.).';

-- ------------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) EM NUTRITION_ENGINE_CLINICAL_REVIEWS
-- ------------------------------------------------------------------------------
ALTER TABLE public.nutrition_engine_clinical_reviews ENABLE ROW LEVEL SECURITY;

-- SELECT: Paciente (próprio), Admin e Nutricionista vinculado ativo.
-- INFLUENCIADOR RETORNA FALSE (0 linhas)!
CREATE POLICY "View clinical reviews via sensitive auth function"
    ON public.nutrition_engine_clinical_reviews FOR SELECT
    TO authenticated
    USING (private.can_view_engine_clinical_details(auth.uid(), patient_id));

-- INSERT: Bloqueado diretamente para authenticated e anon.
-- Reason codes automáticos devem ser criados exclusivamente pelo motor/backend confiável (service_role).
-- Não existe policy de INSERT para authenticated, impedindo a fabricação direta de reason codes pela Data API.

-- UPDATE: Nutricionista vinculado ativo ou Admin para registrar anotações e assinatura de revisão clínica
CREATE POLICY "Update clinical reviews via authorized reviewer"
    ON public.nutrition_engine_clinical_reviews FOR UPDATE
    TO authenticated
    USING (private.can_review_engine(auth.uid(), patient_id))
    WITH CHECK (private.can_review_engine(auth.uid(), patient_id));

-- ------------------------------------------------------------------------------
-- 5. PRIVILÉGIOS E IMUTABILIDADE DE REASON CODES CLÍNICOS
-- ------------------------------------------------------------------------------
-- Revoga expressamente INSERT de authenticated e anon
REVOKE INSERT ON public.nutrition_engine_clinical_reviews FROM authenticated, anon, public;

-- Garante privilégios completos para service_role (backend confiável do motor)
GRANT ALL ON public.nutrition_engine_clinical_reviews TO service_role;

-- Nutricionista autenticado pode atualizar apenas notas clínicas e metadados de revisão
REVOKE UPDATE ON public.nutrition_engine_clinical_reviews FROM authenticated;
GRANT UPDATE (clinical_review_notes, reviewed_by, reviewed_at) ON public.nutrition_engine_clinical_reviews TO authenticated;

-- Trigger para garantir imutabilidade estrita dos reason codes e identificadores contra qualquer tentativa de alteração
CREATE OR REPLACE FUNCTION private.enforce_clinical_review_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.clinical_reason_codes IS DISTINCT FROM OLD.clinical_reason_codes THEN
        RAISE EXCEPTION 'Os reason codes clínicos foram gerados automaticamente pelo motor nutricional e são imutáveis.';
    END IF;
    IF NEW.engine_run_id IS DISTINCT FROM OLD.engine_run_id THEN
        RAISE EXCEPTION 'engine_run_id é imutável.';
    END IF;
    IF NEW.patient_id IS DISTINCT FROM OLD.patient_id THEN
        RAISE EXCEPTION 'patient_id é imutável.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clinical_review_immutability ON public.nutrition_engine_clinical_reviews;
CREATE TRIGGER trg_clinical_review_immutability
    BEFORE UPDATE ON public.nutrition_engine_clinical_reviews
    FOR EACH ROW
    EXECUTE FUNCTION private.enforce_clinical_review_immutability();
