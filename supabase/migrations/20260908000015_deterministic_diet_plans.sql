-- ==============================================================================
-- MIGRATION: 20260908000015_deterministic_diet_plans.sql
-- DESCRIPTION: Arquitetura Versionada e Imutável do Motor Determinístico de Dieta,
--              Refeições, Itens com Snapshot, Avaliações Clínicas e RLS (ETAPA 6)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABELA PRINCIPAL DE PLANOS ALIMENTARES (diet_plans)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.diet_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    source_nutrition_engine_run_id UUID NOT NULL REFERENCES public.nutrition_engine_runs(id) ON DELETE RESTRICT,
    source_nutrition_target_id UUID NOT NULL REFERENCES public.nutrition_targets(id) ON DELETE RESTRICT,
    composer_version TEXT NOT NULL,
    composer_config_version TEXT NOT NULL DEFAULT 'config-1.0.0',
    food_dataset_version TEXT NOT NULL,
    food_dataset_checksum TEXT NOT NULL,
    price_engine_version TEXT NOT NULL,
    input_snapshot_hash TEXT NOT NULL,
    output_plan_hash TEXT NOT NULL,
    generation_status TEXT NOT NULL CHECK (
        generation_status IN ('calculated', 'review_required', 'infeasible', 'superseded')
    ),
    approval_status TEXT NOT NULL DEFAULT 'draft' CHECK (
        approval_status IN ('draft', 'approved', 'rejected', 'superseded')
    ),
    rejection_reason TEXT,
    infeasible_reason_codes TEXT[] NOT NULL DEFAULT '{}',
    day_count INT NOT NULL DEFAULT 7 CHECK (day_count >= 1 AND day_count <= 7),
    daily_budget_target NUMERIC(8,2),
    estimated_daily_cost NUMERIC(8,2),
    estimated_weekly_cost NUMERIC(8,2),
    budget_confidence NUMERIC(3,2) NOT NULL DEFAULT 0.00,
    budget_status TEXT NOT NULL DEFAULT 'budget_unverified' CHECK (
        budget_status IN ('within_budget', 'exceeds_budget', 'budget_unverified')
    ),
    currency TEXT NOT NULL DEFAULT 'BRL',
    price_coverage_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    version INT NOT NULL DEFAULT 1,
    superseded_by UUID REFERENCES public.diet_plans(id),
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    generation_reference_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now()),
    created_by UUID REFERENCES public.profiles(id),
    approved_by UUID REFERENCES public.profiles(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now())
);

CREATE INDEX IF NOT EXISTS idx_diet_plans_patient ON public.diet_plans(patient_id);
CREATE INDEX IF NOT EXISTS idx_diet_plans_engine_run ON public.diet_plans(source_nutrition_engine_run_id);
CREATE INDEX IF NOT EXISTS idx_diet_plans_target ON public.diet_plans(source_nutrition_target_id);
CREATE INDEX IF NOT EXISTS idx_diet_plans_status ON public.diet_plans(generation_status, approval_status);
CREATE INDEX IF NOT EXISTS idx_diet_plans_active ON public.diet_plans(patient_id, is_active);

-- Concorrência: Apenas 1 plano alimentar ativo por paciente
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_diet_plan_per_patient 
    ON public.diet_plans(patient_id) 
    WHERE is_active = TRUE;

COMMENT ON TABLE public.diet_plans IS 'Planos alimentares determinísticos e versionados derivados de NutritionTargets e restrições.';

