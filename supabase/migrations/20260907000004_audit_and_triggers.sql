-- ==============================================================================
-- MIGRATION: 20260907000004_audit_and_triggers.sql
-- DESCRIPTION: Triggers with search_path='', Unconditional Patient Signup & Immutability
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. HELPER: UPDATE TIMESTAMP
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = pg_catalog.timezone('utc', pg_catalog.now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;
CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS update_org_members_updated_at ON public.organization_members;
CREATE TRIGGER update_org_members_updated_at
    BEFORE UPDATE ON public.organization_members
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS update_prof_profiles_updated_at ON public.professional_profiles;
CREATE TRIGGER update_prof_profiles_updated_at
    BEFORE UPDATE ON public.professional_profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS update_patients_updated_at ON public.patients;
CREATE TRIGGER update_patients_updated_at
    BEFORE UPDATE ON public.patients
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS update_prof_patient_links_updated_at ON public.professional_patient_links;
CREATE TRIGGER update_prof_patient_links_updated_at
    BEFORE UPDATE ON public.professional_patient_links
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------------------------------------
-- 2. HARDENED IMMUTABILITY TRIGGER: PREVENT SELF-ROLE ESCALATION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_profile_role_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- If role_id is being changed and the actor is not an admin, reject transaction
    IF OLD.role_id IS DISTINCT FROM NEW.role_id THEN
        IF auth.uid() IS NOT NULL AND NOT private.is_admin(auth.uid()) THEN
            RAISE EXCEPTION 'Acesso Negado: A alteração de papéis (roles) é estritamente restrita a administradores.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_unauthorized_role_change ON public.profiles;
CREATE TRIGGER trg_prevent_unauthorized_role_change
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_role_immutability();

-- ------------------------------------------------------------------------------
-- 3. HARDENED AUTH TRIGGER: UNCONDITIONAL PATIENT ROLE FOR PUBLIC SIGNUPS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role_id TEXT;
    v_full_name TEXT;
BEGIN
    -- MANDATORY SECURITY RULE: All public signups are strictly and unconditionally PATIENT.
    -- ADMIN, NUTRITIONIST, and INFLUENCER must be provisioned through secure administrative flows,
    -- invitations, or administrative approvals. No user metadata can grant professional roles.
    v_role_id := 'patient';

    -- Extract sanitized full name
    v_full_name := COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
        SPLIT_PART(NEW.email, '@', 1)
    );

    -- 1. Create base profile (ALWAYS patient role)
    INSERT INTO public.profiles (
        id,
        role_id,
        full_name,
        email,
        avatar_url,
        is_active
    ) VALUES (
        NEW.id,
        v_role_id,
        v_full_name,
        NEW.email,
        NEW.raw_user_meta_data->>'avatar_url',
        TRUE
    );

    -- 2. Create patient domain record
    INSERT INTO public.patients (
        id,
        notes
    ) VALUES (
        NEW.id,
        'Paciente cadastrado via portal.'
    );

    -- 3. Record audit log
    INSERT INTO public.audit_logs (
        actor_id,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        NEW.id,
        'auth.user_created',
        'profile',
        NEW.id::text,
        pg_catalog.jsonb_build_object(
            'role_id', v_role_id,
            'email', NEW.email
        )
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------------------------
-- 4. HARDENED AUDIT LOGGER HELPER (ANTI-SPOOFING & search_path = '')
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_audit_event(
    p_actor_id UUID,
    p_action TEXT,
    p_entity_type TEXT,
    p_entity_id TEXT DEFAULT NULL,
    p_organization_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_ip_address TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_log_id UUID;
    v_enforced_actor_id UUID;
BEGIN
    -- ANTI-SPOOFING: If called from an authenticated session by a non-admin,
    -- enforce actor_id to be auth.uid(), preventing client-side actor spoofing.
    IF auth.uid() IS NOT NULL AND NOT private.is_admin(auth.uid()) THEN
        v_enforced_actor_id := auth.uid();
    ELSE
        v_enforced_actor_id := COALESCE(auth.uid(), p_actor_id);
    END IF;

    INSERT INTO public.audit_logs (
        actor_id,
        action,
        entity_type,
        entity_id,
        organization_id,
        metadata,
        ip_address,
        user_agent
    ) VALUES (
        v_enforced_actor_id,
        p_action,
        p_entity_type,
        p_entity_id,
        p_organization_id,
        COALESCE(p_metadata, '{}'::jsonb),
        p_ip_address,
        p_user_agent
    ) RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. AUDIT LOG IMMUTABILITY TRIGGER (APPEND-ONLY LEDGER)
-- ------------------------------------------------------------------------------
-- Protects audit logs against modification or deletion by application users and admins.
-- Note: Does not claim absolute defense against PostgreSQL superusers / DBAs with direct disk/root access.
CREATE OR REPLACE FUNCTION public.enforce_audit_log_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Acesso Negado: Registros da tabela audit_logs são estritamente imutáveis (append-only ledger). Atualizações e exclusões são proibidas para usuários e administradores da aplicação.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_audit_tampering ON public.audit_logs;
CREATE TRIGGER trg_prevent_audit_tampering
    BEFORE UPDATE OR DELETE ON public.audit_logs
    FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_audit_log_immutability();

-- ------------------------------------------------------------------------------
-- 6. STRICT PERMISSIONS REVOCATION
-- ------------------------------------------------------------------------------
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit_event(UUID, TEXT, TEXT, TEXT, UUID, JSONB, TEXT, TEXT) TO authenticated, service_role;
