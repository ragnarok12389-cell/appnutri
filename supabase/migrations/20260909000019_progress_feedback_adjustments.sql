-- =============================================================================
-- ETAPA 9: PROGRESSO, FEEDBACK E PROPOSTAS DE AJUSTE
-- =============================================================================

CREATE TABLE public.patient_check_ins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    check_in_date DATE NOT NULL,
    weight_kg NUMERIC(5,2) CHECK (weight_kg IS NULL OR weight_kg BETWEEN 20 AND 400),
    hunger_level INT CHECK (hunger_level IS NULL OR hunger_level BETWEEN 1 AND 5),
    energy_level INT CHECK (energy_level IS NULL OR energy_level BETWEEN 1 AND 5),
    sleep_quality INT CHECK (sleep_quality IS NULL OR sleep_quality BETWEEN 1 AND 5),
    nutrition_adherence_rating INT CHECK (nutrition_adherence_rating IS NULL OR nutrition_adherence_rating BETWEEN 1 AND 5),
    workout_adherence_rating INT CHECK (workout_adherence_rating IS NULL OR workout_adherence_rating BETWEEN 1 AND 5),
    concerning_symptoms BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT patient_check_in_not_future CHECK (check_in_date <= (created_at AT TIME ZONE 'UTC')::date),
    CONSTRAINT patient_check_in_has_data CHECK (
        weight_kg IS NOT NULL OR hunger_level IS NOT NULL OR energy_level IS NOT NULL OR
        sleep_quality IS NOT NULL OR nutrition_adherence_rating IS NOT NULL OR
        workout_adherence_rating IS NOT NULL OR concerning_symptoms OR notes IS NOT NULL
    ),
    UNIQUE (patient_id, check_in_date)
);

CREATE INDEX idx_patient_check_ins_patient_date
    ON public.patient_check_ins(patient_id, check_in_date DESC);

CREATE TABLE public.progress_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    window_start DATE NOT NULL,
    window_end DATE NOT NULL,
    engine_version TEXT NOT NULL,
    config_version TEXT NOT NULL,
    input_hash TEXT NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
    output_hash TEXT NOT NULL CHECK (output_hash ~ '^[0-9a-f]{64}$'),
    input_snapshot JSONB NOT NULL,
    metrics JSONB NOT NULL,
    reason_codes TEXT[] NOT NULL DEFAULT '{}',
    data_quality TEXT NOT NULL CHECK (data_quality IN ('insufficient', 'partial', 'sufficient')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (window_start <= window_end),
    UNIQUE (patient_id, engine_version, config_version, input_hash)
);

CREATE INDEX idx_progress_analyses_patient_created
    ON public.progress_analyses(patient_id, created_at DESC);

CREATE TABLE public.adjustment_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    analysis_id UUID NOT NULL REFERENCES public.progress_analyses(id) ON DELETE RESTRICT,
    domain TEXT NOT NULL CHECK (domain IN ('nutrition', 'workout', 'general')),
    proposal_type TEXT NOT NULL CHECK (proposal_type IN (
        'review_meal_satiety', 'review_nutrition_adherence', 'review_workout_adherence',
        'review_exercise_discomfort', 'review_routine_feasibility', 'professional_follow_up'
    )),
    priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
    reason_codes TEXT[] NOT NULL,
    summary TEXT NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 500),
    status TEXT NOT NULL DEFAULT 'pending_review' CHECK (
        status IN ('pending_review', 'accepted_for_review', 'dismissed')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    UNIQUE (analysis_id, domain, proposal_type)
);

CREATE INDEX idx_adjustment_proposals_patient_status
    ON public.adjustment_proposals(patient_id, status, created_at DESC);

CREATE TABLE public.adjustment_proposal_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL UNIQUE REFERENCES public.adjustment_proposals(id) ON DELETE RESTRICT,
    reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    decision TEXT NOT NULL CHECK (decision IN ('accepted_for_review', 'dismissed')),
    notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION private.block_progress_history_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.created_at := now();
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Progress history is append-only.';
END;
$$;

CREATE TRIGGER trg_patient_check_ins_append_only
    BEFORE INSERT OR UPDATE OR DELETE ON public.patient_check_ins
    FOR EACH ROW EXECUTE FUNCTION private.block_progress_history_mutation();

