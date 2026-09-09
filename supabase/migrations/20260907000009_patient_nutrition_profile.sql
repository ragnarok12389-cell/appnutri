-- ==============================================================================
-- MIGRATION: 20260907000009_patient_nutrition_profile.sql
-- DESCRIPTION: Comprehensive Relational Patient Nutrition Profile, Physical Sensitive Data
--              Segregation (patient_nutrition_sensitive), Dedicated Private Auth Functions & RLS
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PATIENT_NUTRITION_PROFILES (Relational Non-Sensitive Active Profile)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_nutrition_profiles (
    id UUID PRIMARY KEY REFERENCES public.patients(id) ON DELETE CASCADE,
    
    -- 1. Dados Corporais & Antropometria
    height_cm NUMERIC(5,2) CHECK (height_cm IS NULL OR (height_cm >= 50 AND height_cm <= 260)),
    current_weight_kg NUMERIC(5,2) CHECK (current_weight_kg IS NULL OR (current_weight_kg >= 20 AND current_weight_kg <= 400)),
    target_weight_kg NUMERIC(5,2) CHECK (target_weight_kg IS NULL OR (target_weight_kg >= 20 AND target_weight_kg <= 400)),
    birth_date DATE,
    biological_sex TEXT CHECK (biological_sex IS NULL OR biological_sex IN ('male', 'female')),
    waist_cm NUMERIC(5,2) CHECK (waist_cm IS NULL OR (waist_cm >= 30 AND waist_cm <= 250)),
    body_fat_percentage NUMERIC(4,2) CHECK (body_fat_percentage IS NULL OR (body_fat_percentage >= 2 AND body_fat_percentage <= 70)),

    -- 2. Objetivo Estruturado
    primary_goal TEXT CHECK (primary_goal IS NULL OR primary_goal IN ('lose_weight', 'gain_muscle', 'maintain_weight', 'body_recomposition', 'improve_health', 'improve_performance')),
    desired_rate_of_change TEXT CHECK (desired_rate_of_change IS NULL OR desired_rate_of_change IN ('slow', 'moderate', 'fast')),
    target_date DATE,

    -- 3. Rotina Diária
    wake_time TEXT,
    sleep_time TEXT,
    average_sleep_hours NUMERIC(3,1) CHECK (average_sleep_hours IS NULL OR (average_sleep_hours >= 1 AND average_sleep_hours <= 24)),
    work_start_time TEXT,
    work_end_time TEXT,
    work_type TEXT CHECK (work_type IS NULL OR work_type IN ('sedentary', 'mixed', 'physical')),
    usual_training_time TEXT,
    weekday_routine TEXT,
    weekend_routine TEXT,

    -- 4. Atividade Física
    activity_level TEXT CHECK (activity_level IS NULL OR activity_level IN ('sedentary', 'light', 'moderate', 'high', 'very_high')),
    training_days_per_week INT CHECK (training_days_per_week IS NULL OR (training_days_per_week >= 0 AND training_days_per_week <= 7)),
    training_duration_minutes INT CHECK (training_duration_minutes IS NULL OR (training_duration_minutes >= 0 AND training_duration_minutes <= 360)),
    training_types TEXT[] NOT NULL DEFAULT '{}',

    -- 5. Estrutura de Refeições e Hábitos
    desired_meals_per_day INT CHECK (desired_meals_per_day IS NULL OR (desired_meals_per_day >= 1 AND desired_meals_per_day <= 10)),
    usual_meals_per_day INT CHECK (usual_meals_per_day IS NULL OR (usual_meals_per_day >= 1 AND usual_meals_per_day <= 10)),
    breakfast_habit TEXT,
    lunch_habit TEXT,
    dinner_habit TEXT,
    snacks_habit TEXT,
    meal_schedules JSONB NOT NULL DEFAULT '[]'::jsonb,
    skips_breakfast BOOLEAN NOT NULL DEFAULT FALSE,
    irregular_work_schedule BOOLEAN NOT NULL DEFAULT FALSE,
    works_night_shifts BOOLEAN NOT NULL DEFAULT FALSE,
    eats_out_frequently BOOLEAN NOT NULL DEFAULT FALSE,
    needs_packed_meals BOOLEAN NOT NULL DEFAULT FALSE,

    -- 6. Padrões & Preferências Alimentares (Gerais)
    dietary_pattern TEXT CHECK (dietary_pattern IS NULL OR dietary_pattern IN ('omnivore', 'vegetarian', 'vegan', 'pescatarian', 'other')),
    uses_supplements BOOLEAN NOT NULL DEFAULT FALSE,
    current_supplements TEXT[] NOT NULL DEFAULT '{}',
    favorite_foods TEXT[] NOT NULL DEFAULT '{}',
    disliked_foods TEXT[] NOT NULL DEFAULT '{}',
    foods_patient_refuses TEXT[] NOT NULL DEFAULT '{}',
    preferred_protein_sources TEXT[] NOT NULL DEFAULT '{}',
    preferred_carbohydrate_sources TEXT[] NOT NULL DEFAULT '{}',
    preferred_fat_sources TEXT[] NOT NULL DEFAULT '{}',
    preferred_fruits TEXT[] NOT NULL DEFAULT '{}',
    preferred_vegetables TEXT[] NOT NULL DEFAULT '{}',
    cuisine_preferences TEXT[] NOT NULL DEFAULT '{}',
    religious_or_cultural_restrictions TEXT[] NOT NULL DEFAULT '{}',

    -- 7. Orçamento Alimentar
    food_budget_amount NUMERIC(10,2) CHECK (food_budget_amount IS NULL OR food_budget_amount >= 0),
    food_budget_period TEXT CHECK (food_budget_period IS NULL OR food_budget_period IN ('daily', 'weekly', 'monthly')),
    currency TEXT NOT NULL DEFAULT 'BRL',
    budget_flexibility TEXT CHECK (budget_flexibility IS NULL OR budget_flexibility IN ('strict', 'moderate', 'flexible')),
    number_of_people_in_household INT CHECK (number_of_people_in_household IS NULL OR number_of_people_in_household >= 1),
    is_budget_exclusive_for_patient BOOLEAN NOT NULL DEFAULT TRUE,

    -- 8. Contexto de Compra e Localidade
    country TEXT NOT NULL DEFAULT 'BR',
    state_region TEXT,
    city TEXT,
    preferred_stores TEXT[] NOT NULL DEFAULT '{}',
    shopping_frequency TEXT CHECK (shopping_frequency IS NULL OR shopping_frequency IN ('daily', 'weekly', 'biweekly', 'monthly')),

    -- 9. Cozinha, Preparo e Alimentação Fora
    can_cook BOOLEAN NOT NULL DEFAULT TRUE,
    cooking_skill_level TEXT CHECK (cooking_skill_level IS NULL OR cooking_skill_level IN ('none', 'basic', 'intermediate', 'advanced')),
    available_cooking_time_minutes INT CHECK (available_cooking_time_minutes IS NULL OR available_cooking_time_minutes >= 0),
    meal_prep_days TEXT[] NOT NULL DEFAULT '{}',
    has_refrigerator BOOLEAN NOT NULL DEFAULT TRUE,
    has_freezer BOOLEAN NOT NULL DEFAULT TRUE,
    has_microwave BOOLEAN NOT NULL DEFAULT TRUE,
    has_stove BOOLEAN NOT NULL DEFAULT TRUE,
    has_air_fryer BOOLEAN NOT NULL DEFAULT FALSE,
    meals_out_per_week INT CHECK (meals_out_per_week IS NULL OR meals_out_per_week >= 0),
    uses_delivery_frequency TEXT CHECK (uses_delivery_frequency IS NULL OR uses_delivery_frequency IN ('never', 'rarely', 'weekly_1_2', 'weekly_3_4', 'daily')),
    eats_at_work BOOLEAN NOT NULL DEFAULT FALSE,
    work_refrigerator_available BOOLEAN NOT NULL DEFAULT FALSE,
    work_microwave_available BOOLEAN NOT NULL DEFAULT FALSE,

    -- 10. Hábitos Gerais, Dificuldades e Histórico
    water_intake_liters NUMERIC(4,2) CHECK (water_intake_liters IS NULL OR water_intake_liters >= 0),
    alcohol_frequency TEXT CHECK (alcohol_frequency IS NULL OR alcohol_frequency IN ('never', 'rarely', 'weekly_social', 'weekly_frequent', 'daily')),
    soft_drink_frequency TEXT CHECK (soft_drink_frequency IS NULL OR soft_drink_frequency IN ('never', 'rarely', 'weekly_1_2', 'weekly_3_4', 'daily')),
    coffee_frequency TEXT CHECK (coffee_frequency IS NULL OR coffee_frequency IN ('never', '1_cup_day', '2_3_cups_day', '4_plus_cups_day')),
    fast_food_frequency TEXT CHECK (fast_food_frequency IS NULL OR fast_food_frequency IN ('never', 'rarely', 'weekly_1_2', 'weekly_3_4', 'daily')),
    late_night_eating BOOLEAN NOT NULL DEFAULT FALSE,
    emotional_eating_reported BOOLEAN NOT NULL DEFAULT FALSE,
    hunger_pattern TEXT CHECK (hunger_pattern IS NULL OR hunger_pattern IN ('morning', 'afternoon', 'evening', 'night', 'constant', 'variable')),
    primary_challenges TEXT[] NOT NULL DEFAULT '{}',
    challenges_notes TEXT,
    followed_diet_before BOOLEAN NOT NULL DEFAULT FALSE,
    what_worked_before TEXT,
    what_failed_before TEXT,
    foods_or_methods_refused TEXT,

    -- Metadados de Progresso e Versão
    completion_percentage INT NOT NULL DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    version INT NOT NULL DEFAULT 1,
    last_updated_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now())
);

