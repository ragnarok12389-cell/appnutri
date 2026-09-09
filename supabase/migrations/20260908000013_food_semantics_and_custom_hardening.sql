-- ==============================================================================
-- MIGRAÇÃO 13: SEMÂNTICA OFICIAL TACO, IMUTABILIDADE E HARDENING CUSTOM
-- ==============================================================================

-- 1. Ampliação do Esquema de Nutrientes para Semântica Oficial TACO
ALTER TABLE public.food_nutrients
    ADD COLUMN IF NOT EXISTS raw_value TEXT,
    ADD COLUMN IF NOT EXISTS numeric_value NUMERIC(10,4),
    ADD COLUMN IF NOT EXISTS value_status TEXT NOT NULL DEFAULT 'NUMERIC_VALUE';

-- Ajuste de check constraints em food_nutrients
ALTER TABLE public.food_nutrients
    DROP CONSTRAINT IF EXISTS chk_food_nutrient_quality;

ALTER TABLE public.food_nutrients
    ADD CONSTRAINT chk_food_nutrient_quality CHECK (
        data_quality IN (
            'analytical', 'calculated', 'estimated', 'imputed', 'trace',
            'not_applicable', 'under_reevaluation', 'not_requested',
            'not_available', 'not_analyzed', 'unknown'
        )
    );

ALTER TABLE public.food_nutrients
    DROP CONSTRAINT IF EXISTS chk_food_nutrient_value_status;

ALTER TABLE public.food_nutrients
    ADD CONSTRAINT chk_food_nutrient_value_status CHECK (
        value_status IN (
            'KNOWN_NUMERIC_ZERO', 'NUMERIC_VALUE', 'TRACE',
            'NOT_APPLICABLE', 'UNDER_REEVALUATION', 'NOT_REQUESTED', 'UNKNOWN'
        )
    );

-- Sincronizar dados existentes
UPDATE public.food_nutrients
SET numeric_value = amount_per_100g,
    raw_value = COALESCE(raw_value, amount_per_100g::text)
WHERE numeric_value IS NULL AND amount_per_100g IS NOT NULL;

-- 2. Campos de Governança de Alimentos Customizados em foods
ALTER TABLE public.foods
    ADD COLUMN IF NOT EXISTS validation_status TEXT NOT NULL DEFAULT 'official_approved';

ALTER TABLE public.foods
    DROP CONSTRAINT IF EXISTS chk_food_validation_status;

ALTER TABLE public.foods
    ADD CONSTRAINT chk_food_validation_status CHECK (
        validation_status IN ('draft', 'verified_by_nutritionist', 'rejected', 'official_approved')
    );

ALTER TABLE public.foods
    DROP CONSTRAINT IF EXISTS chk_food_source_type;

ALTER TABLE public.foods
    ADD CONSTRAINT chk_food_source_type CHECK (
        source_type IN ('official', 'official_table', 'manufacturer_label', 'professional_custom', 'retailer_verified')
    );

-- Atualização das policies RLS de foods para aceitar tanto 'official' quanto 'official_table'
DROP POLICY IF EXISTS "Admin manage official foods" ON public.foods;
CREATE POLICY "Admin manage official foods"
    ON public.foods FOR INSERT
    TO authenticated
    WITH CHECK (
        (source_type IN ('official', 'official_table') AND private.is_admin(auth.uid()))
        OR (source_type = 'professional_custom' AND private.is_professional(auth.uid()) AND created_by = auth.uid())
    );

DROP POLICY IF EXISTS "Admin or owner update foods" ON public.foods;
CREATE POLICY "Admin or owner update foods"
    ON public.foods FOR UPDATE
    TO authenticated
    USING (
        (source_type IN ('official', 'official_table') AND private.is_admin(auth.uid()))
        OR (source_type = 'professional_custom' AND created_by = auth.uid())
        OR (source_type = 'professional_custom' AND private.is_admin(auth.uid()))
    )
    WITH CHECK (
        (source_type IN ('official', 'official_table') AND private.is_admin(auth.uid()))
        OR (source_type = 'professional_custom' AND created_by = auth.uid())
        OR (source_type = 'professional_custom' AND private.is_admin(auth.uid()))
    );