-- ------------------------------------------------------------------------------
-- 2. DIAS DO PLANO ALIMENTAR (diet_plan_days)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.diet_plan_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    diet_plan_id UUID NOT NULL REFERENCES public.diet_plans(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week >= 1 AND day_of_week <= 7),
    day_label TEXT NOT NULL,
    target_calories_kcal NUMERIC(7,2) NOT NULL,
    target_protein_g NUMERIC(6,2) NOT NULL,
    target_carbohydrate_g NUMERIC(6,2) NOT NULL,
    target_fat_g NUMERIC(6,2) NOT NULL,
    actual_calories_kcal NUMERIC(7,2) NOT NULL,
    actual_protein_g NUMERIC(6,2) NOT NULL,
    actual_carbohydrate_g NUMERIC(6,2) NOT NULL,
    actual_fat_g NUMERIC(6,2) NOT NULL,
    actual_fiber_g NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    actual_sodium_mg NUMERIC(8,2) NOT NULL DEFAULT 0.00,
    calories_delta_pct NUMERIC(5,2) NOT NULL,
    protein_delta_pct NUMERIC(5,2) NOT NULL,
    carbohydrate_delta_pct NUMERIC(5,2) NOT NULL,
    fat_delta_pct NUMERIC(5,2) NOT NULL,
    adherence_status TEXT NOT NULL DEFAULT 'within_tolerance' CHECK (
        adherence_status IN ('within_tolerance', 'out_of_tolerance')
    ),
    estimated_cost NUMERIC(8,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now()),
    CONSTRAINT uq_diet_plan_days_plan_day UNIQUE (diet_plan_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_diet_plan_days_plan ON public.diet_plan_days(diet_plan_id);

COMMENT ON TABLE public.diet_plan_days IS 'Agregações diárias e balanço nutricional/custo para cada dia do plano alimentar.';

-- ------------------------------------------------------------------------------
-- 3. REFEIÇÕES DO PLANO (diet_meals)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.diet_meals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    diet_plan_day_id UUID NOT NULL REFERENCES public.diet_plan_days(id) ON DELETE CASCADE,
    meal_order INT NOT NULL,
    meal_type TEXT NOT NULL CHECK (
        meal_type IN ('breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper', 'custom')
    ),
    meal_name TEXT NOT NULL,
    scheduled_time TEXT,
    target_calories_kcal NUMERIC(7,2) NOT NULL,
    target_protein_g NUMERIC(6,2) NOT NULL,
    target_carbohydrate_g NUMERIC(6,2) NOT NULL,
    target_fat_g NUMERIC(6,2) NOT NULL,
    actual_calories_kcal NUMERIC(7,2) NOT NULL,
    actual_protein_g NUMERIC(6,2) NOT NULL,
    actual_carbohydrate_g NUMERIC(6,2) NOT NULL,
    actual_fat_g NUMERIC(6,2) NOT NULL,
    actual_fiber_g NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    actual_sodium_mg NUMERIC(8,2) NOT NULL DEFAULT 0.00,
    estimated_cost NUMERIC(8,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now()),
    CONSTRAINT uq_diet_meals_day_order UNIQUE (diet_plan_day_id, meal_order)
);

CREATE INDEX IF NOT EXISTS idx_diet_meals_day ON public.diet_meals(diet_plan_day_id);

COMMENT ON TABLE public.diet_meals IS 'Refeições estruturadas com horários, metas de partição calórica e totais alcançados.';

-- ------------------------------------------------------------------------------
-- 4. ITENS DA REFEIÇÃO COM SNAPSHOT IMUTÁVEL (diet_meal_items)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.diet_meal_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    diet_meal_id UUID NOT NULL REFERENCES public.diet_meals(id) ON DELETE CASCADE,
    food_id UUID NOT NULL REFERENCES public.foods(id) ON DELETE RESTRICT,
    source_id UUID REFERENCES public.food_data_sources(id),
    source_food_code TEXT NOT NULL DEFAULT '',
    item_order INT NOT NULL,
    food_name TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_version TEXT NOT NULL,
    grams NUMERIC(8,2) NOT NULL CHECK (grams > 0),
    energy_kcal NUMERIC(8,2) NOT NULL,
    protein_g NUMERIC(8,2) NOT NULL,
    carbohydrate_g NUMERIC(8,2) NOT NULL,
    fat_g NUMERIC(8,2) NOT NULL,
    fiber_g NUMERIC(8,2),
    sodium_mg NUMERIC(8,2),
    household_measure_label TEXT,
    household_measure_quantity NUMERIC(6,2),
    price_estimate NUMERIC(10,4),
    price_confidence NUMERIC(3,2) NOT NULL DEFAULT 0.00,
    price_source_level TEXT NOT NULL DEFAULT 'unknown',
    currency TEXT NOT NULL DEFAULT 'BRL',
    composition_snapshot_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now()),
    CONSTRAINT uq_diet_meal_items_meal_order UNIQUE (diet_meal_id, item_order)
);

CREATE INDEX IF NOT EXISTS idx_diet_meal_items_meal ON public.diet_meal_items(diet_meal_id);
CREATE INDEX IF NOT EXISTS idx_diet_meal_items_food ON public.diet_meal_items(food_id);

COMMENT ON TABLE public.diet_meal_items IS 'Itens da refeição com verdade canônica estrita em gramas e snapshot imutável de composição e preço.';

-- ------------------------------------------------------------------------------
-- 5. AUDITORIA E REVISÃO CLÍNICA DE PLANOS (diet_plan_reviews)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.diet_plan_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    diet_plan_id UUID NOT NULL REFERENCES public.diet_plans(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES public.profiles(id),
    decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected', 'modified')),
    review_notes TEXT,
    changes_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now())
);

CREATE INDEX IF NOT EXISTS idx_diet_plan_reviews_plan ON public.diet_plan_reviews(diet_plan_id);
CREATE INDEX IF NOT EXISTS idx_diet_plan_reviews_reviewer ON public.diet_plan_reviews(reviewer_id);

