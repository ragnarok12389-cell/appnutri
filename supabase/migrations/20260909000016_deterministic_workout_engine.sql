-- ==============================================================================
-- MIGRATION: 20260909000016_deterministic_workout_engine.sql
-- DESCRIPTION: Arquitetura Versionada e Imutável do Motor Determinístico de Treino,
--              Exercícios, Sessões, Séries, Progressão e RLS (ETAPA 7)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. CATÁLOGO CURADO DE EXERCÍCIOS (exercise_catalog)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exercise_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    aliases TEXT[] NOT NULL DEFAULT '{}',
    movement_pattern TEXT NOT NULL CHECK (
        movement_pattern IN ('squat', 'hinge', 'push_horizontal', 'push_vertical', 'pull_horizontal', 'pull_vertical', 'lunge', 'carry', 'core', 'isolation')
    ),
    primary_muscle_groups TEXT[] NOT NULL,
    secondary_muscle_groups TEXT[] NOT NULL DEFAULT '{}',
    required_equipment TEXT[] NOT NULL,
    complexity_level TEXT NOT NULL CHECK (
        complexity_level IN ('beginner', 'intermediate', 'advanced')
    ),
    is_unilateral BOOLEAN NOT NULL DEFAULT FALSE,
    is_compound BOOLEAN NOT NULL DEFAULT TRUE,
    safety_contraindications TEXT[] NOT NULL DEFAULT '{}',
    instructions TEXT NOT NULL DEFAULT '',
    source_version TEXT NOT NULL DEFAULT '1.0.0',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now())
);

CREATE INDEX IF NOT EXISTS idx_exercise_catalog_pattern ON public.exercise_catalog(movement_pattern);
CREATE INDEX IF NOT EXISTS idx_exercise_catalog_complexity ON public.exercise_catalog(complexity_level);
CREATE INDEX IF NOT EXISTS idx_exercise_catalog_active ON public.exercise_catalog(is_active);

COMMENT ON TABLE public.exercise_catalog IS 'Catálogo curado e estruturado de exercícios com classificação biomecânica determinística.';

-- ------------------------------------------------------------------------------
-- 2. PROGRAMAS DE TREINO (workout_programs)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workout_programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    engine_version TEXT NOT NULL DEFAULT '1.0.0',
    config_version TEXT NOT NULL DEFAULT 'config-1.0.0',
    catalog_version TEXT NOT NULL DEFAULT '1.0.0',
    catalog_checksum TEXT NOT NULL DEFAULT '',
    catalog_provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_profile_version INT NOT NULL DEFAULT 1,
    source_profile_id UUID REFERENCES public.patient_nutrition_profiles(id),
    input_snapshot_hash TEXT NOT NULL,
    output_program_hash TEXT NOT NULL,
    objective TEXT NOT NULL CHECK (
        objective IN ('hypertrophy', 'general_fitness', 'strength_foundation', 'weight_loss_support', 'conditioning_foundation')
    ),
    experience_level TEXT NOT NULL CHECK (
        experience_level IN ('beginner', 'intermediate', 'advanced')
    ),
    sessions_per_week INT NOT NULL CHECK (sessions_per_week >= 2 AND sessions_per_week <= 6),
    session_duration_minutes INT NOT NULL DEFAULT 60 CHECK (session_duration_minutes >= 30 AND session_duration_minutes <= 120),
    split_type TEXT NOT NULL CHECK (
        split_type IN ('full_body', 'upper_lower', 'push_pull_legs', 'custom_split')
    ),
    generation_status TEXT NOT NULL CHECK (
        generation_status IN ('calculated', 'review_required', 'infeasible', 'superseded')
    ),
    approval_status TEXT NOT NULL DEFAULT 'draft' CHECK (
        approval_status IN ('draft', 'approved', 'rejected', 'superseded')
    ),
    rejection_reason TEXT,
    infeasible_reason_codes TEXT[] NOT NULL DEFAULT '{}',
    version INT NOT NULL DEFAULT 1,
    superseded_by UUID REFERENCES public.workout_programs(id),
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    generation_reference_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now()),
    created_by UUID REFERENCES public.profiles(id),
    approved_by UUID REFERENCES public.profiles(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now())
);

CREATE INDEX IF NOT EXISTS idx_workout_programs_patient ON public.workout_programs(patient_id);
CREATE INDEX IF NOT EXISTS idx_workout_programs_status ON public.workout_programs(generation_status, approval_status);
CREATE INDEX IF NOT EXISTS idx_workout_programs_active ON public.workout_programs(patient_id, is_active);

-- Concorrência: Apenas 1 programa de treino ativo por paciente
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_workout_program_per_patient 
    ON public.workout_programs(patient_id) 
    WHERE is_active = TRUE;

COMMENT ON TABLE public.workout_programs IS 'Programas de treino determinísticos e versionados derivados do perfil do praticante.';

