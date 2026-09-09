-- ==============================================================================
-- MIGRATION: 20260907000007_atomic_enrollment_and_rpc_wrappers.sql
-- DESCRIPTION: Truly Atomic Invite Enrollment via Trigger & Controlled Public RPC Wrappers
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. HARDENED ATOMIC TRIGGER: HANDLE_NEW_USER WITH INVITE CONSUMPTION & ROLLBACK
-- ------------------------------------------------------------------------------
-- If any invite validation fails, the trigger raises an exception, which rolls
-- back the entire auth.users insert transaction. ZERO residual or orphan accounts.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_patient_token_hash TEXT;
    v_prof_token_hash TEXT;
    v_patient_invite public.patient_invites%ROWTYPE;
    v_prof_invite public.professional_invites%ROWTYPE;
    v_full_name TEXT;
    v_prof_type TEXT;
    v_link_type TEXT;
BEGIN
    -- Extract full name
    v_full_name := COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
        SPLIT_PART(NEW.email, '@', 1)
    );

    v_patient_token_hash := NULLIF(TRIM(NEW.raw_user_meta_data->>'patient_invite_token_hash'), '');
    v_prof_token_hash := NULLIF(TRIM(NEW.raw_user_meta_data->>'professional_invite_token_hash'), '');

    -- ==========================================================================
    -- CASE A: PATIENT INVITE SIGNUP (Atomic Enrollment)
    -- ==========================================================================
    IF v_patient_token_hash IS NOT NULL THEN
        -- 1. Lock invite row
        SELECT * INTO v_patient_invite
        FROM public.patient_invites
        WHERE token_hash = v_patient_token_hash
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'INVITE_NOT_FOUND' USING ERRCODE = 'P0002';
        END IF;

        IF v_patient_invite.revoked_at IS NOT NULL OR v_patient_invite.status = 'revoked' THEN
            RAISE EXCEPTION 'INVITE_REVOKED' USING ERRCODE = 'P0004';
        END IF;

        IF v_patient_invite.expires_at < pg_catalog.timezone('utc', pg_catalog.now()) OR v_patient_invite.status = 'expired' THEN
            UPDATE public.patient_invites SET status = 'expired' WHERE id = v_patient_invite.id;
            RAISE EXCEPTION 'INVITE_EXPIRED' USING ERRCODE = 'P0005';
        END IF;

        IF v_patient_invite.status <> 'pending' THEN
            RAISE EXCEPTION 'INVITE_ALREADY_USED_OR_INVALID' USING ERRCODE = 'P0003';
        END IF;

        -- Validate email match if the invite was directed to a specific email
        IF v_patient_invite.email IS NOT NULL AND LOWER(TRIM(v_patient_invite.email)) <> LOWER(TRIM(NEW.email)) THEN
            RAISE EXCEPTION 'INVITE_EMAIL_MISMATCH' USING ERRCODE = 'P0006';
        END IF;

        -- 2. Create base profile (Always patient)
        INSERT INTO public.profiles (
            id, role_id, full_name, email, avatar_url, is_active
        ) VALUES (
            NEW.id, 'patient', v_full_name, NEW.email, NEW.raw_user_meta_data->>'avatar_url', TRUE
        );

        -- 3. Create patient record
        INSERT INTO public.patients (id, notes)
        VALUES (NEW.id, 'Paciente cadastrado via convite seguro.');

        -- 4. Determine link type
        SELECT professional_type INTO v_prof_type
        FROM public.professional_profiles
        WHERE id = v_patient_invite.professional_id;

        IF v_prof_type = 'influencer' THEN
            v_link_type := 'influencer_referral';
        ELSE
            v_link_type := 'direct';
        END IF;

        -- 5. Create active primary link
        INSERT INTO public.professional_patient_links (
            professional_id, patient_id, organization_id, is_primary, status, link_type, notes
        ) VALUES (
            v_patient_invite.professional_id, NEW.id, v_patient_invite.organization_id, TRUE, 'active', v_link_type, 'Vinculado atomicamente via convite ' || v_patient_invite.id::text
        );

        -- 6. Consume invite
        UPDATE public.patient_invites
        SET status = 'accepted',
            accepted_by = NEW.id,
            accepted_at = pg_catalog.timezone('utc', pg_catalog.now())
        WHERE id = v_patient_invite.id;

        -- 7. Audit log
        INSERT INTO public.audit_logs (
            actor_id, action, entity_type, entity_id, organization_id, metadata
        ) VALUES (
            NEW.id, 'invite.accepted_atomic', 'patient_invites', v_patient_invite.id::text, v_patient_invite.organization_id,
            pg_catalog.jsonb_build_object(
                'professional_id', v_patient_invite.professional_id,
                'link_type', v_link_type
            )
        );

        RETURN NEW;
    END IF;

    -- ==========================================================================
    -- CASE B: PROFESSIONAL INVITE SIGNUP (Atomic Provisioning)
    -- ==========================================================================
    IF v_prof_token_hash IS NOT NULL THEN
        SELECT * INTO v_prof_invite
        FROM public.professional_invites
        WHERE token_hash = v_prof_token_hash
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'INVITE_NOT_FOUND' USING ERRCODE = 'P0002';
        END IF;

        IF v_prof_invite.revoked_at IS NOT NULL THEN
            RAISE EXCEPTION 'INVITE_REVOKED' USING ERRCODE = 'P0004';
        END IF;

        IF v_prof_invite.expires_at < pg_catalog.timezone('utc', pg_catalog.now()) THEN
            RAISE EXCEPTION 'INVITE_EXPIRED' USING ERRCODE = 'P0005';
        END IF;

        IF v_prof_invite.accepted_at IS NOT NULL THEN
            RAISE EXCEPTION 'INVITE_ALREADY_USED' USING ERRCODE = 'P0003';
        END IF;

        IF LOWER(TRIM(v_prof_invite.email)) <> LOWER(TRIM(NEW.email)) THEN
            RAISE EXCEPTION 'INVITE_EMAIL_MISMATCH' USING ERRCODE = 'P0006';
        END IF;

        IF v_prof_invite.role_id NOT IN ('nutritionist', 'influencer') THEN
            RAISE EXCEPTION 'INVALID_ROLE' USING ERRCODE = 'P0007';
        END IF;

        -- Create profile directly with the invited role
        INSERT INTO public.profiles (
            id, role_id, full_name, email, avatar_url, is_active
        ) VALUES (
            NEW.id, v_prof_invite.role_id, v_full_name, NEW.email, NEW.raw_user_meta_data->>'avatar_url', TRUE
        );

        -- Create professional profile
        INSERT INTO public.professional_profiles (id, professional_type)
        VALUES (NEW.id, v_prof_invite.role_id);

        -- Add to organization if specified
        IF v_prof_invite.organization_id IS NOT NULL THEN
            INSERT INTO public.organization_members (organization_id, user_id, role_in_org)
            VALUES (v_prof_invite.organization_id, NEW.id, 'member')
            ON CONFLICT DO NOTHING;
        END IF;

        -- Consume invite
        UPDATE public.professional_invites
        SET accepted_by = NEW.id,
            accepted_at = pg_catalog.timezone('utc', pg_catalog.now())
        WHERE id = v_prof_invite.id;

        -- Audit log
        INSERT INTO public.audit_logs (
            actor_id, action, entity_type, entity_id, organization_id, metadata
        ) VALUES (
            NEW.id, 'professional_invite.accepted_atomic', 'professional_invites', v_prof_invite.id::text, v_prof_invite.organization_id,
            pg_catalog.jsonb_build_object('role_id', v_prof_invite.role_id, 'email', v_prof_invite.email)
        );

        RETURN NEW;
    END IF;

    -- ==========================================================================
    -- CASE C: PUBLIC SIGNUP (Strictly & Unconditionally PATIENT)
    -- ==========================================================================
    -- Any attempt to pass role_id or role in metadata is strictly ignored.
    INSERT INTO public.profiles (
        id, role_id, full_name, email, avatar_url, is_active
    ) VALUES (
        NEW.id, 'patient', v_full_name, NEW.email, NEW.raw_user_meta_data->>'avatar_url', TRUE
    );

    INSERT INTO public.patients (id, notes)
    VALUES (NEW.id, 'Paciente cadastrado via portal público.');

    INSERT INTO public.audit_logs (
        actor_id, action, entity_type, entity_id, metadata
    ) VALUES (
        NEW.id, 'auth.user_created', 'profile', NEW.id::text,
        pg_catalog.jsonb_build_object('role_id', 'patient', 'email', NEW.email)
    );

    RETURN NEW;