DROP POLICY IF EXISTS "Admin or owner delete foods" ON public.foods;
CREATE POLICY "Admin or owner delete foods"
    ON public.foods FOR DELETE
    TO authenticated
    USING (
        (source_type IN ('official', 'official_table') AND private.is_admin(auth.uid()))
        OR (source_type = 'professional_custom' AND created_by = auth.uid())
    );

-- 3. Tipos de Alias para Preservar Ambiguidade de Busca
ALTER TABLE public.food_aliases
    ADD COLUMN IF NOT EXISTS alias_type TEXT NOT NULL DEFAULT 'search_term';

ALTER TABLE public.food_aliases
    DROP CONSTRAINT IF EXISTS chk_food_alias_type;

ALTER TABLE public.food_aliases
    ADD CONSTRAINT chk_food_alias_type CHECK (
        alias_type IN ('exact', 'search_term', 'colloquial')
    );

-- 4. Metadados de Evidência e Confiança em Tags
ALTER TABLE public.food_tag_mappings
    ADD COLUMN IF NOT EXISTS evidence_source TEXT,
    ADD COLUMN IF NOT EXISTS confidence TEXT NOT NULL DEFAULT 'unknown',
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

ALTER TABLE public.food_tag_mappings
    DROP CONSTRAINT IF EXISTS chk_food_tag_confidence;

ALTER TABLE public.food_tag_mappings
    ADD CONSTRAINT chk_food_tag_confidence CHECK (
        confidence IN ('high', 'medium', 'low', 'unknown')
    );

-- 5. Imutabilidade Absoluta da Composição Oficial TACO para Usuários da Aplicação
CREATE OR REPLACE FUNCTION private.check_official_food_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role TEXT;
BEGIN
    v_role := COALESCE(current_setting('request.jwt.claim.role', true), '');

    -- Se for superuser / migração / service_role, permitir
    IF v_role IN ('service_role', 'supabase_admin', '') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.source_type IN ('official', 'official_table') THEN
            RAISE EXCEPTION 'Exclusão de alimento oficial da base TACO é terminantemente proibida.';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.source_type IN ('official', 'official_table') THEN
            -- Usuários da aplicação (incluindo admin) não podem alterar quaisquer atributos originados da fonte
            IF NEW.source_id <> OLD.source_id OR
               NEW.source_food_code <> OLD.source_food_code OR
               NEW.source_type <> OLD.source_type OR
               NEW.name <> OLD.name OR
               NEW.normalized_name <> OLD.normalized_name OR
               NEW.scientific_name IS DISTINCT FROM OLD.scientific_name OR
               NEW.food_group <> OLD.food_group OR
               NEW.preparation_state <> OLD.preparation_state OR
               NEW.is_generic <> OLD.is_generic OR
               NEW.validation_status <> OLD.validation_status THEN
                RAISE EXCEPTION 'Alteração de dados canônicos da fonte oficial é proibida para usuários da aplicação (inclusive administradores). Administradores podem gerenciar exclusivamente metadados operacionais (is_active, engine_eligibility_status, needs_review).';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_official_food_immutability ON public.foods;
CREATE TRIGGER trg_official_food_immutability
    BEFORE UPDATE OR DELETE ON public.foods
    FOR EACH ROW
    EXECUTE FUNCTION private.check_official_food_immutability();

