-- ==============================================================================
-- MIGRATION: 20260909000018_ai_companion_runtime_hardening.sql
-- DESCRIPTION: Fecha lacunas do runtime real da Etapa 8: rate limit atômico,
--              confirmação concorrente e vínculo do payload ao plano do paciente.
-- ==============================================================================

ALTER TABLE public.ai_tool_executions
    DROP CONSTRAINT IF EXISTS ai_tool_executions_confirmation_status_check;

ALTER TABLE public.ai_tool_executions
    ADD CONSTRAINT ai_tool_executions_confirmation_status_check CHECK (
        confirmation_status IN ('not_required', 'pending', 'processing', 'confirmed', 'cancelled', 'expired')
    );

ALTER TABLE public.ai_tool_executions
    ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_tool_confirmation_token
    ON public.ai_tool_executions(confirmation_token)
    WHERE confirmation_token IS NOT NULL;

CREATE OR REPLACE FUNCTION public.consume_ai_rate_limit(
    p_patient_id UUID,
    p_max_messages INT,
    p_window_seconds INT
)
RETURNS TABLE (
    allowed BOOLEAN,
    message_count INT,
    window_started_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_now TIMESTAMPTZ := pg_catalog.now();
    v_count INT;
    v_window TIMESTAMPTZ;
BEGIN
    IF p_patient_id IS NULL OR p_max_messages < 1 OR p_window_seconds < 1 THEN
        RAISE EXCEPTION 'INVALID_RATE_LIMIT_ARGUMENTS';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = p_patient_id) THEN
        RAISE EXCEPTION 'PATIENT_NOT_FOUND';
    END IF;

    INSERT INTO public.ai_rate_limits (
        patient_id,
        message_count_current_hour,
        tool_count_current_hour,
        window_started_at,
        updated_at
    )
    VALUES (p_patient_id, 0, 0, v_now, v_now)
    ON CONFLICT (patient_id) DO NOTHING;

    SELECT ar.message_count_current_hour, ar.window_started_at
    INTO v_count, v_window
    FROM public.ai_rate_limits ar
    WHERE ar.patient_id = p_patient_id
    FOR UPDATE;

    IF v_now >= v_window + pg_catalog.make_interval(secs => p_window_seconds) THEN
        v_count := 1;
        v_window := v_now;
        UPDATE public.ai_rate_limits
        SET message_count_current_hour = v_count,
            window_started_at = v_window,
            updated_at = v_now
        WHERE patient_id = p_patient_id;
        RETURN QUERY SELECT TRUE, v_count, v_window;
        RETURN;
    END IF;

    IF v_count >= p_max_messages THEN
        RETURN QUERY SELECT FALSE, v_count, v_window;
        RETURN;
    END IF;

    v_count := v_count + 1;
    UPDATE public.ai_rate_limits
    SET message_count_current_hour = v_count,
        updated_at = v_now
    WHERE patient_id = p_patient_id;

    RETURN QUERY SELECT TRUE, v_count, v_window;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_ai_pending_action(
    p_confirmation_token TEXT,
    p_patient_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_action public.ai_tool_executions%ROWTYPE;
    v_plan_id UUID;
    v_item_id UUID;
    v_meal_id UUID;
    v_current_food_id UUID;
    v_owned BOOLEAN;
BEGIN
    SELECT ate.* INTO v_action
    FROM public.ai_tool_executions ate
    WHERE ate.confirmation_token = p_confirmation_token
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN pg_catalog.jsonb_build_object('ok', FALSE, 'error', 'INVALID_CONFIRMATION_TOKEN');
    END IF;

    IF v_action.patient_id <> p_patient_id THEN
        RETURN pg_catalog.jsonb_build_object('ok', FALSE, 'error', 'CROSS_TENANT_ACTION_BLOCKED');
    END IF;

    IF v_action.confirmation_status <> 'pending' THEN
        RETURN pg_catalog.jsonb_build_object('ok', FALSE, 'error', 'ACTION_ALREADY_CONSUMED');
    END IF;

    IF v_action.confirmation_expires_at IS NULL OR v_action.confirmation_expires_at <= pg_catalog.now() THEN
        UPDATE public.ai_tool_executions
        SET confirmation_status = 'expired',
            execution_status = 'failed',
            resolved_at = pg_catalog.now(),
            error_message = 'CONFIRMATION_EXPIRED'
        WHERE id = v_action.id;
        RETURN pg_catalog.jsonb_build_object('ok', FALSE, 'error', 'CONFIRMATION_EXPIRED');
    END IF;

    BEGIN
        v_plan_id := (v_action.input_arguments ->> 'plan_id')::UUID;
        v_item_id := (v_action.input_arguments ->> 'item_id')::UUID;
        v_meal_id := (v_action.input_arguments ->> 'meal_id')::UUID;
        v_current_food_id := (v_action.input_arguments ->> 'current_food_id')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        RETURN pg_catalog.jsonb_build_object('ok', FALSE, 'error', 'INVALID_ACTION_PAYLOAD');
    END;

    SELECT EXISTS (
        SELECT 1
        FROM public.diet_meal_items dmi
        JOIN public.diet_meals dm ON dm.id = dmi.diet_meal_id
        JOIN public.diet_plan_days dpd ON dpd.id = dm.diet_plan_day_id
        JOIN public.diet_plans dp ON dp.id = dpd.diet_plan_id
        WHERE dmi.id = v_item_id
          AND dmi.diet_meal_id = v_meal_id
          AND dmi.food_id = v_current_food_id
          AND dp.id = v_plan_id
          AND dp.patient_id = p_patient_id
          AND dp.is_active = TRUE
          AND dp.approval_status = 'approved'
    ) INTO v_owned;

    IF NOT v_owned THEN
        RETURN pg_catalog.jsonb_build_object('ok', FALSE, 'error', 'ACTION_TARGET_NOT_OWNED');
    END IF;

    UPDATE public.ai_tool_executions
    SET confirmation_status = 'processing'
    WHERE id = v_action.id;

    RETURN pg_catalog.jsonb_build_object(
        'ok', TRUE,
        'patient_id', v_action.patient_id,
        'expires_at', v_action.confirmation_expires_at,
        'payload', v_action.input_arguments
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_ai_pending_action(
    p_confirmation_token TEXT,
    p_patient_id UUID,
    p_success BOOLEAN,
    p_output JSONB DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_updated INT;
BEGIN
    UPDATE public.ai_tool_executions
    SET confirmation_status = CASE WHEN p_success THEN 'confirmed' ELSE 'cancelled' END,
        execution_status = CASE WHEN p_success THEN 'success' ELSE 'failed' END,
        output_payload = COALESCE(p_output, output_payload),
        error_message = p_error_message,
        resolved_at = pg_catalog.now()
    WHERE confirmation_token = p_confirmation_token
      AND patient_id = p_patient_id
      AND confirmation_status = 'processing';

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_ai_pending_action(
    p_confirmation_token TEXT,
    p_patient_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_updated INT;
BEGIN
    UPDATE public.ai_tool_executions
    SET confirmation_status = 'cancelled',
        execution_status = 'failed',
        resolved_at = pg_catalog.now(),
        error_message = 'CANCELLED_BY_USER'
    WHERE confirmation_token = p_confirmation_token
      AND patient_id = p_patient_id
      AND confirmation_status = 'pending';

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_rate_limit(UUID, INT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_ai_pending_action(TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_ai_pending_action(TEXT, UUID, BOOLEAN, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_ai_pending_action(TEXT, UUID) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.consume_ai_rate_limit(UUID, INT, INT) TO service_role;
        GRANT EXECUTE ON FUNCTION public.claim_ai_pending_action(TEXT, UUID) TO service_role;
        GRANT EXECUTE ON FUNCTION public.finalize_ai_pending_action(TEXT, UUID, BOOLEAN, JSONB, TEXT) TO service_role;
        GRANT EXECUTE ON FUNCTION public.cancel_ai_pending_action(TEXT, UUID) TO service_role;
    END IF;
END $$;