CREATE INDEX IF NOT EXISTS idx_nutrition_profiles_goal ON public.patient_nutrition_profiles(primary_goal);
CREATE INDEX IF NOT EXISTS idx_nutrition_profiles_budget ON public.patient_nutrition_profiles(food_budget_amount);
CREATE INDEX IF NOT EXISTS idx_nutrition_profiles_completed ON public.patient_nutrition_profiles(is_completed);

COMMENT ON TABLE public.patient_nutrition_profiles IS 'Structured non-sensitive active nutrition profile for patients used by future diet generation engine.';

-- ------------------------------------------------------------------------------
-- 2. PATIENT_NUTRITION_SENSITIVE (Physically Segregated Clinical & Medical Data)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_nutrition_sensitive (
    patient_id UUID PRIMARY KEY REFERENCES public.patients(id) ON DELETE CASCADE,
    food_allergies TEXT[] NOT NULL DEFAULT '{}',
    food_intolerances TEXT[] NOT NULL DEFAULT '{}',
    medical_dietary_notes TEXT,
    clinical_dietary_restrictions TEXT[] NOT NULL DEFAULT '{}',
    last_updated_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now())
);

COMMENT ON TABLE public.patient_nutrition_sensitive IS 'Physically segregated clinical, allergy, intolerance and medical dietary records with strict RLS isolation.';

