-- ==============================================================================
-- MIGRATION: 20260908000010_deterministic_nutrition_engine.sql
-- DESCRIPTION: Deterministic Nutrition Engine (Runs & Targets), Provenance & Safety
--              Screening, Professional Clinical Notes, Security Definer Auth & RLS
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. CLINICAL DATA PROVENANCE & SAFETY SCREENING FLAGS
-- ------------------------------------------------------------------------------

-- Adiciona campos de triagem de segurança relatados pelo paciente na tabela sensível
ALTER TABLE public.patient_nutrition_sensitive
    ADD COLUMN IF NOT EXISTS is_pregnant BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_breastfeeding BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS has_eating_disorder_history BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS has_severe_allergies BOOLEAN NOT NULL DEFAULT FALSE;

-- Tabela exclusiva para anotações e condutas do nutricionista (paciente não pode apagar nem sobrescrever)
CREATE TABLE IF NOT EXISTS public.patient_professional_clinical_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    professional_id UUID NOT NULL REFERENCES public.profiles(id),
    clinical_notes TEXT NOT NULL,
    recommended_caloric_adjustment_kcal NUMERIC(6,2),
    recommended_protein_g_per_kg NUMERIC(4,2),
    requires_special_attention BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now())
);

CREATE INDEX IF NOT EXISTS idx_professional_notes_patient ON public.patient_professional_clinical_notes(patient_id);

COMMENT ON TABLE public.patient_professional_clinical_notes IS 'Dedicated clinical notes created by licensed nutritionists that patients cannot overwrite or delete.';

-- ------------------------------------------------------------------------------
-- 2. NUTRITION_ENGINE_RUNS (Deterministic Engine Execution Records)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nutrition_engine_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    nutrition_snapshot_id UUID NOT NULL REFERENCES public.patient_nutrition_snapshots(id) ON DELETE CASCADE,
    sensitive_snapshot_id UUID REFERENCES public.patient_nutrition_sensitive_snapshots(id) ON DELETE SET NULL,
    engine_version TEXT NOT NULL,
    config_version TEXT NOT NULL DEFAULT 'config-1.0.0',
    status TEXT NOT NULL CHECK (status IN ('calculated', 'insufficient_data', 'review_required', 'blocked', 'superseded')),
    requires_professional_review BOOLEAN NOT NULL DEFAULT FALSE,
    review_reason_codes TEXT[] NOT NULL DEFAULT '{}',
    clinical_review_notes TEXT,
    input_hash TEXT NOT NULL,
    output_hash TEXT NOT NULL,
    calculated_by UUID REFERENCES public.profiles(id),
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now())
);

CREATE INDEX IF NOT EXISTS idx_engine_runs_patient ON public.nutrition_engine_runs(patient_id);
CREATE INDEX IF NOT EXISTS idx_engine_runs_status ON public.nutrition_engine_runs(status);
CREATE INDEX IF NOT EXISTS idx_engine_runs_input_hash ON public.nutrition_engine_runs(input_hash);
CREATE INDEX IF NOT EXISTS idx_engine_runs_created_at ON public.nutrition_engine_runs(created_at DESC);

COMMENT ON TABLE public.nutrition_engine_runs IS 'Immutable audit records of deterministic nutrition engine executions.';

-- ------------------------------------------------------------------------------
-- 3. NUTRITION_TARGETS (Deterministic Macro, Caloric & Constraint Targets)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nutrition_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engine_run_id UUID NOT NULL REFERENCES public.nutrition_engine_runs(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    
    -- BMR & TDEE
    estimated_bmr_kcal NUMERIC(7,2) NOT NULL,
    bmr_formula TEXT NOT NULL DEFAULT 'mifflin_st_jeor',
    bmr_formula_version TEXT NOT NULL DEFAULT '1.0.0',
    activity_level TEXT NOT NULL,
    activity_factor NUMERIC(4,3) NOT NULL,
    estimated_tdee_kcal NUMERIC(7,2) NOT NULL,
    
    -- Alvos Energéticos e Faixas
    primary_goal TEXT NOT NULL,
    desired_rate_of_change TEXT,
    goal_adjustment_kcal NUMERIC(6,2) NOT NULL,
    target_calories_nominal_kcal NUMERIC(7,2) NOT NULL,
    target_calories_min_kcal NUMERIC(7,2) NOT NULL,
    target_calories_max_kcal NUMERIC(7,2) NOT NULL,
    
    -- Macronutrientes (g, kcal, %)
    protein_g NUMERIC(6,2) NOT NULL,
    carbohydrate_g NUMERIC(6,2) NOT NULL,
    fat_g NUMERIC(6,2) NOT NULL,
    protein_kcal NUMERIC(7,2) NOT NULL,
    carbohydrate_kcal NUMERIC(7,2) NOT NULL,
    fat_kcal NUMERIC(7,2) NOT NULL,
    protein_percentage NUMERIC(5,2) NOT NULL,
    carbohydrate_percentage NUMERIC(5,2) NOT NULL,
    fat_percentage NUMERIC(5,2) NOT NULL,
    
    -- Refeições
    desired_meals_per_day INT NOT NULL,
    calories_per_meal_average NUMERIC(6,2) NOT NULL,
    
    -- Orçamento Normalizado
    normalized_daily_budget NUMERIC(8,2) NOT NULL,
    normalized_weekly_budget NUMERIC(8,2) NOT NULL,
    normalized_monthly_budget NUMERIC(8,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'BRL',
    budget_estimate_type TEXT NOT NULL CHECK (budget_estimate_type IN ('individual_exact', 'household_proportional')),
    
    -- Constraints Estruturadas & Confiança
    calculation_confidence NUMERIC(3,2) NOT NULL DEFAULT 1.00,
    constraints_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now())
);