-- ------------------------------------------------------------------------------
-- 3. DIAS DO PROGRAMA (workout_program_days)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workout_program_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workout_program_id UUID NOT NULL REFERENCES public.workout_programs(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week >= 1 AND day_of_week <= 7),
    day_label TEXT NOT NULL,
    is_rest_day BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now()),
    CONSTRAINT uq_workout_program_days_plan_day UNIQUE (workout_program_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_workout_program_days_program ON public.workout_program_days(workout_program_id);

-- ------------------------------------------------------------------------------
-- 4. SESSÕES DE TREINO (workout_sessions)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workout_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workout_program_day_id UUID NOT NULL REFERENCES public.workout_program_days(id) ON DELETE CASCADE,
    session_order INT NOT NULL,
    name TEXT NOT NULL,
    session_focus TEXT NOT NULL,
    estimated_duration_minutes INT NOT NULL DEFAULT 60,
    warmup_protocol JSONB NOT NULL DEFAULT '[]'::jsonb,
    cooldown_protocol JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now())
);

CREATE INDEX IF NOT EXISTS idx_workout_sessions_day ON public.workout_sessions(workout_program_day_id);

-- ------------------------------------------------------------------------------
-- 5. EXERCÍCIOS DA SESSÃO (workout_exercises) COM SNAPSHOT HISTÓRICO COMPLETO
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workout_exercises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workout_session_id UUID NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
    exercise_id UUID NOT NULL REFERENCES public.exercise_catalog(id) ON DELETE RESTRICT,
    exercise_order INT NOT NULL,
    exercise_name TEXT NOT NULL,
    movement_pattern TEXT NOT NULL,
    exercise_snapshot_hash TEXT NOT NULL DEFAULT '',
    primary_muscle_groups TEXT[] NOT NULL DEFAULT '{}',
    secondary_muscle_groups TEXT[] NOT NULL DEFAULT '{}',
    required_equipment TEXT[] NOT NULL DEFAULT '{}',
    complexity_level TEXT NOT NULL DEFAULT 'beginner',
    is_unilateral BOOLEAN NOT NULL DEFAULT FALSE,
    is_compound BOOLEAN NOT NULL DEFAULT TRUE,
    catalog_source_version TEXT NOT NULL DEFAULT '1.0.0',
    prescribed_sets INT NOT NULL CHECK (prescribed_sets >= 1 AND prescribed_sets <= 8),
    min_reps INT NOT NULL CHECK (min_reps >= 1 AND min_reps <= 50),
    max_reps INT NOT NULL CHECK (max_reps >= min_reps AND max_reps <= 50),
    target_rir INT CHECK (target_rir >= 0 AND target_rir <= 5),
    target_rpe NUMERIC(3,1) CHECK (target_rpe >= 5.0 AND target_rpe <= 10.0),
    rest_seconds INT NOT NULL CHECK (rest_seconds >= 15 AND rest_seconds <= 300),
    tempo TEXT,
    warmup_sets INT NOT NULL DEFAULT 0,
    notes TEXT,
    progression_strategy TEXT NOT NULL DEFAULT 'double_progression' CHECK (
        progression_strategy IN ('double_progression', 'linear_load', 'density_reps', 'maintenance')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now())
);

CREATE INDEX IF NOT EXISTS idx_workout_exercises_session ON public.workout_exercises(workout_session_id);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_catalog ON public.workout_exercises(exercise_id);

-- ------------------------------------------------------------------------------
-- 6. PRESCRIÇÃO DETALHADA DE SÉRIES (workout_exercise_sets)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workout_exercise_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workout_exercise_id UUID NOT NULL REFERENCES public.workout_exercises(id) ON DELETE CASCADE,
    set_order INT NOT NULL,
    set_type TEXT NOT NULL DEFAULT 'normal' CHECK (
        set_type IN ('warmup', 'normal', 'drop_set', 'myo_reps', 'to_failure')
    ),
    target_reps INT,
    target_rir INT,
    target_rpe NUMERIC(3,1),
    rest_seconds INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now())
);

CREATE INDEX IF NOT EXISTS idx_workout_exercise_sets_ex ON public.workout_exercise_sets(workout_exercise_id);

-- ------------------------------------------------------------------------------
-- 7. HISTÓRICO REAL DE EXECUÇÃO (workout_execution_logs)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workout_execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    workout_exercise_id UUID NOT NULL REFERENCES public.workout_exercises(id) ON DELETE CASCADE,
    session_date DATE NOT NULL,
    set_number INT NOT NULL CHECK (set_number >= 1 AND set_number <= 20),
    weight_kg NUMERIC(6,2) CHECK (weight_kg IS NULL OR weight_kg >= 0),
    weight_unit TEXT NOT NULL DEFAULT 'kg' CHECK (weight_unit IN ('kg', 'lb')),
    reps_completed INT NOT NULL CHECK (reps_completed >= 0 AND reps_completed <= 200),
    actual_rir INT CHECK (actual_rir IS NULL OR (actual_rir >= 0 AND actual_rir <= 10)),
    actual_rpe NUMERIC(3,1) CHECK (actual_rpe IS NULL OR (actual_rpe >= 5.0 AND actual_rpe <= 10.0)),
    is_completed BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    logged_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now())
);

CREATE INDEX IF NOT EXISTS idx_workout_logs_patient_date ON public.workout_execution_logs(patient_id, session_date);
CREATE INDEX IF NOT EXISTS idx_workout_logs_exercise ON public.workout_execution_logs(workout_exercise_id);