-- ------------------------------------------------------------------------------
-- 3. PATIENT_NUTRITION_SNAPSHOTS (General Immutable Version Snapshots)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_nutrition_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    version INT NOT NULL,
    snapshot_data JSONB NOT NULL,
    completion_percentage INT NOT NULL,
    created_by UUID REFERENCES public.profiles(id),
    change_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now()),
    CONSTRAINT uq_patient_snapshot_version UNIQUE (patient_id, version)
);

CREATE INDEX IF NOT EXISTS idx_nutrition_snapshots_patient ON public.patient_nutrition_snapshots(patient_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_snapshots_created_at ON public.patient_nutrition_snapshots(created_at DESC);

COMMENT ON TABLE public.patient_nutrition_snapshots IS 'Immutable snapshots of non-sensitive patient nutrition profile across versions.';

-- ------------------------------------------------------------------------------
-- 4. PATIENT_NUTRITION_SENSITIVE_SNAPSHOTS (Segregated Sensitive Snapshots)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_nutrition_sensitive_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    version INT NOT NULL,
    snapshot_data JSONB NOT NULL,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now()),
    CONSTRAINT uq_patient_sensitive_snapshot_version UNIQUE (patient_id, version)
);

CREATE INDEX IF NOT EXISTS idx_nutrition_sensitive_snapshots_patient ON public.patient_nutrition_sensitive_snapshots(patient_id);

COMMENT ON TABLE public.patient_nutrition_sensitive_snapshots IS 'Immutable snapshots of clinical, allergy and medical dietary data across versions with restricted access.';

-- ------------------------------------------------------------------------------
-- 5. PERMISSIONS & RBAC SEEDING
-- ------------------------------------------------------------------------------
INSERT INTO public.permissions (id, name, module, description)
VALUES
    ('nutrition_profile.view', 'Visualizar Perfil Nutricional', 'nutrition', 'Permite visualizar o perfil nutricional geral do paciente'),
    ('nutrition_profile.edit', 'Editar Perfil Nutricional', 'nutrition', 'Permite preencher e atualizar o perfil nutricional do paciente'),
    ('nutrition_sensitive.view', 'Visualizar Dados Clínicos Sensíveis', 'nutrition', 'Permite visualizar alergias, notas médicas e dados sensíveis do paciente'),
    ('nutrition_sensitive.edit', 'Editar Dados Clínicos Sensíveis', 'nutrition', 'Permite atualizar dados clínicos e sensíveis do paciente')