COMMENT ON TABLE public.diet_plan_reviews IS 'Trilha de auditoria das decisões clínicas de aprovação, rejeição ou edição por profissionais.';

-- ------------------------------------------------------------------------------
-- 6. PERMISSÕES E RBAC (public.permissions & public.role_permissions)
-- ------------------------------------------------------------------------------
INSERT INTO public.permissions (id, name, module, description)
VALUES
    ('diet_plan.generate', 'Gerar Plano Alimentar', 'diet', 'Permite gerar planos alimentares determinísticos para pacientes'),
    ('diet_plan.view', 'Visualizar Plano Alimentar', 'diet', 'Permite visualizar plano alimentar ativo e histórico'),
    ('diet_plan.review', 'Revisar e Aprovar Plano', 'diet', 'Permite aprovar, rejeitar ou liberar planos marcados com review_required'),
    ('diet_plan.edit', 'Editar Itens do Plano', 'diet', 'Permite que nutricionistas editem refeições gerando nova versão auditada')
ON CONFLICT (id) DO NOTHING;

-- Admin recebe todas as permissões
INSERT INTO public.role_permissions (role_id, permission_id)
VALUES
    ('admin', 'diet_plan.generate'),
    ('admin', 'diet_plan.view'),
    ('admin', 'diet_plan.review'),
    ('admin', 'diet_plan.edit')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Nutricionista recebe todas as permissões clínicas
INSERT INTO public.role_permissions (role_id, permission_id)
VALUES
    ('nutritionist', 'diet_plan.generate'),
    ('nutritionist', 'diet_plan.view'),
    ('nutritionist', 'diet_plan.review'),
    ('nutritionist', 'diet_plan.edit')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Paciente visualiza somente seu próprio plano