-- ------------------------------------------------------------------------------
-- 8. EVENTOS DE PROGRESSÃO DETERMINÍSTICA (workout_progression_events)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workout_progression_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    exercise_id UUID NOT NULL REFERENCES public.exercise_catalog(id) ON DELETE RESTRICT,
    event_type TEXT NOT NULL CHECK (
        event_type IN ('load_increase_recommended', 'reps_target_reached', 'deload_recommended', 'plateau_detected', 'unquantified_load_increase')
    ),
    previous_load_kg NUMERIC(6,2) CHECK (previous_load_kg IS NULL OR previous_load_kg >= 0),
    recommended_load_kg NUMERIC(6,2) CHECK (recommended_load_kg IS NULL OR recommended_load_kg >= 0),
    load_unit TEXT NOT NULL DEFAULT 'kg' CHECK (load_unit IN ('kg', 'lb')),
    reps_achieved INT CHECK (reps_achieved IS NULL OR (reps_achieved >= 0 AND reps_achieved <= 200)),
    sessions_maintained INT CHECK (sessions_maintained IS NULL OR sessions_maintained >= 0),
    rationale TEXT NOT NULL,
    is_applied BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now())
);

CREATE INDEX IF NOT EXISTS idx_workout_progression_patient ON public.workout_progression_events(patient_id);

-- ------------------------------------------------------------------------------
-- 9. REVISÕES TÉCNICAS E CLÍNICAS (workout_reviews)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workout_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workout_program_id UUID NOT NULL REFERENCES public.workout_programs(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES public.profiles(id),
    decision TEXT NOT NULL CHECK (decision IN ('approved', 'changes_requested', 'rejected')),
    review_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now())
);

CREATE INDEX IF NOT EXISTS idx_workout_reviews_program ON public.workout_reviews(workout_program_id);

-- ------------------------------------------------------------------------------
-- 10. GOVERNANÇA DE ROLES E PERMISSÕES (SEGREGAÇÃO DE COMPETÊNCIA)
-- ------------------------------------------------------------------------------
INSERT INTO public.permissions (id, name, module, description)
VALUES 
    ('workout.review', 'Revisar Treinos Clínicos/Especiais', 'workout', 'Permite revisar tecnicamente e liberar programas de treino marcados como review_required.')
ON CONFLICT (id) DO UPDATE 
SET name = EXCLUDED.name, description = EXCLUDED.description;

-- Revogar permissões de prescrição/revisão técnica de treino de nutricionistas e influencers
-- (Prescrição de treino é atribuição legal privativa de Educação Física - CREF).
DELETE FROM public.role_permissions 
WHERE role_id IN ('nutritionist', 'influencer') 
  AND permission_id IN ('workout.review', 'workout.edit');

-- ------------------------------------------------------------------------------
-- 11. FUNÇÕES DE AUTORIZAÇÃO E SEGURANÇA (SCHEMA PRIVATE)
-- ------------------------------------------------------------------------------

-- 11.0. IS_PATIENT_OWNER
-- Comprova estruturalmente a relação de ownership entre o paciente e o usuário autenticado.
-- A arquitetura do sistema utiliza Shared Primary Key / Table Inheritance:
-- public.patients.id -> public.profiles.id -> auth.users.id
-- Esta função encapsula e garante formalmente que o usuário autenticado é o dono do registro de paciente.
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

GRANT EXECUTE ON FUNCTION private.is_patient_owner(UUID, UUID) TO authenticated;