CREATE TRIGGER trg_progress_analyses_append_only
    BEFORE INSERT OR UPDATE OR DELETE ON public.progress_analyses
    FOR EACH ROW EXECUTE FUNCTION private.block_progress_history_mutation();

CREATE TRIGGER trg_adjustment_reviews_append_only
    BEFORE INSERT OR UPDATE OR DELETE ON public.adjustment_proposal_reviews
    FOR EACH ROW EXECUTE FUNCTION private.block_progress_history_mutation();

CREATE OR REPLACE FUNCTION private.can_view_patient_progress(p_user_id UUID, p_patient_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        private.is_patient_owner(p_patient_id, p_user_id)
        OR private.is_admin(p_user_id)
        OR (
            private.can_access_patient(p_user_id, p_patient_id)
            AND EXISTS (
                SELECT 1
                FROM public.profiles pr
                JOIN public.role_permissions rp ON rp.role_id = pr.role_id
                WHERE pr.id = p_user_id
                  AND pr.role_id = 'nutritionist'
                  AND rp.permission_id = 'progress.view'
            )
        );
$$;

ALTER TABLE public.patient_check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adjustment_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adjustment_proposal_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View authorized patient check ins"
    ON public.patient_check_ins FOR SELECT TO authenticated
    USING (private.can_view_patient_progress(auth.uid(), patient_id));

CREATE POLICY "Patients insert own check ins"
    ON public.patient_check_ins FOR INSERT TO authenticated
    WITH CHECK (private.is_patient_owner(patient_id, auth.uid()));

CREATE POLICY "View authorized progress analyses"
    ON public.progress_analyses FOR SELECT TO authenticated
    USING (private.can_view_patient_progress(auth.uid(), patient_id));

CREATE POLICY "View authorized adjustment proposals"
    ON public.adjustment_proposals FOR SELECT TO authenticated
    USING (private.can_view_patient_progress(auth.uid(), patient_id));

CREATE POLICY "View authorized adjustment reviews"
    ON public.adjustment_proposal_reviews FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.adjustment_proposals proposal
            WHERE proposal.id = proposal_id
              AND private.can_view_patient_progress(auth.uid(), proposal.patient_id)
        )
    );

GRANT SELECT, INSERT ON TABLE public.patient_check_ins TO authenticated;
REVOKE UPDATE, DELETE ON TABLE public.patient_check_ins FROM authenticated;
GRANT SELECT ON TABLE public.progress_analyses TO authenticated;
GRANT SELECT ON TABLE public.adjustment_proposals TO authenticated;
GRANT SELECT ON TABLE public.adjustment_proposal_reviews TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.progress_analyses FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.adjustment_proposals FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.adjustment_proposal_reviews FROM authenticated;

