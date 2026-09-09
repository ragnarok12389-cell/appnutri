-- ==============================================================================
-- MIGRATION: 20260907000008_private_grants_and_email_verification.sql
-- DESCRIPTION: Schema Private Grants for RLS, Email Confirmation Lifecycle, and RPC Hardening
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. FIX PRIVATE SCHEMA PRIVILEGES FOR AUTHENTICATED RLS EVALUATION
-- ------------------------------------------------------------------------------
-- The authenticated role must be able to execute ONLY the specific helper functions
-- used in RLS policies without permission denied on the private schema.
-- The schema remains strictly NOT exposed via Supabase Data API / PostgREST.

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- Revoke execute on all functions in private by default
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;

-- Grant EXECUTE strictly and specifically on the RLS helper functions needed by policies
GRANT EXECUTE ON FUNCTION private.get_user_role(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_admin(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_professional(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_access_patient(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_org_member(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_manage_org_members(UUID, UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2. REMOVE REDUNDANT PUBLIC RPC: ACCEPT_PATIENT_INVITE
-- ------------------------------------------------------------------------------
-- Patient invite acceptance happens 100% atomically within the auth.users trigger
-- during signup. Retaining public.accept_patient_invite creates redundant attack surface.
REVOKE ALL ON FUNCTION public.accept_patient_invite(TEXT) FROM anon, authenticated, PUBLIC;
DROP FUNCTION IF EXISTS public.accept_patient_invite(TEXT);

-- ------------------------------------------------------------------------------
-- 3. LIFECYCLE: DISTINGUISH PENDING_VERIFICATION VS ACTIVE (EMAIL CONFIRMATION)
-- ------------------------------------------------------------------------------

-- Add status column to profiles if not present
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' 
CHECK (status IN ('pending_verification', 'active', 'inactive', 'suspended'));

CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);

-- Update check constraint on professional_patient_links to allow 'pending_verification'
ALTER TABLE public.professional_patient_links
DROP CONSTRAINT IF EXISTS professional_patient_links_status_check;

ALTER TABLE public.professional_patient_links
ADD CONSTRAINT professional_patient_links_status_check
CHECK (status IN ('active', 'inactive', 'transferred', 'pending', 'pending_verification'));

-- ------------------------------------------------------------------------------
-- 4. HARDENED HANDLE_NEW_USER TRIGGER: EMAIL CONFIRMATION AWARE
-- ------------------------------------------------------------------------------
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
    v_is_email_confirmed BOOLEAN;
    v_user_status TEXT;
    v_link_status TEXT;
BEGIN
    -- Determine whether email is confirmed upon signup
    -- When Supabase Confirm Email is enabled, email_confirmed_at is NULL initially.
    v_is_email_confirmed := (NEW.email_confirmed_at IS NOT NULL OR NEW.confirmed_at IS NOT NULL);
    
    IF v_is_email_confirmed THEN
        v_user_status := 'active';
        v_link_status := 'active';
    ELSE
        v_user_status := 'pending_verification';
        v_link_status := 'pending_verification';
    END IF;

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
        -- Inactive and pending_verification until email is confirmed if verification is required
        INSERT INTO public.profiles (
            id, role_id, full_name, email, avatar_url, is_active, status
        ) VALUES (
            NEW.id, 'patient', v_full_name, NEW.email, NEW.raw_user_meta_data->>'avatar_url', v_is_email_confirmed, v_user_status
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

        -- 5. Create link: if email is not confirmed, status is pending_verification
        -- RLS policy private.can_access_patient strictly requires status = 'active'
        -- preventing any premature clinical access before confirmation.
        INSERT INTO public.professional_patient_links (
            professional_id, patient_id, organization_id, is_primary, status, link_type, notes
        ) VALUES (
            v_patient_invite.professional_id, NEW.id, v_patient_invite.organization_id, TRUE, v_link_status, v_link_type, 'Vinculado atomicamente via convite ' || v_patient_invite.id::text
        );

        -- 6. Consume invite (prevents double-spend)
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
                'link_type', v_link_type,
                'status', v_link_status
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
            id, role_id, full_name, email, avatar_url, is_active, status
        ) VALUES (
            NEW.id, v_prof_invite.role_id, v_full_name, NEW.email, NEW.raw_user_meta_data->>'avatar_url', v_is_email_confirmed, v_user_status
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
            pg_catalog.jsonb_build_object('role_id', v_prof_invite.role_id, 'email', v_prof_invite.email, 'status', v_user_status)
        );

        RETURN NEW;
    END IF;

    -- ==========================================================================
    -- CASE C: PUBLIC SIGNUP (Strictly & Unconditionally PATIENT)
    -- ==========================================================================
    INSERT INTO public.profiles (
        id, role_id, full_name, email, avatar_url, is_active, status
    ) VALUES (
        NEW.id, 'patient', v_full_name, NEW.email, NEW.raw_user_meta_data->>'avatar_url', v_is_email_confirmed, v_user_status
    );

    INSERT INTO public.patients (id, notes)
    VALUES (NEW.id, 'Paciente cadastrado via portal público.');

    INSERT INTO public.audit_logs (
        actor_id, action, entity_type, entity_id, metadata
    ) VALUES (
        NEW.id, 'auth.user_created', 'profile', NEW.id::text,
        pg_catalog.jsonb_build_object('role_id', 'patient', 'email', NEW.email, 'status', v_user_status)
    );

    RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. TRIGGER ON EMAIL CONFIRMATION: PROMOTE PENDING_VERIFICATION TO ACTIVE
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_user_email_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Detect transition from unconfirmed to confirmed email
    IF (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
       OR (OLD.confirmed_at IS NULL AND NEW.confirmed_at IS NOT NULL) THEN
        
        -- 1. Activate profile
        UPDATE public.profiles
        SET status = 'active',
            is_active = TRUE,
            updated_at = pg_catalog.timezone('utc', pg_catalog.now())
        WHERE id = NEW.id AND status = 'pending_verification';

        -- 2. Activate patient link if it was pending verification
        UPDATE public.professional_patient_links
        SET status = 'active',
            updated_at = pg_catalog.timezone('utc', pg_catalog.now())
        WHERE patient_id = NEW.id AND status = 'pending_verification';

        -- 3. Audit log
        INSERT INTO public.audit_logs (
            actor_id, action, entity_type, entity_id, metadata
        ) VALUES (
            NEW.id, 'auth.email_confirmed', 'profile', NEW.id::text,
            pg_catalog.jsonb_build_object('email', NEW.email, 'status', 'active')
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
    AFTER UPDATE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_user_email_confirmed();