-- 11.1. CAN_VIEW_WORKOUT_PROGRAM
CREATE OR REPLACE FUNCTION private.can_view_workout_program(viewer_id UUID, p_program_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_patient_id UUID;
    v_approval_status TEXT;
    v_is_active BOOLEAN;
    v_role_name TEXT;
BEGIN
    SELECT patient_id, approval_status, is_active
    INTO v_patient_id, v_approval_status, v_is_active
    FROM public.workout_programs
    WHERE id = p_program_id;

    IF v_patient_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- 1. Admin sempre visualiza para auditoria e governança
    IF private.is_admin(viewer_id) THEN
        RETURN TRUE;
    END IF;

    -- 2. Paciente Dono do Programa:
    -- O paciente visualiza estritamente programas aprovados e ativos.
    -- Estado de draft ou review_required é estritamente invisível ao paciente!
    IF private.is_patient_owner(v_patient_id, viewer_id) THEN
        IF v_approval_status = 'approved' AND v_is_active = TRUE THEN
            RETURN TRUE;
        END IF;

        RETURN FALSE;
    END IF;

    -- 3. Profissional com vínculo ativo (apenas leitura de apoio calórico):
    -- Nutricionistas com vínculo podem apenas consultar o treino ativo para alinhar calorias e macros.
    IF private.can_access_patient(viewer_id, v_patient_id) THEN
        SELECT p.role_id INTO v_role_name
        FROM public.profiles p
        WHERE p.id = viewer_id;

        IF v_role_name = 'nutritionist' THEN
            -- Nutricionista só vê para apoio se o treino estiver aprovado/ativo
            IF v_approval_status = 'approved' AND v_is_active = TRUE THEN
                RETURN TRUE;
            END IF;
        END IF;
    END IF;

    RETURN FALSE;
END;
$$;

-- 11.2. CAN_MANAGE_WORKOUT_PROGRAM
-- Permite aprovar, rejeitar ou editar um programa de treino.
-- Se generation_status = 'review_required', NENHUM papel existente (nem nutricionista, nem influencer, nem admin operacional)
-- pode aprovar sem papel técnico específico de Educação Física com 'workout.review'.
CREATE OR REPLACE FUNCTION private.can_manage_workout_program(viewer_id UUID, p_program_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_gen_status TEXT;
    v_has_review_perm BOOLEAN;
BEGIN
    SELECT generation_status INTO v_gen_status
    FROM public.workout_programs
    WHERE id = p_program_id;

    -- Programas marcados com review_required exigem competência técnica de Educação Física
    IF v_gen_status = 'review_required' THEN
        SELECT EXISTS (
            SELECT 1
            FROM public.profiles pr
            JOIN public.role_permissions rp ON rp.role_id = pr.role_id
            WHERE pr.id = viewer_id 
              AND rp.permission_id = 'workout.review'
              AND pr.role_id NOT IN ('admin', 'nutritionist', 'influencer', 'patient')
        ) INTO v_has_review_perm;

        RETURN v_has_review_perm;
    END IF;

    -- Para outros programas não marcados como review_required: Admin tem governança operacional
    IF private.is_admin(viewer_id) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION private.can_view_workout_program(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_workout_program(UUID, UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 12. TRIGGERS DE IMUTABILIDADE DE PROGRAMAS DE TREINO E EXERCÍCIOS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.check_workout_program_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role TEXT;
BEGIN
    v_role := COALESCE(current_setting('request.jwt.claim.role', true), '');

    -- Bypass para backend / service_role
    IF v_role IN ('service_role', 'supabase_admin') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF session_user IN ('postgres', 'supabase_admin')
       AND COALESCE(current_setting('role', true), 'none') = 'none'
       AND v_role = '' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Proíbe alteração de hashes de integridade, catálogo ou versão
        IF NEW.input_snapshot_hash <> OLD.input_snapshot_hash OR
           NEW.output_program_hash <> OLD.output_program_hash OR
           NEW.catalog_version <> OLD.catalog_version OR
           NEW.catalog_checksum <> OLD.catalog_checksum OR
           NEW.version <> OLD.version THEN
            RAISE EXCEPTION 'Adulteração de hashes de integridade ou identidade de catálogo de programa de treino é estritamente proibida.';
        END IF;

        -- Safety Gate: programas em review_required não podem ser auto-aprovados ou ativados por papéis sem qualificação técnica
        IF NEW.generation_status = 'review_required' AND (NEW.approval_status = 'approved' OR NEW.is_active = TRUE) THEN
            RAISE EXCEPTION 'SAFETY_VIOLATION: review_required workout programs cannot be approved or activated without qualified exercise professional authorization.';
        END IF;

        -- Safety Gate: programas infeasible não podem ser ativados
        IF NEW.generation_status = 'infeasible' AND (NEW.approval_status = 'approved' OR NEW.is_active = TRUE) THEN
            RAISE EXCEPTION 'SAFETY_VIOLATION: infeasible workout programs cannot be approved or activated.';
        END IF;

        IF OLD.approval_status IN ('approved', 'superseded') THEN
            IF NEW.patient_id <> OLD.patient_id OR
               NEW.sessions_per_week <> OLD.sessions_per_week OR
               NEW.objective <> OLD.objective THEN
                RAISE EXCEPTION 'Workout programs are strictly immutable once approved. Create a new version instead.';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.approval_status = 'approved' THEN
            RAISE EXCEPTION 'Exclusão de programa de treino ativo/aprovado é terminantemente proibida. O programa deve ser marcado como superseded.';
        END IF;
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workout_program_immutability ON public.workout_programs;
CREATE TRIGGER trg_workout_program_immutability
    BEFORE UPDATE OR DELETE ON public.workout_programs
    FOR EACH ROW
    EXECUTE FUNCTION private.check_workout_program_immutability();

CREATE OR REPLACE FUNCTION private.check_workout_exercise_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role TEXT;
    v_prog_approval_status TEXT;
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

    SELECT wp.approval_status INTO v_prog_approval_status
    FROM public.workout_sessions ws
    JOIN public.workout_program_days wpd ON wpd.id = ws.workout_program_day_id
    JOIN public.workout_programs wp ON wp.id = wpd.workout_program_id
    WHERE ws.id = COALESCE(OLD.workout_session_id, NEW.workout_session_id);

    IF v_prog_approval_status IN ('approved', 'superseded') THEN
        RAISE EXCEPTION 'Cannot modify exercises of existing workout program. Approved programs are immutable; create a new version.';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_workout_exercise_immutability ON public.workout_exercises;
CREATE TRIGGER trg_workout_exercise_immutability
    BEFORE UPDATE OR DELETE ON public.workout_exercises
    FOR EACH ROW
    EXECUTE FUNCTION private.check_workout_exercise_immutability();

-- 12.3. CHECK_WORKOUT_EXECUTION_LOG_IMMUTABILITY
-- Blindagem absoluta de auditoria e janela de correção:
-- 1. No INSERT: força created_at e updated_at gerados estritamente pelo PostgreSQL (ignora qualquer timestamp manipulado pelo cliente).
-- 2. No UPDATE: impede estritamente a mutação de chaves primárias e campos de identidade/ownership (id, patient_id, workout_exercise_id, created_at).
-- 3. No DELETE: proíbe deleção direta de logs de execução por usuários autenticados para assegurar integridade histórica.
CREATE OR REPLACE FUNCTION private.check_workout_execution_log_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role TEXT;
BEGIN
    v_role := COALESCE(current_setting('request.jwt.claim.role', true), '');

    -- Bypass para backend / service_role
    IF v_role IN ('service_role', 'supabase_admin') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF session_user IN ('postgres', 'supabase_admin')
       AND COALESCE(current_setting('role', true), 'none') = 'none'
       AND v_role = '' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'INSERT' THEN
        -- Blindagem temporal: created_at e updated_at são gerados confiavelmente pelo PostgreSQL
        NEW.created_at := pg_catalog.timezone('utc', pg_catalog.now());
        NEW.updated_at := pg_catalog.timezone('utc', pg_catalog.now());
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Blindagem de identidade e ownership: proíbe mutação de id, patient_id, workout_exercise_id ou created_at
        IF NEW.id <> OLD.id THEN
            RAISE EXCEPTION 'Cannot modify identity primary key id of workout_execution_logs.';
        END IF;

        IF NEW.patient_id <> OLD.patient_id THEN
            RAISE EXCEPTION 'Cannot modify patient_id of workout_execution_logs.';
        END IF;

        IF NEW.workout_exercise_id <> OLD.workout_exercise_id THEN
            RAISE EXCEPTION 'Cannot modify workout_exercise_id of workout_execution_logs.';
        END IF;

        IF NEW.created_at <> OLD.created_at THEN
            RAISE EXCEPTION 'Cannot modify created_at timestamp of workout_execution_logs.';
        END IF;

        NEW.updated_at := pg_catalog.timezone('utc', pg_catalog.now());
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Direct deletion of workout_execution_logs is prohibited to maintain audit trail.';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_workout_execution_log_immutability ON public.workout_execution_logs;
CREATE TRIGGER trg_workout_execution_log_immutability
    BEFORE INSERT OR UPDATE OR DELETE ON public.workout_execution_logs
    FOR EACH ROW
    EXECUTE FUNCTION private.check_workout_execution_log_immutability();

-- ------------------------------------------------------------------------------
-- 13. ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE public.exercise_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_program_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_exercise_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_progression_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_reviews ENABLE ROW LEVEL SECURITY;

-- 13.1. EXERCISE_CATALOG: Leitura para todos os usuários autenticados
CREATE POLICY "View active exercises"
    ON public.exercise_catalog FOR SELECT
    TO authenticated
    USING (is_active = TRUE);

CREATE POLICY "Admin manage exercise catalog"
    ON public.exercise_catalog FOR ALL
    TO authenticated
    USING (private.is_admin(auth.uid()))
    WITH CHECK (private.is_admin(auth.uid()));

-- 13.2. WORKOUT_PROGRAMS
CREATE POLICY "View workout programs via authorization function"
    ON public.workout_programs FOR SELECT
    TO authenticated
    USING (private.can_view_workout_program(auth.uid(), id));

CREATE POLICY "Manage workout programs via authorization function"
    ON public.workout_programs FOR ALL
    TO authenticated
    USING (private.can_manage_workout_program(auth.uid(), id))
    WITH CHECK (private.can_manage_workout_program(auth.uid(), id));

-- 13.3. WORKOUT_PROGRAM_DAYS
CREATE POLICY "View workout program days via program access"
    ON public.workout_program_days FOR SELECT
    TO authenticated
    USING (private.can_view_workout_program(auth.uid(), workout_program_id));

CREATE POLICY "Manage workout program days via program management"
    ON public.workout_program_days FOR ALL
    TO authenticated
    USING (private.can_manage_workout_program(auth.uid(), workout_program_id))
    WITH CHECK (private.can_manage_workout_program(auth.uid(), workout_program_id));

-- 13.4. WORKOUT_SESSIONS
CREATE POLICY "View workout sessions via program access"
    ON public.workout_sessions FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workout_program_days wpd
            WHERE wpd.id = workout_program_day_id
              AND private.can_view_workout_program(auth.uid(), wpd.workout_program_id)
        )
    );

CREATE POLICY "Manage workout sessions via program management"
    ON public.workout_sessions FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workout_program_days wpd
            WHERE wpd.id = workout_program_day_id
              AND private.can_manage_workout_program(auth.uid(), wpd.workout_program_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workout_program_days wpd
            WHERE wpd.id = workout_program_day_id
              AND private.can_manage_workout_program(auth.uid(), wpd.workout_program_id)
        )
    );

-- 13.5. WORKOUT_EXERCISES
CREATE POLICY "View workout exercises via program access"
    ON public.workout_exercises FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workout_sessions ws
            JOIN public.workout_program_days wpd ON wpd.id = ws.workout_program_day_id
            WHERE ws.id = workout_session_id
              AND private.can_view_workout_program(auth.uid(), wpd.workout_program_id)
        )
    );