END;
$$;

-- Ensure trigger is active on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------------------------
-- 2. CONTROLLED PUBLIC RPC WRAPPERS (Exposed Minimal Surface for Supabase Data API)
-- ------------------------------------------------------------------------------

-- Public wrapper for validating patient invite
CREATE OR REPLACE FUNCTION public.validate_patient_invite(p_token_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN private.validate_patient_invite(p_token_hash);
END;
$$;

-- Public wrapper for validating professional invite
CREATE OR REPLACE FUNCTION public.validate_professional_invite(p_token_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN private.validate_professional_invite(p_token_hash);
END;
$$;

-- Public wrapper for accepting patient invite by an already-authenticated user
-- CRITICAL SECURITY RULE: Uses auth.uid() from the verified session, NEVER client-supplied ID.
CREATE OR REPLACE FUNCTION public.accept_patient_invite(p_token_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Acesso não autorizado: autenticação requerida.' USING ERRCODE = '42501';
    END IF;

    RETURN private.accept_patient_invite(p_token_hash, v_user_id);
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. PERMISSIONS AND PRIVILEGE HARDENING
-- ------------------------------------------------------------------------------
-- Revoke all execute on schema private from public/anon
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- Grant minimal necessary execute on public RPC wrappers
GRANT EXECUTE ON FUNCTION public.validate_patient_invite(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validate_professional_invite(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_patient_invite(TEXT) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.accept_patient_invite(TEXT) FROM anon, PUBLIC;