-- 5.1. Imutabilidade de Metadados Canônicos em food_data_sources
CREATE OR REPLACE FUNCTION private.check_food_data_sources_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role TEXT;
BEGIN
    v_role := COALESCE(current_setting('request.jwt.claim.role', true), '');

    -- Se for superuser / migração / service_role, permitir
    IF v_role IN ('service_role', 'supabase_admin', '') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Exclusão de fontes oficiais de dados de alimentos é proibida.';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.name IS DISTINCT FROM OLD.name OR
           NEW.version IS DISTINCT FROM OLD.version OR
           NEW.publisher IS DISTINCT FROM OLD.publisher OR
           NEW.reference IS DISTINCT FROM OLD.reference OR
           NEW.checksum IS DISTINCT FROM OLD.checksum OR
           NEW.imported_at IS DISTINCT FROM OLD.imported_at OR
           NEW.id IS DISTINCT FROM OLD.id THEN
            RAISE EXCEPTION 'Alteração de metadados canônicos em food_data_sources é proibida para usuários da aplicação (inclusive administradores).';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_food_data_sources_immutability ON public.food_data_sources;
CREATE TRIGGER trg_food_data_sources_immutability
    BEFORE UPDATE OR DELETE ON public.food_data_sources
    FOR EACH ROW
    EXECUTE FUNCTION private.check_food_data_sources_immutability();

-- 6. Imutabilidade de Nutrientes Oficiais em food_nutrients
CREATE OR REPLACE FUNCTION private.check_official_nutrient_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_source_type TEXT;
    v_target_food_id UUID;
    v_role TEXT;
BEGIN
    v_role := COALESCE(current_setting('request.jwt.claim.role', true), '');

    -- Se for superuser / migração / service_role, permitir
    IF v_role IN ('service_role', 'supabase_admin', '') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    v_target_food_id := COALESCE(NEW.food_id, OLD.food_id);

    SELECT source_type INTO v_source_type
    FROM public.foods
    WHERE id = v_target_food_id;

    IF v_source_type IN ('official', 'official_table') THEN
        RAISE EXCEPTION 'Alteração direta de nutrientes da fonte oficial TACO é proibida para usuários da aplicação. Apenas o importador oficial autorizado (service_role) pode atualizar a composição analítica.';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_official_nutrient_immutability ON public.food_nutrients;
CREATE TRIGGER trg_official_nutrient_immutability
    BEFORE INSERT OR UPDATE OR DELETE ON public.food_nutrients
    FOR EACH ROW
    EXECUTE FUNCTION private.check_official_nutrient_immutability();

-- 7. Governança e Blindagem de Alimentos Customizados (professional_custom)
CREATE OR REPLACE FUNCTION private.check_professional_custom_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_source_name TEXT;
    v_user_role TEXT;
BEGIN
    IF NEW.source_type = 'professional_custom' THEN
        -- Não pode usar source_id da TACO
        SELECT name INTO v_source_name
        FROM public.food_data_sources
        WHERE id = NEW.source_id;

        IF v_source_name ILIKE '%TACO%' THEN
            RAISE EXCEPTION 'Alimentos customizados não podem ser atribuídos à fonte oficial TACO.';
        END IF;

        IF NEW.organization_id IS NULL THEN
            RAISE EXCEPTION 'Alimentos customizados devem obrigatoriamente pertencer a uma organização.';
        END IF;

        -- Influenciador não pode validar composição clínica/nutricional
        IF NEW.validation_status = 'verified_by_nutritionist' THEN
            SELECT role_id INTO v_user_role
            FROM public.profiles
            WHERE id = auth.uid();

            IF v_user_role = 'influencer' THEN
                RAISE EXCEPTION 'Influenciadores não possuem autorização clínica para validar composição nutricional.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_professional_custom_rules ON public.foods;
CREATE TRIGGER trg_professional_custom_rules
    BEFORE INSERT OR UPDATE ON public.foods
    FOR EACH ROW
    EXECUTE FUNCTION private.check_professional_custom_rules();

-- Conceder permissões necessárias
GRANT EXECUTE ON FUNCTION private.check_official_food_immutability() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.check_official_nutrient_immutability() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.check_professional_custom_rules() TO authenticated, service_role;