CREATE POLICY "Manage workout exercises via program management"
    ON public.workout_exercises FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workout_sessions ws
            JOIN public.workout_program_days wpd ON wpd.id = ws.workout_program_day_id
            WHERE ws.id = workout_session_id
              AND private.can_manage_workout_program(auth.uid(), wpd.workout_program_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workout_sessions ws
            JOIN public.workout_program_days wpd ON wpd.id = ws.workout_program_day_id
            WHERE ws.id = workout_session_id
              AND private.can_manage_workout_program(auth.uid(), wpd.workout_program_id)
        )
    );

-- 13.6. WORKOUT_EXECUTION_LOGS: Segurança Estrita de Execução
-- SELECT: Paciente visualiza exclusivamente seus próprios logs (resolvido estruturalmente por is_patient_owner)
CREATE POLICY "Patients view own workout logs"
    ON public.workout_execution_logs FOR SELECT
    TO authenticated
    USING (private.is_patient_owner(patient_id, auth.uid()) OR private.is_admin(auth.uid()));

-- INSERT: Paciente insere apenas para si, e ESTRITAMENTE para exercícios pertencentes ao seu programa aprovado e ativo
CREATE POLICY "Patients insert own workout logs"
    ON public.workout_execution_logs FOR INSERT
    TO authenticated
    WITH CHECK (
        private.is_patient_owner(patient_id, auth.uid())
        AND EXISTS (
            SELECT 1 
            FROM public.workout_exercises we
            JOIN public.workout_sessions ws ON ws.id = we.workout_session_id
            JOIN public.workout_program_days wpd ON wpd.id = ws.workout_program_day_id
            JOIN public.workout_programs wp ON wp.id = wpd.workout_program_id
            WHERE we.id = workout_exercise_id
              AND private.is_patient_owner(wp.patient_id, auth.uid())
              AND wp.is_active = TRUE
              AND wp.approval_status = 'approved'
        )
    );