INSERT INTO public.role_permissions (role_id, permission_id)
VALUES
    ('patient', 'diet_plan.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Influenciador NÃO RECEBE NENHUMA PERMISSÃO CLÍNICA de dieta!
-- Apenas permissões operacionais previamente concedidas.

-- ------------------------------------------------------------------------------
-- 7. FUNÇÕES DE SEGURANÇA DEFINER (SCHEMA private)
-- ------------------------------------------------------------------------------

-- 7.1. CAN_VIEW_DIET_PLAN
-- Define quem pode visualizar um plano alimentar específico:
-- - Paciente: somente se for o dono E (plano aprovado OU draft calculado sem review_required).
-- - Nutricionista vinculada ativa: sempre que tiver vínculo ativo com o paciente.
-- - Admin: sempre.
-- - Influenciador: NUNCA possui acesso clínico a planos detalhados de pacientes.
CREATE OR REPLACE FUNCTION private.can_view_diet_plan(viewer_id UUID, p_diet_plan_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_patient_id UUID;
    v_approval_status TEXT;
    v_generation_status TEXT;
    v_is_active BOOLEAN;
    v_role_name TEXT;
BEGIN
    SELECT patient_id, approval_status, generation_status, is_active
    INTO v_patient_id, v_approval_status, v_generation_status, v_is_active
    FROM public.diet_plans
    WHERE id = p_diet_plan_id;

    IF v_patient_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- 1. Admin sempre visualiza
    IF private.is_admin(viewer_id) THEN
        RETURN TRUE;
    END IF;

    -- 2. Paciente Dono do Plano (relação real auth.users -> profiles -> patients):
    IF EXISTS (
        SELECT 1 
        FROM public.patients pat
        JOIN public.profiles pr ON pr.id = pat.id
        WHERE pat.id = v_patient_id 
          AND pr.id = viewer_id
    ) THEN
        -- O paciente visualiza estritamente planos aprovados e ativos.
        -- Estado ambíguo de 'draft visível' ou 'review_required' é estritamente proibido!
        IF v_approval_status = 'approved' AND v_is_active = TRUE THEN
            RETURN TRUE;
        END IF;

        RETURN FALSE;
    END IF;

    -- 3. Profissional com vínculo ativo:
    IF private.can_access_patient(viewer_id, v_patient_id) THEN
        SELECT p.role_id INTO v_role_name
        FROM public.profiles p
        WHERE p.id = viewer_id;

        -- Apenas Nutricionista licenciada vinculada tem acesso clínico!
        IF v_role_name = 'nutritionist' THEN
            RETURN TRUE;
        END IF;
    END IF;

    RETURN FALSE;
END;
$$;

-- 7.2. CAN_MANAGE_DIET_PLAN
-- Permite aprovar, rejeitar ou editar um plano:
-- Apenas Admin ou Nutricionista vinculada ativa.
CREATE OR REPLACE FUNCTION private.can_manage_diet_plan(viewer_id UUID, p_diet_plan_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_patient_id UUID;
    v_role_name TEXT;
BEGIN
    SELECT patient_id INTO v_patient_id
    FROM public.diet_plans
    WHERE id = p_diet_plan_id;

    IF v_patient_id IS NULL THEN
        RETURN FALSE;
    END IF;

    IF private.is_admin(viewer_id) THEN
        RETURN TRUE;
    END IF;

    IF private.can_access_patient(viewer_id, v_patient_id) THEN
        SELECT p.role_id INTO v_role_name
        FROM public.profiles p
        WHERE p.id = viewer_id;

        IF v_role_name = 'nutritionist' THEN
            RETURN TRUE;
        END IF;
    END IF;

    RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION private.can_view_diet_plan(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_diet_plan(UUID, UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 8. TRIGGER DE IMUTABILIDADE DE PLANOS ALIMENTARES E ITENS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.check_diet_plan_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role TEXT;
BEGIN
    v_role := COALESCE(current_setting('request.jwt.claim.role', true), '');

    -- Bypass confiável para backend / service_role
    IF v_role IN ('service_role', 'supabase_admin') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF session_user IN ('postgres', 'supabase_admin')
       AND COALESCE(current_setting('role', true), 'none') = 'none'
       AND v_role = '' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Proíbe alteração de hashes de input/output, alvos de origem e composição
        IF NEW.input_snapshot_hash <> OLD.input_snapshot_hash OR
           NEW.output_plan_hash <> OLD.output_plan_hash OR
           NEW.source_nutrition_engine_run_id <> OLD.source_nutrition_engine_run_id OR
           NEW.source_nutrition_target_id <> OLD.source_nutrition_target_id OR
           NEW.food_dataset_checksum <> OLD.food_dataset_checksum OR
           NEW.version <> OLD.version THEN
            RAISE EXCEPTION 'Adulteração de hashes ou metadados de proveniência de plano alimentar é estritamente proibida.';
        END IF;

        IF OLD.approval_status IN ('approved', 'superseded') THEN
            IF NEW.day_count <> OLD.day_count OR
               NEW.patient_id <> OLD.patient_id THEN
                RAISE EXCEPTION 'Cannot modify existing diet plan. Approved plans are immutable; create a new version.';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.approval_status = 'approved' THEN
            RAISE EXCEPTION 'Exclusão de plano alimentar clínico aprovado é terminantemente proibida. O plano deve ser marcado como superseded.';
        END IF;
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_diet_plan_immutability ON public.diet_plans;
CREATE TRIGGER trg_diet_plan_immutability
    BEFORE UPDATE OR DELETE ON public.diet_plans
    FOR EACH ROW
    EXECUTE FUNCTION private.check_diet_plan_immutability();

CREATE OR REPLACE FUNCTION private.check_diet_meal_item_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role TEXT;
    v_plan_approval_status TEXT;
BEGIN
    v_role := COALESCE(current_setting('request.jwt.claim.role', true), '');

    -- Bypass confiável para backend / service_role
    IF v_role IN ('service_role', 'supabase_admin') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF session_user IN ('postgres', 'supabase_admin')
       AND COALESCE(current_setting('role', true), 'none') = 'none'
       AND v_role = '' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT dp.approval_status INTO v_plan_approval_status
    FROM public.diet_meals dm
    JOIN public.diet_plan_days dpd ON dpd.id = dm.diet_plan_day_id
    JOIN public.diet_plans dp ON dp.id = dpd.diet_plan_id
    WHERE dm.id = COALESCE(OLD.diet_meal_id, NEW.diet_meal_id);

    IF v_plan_approval_status IN ('approved', 'superseded') THEN
        RAISE EXCEPTION 'Cannot modify items of existing diet plan. Approved plans are immutable; create a new version.';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_diet_meal_items_immutability ON public.diet_meal_items;
CREATE TRIGGER trg_diet_meal_items_immutability
    BEFORE UPDATE OR DELETE ON public.diet_meal_items
    FOR EACH ROW
    EXECUTE FUNCTION private.check_diet_meal_item_immutability();

-- ------------------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE public.diet_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diet_plan_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diet_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diet_meal_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diet_plan_reviews ENABLE ROW LEVEL SECURITY;

-- 9.1. DIET_PLANS
CREATE POLICY "View diet plans via authorization function"
    ON public.diet_plans FOR SELECT
    TO authenticated
    USING (private.can_view_diet_plan(auth.uid(), id));

CREATE POLICY "Insert diet plans via authorized executor or service role"
    ON public.diet_plans FOR INSERT
    TO authenticated
    WITH CHECK (
        private.is_admin(auth.uid())
        OR private.can_execute_engine(auth.uid(), patient_id)
    );

CREATE POLICY "Update diet plans via authorized clinical manager"
    ON public.diet_plans FOR UPDATE
    TO authenticated
    USING (private.can_manage_diet_plan(auth.uid(), id))
    WITH CHECK (private.can_manage_diet_plan(auth.uid(), id));

-- 9.2. DIET_PLAN_DAYS
CREATE POLICY "View diet plan days via plan access"
    ON public.diet_plan_days FOR SELECT
    TO authenticated
    USING (private.can_view_diet_plan(auth.uid(), diet_plan_id));

CREATE POLICY "Manage diet plan days via plan management"
    ON public.diet_plan_days FOR ALL
    TO authenticated
    USING (private.can_manage_diet_plan(auth.uid(), diet_plan_id))
    WITH CHECK (private.can_manage_diet_plan(auth.uid(), diet_plan_id));

-- 9.3. DIET_MEALS
CREATE POLICY "View diet meals via plan access"
    ON public.diet_meals FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.diet_plan_days dpd
            WHERE dpd.id = diet_plan_day_id
              AND private.can_view_diet_plan(auth.uid(), dpd.diet_plan_id)
        )
    );

CREATE POLICY "Manage diet meals via plan management"
    ON public.diet_meals FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.diet_plan_days dpd
            WHERE dpd.id = diet_plan_day_id
              AND private.can_manage_diet_plan(auth.uid(), dpd.diet_plan_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.diet_plan_days dpd
            WHERE dpd.id = diet_plan_day_id
              AND private.can_manage_diet_plan(auth.uid(), dpd.diet_plan_id)
        )
    );

-- 9.4. DIET_MEAL_ITEMS
CREATE POLICY "View diet meal items via plan access"
    ON public.diet_meal_items FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.diet_meals dm
            JOIN public.diet_plan_days dpd ON dpd.id = dm.diet_plan_day_id
            WHERE dm.id = diet_meal_id
              AND private.can_view_diet_plan(auth.uid(), dpd.diet_plan_id)
        )
    );