ON CONFLICT (id) DO NOTHING;

-- Admin receives all permissions
INSERT INTO public.role_permissions (role_id, permission_id)
VALUES
    ('admin', 'nutrition_profile.view'),
    ('admin', 'nutrition_profile.edit'),
    ('admin', 'nutrition_sensitive.view'),
    ('admin', 'nutrition_sensitive.edit')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Nutritionist receives clinical & editing permissions
INSERT INTO public.role_permissions (role_id, permission_id)
VALUES
    ('nutritionist', 'nutrition_profile.view'),
    ('nutritionist', 'nutrition_profile.edit'),
    ('nutritionist', 'nutrition_sensitive.view'),
    ('nutritionist', 'nutrition_sensitive.edit')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Influencer receives ONLY non-sensitive nutrition profile viewing
INSERT INTO public.role_permissions (role_id, permission_id)
VALUES
    ('influencer', 'nutrition_profile.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Patient can view and edit their own nutrition profile and sensitive data
INSERT INTO public.role_permissions (role_id, permission_id)
VALUES
    ('patient', 'nutrition_profile.view'),
    ('patient', 'nutrition_profile.edit'),
    ('patient', 'nutrition_sensitive.view'),
    ('patient', 'nutrition_sensitive.edit')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 6. SECURITY DEFINER AUTHORIZATION HELPER FUNCTIONS (IN PRIVATE SCHEMA)
-- ------------------------------------------------------------------------------

-- 6.1. CAN_VIEW_NUTRITION_PROFILE
-- Allows: Patient (self), Admin, and Active Linked Professional (Nutritionist OR Influencer).
CREATE OR REPLACE FUNCTION private.can_view_nutrition_profile(viewer_id UUID, p_patient_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Patient viewing self
    IF viewer_id = p_patient_id THEN
        RETURN TRUE;
    END IF;

    -- Admin
    IF private.is_admin(viewer_id) THEN
        RETURN TRUE;
    END IF;

    -- Active linked professional (nutritionist or influencer with status = 'active')
    IF private.can_access_patient(viewer_id, p_patient_id) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;

-- 6.2. CAN_EDIT_NUTRITION_PROFILE
-- Allows: Patient (self), Admin, and Active Linked Nutritionist.
-- INFLUENCER IS STRICTLY BLOCKED FROM EDITING!
CREATE OR REPLACE FUNCTION private.can_edit_nutrition_profile(viewer_id UUID, p_patient_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Patient editing self
    IF viewer_id = p_patient_id THEN
        RETURN TRUE;
    END IF;

    -- Admin
    IF private.is_admin(viewer_id) THEN
        RETURN TRUE;
    END IF;

    -- Active linked NUTRITIONIST can edit (influencer returns FALSE)
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

-- 6.3. CAN_VIEW_NUTRITION_SENSITIVE
-- Allows: Patient (self), Admin, and Active Linked Nutritionist.
-- INFLUENCER HAS ZERO ACCESS (RETURNS FALSE)!
CREATE OR REPLACE FUNCTION private.can_view_nutrition_sensitive(viewer_id UUID, p_patient_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Patient viewing self
    IF viewer_id = p_patient_id THEN
        RETURN TRUE;
    END IF;

    -- Admin
    IF private.is_admin(viewer_id) THEN
        RETURN TRUE;
    END IF;

    -- Active linked NUTRITIONIST can view sensitive data (influencer returns FALSE)
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

-- 6.4. CAN_EDIT_NUTRITION_SENSITIVE
-- Allows: Patient (self), Admin, and Active Linked Nutritionist.
-- INFLUENCER HAS ZERO ACCESS (RETURNS FALSE)!
CREATE OR REPLACE FUNCTION private.can_edit_nutrition_sensitive(viewer_id UUID, p_patient_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Patient editing self
    IF viewer_id = p_patient_id THEN
        RETURN TRUE;
    END IF;

    -- Admin
    IF private.is_admin(viewer_id) THEN
        RETURN TRUE;
    END IF;

    -- Active linked NUTRITIONIST can edit sensitive data (influencer returns FALSE)
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

GRANT EXECUTE ON FUNCTION private.can_view_nutrition_profile(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_edit_nutrition_profile(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_view_nutrition_sensitive(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_edit_nutrition_sensitive(UUID, UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.patient_nutrition_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_nutrition_sensitive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_nutrition_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_nutrition_sensitive_snapshots ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 7.1. POLICIES FOR PATIENT_NUTRITION_PROFILES (General Data)
-- ------------------------------------------------------------------------------

CREATE POLICY "View nutrition profile via private function"
    ON public.patient_nutrition_profiles FOR SELECT
    TO authenticated
    USING (private.can_view_nutrition_profile(auth.uid(), id));

CREATE POLICY "Insert nutrition profile via patient or admin"
    ON public.patient_nutrition_profiles FOR INSERT
    TO authenticated
    WITH CHECK (id = auth.uid() OR private.is_admin(auth.uid()));

CREATE POLICY "Update nutrition profile via private edit function"
    ON public.patient_nutrition_profiles FOR UPDATE
    TO authenticated
    USING (private.can_edit_nutrition_profile(auth.uid(), id))
    WITH CHECK (private.can_edit_nutrition_profile(auth.uid(), id));

CREATE POLICY "Delete nutrition profile via admin"
    ON public.patient_nutrition_profiles FOR DELETE
    TO authenticated
    USING (private.is_admin(auth.uid()));

-- ------------------------------------------------------------------------------
-- 7.2. POLICIES FOR PATIENT_NUTRITION_SENSITIVE (Clinical & Medical Data)
-- ------------------------------------------------------------------------------

-- SELECT: Patient (self), Admin, Linked Active Nutritionist. Influencer = 0 rows!
CREATE POLICY "View nutrition sensitive via private function"
    ON public.patient_nutrition_sensitive FOR SELECT
    TO authenticated
    USING (private.can_view_nutrition_sensitive(auth.uid(), patient_id));

-- INSERT: Patient (self), Admin, Linked Active Nutritionist. Influencer = blocked!
CREATE POLICY "Insert nutrition sensitive via patient or authorized editor"
    ON public.patient_nutrition_sensitive FOR INSERT
    TO authenticated
    WITH CHECK (patient_id = auth.uid() OR private.can_edit_nutrition_sensitive(auth.uid(), patient_id));

-- UPDATE: Patient (self), Admin, Linked Active Nutritionist. Influencer = blocked!
CREATE POLICY "Update nutrition sensitive via private edit function"
    ON public.patient_nutrition_sensitive FOR UPDATE
    TO authenticated
    USING (private.can_edit_nutrition_sensitive(auth.uid(), patient_id))
    WITH CHECK (private.can_edit_nutrition_sensitive(auth.uid(), patient_id));

-- DELETE: Admin only
CREATE POLICY "Delete nutrition sensitive via admin"
    ON public.patient_nutrition_sensitive FOR DELETE
    TO authenticated
    USING (private.is_admin(auth.uid()));

-- ------------------------------------------------------------------------------
-- 7.3. POLICIES FOR PATIENT_NUTRITION_SNAPSHOTS (General Snapshots)
-- ------------------------------------------------------------------------------

CREATE POLICY "View nutrition snapshots via private function"
    ON public.patient_nutrition_snapshots FOR SELECT
    TO authenticated
    USING (private.can_view_nutrition_profile(auth.uid(), patient_id));

CREATE POLICY "Insert nutrition snapshots via private edit function"
    ON public.patient_nutrition_snapshots FOR INSERT
    TO authenticated
    WITH CHECK (private.can_edit_nutrition_profile(auth.uid(), patient_id));

-- ------------------------------------------------------------------------------
-- 7.4. POLICIES FOR PATIENT_NUTRITION_SENSITIVE_SNAPSHOTS (Clinical Snapshots)
-- ------------------------------------------------------------------------------

CREATE POLICY "View sensitive snapshots via private function"
    ON public.patient_nutrition_sensitive_snapshots FOR SELECT
    TO authenticated
    USING (private.can_view_nutrition_sensitive(auth.uid(), patient_id));

CREATE POLICY "Insert sensitive snapshots via private edit function"
    ON public.patient_nutrition_sensitive_snapshots FOR INSERT
    TO authenticated
    WITH CHECK (private.can_edit_nutrition_sensitive(auth.uid(), patient_id));
