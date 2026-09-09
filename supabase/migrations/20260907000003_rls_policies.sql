-- ==============================================================================
-- MIGRATION: 20260907000003_rls_policies.sql
-- DESCRIPTION: Private Schema Helper Functions & Strict Row Level Security
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PRIVATE SCHEMA FOR SENSITIVE RLS HELPER FUNCTIONS
-- ------------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2. SECURITY DEFINER HELPER FUNCTIONS (Hardened: search_path = '')
-- ------------------------------------------------------------------------------

-- Get role of user safely without recursive RLS trigger
CREATE OR REPLACE FUNCTION private.get_user_role(target_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p.role_id 
    FROM public.profiles p 
    WHERE p.id = target_user_id;
$$;

-- Check if user is an administrator
CREATE OR REPLACE FUNCTION private.is_admin(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT COALESCE(
        (SELECT p.role_id = 'admin' FROM public.profiles p WHERE p.id = target_user_id),
        FALSE
    );
$$;

-- Check if user is a professional (nutritionist or influencer)
CREATE OR REPLACE FUNCTION private.is_professional(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT COALESCE(
        (SELECT p.role_id IN ('nutritionist', 'influencer') FROM public.profiles p WHERE p.id = target_user_id),
        FALSE
    );
$$;

-- Check if professional has active link with patient (or is admin)
-- IMPORTANT: Only 'active' status grants access. 'inactive', 'transferred', or 'pending' links DO NOT grant access.
CREATE OR REPLACE FUNCTION private.can_access_patient(prof_id UUID, pat_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT 
        private.is_admin(prof_id)
        OR EXISTS (
            SELECT 1 
            FROM public.professional_patient_links l
            WHERE l.professional_id = prof_id 
              AND l.patient_id = pat_id 
              AND l.status = 'active'
        );
$$;

-- Check organization membership
CREATE OR REPLACE FUNCTION private.is_org_member(target_org_id UUID, target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT 
        private.is_admin(target_user_id)
        OR EXISTS (
            SELECT 1 
            FROM public.organization_members m
            WHERE m.organization_id = target_org_id 
              AND m.user_id = target_user_id
        );
$$;

-- Check if user can manage organization members (Org Owner, Org Admin, or System Admin)
CREATE OR REPLACE FUNCTION private.can_manage_org_members(target_org_id UUID, actor_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT 
        private.is_admin(actor_id)
        OR EXISTS (
            SELECT 1 FROM public.organizations o
            WHERE o.id = target_org_id AND o.owner_id = actor_id
        )
        OR EXISTS (
            SELECT 1 FROM public.organization_members m
            WHERE m.organization_id = target_org_id 
              AND m.user_id = actor_id 
              AND m.role_in_org IN ('owner', 'admin')
        );
$$;

-- Revoke all default execution rights and grant only minimum needed
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_user_role(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_admin(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_professional(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_access_patient(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_org_member(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_manage_org_members(UUID, UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3. ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ------------------------------------------------------------------------------

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_patient_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 4. RLS POLICIES: ROLES, PERMISSIONS & ROLE_PERMISSIONS (Read-only for users)
-- ------------------------------------------------------------------------------

-- Roles: Read-only for authenticated, write-only for admin
CREATE POLICY "roles_select"
    ON public.roles FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "roles_admin_manage"
    ON public.roles FOR ALL
    TO authenticated
    USING (private.is_admin(auth.uid()))
    WITH CHECK (private.is_admin(auth.uid()));

-- Permissions: Read-only for authenticated, write-only for admin
CREATE POLICY "permissions_select"
    ON public.permissions FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "permissions_admin_manage"
    ON public.permissions FOR ALL
    TO authenticated
    USING (private.is_admin(auth.uid()))
    WITH CHECK (private.is_admin(auth.uid()));

-- Role Permissions: Read-only for authenticated, write-only for admin
CREATE POLICY "role_permissions_select"
    ON public.role_permissions FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "role_permissions_admin_manage"
    ON public.role_permissions FOR ALL
    TO authenticated
    USING (private.is_admin(auth.uid()))
    WITH CHECK (private.is_admin(auth.uid()));

-- ------------------------------------------------------------------------------
-- 5. RLS POLICIES: PROFILES
-- ------------------------------------------------------------------------------

CREATE POLICY "profiles_select"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (
        id = auth.uid()
        OR private.is_admin(auth.uid())
        OR private.can_access_patient(auth.uid(), id)
        OR EXISTS (
            SELECT 1 FROM public.professional_patient_links
            WHERE professional_id = id 
              AND patient_id = auth.uid() 
              AND status = 'active'
        )
    );

CREATE POLICY "profiles_update"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (id = auth.uid() OR private.is_admin(auth.uid()))
    WITH CHECK (id = auth.uid() OR private.is_admin(auth.uid()));

CREATE POLICY "profiles_insert"
    ON public.profiles FOR INSERT
    TO authenticated
    WITH CHECK (id = auth.uid() OR private.is_admin(auth.uid()));

-- ------------------------------------------------------------------------------
-- 6. RLS POLICIES: USER_PERMISSIONS (Protected against self-elevation)
-- ------------------------------------------------------------------------------

-- Users can ONLY inspect their own permission overrides
CREATE POLICY "user_permissions_select"
    ON public.user_permissions FOR SELECT
    TO authenticated
    USING (user_id = auth.uid() OR private.is_admin(auth.uid()));

-- STRICT: Only administrators can grant, update or revoke user permissions
CREATE POLICY "user_permissions_admin_manage"
    ON public.user_permissions FOR ALL
    TO authenticated
    USING (private.is_admin(auth.uid()))
    WITH CHECK (private.is_admin(auth.uid()));

-- ------------------------------------------------------------------------------
-- 7. RLS POLICIES: ORGANIZATIONS & MEMBERS (Strict Tenant Isolation)
-- ------------------------------------------------------------------------------

CREATE POLICY "organizations_select"
    ON public.organizations FOR SELECT
    TO authenticated
    USING (
        owner_id = auth.uid() 
        OR private.is_org_member(id, auth.uid()) 
        OR private.is_admin(auth.uid())
    );

CREATE POLICY "organizations_manage"
    ON public.organizations FOR ALL
    TO authenticated
    USING (owner_id = auth.uid() OR private.is_admin(auth.uid()))
    WITH CHECK (owner_id = auth.uid() OR private.is_admin(auth.uid()));

-- Org members: Can only view members of their own organizations
CREATE POLICY "org_members_select"
    ON public.organization_members FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid() 
        OR private.is_org_member(organization_id, auth.uid()) 
        OR private.is_admin(auth.uid())
    );

-- Org members: Only Org Owner, Org Admin, or System Admin can manage members
CREATE POLICY "org_members_manage"
    ON public.organization_members FOR ALL
    TO authenticated
    USING (private.can_manage_org_members(organization_id, auth.uid()))
    WITH CHECK (private.can_manage_org_members(organization_id, auth.uid()));

-- ------------------------------------------------------------------------------
-- 8. RLS POLICIES: PROFESSIONAL_PROFILES
-- ------------------------------------------------------------------------------

CREATE POLICY "professional_profiles_select"
    ON public.professional_profiles FOR SELECT
    TO authenticated
    USING (
        id = auth.uid() 
        OR private.is_admin(auth.uid()) 
        OR EXISTS (
            SELECT 1 FROM public.professional_patient_links
            WHERE professional_id = id 
              AND patient_id = auth.uid() 
              AND status = 'active'
        )
    );

CREATE POLICY "professional_profiles_manage"
    ON public.professional_profiles FOR ALL
    TO authenticated
    USING (id = auth.uid() OR private.is_admin(auth.uid()))
    WITH CHECK (id = auth.uid() OR private.is_admin(auth.uid()));

-- ------------------------------------------------------------------------------
-- 9. RLS POLICIES: PATIENTS
-- ------------------------------------------------------------------------------

CREATE POLICY "patients_select"
    ON public.patients FOR SELECT
    TO authenticated
    USING (
        id = auth.uid() 
        OR private.can_access_patient(auth.uid(), id)
        OR private.is_admin(auth.uid())
    );

CREATE POLICY "patients_update"
    ON public.patients FOR UPDATE
    TO authenticated
    USING (private.can_access_patient(auth.uid(), id) OR private.is_admin(auth.uid()))
    WITH CHECK (private.can_access_patient(auth.uid(), id) OR private.is_admin(auth.uid()));

CREATE POLICY "patients_insert"
    ON public.patients FOR INSERT
    TO authenticated
    WITH CHECK (
        id = auth.uid() 
        OR private.is_professional(auth.uid()) 
        OR private.is_admin(auth.uid())
    );

-- ------------------------------------------------------------------------------
-- 10. RLS POLICIES: PROFESSIONAL_PATIENT_LINKS (No IDOR, strictly owned)
-- ------------------------------------------------------------------------------

CREATE POLICY "links_select"
    ON public.professional_patient_links FOR SELECT
    TO authenticated
    USING (
        professional_id = auth.uid() 
        OR patient_id = auth.uid() 
        OR private.is_admin(auth.uid())
    );

-- Only the professional involved or admin can create, update or delete a link
CREATE POLICY "links_insert"
    ON public.professional_patient_links FOR INSERT
    TO authenticated
    WITH CHECK (
        professional_id = auth.uid() 
        OR private.is_admin(auth.uid())
    );

CREATE POLICY "links_update"
    ON public.professional_patient_links FOR UPDATE
    TO authenticated
    USING (
        professional_id = auth.uid() 
        OR private.is_admin(auth.uid())
    )
    WITH CHECK (
        professional_id = auth.uid() 
        OR private.is_admin(auth.uid())
    );

CREATE POLICY "links_delete"
    ON public.professional_patient_links FOR DELETE
    TO authenticated
    USING (
        professional_id = auth.uid() 
        OR private.is_admin(auth.uid())
    );

-- ------------------------------------------------------------------------------
-- 11. RLS POLICIES: AUDIT_LOGS (Read-only for Admin)
-- ------------------------------------------------------------------------------

-- Admins only can read audit logs
CREATE POLICY "audit_logs_select"
    ON public.audit_logs FOR SELECT
    TO authenticated
    USING (private.is_admin(auth.uid()));

-- Inserção via procedure log_audit_event ou service_role
CREATE POLICY "audit_logs_insert"
    ON public.audit_logs FOR INSERT
    TO authenticated
    WITH CHECK (actor_id = auth.uid() OR private.is_admin(auth.uid()));
