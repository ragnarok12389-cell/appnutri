-- =============================================================================
-- ETAPA 10: PRODUTOS, RECURSOS E ENTITLEMENTS SERVER-SIDE
-- =============================================================================

CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z0-9_]{2,49}$'),
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
    description TEXT,
    product_version INT NOT NULL DEFAULT 1 CHECK (product_version > 0),
    commercial_status TEXT NOT NULL CHECK (commercial_status IN ('active', 'draft', 'retired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.product_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    feature_key TEXT NOT NULL CHECK (feature_key ~ '^[a-z][a-z0-9_.]{2,79}$'),
    limits JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (product_id, feature_key)
);

CREATE TABLE public.user_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    product_version INT NOT NULL,
    feature_snapshot JSONB NOT NULL CHECK (jsonb_typeof(feature_snapshot) = 'object'),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
    source TEXT NOT NULL CHECK (source IN ('system', 'admin', 'promotion', 'payment')),
    external_reference TEXT,
    valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_until TIMESTAMPTZ,
    granted_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE UNIQUE INDEX uq_entitlement_external_reference
    ON public.user_entitlements(source, external_reference)
    WHERE external_reference IS NOT NULL;
CREATE INDEX idx_entitlements_patient_status
    ON public.user_entitlements(patient_id, status, valid_until);

CREATE TABLE public.entitlement_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entitlement_id UUID NOT NULL REFERENCES public.user_entitlements(id) ON DELETE RESTRICT,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    event_type TEXT NOT NULL CHECK (event_type IN ('granted', 'revoked', 'expired')),
    reason TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION private.block_entitlement_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN NEW.created_at := now(); RETURN NEW; END IF;
    IF TG_OP = 'DELETE'
       AND session_user IN ('postgres', 'supabase_admin')
       AND COALESCE(current_setting('role', true), 'none') = 'none' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Entitlement events are append-only.';
END;
$$;
CREATE TRIGGER trg_entitlement_events_append_only
    BEFORE INSERT OR UPDATE OR DELETE ON public.entitlement_events
    FOR EACH ROW EXECUTE FUNCTION private.block_entitlement_event_mutation();

CREATE OR REPLACE FUNCTION private.protect_entitlement_snapshot()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF NEW.patient_id <> OLD.patient_id OR NEW.product_id <> OLD.product_id
       OR NEW.product_version <> OLD.product_version OR NEW.feature_snapshot <> OLD.feature_snapshot
       OR NEW.source <> OLD.source OR NEW.external_reference IS DISTINCT FROM OLD.external_reference
       OR NEW.valid_from <> OLD.valid_from OR NEW.granted_by IS DISTINCT FROM OLD.granted_by
       OR NEW.created_at <> OLD.created_at THEN
        RAISE EXCEPTION 'Entitlement identity and feature snapshot are immutable.';
    END IF;
    IF OLD.status <> 'active' AND NEW.status <> OLD.status THEN
        RAISE EXCEPTION 'Resolved entitlement cannot change state.';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_user_entitlements_snapshot
    BEFORE UPDATE ON public.user_entitlements
    FOR EACH ROW EXECUTE FUNCTION private.protect_entitlement_snapshot();

CREATE OR REPLACE FUNCTION private.has_active_entitlement(p_user_id UUID, p_feature_key TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_entitlements ue
        WHERE ue.patient_id = p_user_id
          AND ue.status = 'active'
          AND ue.valid_from <= now()
          AND (ue.valid_until IS NULL OR ue.valid_until > now())
          AND ue.feature_snapshot ? p_feature_key
    );
$$;

CREATE OR REPLACE FUNCTION public.has_my_entitlement(p_feature_key TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT private.has_active_entitlement(auth.uid(), p_feature_key);
$$;

CREATE OR REPLACE FUNCTION public.grant_user_entitlement(
    p_patient_id UUID, p_product_code TEXT, p_actor_id UUID, p_source TEXT,
    p_external_reference TEXT DEFAULT NULL, p_valid_until TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_product public.products%ROWTYPE;
    v_entitlement_id UUID;
    v_features JSONB;
BEGIN
    IF NOT private.is_admin(p_actor_id) THEN RAISE EXCEPTION 'Only admin can grant entitlements manually.'; END IF;
    IF p_source NOT IN ('admin', 'promotion') THEN RAISE EXCEPTION 'Invalid manual entitlement source.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.patients WHERE id = p_patient_id) THEN RAISE EXCEPTION 'Patient not found.'; END IF;

    SELECT * INTO v_product FROM public.products WHERE code = p_product_code AND commercial_status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Active product not found.'; END IF;
    SELECT COALESCE(jsonb_object_agg(feature_key, limits), '{}'::jsonb) INTO v_features
    FROM public.product_features WHERE product_id = v_product.id;

    PERFORM pg_advisory_xact_lock(hashtext('entitlement:' || p_patient_id::text));
    IF p_external_reference IS NOT NULL THEN
        SELECT id INTO v_entitlement_id FROM public.user_entitlements
        WHERE source = p_source AND external_reference = p_external_reference;
        IF v_entitlement_id IS NOT NULL THEN RETURN v_entitlement_id; END IF;
    END IF;

    INSERT INTO public.user_entitlements (
        patient_id, product_id, product_version, feature_snapshot, source,
        external_reference, valid_until, granted_by
    ) VALUES (
        p_patient_id, v_product.id, v_product.product_version, v_features, p_source,
        p_external_reference, p_valid_until, p_actor_id
    ) RETURNING id INTO v_entitlement_id;
    INSERT INTO public.entitlement_events (entitlement_id, patient_id, actor_id, event_type)
    VALUES (v_entitlement_id, p_patient_id, p_actor_id, 'granted');
    RETURN v_entitlement_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_user_entitlement(
    p_entitlement_id UUID, p_actor_id UUID, p_reason TEXT
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_patient_id UUID;
BEGIN
    IF NOT private.is_admin(p_actor_id) THEN RAISE EXCEPTION 'Only admin can revoke entitlements.'; END IF;
    SELECT patient_id INTO v_patient_id FROM public.user_entitlements
    WHERE id = p_entitlement_id AND status = 'active' FOR UPDATE;
    IF NOT FOUND THEN RETURN FALSE; END IF;
    UPDATE public.user_entitlements SET status = 'revoked', revoked_at = now(), revoked_by = p_actor_id
    WHERE id = p_entitlement_id;
    INSERT INTO public.entitlement_events (entitlement_id, patient_id, actor_id, event_type, reason)
    VALUES (p_entitlement_id, v_patient_id, p_actor_id, 'revoked', NULLIF(trim(p_reason), ''));
    RETURN TRUE;
END;
$$;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlement_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view active products" ON public.products FOR SELECT TO authenticated
    USING (commercial_status = 'active' OR private.is_admin(auth.uid()));
CREATE POLICY "Authenticated view active product features" ON public.product_features FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND (p.commercial_status = 'active' OR private.is_admin(auth.uid()))));
CREATE POLICY "Users view own entitlements" ON public.user_entitlements FOR SELECT TO authenticated
    USING (private.is_patient_owner(patient_id, auth.uid()) OR private.is_admin(auth.uid()));
CREATE POLICY "Users view own entitlement events" ON public.entitlement_events FOR SELECT TO authenticated
    USING (private.is_patient_owner(patient_id, auth.uid()) OR private.is_admin(auth.uid()));

GRANT SELECT ON public.products, public.product_features, public.user_entitlements, public.entitlement_events TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.products, public.product_features, public.user_entitlements, public.entitlement_events FROM authenticated;

INSERT INTO public.products (code, name, description, commercial_status)
VALUES
    ('appnutri_core', 'AppNutri Essencial', 'Recursos essenciais já disponíveis para todos os pacientes.', 'active'),
    ('appnutri_premium', 'AppNutri Premium', 'Recursos avançados preparados para comercialização futura.', 'active')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.product_features (product_id, feature_key)
SELECT p.id, feature_key FROM public.products p
CROSS JOIN unnest(ARRAY['nutrition.plan', 'workout.plan', 'progress.basic', 'ai.companion']) feature_key
WHERE p.code = 'appnutri_core' ON CONFLICT DO NOTHING;
INSERT INTO public.product_features (product_id, feature_key)
SELECT p.id, feature_key FROM public.products p
CROSS JOIN unnest(ARRAY['progress.advanced', 'budget.mode', 'professional.review']) feature_key
WHERE p.code = 'appnutri_premium' ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION private.grant_core_entitlement_on_patient_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_product public.products%ROWTYPE; v_features JSONB; v_id UUID;
BEGIN
    SELECT * INTO v_product FROM public.products WHERE code = 'appnutri_core';
    IF NOT FOUND THEN RETURN NEW; END IF;
    SELECT jsonb_object_agg(feature_key, limits) INTO v_features FROM public.product_features WHERE product_id = v_product.id;
    INSERT INTO public.user_entitlements (patient_id, product_id, product_version, feature_snapshot, source, external_reference)
    VALUES (NEW.id, v_product.id, v_product.product_version, v_features, 'system', 'core:' || NEW.id::text)
    ON CONFLICT (source, external_reference) WHERE external_reference IS NOT NULL DO NOTHING RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
        INSERT INTO public.entitlement_events (entitlement_id, patient_id, event_type) VALUES (v_id, NEW.id, 'granted');
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_grant_core_entitlement
    AFTER INSERT ON public.patients FOR EACH ROW EXECUTE FUNCTION private.grant_core_entitlement_on_patient_insert();

INSERT INTO public.user_entitlements (patient_id, product_id, product_version, feature_snapshot, source, external_reference)
SELECT pat.id, prod.id, prod.product_version,
       (SELECT jsonb_object_agg(pf.feature_key, pf.limits) FROM public.product_features pf WHERE pf.product_id = prod.id),
       'system', 'core:' || pat.id::text
FROM public.patients pat CROSS JOIN public.products prod
WHERE prod.code = 'appnutri_core'
ON CONFLICT (source, external_reference) WHERE external_reference IS NOT NULL DO NOTHING;
INSERT INTO public.entitlement_events (entitlement_id, patient_id, event_type)
SELECT ue.id, ue.patient_id, 'granted' FROM public.user_entitlements ue
WHERE ue.source = 'system' AND ue.external_reference LIKE 'core:%'
  AND NOT EXISTS (SELECT 1 FROM public.entitlement_events ee WHERE ee.entitlement_id = ue.id);

REVOKE ALL ON FUNCTION public.has_my_entitlement(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_my_entitlement(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.grant_user_entitlement(UUID, TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_user_entitlement(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
DO $$ BEGIN IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON public.products, public.product_features, public.user_entitlements, public.entitlement_events TO service_role;
    GRANT EXECUTE ON FUNCTION public.grant_user_entitlement(UUID, TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
    GRANT EXECUTE ON FUNCTION public.revoke_user_entitlement(UUID, UUID, TEXT) TO service_role;
END IF; END $$;