CREATE OR REPLACE FUNCTION public.persist_progress_analysis_atomic(
    p_patient_id UUID,
    p_window_start DATE,
    p_window_end DATE,
    p_engine_version TEXT,
    p_config_version TEXT,
    p_input_hash TEXT,
    p_output_hash TEXT,
    p_input_snapshot JSONB,
    p_metrics JSONB,
    p_reason_codes TEXT[],
    p_data_quality TEXT,
    p_proposals JSONB,
    p_feedback_ids UUID[] DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_analysis_id UUID;
    v_proposal JSONB;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.patients WHERE id = p_patient_id) THEN
        RAISE EXCEPTION 'Patient not found.';
    END IF;
    IF p_window_start > p_window_end OR p_window_end > CURRENT_DATE THEN
        RAISE EXCEPTION 'Invalid analysis window.';
    END IF;
    IF p_input_hash !~ '^[0-9a-f]{64}$' OR p_output_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Invalid progress hash.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('progress:' || p_patient_id::text));

    SELECT id INTO v_analysis_id
    FROM public.progress_analyses
    WHERE patient_id = p_patient_id
      AND engine_version = p_engine_version
      AND config_version = p_config_version
      AND input_hash = p_input_hash;

    IF v_analysis_id IS NOT NULL THEN
        RETURN v_analysis_id;
    END IF;

    INSERT INTO public.progress_analyses (
        patient_id, window_start, window_end, engine_version, config_version,
        input_hash, output_hash, input_snapshot, metrics, reason_codes, data_quality
    ) VALUES (
        p_patient_id, p_window_start, p_window_end, p_engine_version, p_config_version,
        p_input_hash, p_output_hash, p_input_snapshot, p_metrics, p_reason_codes, p_data_quality
    ) RETURNING id INTO v_analysis_id;

    FOR v_proposal IN SELECT value FROM jsonb_array_elements(COALESCE(p_proposals, '[]'::jsonb))
    LOOP
        INSERT INTO public.adjustment_proposals (
            patient_id, analysis_id, domain, proposal_type, priority, reason_codes, summary
        ) VALUES (
            p_patient_id,
            v_analysis_id,
            v_proposal->>'domain',
            v_proposal->>'proposal_type',
            v_proposal->>'priority',
            ARRAY(SELECT jsonb_array_elements_text(v_proposal->'reason_codes')),
            v_proposal->>'summary'
        );
    END LOOP;

    UPDATE public.ai_feedback_events
    SET status = 'processed_stage9'
    WHERE patient_id = p_patient_id
      AND id = ANY(p_feedback_ids)
      AND status = 'recorded';

    RETURN v_analysis_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_adjustment_proposal(
    p_proposal_id UUID,
    p_reviewer_id UUID,
    p_decision TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_proposal public.adjustment_proposals%ROWTYPE;
    v_reviewer_role TEXT;
BEGIN
    IF p_decision NOT IN ('accepted_for_review', 'dismissed') OR char_length(COALESCE(p_notes, '')) > 1000 THEN
        RAISE EXCEPTION 'Invalid review payload.';
    END IF;

    SELECT * INTO v_proposal
    FROM public.adjustment_proposals
    WHERE id = p_proposal_id
    FOR UPDATE;

    IF NOT FOUND OR v_proposal.status <> 'pending_review' THEN
        RETURN FALSE;
    END IF;

    SELECT role_id INTO v_reviewer_role FROM public.profiles WHERE id = p_reviewer_id AND is_active = TRUE;

    IF v_reviewer_role = 'admin' THEN
        NULL;
    ELSIF v_reviewer_role = 'nutritionist'
          AND v_proposal.domain IN ('nutrition', 'general')
          AND private.can_access_patient(p_reviewer_id, v_proposal.patient_id) THEN
        NULL;
    ELSE
        RAISE EXCEPTION 'Reviewer is not authorized for this proposal domain.';
    END IF;

    INSERT INTO public.adjustment_proposal_reviews (proposal_id, reviewer_id, decision, notes)
    VALUES (p_proposal_id, p_reviewer_id, p_decision, NULLIF(trim(p_notes), ''));

    UPDATE public.adjustment_proposals
    SET status = p_decision, resolved_at = now()
    WHERE id = p_proposal_id;

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.persist_progress_analysis_atomic(
    UUID, DATE, DATE, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT[], TEXT, JSONB, UUID[]
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_adjustment_proposal(UUID, UUID, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT ALL ON TABLE public.patient_check_ins TO service_role;
        GRANT ALL ON TABLE public.progress_analyses TO service_role;
        GRANT ALL ON TABLE public.adjustment_proposals TO service_role;
        GRANT ALL ON TABLE public.adjustment_proposal_reviews TO service_role;
        GRANT EXECUTE ON FUNCTION public.persist_progress_analysis_atomic(
            UUID, DATE, DATE, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT[], TEXT, JSONB, UUID[]
        ) TO service_role;
        GRANT EXECUTE ON FUNCTION public.review_adjustment_proposal(UUID, UUID, TEXT, TEXT)
            TO service_role;
    END IF;
END $$;

COMMENT ON TABLE public.patient_check_ins IS 'Check-ins estruturados e append-only informados pelo paciente.';
COMMENT ON TABLE public.progress_analyses IS 'Snapshots imutáveis do motor determinístico de progresso.';
COMMENT ON TABLE public.adjustment_proposals IS 'Propostas de revisão; nunca representam alteração automática de plano.';