CREATE INDEX IF NOT EXISTS idx_nutrition_targets_run ON public.nutrition_targets(engine_run_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_targets_patient ON public.nutrition_targets(patient_id);

COMMENT ON TABLE public.nutrition_targets IS 'Structured caloric, macronutrient and constraint outputs from the nutrition engine.';

-- ------------------------------------------------------------------------------
-- 4. PERMISSIONS & RBAC SEEDING
-- ------------------------------------------------------------------------------
INSERT INTO public.permissions (id, name, module, description)
VALUES
    ('nutrition_engine.run', 'Executar Motor Nutricional', 'nutrition', 'Permite acionar o cálculo nutricional determinístico para um paciente'),
    ('nutrition_engine.view', 'Visualizar Resultados do Motor', 'nutrition', 'Permite visualizar metas calóricas e de macronutrientes geradas'),
    ('nutrition_engine.review', 'Revisar Casos Clínicos do Motor', 'nutrition', 'Permite aprovar e revisar casos sinalizados com review_required')
ON CONFLICT (id) DO NOTHING;

-- Admin recebe todas
INSERT INTO public.role_permissions (role_id, permission_id)
VALUES
    ('admin', 'nutrition_engine.run'),
    ('admin', 'nutrition_engine.view'),
    ('admin', 'nutrition_engine.review')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Nutricionista recebe todas
INSERT INTO public.role_permissions (role_id, permission_id)
VALUES
    ('nutritionist', 'nutrition_engine.run'),
    ('nutritionist', 'nutrition_engine.view'),
    ('nutritionist', 'nutrition_engine.review')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Influenciador recebe APENAS visualização de resumo (sem permissão clínica de execução nem revisão)
INSERT INTO public.role_permissions (role_id, permission_id)
VALUES
    ('influencer', 'nutrition_engine.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Paciente visualiza suas próprias metas
INSERT INTO public.role_permissions (role_id, permission_id)
VALUES
    ('patient', 'nutrition_engine.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 5. SECURITY DEFINER AUTHORIZATION FUNCTIONS (SCHEMA PRIVATE)
-- ------------------------------------------------------------------------------

-- 5.1. CAN_VIEW_ENGINE_RUN
-- Permite visualização geral: Paciente (próprio), Admin e Profissional com vínculo ativo (Nutri ou Influencer)
CREATE OR REPLACE FUNCTION private.can_view_engine_run(viewer_id UUID, p_patient_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF viewer_id = p_patient_id THEN
        RETURN TRUE;
    END IF;

    IF private.is_admin(viewer_id) THEN
        RETURN TRUE;
    END IF;

    IF private.can_access_patient(viewer_id, p_patient_id) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;

-- 5.2. CAN_VIEW_ENGINE_CLINICAL_DETAILS
-- Permite visualização clínica sensível (reason codes médicos, notas clínicas):
-- Paciente (próprio), Admin e Nutricionista vinculado ativo.
-- INFLUENCIADOR RETORNA FALSE!
CREATE OR REPLACE FUNCTION private.can_view_engine_clinical_details(viewer_id UUID, p_patient_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF viewer_id = p_patient_id THEN
        RETURN TRUE;
    END IF;

    IF private.is_admin(viewer_id) THEN
        RETURN TRUE;
    END IF;

    IF private.can_access_patient(viewer_id, p_patient_id) THEN
        IF EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = viewer_id AND p.role_id = 'nutritionist'
        ) THEN
            RETURN TRUE;
        END IF;
    END IF;

    RETURN FALSE;
END;
$$;

-- 5.3. CAN_EXECUTE_ENGINE
-- Permite acionar o motor nutricional:
-- Admin e Nutricionista vinculado ativo (influenciador e paciente retornam FALSE).
CREATE OR REPLACE FUNCTION private.can_execute_engine(viewer_id UUID, p_patient_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF private.is_admin(viewer_id) THEN
        RETURN TRUE;
    END IF;

    IF private.can_access_patient(viewer_id, p_patient_id) THEN
        IF EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = viewer_id AND p.role_id = 'nutritionist'
        ) THEN
            RETURN TRUE;
        END IF;
    END IF;

    RETURN FALSE;
END;
$$;

-- 5.4. CAN_REVIEW_ENGINE
-- Permite aprovar ou revisar cálculos sinalizados:
-- Admin e Nutricionista vinculado ativo (influenciador e paciente retornam FALSE).
CREATE OR REPLACE FUNCTION private.can_review_engine(viewer_id UUID, p_patient_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF private.is_admin(viewer_id) THEN
        RETURN TRUE;
    END IF;

    IF private.can_access_patient(viewer_id, p_patient_id) THEN
        IF EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = viewer_id AND p.role_id = 'nutritionist'
        ) THEN
            RETURN TRUE;
        END IF;
    END IF;

    RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION private.can_view_engine_run(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_view_engine_clinical_details(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_execute_engine(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_review_engine(UUID, UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE public.patient_professional_clinical_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_engine_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_targets ENABLE ROW LEVEL SECURITY;

-- 6.1. PATIENT_PROFESSIONAL_CLINICAL_NOTES
-- SELECT: Paciente (próprio), Admin e Nutricionista vinculado ativo. Influencer = 0 linhas!
CREATE POLICY "View professional clinical notes via sensitive auth function"
    ON public.patient_professional_clinical_notes FOR SELECT
    TO authenticated
    USING (private.can_view_nutrition_sensitive(auth.uid(), patient_id));

-- INSERT/UPDATE: Apenas Nutricionista vinculado ativo ou Admin. Paciente e Influencer = bloqueados!
CREATE POLICY "Insert professional clinical notes via authorized professional"
    ON public.patient_professional_clinical_notes FOR INSERT
    TO authenticated
    WITH CHECK (
        private.is_admin(auth.uid())
        OR (
            private.can_access_patient(auth.uid(), patient_id)
            AND professional_id = auth.uid()
            AND EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid() AND p.role_id = 'nutritionist'
            )
        )
    );

CREATE POLICY "Update professional clinical notes via author or admin"
    ON public.patient_professional_clinical_notes FOR UPDATE
    TO authenticated
    USING (
        private.is_admin(auth.uid())
        OR (
            professional_id = auth.uid()
            AND private.can_access_patient(auth.uid(), patient_id)
        )
    )
    WITH CHECK (
        private.is_admin(auth.uid())
        OR (
            professional_id = auth.uid()
            AND private.can_access_patient(auth.uid(), patient_id)
        )
    );

-- 6.2. NUTRITION_ENGINE_RUNS
-- SELECT: Paciente, Admin, Nutri vinculado e Influencer vinculado
CREATE POLICY "View nutrition engine runs via private function"
    ON public.nutrition_engine_runs FOR SELECT
    TO authenticated
    USING (private.can_view_engine_run(auth.uid(), patient_id));

-- INSERT: Admin ou Nutricionista vinculado ativo
CREATE POLICY "Insert nutrition engine runs via authorized executor"
    ON public.nutrition_engine_runs FOR INSERT
    TO authenticated
    WITH CHECK (private.can_execute_engine(auth.uid(), patient_id));

-- UPDATE: Apenas Admin ou Nutricionista vinculado para revisão/superseded
CREATE POLICY "Update nutrition engine runs via authorized reviewer"
    ON public.nutrition_engine_runs FOR UPDATE
    TO authenticated
    USING (private.can_review_engine(auth.uid(), patient_id))
    WITH CHECK (private.can_review_engine(auth.uid(), patient_id));

-- 6.3. NUTRITION_TARGETS
-- SELECT: Paciente, Admin, Nutri vinculado e Influencer vinculado
CREATE POLICY "View nutrition targets via private function"
    ON public.nutrition_targets FOR SELECT
    TO authenticated
    USING (private.can_view_engine_run(auth.uid(), patient_id));

-- INSERT: Admin ou Nutricionista vinculado ativo
CREATE POLICY "Insert nutrition targets via authorized executor"
    ON public.nutrition_targets FOR INSERT
    TO authenticated
    WITH CHECK (private.can_execute_engine(auth.uid(), patient_id));