-- UPDATE: Política de correção: apenas o próprio paciente e dentro da janela estrita de 1 hora baseada em created_at gerado pelo PostgreSQL
-- O timestamp logged_at informado pelo cliente NÃO estende nem controla permissões.
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

-- DELETE: Nenhuma política para authenticated. Deleções diretas são proibidas para manter integridade histórica.

-- 13.7. WORKOUT_PROGRESSION_EVENTS: Eventos Derivados pelo Motor
-- SELECT: Paciente visualiza seus próprios eventos recomendados
CREATE POLICY "Patients view own progression events"
    ON public.workout_progression_events FOR SELECT
    TO authenticated
    USING (private.is_patient_owner(patient_id, auth.uid()) OR private.is_admin(auth.uid()));

-- NENHUMA política de INSERT, UPDATE ou DELETE para authenticated:
-- Eventos de progressão são estritamente derivados e inseridos pelo motor determinístico (service_role).

-- 13.8. WORKOUT_REVIEWS
CREATE POLICY "View workout reviews via program access"
    ON public.workout_reviews FOR SELECT
    TO authenticated
    USING (private.can_view_workout_program(auth.uid(), workout_program_id));

-- Permissões para service_role (usado pelo backend confiável)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT ALL ON TABLE public.exercise_catalog TO service_role;
        GRANT ALL ON TABLE public.workout_programs TO service_role;
        GRANT ALL ON TABLE public.workout_program_days TO service_role;
        GRANT ALL ON TABLE public.workout_sessions TO service_role;
        GRANT ALL ON TABLE public.workout_exercises TO service_role;
        GRANT ALL ON TABLE public.workout_exercise_sets TO service_role;
        GRANT ALL ON TABLE public.workout_execution_logs TO service_role;
        GRANT ALL ON TABLE public.workout_progression_events TO service_role;
        GRANT ALL ON TABLE public.workout_reviews TO service_role;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 14. RPC TRANSACIONAL ATÔMICO DE PERSISTÊNCIA E SUPERSEDING
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.persist_workout_program_atomic(
    p_program JSONB,
    p_auto_approve BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_program_id UUID;
    v_patient_id UUID;
    v_source_profile_id UUID;
    v_gen_status TEXT;
    v_approval_status TEXT;
    v_is_active BOOLEAN;
    v_day RECORD;
    v_day_id UUID;
    v_session RECORD;
    v_session_id UUID;
    v_exercise RECORD;
    v_role TEXT;
BEGIN
    -- 0. Autorização estrita idêntica ao diet composer e importador TACO:
    v_role := COALESCE(current_setting('request.jwt.claim.role', true), '');
    IF v_role IN ('service_role', 'supabase_admin') THEN
        -- Permitido (backend confiável)
    ELSIF session_user IN ('postgres', 'supabase_admin') AND COALESCE(current_setting('role', true), 'none') = 'none' AND v_role = '' THEN
        -- Permitido (conexão de manutenção / superusuário de banco)
    ELSE
        RAISE EXCEPTION 'Acesso negado: public.persist_workout_program_atomic aceita exclusivamente chamadas via service_role ou superusuário de banco. Praticantes devem invocar a Server Action autorizada.';
    END IF;

    IF p_program IS NULL THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Program JSON cannot be null';
    END IF;

    v_patient_id := (p_program->>'patient_id')::UUID;
    IF v_patient_id IS NULL THEN
        RAISE EXCEPTION 'MISSING_PATIENT_ID: patient_id is required';
    END IF;

    v_gen_status := COALESCE(p_program->>'generation_status', '');
    v_approval_status := COALESCE(p_program->>'approval_status', 'draft');

    -- 1. Serialização estável por paciente via advisory lock de transação (garante concorrência mesmo na 1ª geração)
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_patient_id::TEXT, 0));

    -- 2. Lock explícito e validação de existência do paciente
    PERFORM 1 FROM public.patients WHERE id = v_patient_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PATIENT_NOT_FOUND: patient_id % does not exist', v_patient_id;
    END IF;

    -- 3. Validação do perfil fonte físico (impede referências cross-patient)
    IF p_program ? 'source_profile_id' AND p_program->>'source_profile_id' IS NOT NULL THEN
        v_source_profile_id := (p_program->>'source_profile_id')::UUID;
        PERFORM 1 
        FROM public.patient_nutrition_profiles 
        WHERE id = v_source_profile_id AND id = v_patient_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'INVALID_SOURCE_PROFILE: source_profile_id % does not belong to patient %', v_source_profile_id, v_patient_id;
        END IF;
    END IF;

    -- 4. Validação de status proibidos
    IF v_gen_status IN ('blocked', 'insufficient_data', 'infeasible_blocked') THEN
        RAISE EXCEPTION 'CANNOT_PERSIST_BLOCKED_OR_INSUFFICIENT: generation_status % is not allowed for workout program', v_gen_status;
    END IF;

    IF v_gen_status NOT IN ('calculated', 'review_required', 'infeasible', 'superseded') THEN
        RAISE EXCEPTION 'INVALID_GENERATION_STATUS: % is not a valid status', v_gen_status;
    END IF;

    -- 5. Safety Gates: review_required ou infeasible NÃO PODEM ser aprovados ou ativos
    IF v_gen_status = 'review_required' AND (p_auto_approve = TRUE OR v_approval_status = 'approved') THEN
        RAISE EXCEPTION 'SAFETY_VIOLATION: review_required workout program cannot be persisted as approved or active';
    END IF;

    IF v_gen_status = 'infeasible' AND (p_auto_approve = TRUE OR v_approval_status = 'approved') THEN
        RAISE EXCEPTION 'SAFETY_VIOLATION: infeasible workout program cannot be persisted as approved or active';
    END IF;

    -- 6. Determinação formal de aprovação e ativação
    IF v_gen_status = 'calculated' AND (p_auto_approve = TRUE OR v_approval_status = 'approved') THEN
        v_approval_status := 'approved';
        v_is_active := TRUE;
    ELSE
        v_approval_status := 'draft';
        v_is_active := FALSE;
    END IF;

    -- 7. Superseder atomicamente programas ativos anteriores
    IF v_is_active THEN
        PERFORM 1 
        FROM public.workout_programs 
        WHERE patient_id = v_patient_id AND is_active = TRUE 
        FOR UPDATE;

        UPDATE public.workout_programs
        SET is_active = FALSE,
            approval_status = 'superseded',
            updated_at = pg_catalog.timezone('utc', pg_catalog.now())
        WHERE patient_id = v_patient_id AND is_active = TRUE;
    END IF;

    -- 8. Inserir programa principal com catálogo e provenance congelados
    INSERT INTO public.workout_programs (
        patient_id, engine_version, config_version, catalog_version, catalog_checksum,
        catalog_provenance, source_profile_version, source_profile_id,
        input_snapshot_hash, output_program_hash, objective, experience_level,
        sessions_per_week, session_duration_minutes, split_type,
        generation_status, approval_status, rejection_reason, infeasible_reason_codes,
        version, is_active, generation_reference_at
    )
    VALUES (
        v_patient_id,
        COALESCE(p_program->>'engine_version', '1.0.0'),
        COALESCE(p_program->>'config_version', 'config-1.0.0'),
        COALESCE(p_program->>'catalog_version', '1.0.0'),
        COALESCE(p_program->>'catalog_checksum', ''),
        COALESCE(p_program->'catalog_provenance', '{}'::jsonb),
        COALESCE((p_program->>'source_profile_version')::INT, 1),
        v_source_profile_id,
        p_program->>'input_snapshot_hash',
        p_program->>'output_program_hash',
        p_program->>'objective',
        p_program->>'experience_level',
        COALESCE((p_program->>'sessions_per_week')::INT, 3),
        COALESCE((p_program->>'session_duration_minutes')::INT, 60),
        COALESCE(p_program->>'split_type', 'full_body'),
        v_gen_status,
        v_approval_status,
        p_program->>'rejection_reason',
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_program->'infeasible_reason_codes')), '{}'::TEXT[]),
        COALESCE((p_program->>'version')::INT, 1),
        v_is_active,
        COALESCE((p_program->>'generation_reference_at')::TIMESTAMPTZ, pg_catalog.timezone('utc', pg_catalog.now()))
    )
    RETURNING id INTO v_program_id;

    -- 9. Atualizar superseded_by nos programas arquivados
    IF v_is_active THEN
        UPDATE public.workout_programs
        SET superseded_by = v_program_id
        WHERE patient_id = v_patient_id AND is_active = FALSE AND approval_status = 'superseded' AND superseded_by IS NULL;
    END IF;

    -- 10. Iterar e inserir dias, sessões e exercícios com snapshots históricos completos
    IF p_program ? 'days' AND jsonb_typeof(p_program->'days') = 'array' THEN
        FOR v_day IN SELECT * FROM jsonb_to_recordset(p_program->'days') AS x(
            day_of_week INT, day_label TEXT, is_rest_day BOOLEAN, sessions JSONB
        ) LOOP
            INSERT INTO public.workout_program_days (
                workout_program_id, day_of_week, day_label, is_rest_day
            )
            VALUES (
                v_program_id, v_day.day_of_week, v_day.day_label, COALESCE(v_day.is_rest_day, FALSE)
            )
            RETURNING id INTO v_day_id;

            IF v_day.sessions IS NOT NULL AND jsonb_typeof(v_day.sessions) = 'array' THEN
                FOR v_session IN SELECT * FROM jsonb_to_recordset(v_day.sessions) AS y(
                    session_order INT, name TEXT, session_focus TEXT,
                    estimated_duration_minutes INT, warmup_protocol JSONB, cooldown_protocol JSONB,
                    exercises JSONB
                ) LOOP
                    INSERT INTO public.workout_sessions (
                        workout_program_day_id, session_order, name, session_focus,
                        estimated_duration_minutes, warmup_protocol, cooldown_protocol
                    )
                    VALUES (
                        v_day_id, v_session.session_order, v_session.name, v_session.session_focus,
                        COALESCE(v_session.estimated_duration_minutes, 60),
                        COALESCE(v_session.warmup_protocol, '[]'::jsonb),
                        COALESCE(v_session.cooldown_protocol, '[]'::jsonb)
                    )
                    RETURNING id INTO v_session_id;

                    IF v_session.exercises IS NOT NULL AND jsonb_typeof(v_session.exercises) = 'array' THEN
                        FOR v_exercise IN SELECT * FROM jsonb_to_recordset(v_session.exercises) AS z(
                            exercise_id UUID, exercise_order INT, exercise_name TEXT,
                            movement_pattern TEXT, exercise_snapshot_hash TEXT,
                            primary_muscle_groups TEXT[], secondary_muscle_groups TEXT[],
                            required_equipment TEXT[], complexity_level TEXT,
                            is_unilateral BOOLEAN, is_compound BOOLEAN, catalog_source_version TEXT,
                            prescribed_sets INT, min_reps INT, max_reps INT,
                            target_rir INT, target_rpe NUMERIC, rest_seconds INT, tempo TEXT,
                            warmup_sets INT, notes TEXT, progression_strategy TEXT
                        ) LOOP
                            -- Validar elegibilidade e existência do exercício no catálogo
                            PERFORM 1 
                            FROM public.exercise_catalog 
                            WHERE id = v_exercise.exercise_id AND is_active = TRUE;
                            IF NOT FOUND THEN
                                RAISE EXCEPTION 'INVALID_EXERCISE: exercise_id % does not exist or is inactive', v_exercise.exercise_id;
                            END IF;

                            INSERT INTO public.workout_exercises (
                                workout_session_id, exercise_id, exercise_order, exercise_name,
                                movement_pattern, exercise_snapshot_hash,
                                primary_muscle_groups, secondary_muscle_groups, required_equipment,
                                complexity_level, is_unilateral, is_compound, catalog_source_version,
                                prescribed_sets, min_reps, max_reps,
                                target_rir, target_rpe, rest_seconds, tempo, warmup_sets,
                                notes, progression_strategy
                            )
                            VALUES (
                                v_session_id, v_exercise.exercise_id, v_exercise.exercise_order, v_exercise.exercise_name,
                                v_exercise.movement_pattern, COALESCE(v_exercise.exercise_snapshot_hash, ''),
                                COALESCE(v_exercise.primary_muscle_groups, '{}'::TEXT[]),
                                COALESCE(v_exercise.secondary_muscle_groups, '{}'::TEXT[]),
                                COALESCE(v_exercise.required_equipment, '{}'::TEXT[]),
                                COALESCE(v_exercise.complexity_level, 'beginner'),
                                COALESCE(v_exercise.is_unilateral, FALSE),
                                COALESCE(v_exercise.is_compound, TRUE),
                                COALESCE(v_exercise.catalog_source_version, '1.0.0'),
                                v_exercise.prescribed_sets, v_exercise.min_reps, v_exercise.max_reps,
                                v_exercise.target_rir, v_exercise.target_rpe, v_exercise.rest_seconds, v_exercise.tempo,
                                COALESCE(v_exercise.warmup_sets, 0), v_exercise.notes,
                                COALESCE(v_exercise.progression_strategy, 'double_progression')
                            );
                        END LOOP;
                    END IF;
                END LOOP;
            END IF;
        END LOOP;
    END IF;

    RETURN v_program_id;
END;
$$;

-- Revogar estritamente permissão pública/anon/authenticated e conceder apenas a service_role
REVOKE ALL ON FUNCTION public.persist_workout_program_atomic(JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_workout_program_atomic(JSONB, BOOLEAN) TO service_role;