CREATE POLICY "Manage diet meal items via plan management"
    ON public.diet_meal_items FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.diet_meals dm
            JOIN public.diet_plan_days dpd ON dpd.id = dm.diet_plan_day_id
            WHERE dm.id = diet_meal_id
              AND private.can_manage_diet_plan(auth.uid(), dpd.diet_plan_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.diet_meals dm
            JOIN public.diet_plan_days dpd ON dpd.id = dm.diet_plan_day_id
            WHERE dm.id = diet_meal_id
              AND private.can_manage_diet_plan(auth.uid(), dpd.diet_plan_id)
        )
    );

-- 9.5. DIET_PLAN_REVIEWS
CREATE POLICY "View diet plan reviews via plan access"
    ON public.diet_plan_reviews FOR SELECT
    TO authenticated
    USING (private.can_view_diet_plan(auth.uid(), diet_plan_id));

CREATE POLICY "Insert diet plan reviews via authorized manager"
    ON public.diet_plan_reviews FOR INSERT
    TO authenticated
    WITH CHECK (
        reviewer_id = auth.uid()
        AND private.can_manage_diet_plan(auth.uid(), diet_plan_id)
    );

-- Permissões para service_role (usado pelo backend confiável)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT ALL ON TABLE public.diet_plans TO service_role;
        GRANT ALL ON TABLE public.diet_plan_days TO service_role;
        GRANT ALL ON TABLE public.diet_meals TO service_role;
        GRANT ALL ON TABLE public.diet_meal_items TO service_role;
        GRANT ALL ON TABLE public.diet_plan_reviews TO service_role;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 10. RPC TRANSACIONAL ATÔMICO DE PERSISTÊNCIA E SUPERSEDING (Item 12)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.persist_diet_plan_atomic(
    p_plan JSONB,
    p_auto_approve BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_plan_id UUID;
    v_patient_id UUID;
    v_run_id UUID;
    v_target_id UUID;
    v_gen_status TEXT;
    v_approval_status TEXT;
    v_is_active BOOLEAN;
    v_run_patient_id UUID;
    v_run_status TEXT;
    v_target_patient_id UUID;
    v_target_run_id UUID;
    v_day RECORD;
    v_day_id UUID;
    v_meal RECORD;
    v_meal_id UUID;
    v_item RECORD;
    v_role TEXT;
BEGIN
    -- 0. Autorização estrita idêntica ao importador TACO:
    -- Apenas service_role, supabase_admin ou superusuário de banco direto (testes/manutenção)
    v_role := COALESCE(current_setting('request.jwt.claim.role', true), '');
    IF v_role IN ('service_role', 'supabase_admin') THEN
        -- Permitido (backend confiável)
    ELSIF session_user IN ('postgres', 'supabase_admin') AND COALESCE(current_setting('role', true), 'none') = 'none' AND v_role = '' THEN
        -- Permitido (conexão de manutenção / superusuário de banco)
    ELSE
        RAISE EXCEPTION 'Acesso negado: public.persist_diet_plan_atomic aceita exclusivamente chamadas via service_role ou superusuário de banco. Usuários da aplicação devem invocar a Server Action autorizada.';
    END IF;

    IF p_plan IS NULL THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Plan JSON cannot be null';
    END IF;

    v_patient_id := (p_plan->>'patient_id')::UUID;
    IF v_patient_id IS NULL THEN
        RAISE EXCEPTION 'MISSING_PATIENT_ID: patient_id is required';
    END IF;

    v_run_id := (p_plan->>'source_nutrition_engine_run_id')::UUID;
    IF v_run_id IS NULL THEN
        RAISE EXCEPTION 'MISSING_ENGINE_RUN_ID: source_nutrition_engine_run_id is required';
    END IF;

    v_target_id := (p_plan->>'source_nutrition_target_id')::UUID;
    IF v_target_id IS NULL THEN
        RAISE EXCEPTION 'MISSING_NUTRITION_TARGET_ID: source_nutrition_target_id is required';
    END IF;

    v_gen_status := COALESCE(p_plan->>'generation_status', '');
    v_approval_status := COALESCE(p_plan->>'approval_status', 'draft');

    -- 1. Serialização estável por paciente via advisory lock de transação (garante concorrência mesmo na 1ª geração)
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_patient_id::TEXT, 0));

    -- 2. Lock explícito e validação de existência do paciente
    PERFORM 1 FROM public.patients WHERE id = v_patient_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PATIENT_NOT_FOUND: patient_id % does not exist', v_patient_id;
    END IF;

    -- 3. Validação do Nutrition Engine Run: existência, integridade do paciente e status
    SELECT r.patient_id, r.status
    INTO v_run_patient_id, v_run_status
    FROM public.nutrition_engine_runs r
    WHERE r.id = v_run_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ENGINE_RUN_NOT_FOUND: source_nutrition_engine_run_id % does not exist', v_run_id;
    END IF;

    IF v_run_patient_id != v_patient_id THEN
        RAISE EXCEPTION 'CROSS_PATIENT_FORGERY: engine run % belongs to patient %, not %', v_run_id, v_run_patient_id, v_patient_id;
    END IF;

    IF v_run_status NOT IN ('calculated', 'review_required') THEN
        RAISE EXCEPTION 'INVALID_ENGINE_RUN_STATUS: engine run % status is %, cannot persist diet plan', v_run_id, v_run_status;
    END IF;

    -- 4. Validação do Nutrition Target: existência, integridade do paciente e vínculo com o run
    SELECT t.patient_id, t.engine_run_id
    INTO v_target_patient_id, v_target_run_id
    FROM public.nutrition_targets t
    WHERE t.id = v_target_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NUTRITION_TARGET_NOT_FOUND: source_nutrition_target_id % does not exist', v_target_id;
    END IF;

    IF v_target_patient_id != v_patient_id THEN
        RAISE EXCEPTION 'CROSS_PATIENT_FORGERY: target % belongs to patient %, not %', v_target_id, v_target_patient_id, v_patient_id;
    END IF;

    IF v_target_run_id != v_run_id THEN
        RAISE EXCEPTION 'CROSS_RUN_MISMATCH: target % belongs to run %, not %', v_target_id, v_target_run_id, v_run_id;
    END IF;

    -- 5. Validação de status proibidos
    IF v_gen_status IN ('blocked', 'insufficient_data', 'infeasible_blocked') THEN
        RAISE EXCEPTION 'CANNOT_PERSIST_BLOCKED_OR_INSUFFICIENT: generation_status % is not allowed for diet plan', v_gen_status;
    END IF;

    IF v_gen_status NOT IN ('calculated', 'review_required', 'infeasible', 'superseded') THEN
        RAISE EXCEPTION 'INVALID_GENERATION_STATUS: % is not a valid status', v_gen_status;
    END IF;

    -- 6. Garantia de segurança estrita de ciclo de vida (safety gates)
    IF v_gen_status = 'review_required' AND (p_auto_approve = TRUE OR v_approval_status = 'approved') THEN
        RAISE EXCEPTION 'SAFETY_VIOLATION: review_required plan cannot be persisted as approved or active';
    END IF;

    IF v_gen_status = 'infeasible' AND (p_auto_approve = TRUE OR v_approval_status = 'approved') THEN
        RAISE EXCEPTION 'SAFETY_VIOLATION: infeasible plan cannot be persisted as approved or active';
    END IF;

    -- 7. Determinação formal de aprovação e ativação
    IF v_gen_status = 'calculated' AND (p_auto_approve = TRUE OR v_approval_status = 'approved') THEN
        v_approval_status := 'approved';
        v_is_active := TRUE;
    ELSE
        v_approval_status := 'draft';
        v_is_active := FALSE;
    END IF;

    -- 8. Superseder atomicamente planos ativos anteriores (se o novo plano for ativo)
    IF v_is_active THEN
        PERFORM 1 
        FROM public.diet_plans 
        WHERE patient_id = v_patient_id AND is_active = TRUE 
        FOR UPDATE;

        UPDATE public.diet_plans
        SET is_active = FALSE,
            approval_status = 'superseded',
            updated_at = pg_catalog.timezone('utc', pg_catalog.now())
        WHERE patient_id = v_patient_id AND is_active = TRUE;
    END IF;

    -- 9. Inserir o plano principal
    INSERT INTO public.diet_plans (
        patient_id, source_nutrition_engine_run_id, source_nutrition_target_id,
        composer_version, composer_config_version, food_dataset_version, food_dataset_checksum,
        price_engine_version, input_snapshot_hash, output_plan_hash,
        generation_status, approval_status, rejection_reason, infeasible_reason_codes,
        day_count, daily_budget_target, estimated_daily_cost, estimated_weekly_cost,
        budget_confidence, budget_status, currency, price_coverage_percentage,
        version, is_active, generation_reference_at
    )
    VALUES (
        v_patient_id,
        v_run_id,
        v_target_id,
        p_plan->>'composer_version',
        COALESCE(p_plan->>'composer_config_version', 'config-1.0.0'),
        p_plan->>'food_dataset_version',
        p_plan->>'food_dataset_checksum',
        p_plan->>'price_engine_version',
        p_plan->>'input_snapshot_hash',
        p_plan->>'output_plan_hash',
        v_gen_status,
        v_approval_status,
        p_plan->>'rejection_reason',
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_plan->'infeasible_reason_codes')), '{}'::TEXT[]),
        COALESCE((p_plan->>'day_count')::INT, 7),
        (p_plan->>'daily_budget_target')::NUMERIC,
        (p_plan->>'estimated_daily_cost')::NUMERIC,
        (p_plan->>'estimated_weekly_cost')::NUMERIC,
        COALESCE((p_plan->>'budget_confidence')::NUMERIC, 0.0),
        COALESCE(p_plan->>'budget_status', 'budget_unverified'),
        COALESCE(p_plan->>'currency', 'BRL'),
        COALESCE((p_plan->>'price_coverage_percentage')::NUMERIC, 0.0),
        COALESCE((p_plan->>'version')::INT, 1),
        v_is_active,
        COALESCE((p_plan->>'generation_reference_at')::TIMESTAMPTZ, pg_catalog.timezone('utc', pg_catalog.now()))
    )
    RETURNING id INTO v_plan_id;

    -- 10. Atualizar superseded_by nos planos arquivados
    IF v_is_active THEN
        UPDATE public.diet_plans
        SET superseded_by = v_plan_id
        WHERE patient_id = v_patient_id AND is_active = FALSE AND approval_status = 'superseded' AND superseded_by IS NULL;
    END IF;

    -- Iterar e inserir dias, refeições e itens se presentes
    IF p_plan ? 'days' AND jsonb_typeof(p_plan->'days') = 'array' THEN
        FOR v_day IN SELECT * FROM jsonb_to_recordset(p_plan->'days') AS x(
            day_of_week INT, day_label TEXT, target_calories_kcal NUMERIC, target_protein_g NUMERIC,
            target_carbohydrate_g NUMERIC, target_fat_g NUMERIC, actual_calories_kcal NUMERIC,
            actual_protein_g NUMERIC, actual_carbohydrate_g NUMERIC, actual_fat_g NUMERIC,
            actual_fiber_g NUMERIC, actual_sodium_mg NUMERIC, calories_delta_pct NUMERIC,
            protein_delta_pct NUMERIC, carbohydrate_delta_pct NUMERIC, fat_delta_pct NUMERIC,
            adherence_status TEXT, estimated_cost NUMERIC, meals JSONB
        ) LOOP
            INSERT INTO public.diet_plan_days (
                diet_plan_id, day_of_week, day_label, target_calories_kcal, target_protein_g,
                target_carbohydrate_g, target_fat_g, actual_calories_kcal, actual_protein_g,
                actual_carbohydrate_g, actual_fat_g, actual_fiber_g, actual_sodium_mg,
                calories_delta_pct, protein_delta_pct, carbohydrate_delta_pct, fat_delta_pct,
                adherence_status, estimated_cost
            )
            VALUES (
                v_plan_id, v_day.day_of_week, v_day.day_label, v_day.target_calories_kcal, v_day.target_protein_g,
                v_day.target_carbohydrate_g, v_day.target_fat_g, v_day.actual_calories_kcal, v_day.actual_protein_g,
                v_day.actual_carbohydrate_g, v_day.actual_fat_g, COALESCE(v_day.actual_fiber_g, 0.0), COALESCE(v_day.actual_sodium_mg, 0.0),
                v_day.calories_delta_pct, v_day.protein_delta_pct, v_day.carbohydrate_delta_pct, v_day.fat_delta_pct,
                COALESCE(v_day.adherence_status, 'within_tolerance'), v_day.estimated_cost
            )
            RETURNING id INTO v_day_id;

            IF v_day.meals IS NOT NULL AND jsonb_typeof(v_day.meals) = 'array' THEN
                FOR v_meal IN SELECT * FROM jsonb_to_recordset(v_day.meals) AS y(
                    meal_order INT, meal_type TEXT, meal_name TEXT, scheduled_time TEXT,
                    target_calories_kcal NUMERIC, target_protein_g NUMERIC, target_carbohydrate_g NUMERIC,
                    target_fat_g NUMERIC, actual_calories_kcal NUMERIC, actual_protein_g NUMERIC,
                    actual_carbohydrate_g NUMERIC, actual_fat_g NUMERIC, actual_fiber_g NUMERIC,
                    actual_sodium_mg NUMERIC, estimated_cost NUMERIC, items JSONB
                ) LOOP
                    INSERT INTO public.diet_meals (
                        diet_plan_day_id, meal_order, meal_type, meal_name, scheduled_time,
                        target_calories_kcal, target_protein_g, target_carbohydrate_g, target_fat_g,
                        actual_calories_kcal, actual_protein_g, actual_carbohydrate_g, actual_fat_g,
                        actual_fiber_g, actual_sodium_mg, estimated_cost
                    )
                    VALUES (
                        v_day_id, v_meal.meal_order, v_meal.meal_type, v_meal.meal_name, v_meal.scheduled_time,
                        v_meal.target_calories_kcal, v_meal.target_protein_g, v_meal.target_carbohydrate_g, v_meal.target_fat_g,
                        v_meal.actual_calories_kcal, v_meal.actual_protein_g, v_meal.actual_carbohydrate_g, v_meal.actual_fat_g,
                        COALESCE(v_meal.actual_fiber_g, 0.0), COALESCE(v_meal.actual_sodium_mg, 0.0), v_meal.estimated_cost
                    )
                    RETURNING id INTO v_meal_id;

                    IF v_meal.items IS NOT NULL AND jsonb_typeof(v_meal.items) = 'array' THEN
                        FOR v_item IN SELECT * FROM jsonb_to_recordset(v_meal.items) AS z(
                            food_id UUID, source_id UUID, source_food_code TEXT, item_order INT,
                            food_name TEXT, source_type TEXT, source_version TEXT, grams NUMERIC,
                            energy_kcal NUMERIC, protein_g NUMERIC, carbohydrate_g NUMERIC, fat_g NUMERIC,
                            fiber_g NUMERIC, sodium_mg NUMERIC, household_measure_label TEXT,
                            household_measure_quantity NUMERIC, price_estimate NUMERIC, price_confidence NUMERIC,
                            price_source_level TEXT, currency TEXT, composition_snapshot_hash TEXT
                        ) LOOP
                            INSERT INTO public.diet_meal_items (
                                diet_meal_id, food_id, source_id, source_food_code, item_order,
                                food_name, source_type, source_version, grams, energy_kcal,
                                protein_g, carbohydrate_g, fat_g, fiber_g, sodium_mg,
                                household_measure_label, household_measure_quantity,
                                price_estimate, price_confidence, price_source_level, currency,
                                composition_snapshot_hash
                            )
                            VALUES (
                                v_meal_id, v_item.food_id, v_item.source_id, COALESCE(v_item.source_food_code, ''), v_item.item_order,
                                v_item.food_name, v_item.source_type, v_item.source_version, v_item.grams, v_item.energy_kcal,
                                v_item.protein_g, v_item.carbohydrate_g, v_item.fat_g, v_item.fiber_g, v_item.sodium_mg,
                                v_item.household_measure_label, v_item.household_measure_quantity,
                                v_item.price_estimate, COALESCE(v_item.price_confidence, 0.0), COALESCE(v_item.price_source_level, 'unknown'),
                                COALESCE(v_item.currency, 'BRL'), v_item.composition_snapshot_hash
                            );
                        END LOOP;
                    END IF;
                END LOOP;
            END IF;
        END LOOP;
    END IF;

    RETURN v_plan_id;
END;
$$;

REVOKE ALL ON FUNCTION public.persist_diet_plan_atomic(JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_diet_plan_atomic(JSONB, BOOLEAN) TO service_role;
