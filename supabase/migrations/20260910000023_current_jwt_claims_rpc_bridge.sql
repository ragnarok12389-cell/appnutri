-- ETAPA 11C: compatibilidade dos RPCs privilegiados com o formato JWT atual do PostgREST

CREATE OR REPLACE FUNCTION private.current_request_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
$$;

REVOKE ALL ON FUNCTION private.current_request_role() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.current_request_role() TO service_role;

CREATE OR REPLACE FUNCTION public.persist_diet_plan_from_service(
  p_plan JSONB,
  p_auto_approve BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := private.current_request_role();
  IF v_role NOT IN ('service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'Acesso negado: persist_diet_plan_from_service aceita exclusivamente service_role.';
  END IF;

  PERFORM pg_catalog.set_config('request.jwt.claim.role', v_role, TRUE);
  RETURN public.persist_diet_plan_atomic(p_plan, p_auto_approve);
END;
$$;

CREATE OR REPLACE FUNCTION public.persist_workout_program_from_service(
  p_program JSONB,
  p_auto_approve BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := private.current_request_role();
  IF v_role NOT IN ('service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'Acesso negado: persist_workout_program_from_service aceita exclusivamente service_role.';
  END IF;

  PERFORM pg_catalog.set_config('request.jwt.claim.role', v_role, TRUE);
  RETURN public.persist_workout_program_atomic(p_program, p_auto_approve);
END;
$$;

REVOKE ALL ON FUNCTION public.persist_diet_plan_from_service(JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.persist_workout_program_from_service(JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_diet_plan_from_service(JSONB, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.persist_workout_program_from_service(JSONB, BOOLEAN) TO service_role;

COMMENT ON FUNCTION public.persist_diet_plan_from_service(JSONB, BOOLEAN) IS
  'Ponte server-only que valida request.jwt.claims atual antes do RPC atômico legado.';
COMMENT ON FUNCTION public.persist_workout_program_from_service(JSONB, BOOLEAN) IS
  'Ponte server-only que valida request.jwt.claims atual antes do RPC atômico legado.';
