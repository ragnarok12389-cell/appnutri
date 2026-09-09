-- ==============================================================================
-- MIGRAÇÃO 14: ISOLAMENTO CROSS-TENANT, GOVERNANÇA DE PROFESSIONAL_CUSTOM,
-- IMUTABILIDADE E HARDENING ESTRITO DE DADOS DE ALIMENTOS
-- ==============================================================================

-- 1. Constraint UNIQUE em food_data_sources para Suportar Upsert Concorrente Seguro
ALTER TABLE public.food_data_sources
    DROP CONSTRAINT IF EXISTS uq_food_data_sources_name_version;

ALTER TABLE public.food_data_sources
    ADD CONSTRAINT uq_food_data_sources_name_version UNIQUE (name, version);

-- 2. Campos de Proveniência Estruturada em food_household_measures
ALTER TABLE public.food_household_measures
    ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES public.food_data_sources(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS source_reference TEXT;

-- 3. Campos de Proveniência e Auditoria em food_price_observations
ALTER TABLE public.food_price_observations
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS retailer TEXT,
    ADD COLUMN IF NOT EXISTS brand TEXT,
    ADD COLUMN IF NOT EXISTS source_reference TEXT,
    ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;

-- 4. Remoção do Bypass Inseguro de JWT Vazio em Triggers de Imutabilidade
-- 4.1. Imutabilidade de foods
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

    -- 1. Bypass por JWT confiável de infraestrutura (service_role ou supabase_admin)
    IF v_role IN ('service_role', 'supabase_admin') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- 2. Bypass por role de banco direta confiável (somente quando session_user = postgres/supabase_admin E nenhuma role de aplicação foi assumida)
    -- Ausência de claim ('') em conexão de aplicação NUNCA equivale a processo confiável!
    IF session_user IN ('postgres', 'supabase_admin')
       AND COALESCE(current_setting('role', true), 'none') = 'none'
       AND v_role = '' THEN
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

-- 4.2. Imutabilidade de food_data_sources
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

    IF v_role IN ('service_role', 'supabase_admin') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF session_user IN ('postgres', 'supabase_admin')
       AND COALESCE(current_setting('role', true), 'none') = 'none'
       AND v_role = '' THEN
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

-- 4.3. Imutabilidade e Governança Clínica de food_nutrients
-- Helper function para checar se o usuário possui credencial clínica de nutricionista ou administrador
CREATE OR REPLACE FUNCTION private.is_nutritionist_or_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
    v_role_id TEXT;
    v_role_name TEXT;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT r.id, r.name INTO v_role_id, v_role_name
    FROM public.profiles p
    JOIN public.roles r ON r.id = p.role_id
    WHERE p.id = p_user_id;

    IF v_role_id IN ('nutritionist', 'admin')
       OR v_role_name ILIKE '%nutricionista%'
       OR v_role_name ILIKE '%administrador%' THEN
        RETURN TRUE;
    END IF;

    RETURN private.is_admin(p_user_id);
END;
$$;

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
    v_caller_id UUID;
    v_caller_role_id TEXT;
    v_caller_role_name TEXT;
BEGIN
    v_role := COALESCE(current_setting('request.jwt.claim.role', true), '');
    v_caller_id := auth.uid();

    IF v_role IN ('service_role', 'supabase_admin') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF session_user IN ('postgres', 'supabase_admin')
       AND COALESCE(current_setting('role', true), 'none') = 'none'
       AND v_role = '' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    v_target_food_id := COALESCE(NEW.food_id, OLD.food_id);

    SELECT source_type INTO v_source_type
    FROM public.foods
    WHERE id = v_target_food_id;

    IF v_source_type IN ('official', 'official_table') THEN
        RAISE EXCEPTION 'Alteração direta de nutrientes da fonte oficial TACO é proibida para usuários da aplicação. Apenas o importador oficial autorizado (service_role) pode atualizar a composição analítica.';
    END IF;

    -- Para alimentos customizados (professional_custom), escrita de nutrientes exige nutricionista credenciado ou admin
    IF v_source_type = 'professional_custom' AND v_caller_id IS NOT NULL THEN
        SELECT r.id, r.name INTO v_caller_role_id, v_caller_role_name
        FROM public.profiles p
        JOIN public.roles r ON r.id = p.role_id
        WHERE p.id = v_caller_id;

        IF v_caller_role_id = 'influencer' OR v_caller_role_name ILIKE '%influenc%' THEN
            RAISE EXCEPTION 'Influenciadores não possuem permissão clínica para alterar a composição nutricional de alimentos, mesmo sendo membros da organização.';
        END IF;

        IF NOT private.is_nutritionist_or_admin(v_caller_id) THEN
            RAISE EXCEPTION 'Escrita de nutrientes customizados exige nutricionista autorizado, administrador ou processo confiável de backend.';
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- 5. Governança Robusta de Alimentos Customizados (professional_custom)
CREATE OR REPLACE FUNCTION private.check_professional_custom_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_source_name TEXT;
    v_caller_id UUID;
    v_caller_role_id TEXT;
    v_caller_role_name TEXT;
    v_is_member BOOLEAN;
BEGIN
    v_caller_id := auth.uid();

    IF NEW.source_type = 'professional_custom' THEN
        IF NEW.organization_id IS NULL THEN
            RAISE EXCEPTION 'Alimentos customizados devem obrigatoriamente pertencer a uma organização.';
        END IF;

        -- Forçar created_by para o caller real autenticado
        IF TG_OP = 'INSERT' THEN
            IF v_caller_id IS NOT NULL THEN
                NEW.created_by := v_caller_id;
            END IF;

            IF NEW.created_by IS NULL THEN
                RAISE EXCEPTION 'Alimentos customizados devem obrigatoriamente registrar o usuário autor (created_by).';
            END IF;
        END IF;

        -- Validar se o caller pertence à organização indicada (ordem correta: target_org_id, target_user_id)
        IF v_caller_id IS NOT NULL AND NOT private.is_admin(v_caller_id) THEN
            SELECT private.is_org_member(NEW.organization_id, v_caller_id) INTO v_is_member;
            IF NOT COALESCE(v_is_member, false) THEN
                RAISE EXCEPTION 'Usuário não pertence à organização informada para o alimento customizado.';
            END IF;
        END IF;

        -- Não permitir uso de fontes oficiais TACO
        SELECT name INTO v_source_name
        FROM public.food_data_sources
        WHERE id = NEW.source_id;

        IF v_source_name ILIKE '%TACO%' OR v_source_name ILIKE '%Tabela Brasileira%' THEN
            RAISE EXCEPTION 'Alimentos customizados não podem ser atribuídos à fonte oficial TACO.';
        END IF;

        -- Não permitir uso de códigos numéricos de 3 dígitos reservados para a TACO
        IF NEW.source_food_code ~ '^[0-9]{3}$' THEN
            RAISE EXCEPTION 'Alimentos customizados não podem adotar códigos numéricos reservados da TACO (ex: 001-597).';
        END IF;

        -- Verificar permissão clínica do caller real através de JOIN com public.roles
        IF v_caller_id IS NOT NULL THEN
            SELECT r.id, r.name INTO v_caller_role_id, v_caller_role_name
            FROM public.profiles p
            JOIN public.roles r ON r.id = p.role_id
            WHERE p.id = v_caller_id;

            IF (v_caller_role_id = 'influencer' OR v_caller_role_name ILIKE '%influenc%')
               AND NEW.validation_status = 'verified_by_nutritionist' THEN
                RAISE EXCEPTION 'Influenciadores não possuem autorização clínica para validar composição nutricional ou definir status verified_by_nutritionist.';
            END IF;

            IF NEW.validation_status = 'verified_by_nutritionist' AND NOT private.is_nutritionist_or_admin(v_caller_id) THEN
                RAISE EXCEPTION 'Apenas nutricionistas credenciados ou administradores podem validar alimentos customizados (verified_by_nutritionist).';
            END IF;
        END IF;

        IF TG_OP = 'UPDATE' THEN
            IF NEW.organization_id <> OLD.organization_id THEN
                RAISE EXCEPTION 'Não é permitido transferir alimentos customizados entre organizações.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- 6. Trigger para Observações de Preço (Auditoria de entered_by e source_type)
CREATE OR REPLACE FUNCTION private.check_price_observation_governance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_role TEXT;
BEGIN
    v_caller_id := auth.uid();
    v_role := COALESCE(current_setting('request.jwt.claim.role', true), '');

    -- Forçar entered_by a partir do auth.uid()
    IF v_caller_id IS NOT NULL THEN
        NEW.entered_by := v_caller_id;
    END IF;

    -- Proibir que profissionais ou usuários comuns usem source_type = 'official_reference'
    IF NEW.source_type = 'official_reference' THEN
        IF v_role NOT IN ('service_role', 'supabase_admin') AND (v_caller_id IS NULL OR NOT private.is_admin(v_caller_id)) THEN
            RAISE EXCEPTION 'Apenas administradores podem registrar observações de preço como official_reference.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_price_observation_governance ON public.food_price_observations;
CREATE TRIGGER trg_price_observation_governance
    BEFORE INSERT ON public.food_price_observations
    FOR EACH ROW
    EXECUTE FUNCTION private.check_price_observation_governance();

-- 7. Isolamento Cross-Tenant Estrito em foods (RLS)
DROP POLICY IF EXISTS "View foods for authenticated" ON public.foods;
DROP POLICY IF EXISTS "Public read foods" ON public.foods;
CREATE POLICY "Public read foods"
    ON public.foods FOR SELECT
    TO authenticated
    USING (
        (source_type IN ('official', 'official_table') AND is_active = true)
        OR (
            source_type = 'professional_custom' AND (
                created_by = auth.uid()
                OR (organization_id IS NOT NULL AND private.is_org_member(organization_id, auth.uid()))
                OR private.is_admin(auth.uid())
            )
        )
        OR private.is_admin(auth.uid())
    );

-- 8. Remoção de USING(true) em Tabelas Filhas para Evitar Vazamento Cross-Tenant
-- 8.1. food_nutrients
DROP POLICY IF EXISTS "View food nutrients for authenticated" ON public.food_nutrients;
DROP POLICY IF EXISTS "Public read food_nutrients" ON public.food_nutrients;
CREATE POLICY "Scoped read food_nutrients"
    ON public.food_nutrients FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.foods f
            WHERE f.id = food_nutrients.food_id
            AND (
                (f.source_type IN ('official', 'official_table') AND f.is_active = true)
                OR (
                    f.source_type = 'professional_custom' AND (
                        f.created_by = auth.uid()
                        OR (f.organization_id IS NOT NULL AND private.is_org_member(f.organization_id, auth.uid()))
                        OR private.is_admin(auth.uid())
                    )
                )
                OR private.is_admin(auth.uid())
            )
        )
    );

-- 8.2. food_household_measures
DROP POLICY IF EXISTS "View household measures for authenticated" ON public.food_household_measures;
DROP POLICY IF EXISTS "Public read food_household_measures" ON public.food_household_measures;
CREATE POLICY "Scoped read food_household_measures"
    ON public.food_household_measures FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.foods f
            WHERE f.id = food_household_measures.food_id
            AND (
                (f.source_type IN ('official', 'official_table') AND f.is_active = true)
                OR (
                    f.source_type = 'professional_custom' AND (
                        f.created_by = auth.uid()
                        OR (f.organization_id IS NOT NULL AND private.is_org_member(f.organization_id, auth.uid()))
                        OR private.is_admin(auth.uid())
                    )
                )
                OR private.is_admin(auth.uid())
            )
        )
    );

-- 8.3. food_aliases
DROP POLICY IF EXISTS "View food aliases for authenticated" ON public.food_aliases;
DROP POLICY IF EXISTS "Public read food_aliases" ON public.food_aliases;
CREATE POLICY "Scoped read food_aliases"
    ON public.food_aliases FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.foods f
            WHERE f.id = food_aliases.food_id
            AND (
                (f.source_type IN ('official', 'official_table') AND f.is_active = true)
                OR (
                    f.source_type = 'professional_custom' AND (
                        f.created_by = auth.uid()
                        OR (f.organization_id IS NOT NULL AND private.is_org_member(f.organization_id, auth.uid()))
                        OR private.is_admin(auth.uid())
                    )
                )
                OR private.is_admin(auth.uid())
            )
        )
    );

-- 8.4. food_category_mappings
DROP POLICY IF EXISTS "View food category mappings for authenticated" ON public.food_category_mappings;
DROP POLICY IF EXISTS "Public read food_category_mappings" ON public.food_category_mappings;
CREATE POLICY "Scoped read food_category_mappings"
    ON public.food_category_mappings FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.foods f
            WHERE f.id = food_category_mappings.food_id
            AND (
                (f.source_type IN ('official', 'official_table') AND f.is_active = true)
                OR (
                    f.source_type = 'professional_custom' AND (
                        f.created_by = auth.uid()
                        OR (f.organization_id IS NOT NULL AND private.is_org_member(f.organization_id, auth.uid()))
                        OR private.is_admin(auth.uid())
                    )
                )
                OR private.is_admin(auth.uid())
            )
        )
    );

-- 8.5. food_tag_mappings
DROP POLICY IF EXISTS "View food tag mappings for authenticated" ON public.food_tag_mappings;
DROP POLICY IF EXISTS "Public read food_tag_mappings" ON public.food_tag_mappings;
CREATE POLICY "Scoped read food_tag_mappings"
    ON public.food_tag_mappings FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.foods f
            WHERE f.id = food_tag_mappings.food_id
            AND (
                (f.source_type IN ('official', 'official_table') AND f.is_active = true)
                OR (
                    f.source_type = 'professional_custom' AND (
                        f.created_by = auth.uid()
                        OR (f.organization_id IS NOT NULL AND private.is_org_member(f.organization_id, auth.uid()))
                        OR private.is_admin(auth.uid())
                    )
                )
                OR private.is_admin(auth.uid())
            )
        )
    );

-- 8.6. Scoped Read para food_price_observations (Preços Privados de Organização Não Vazarem Globalmente)
DROP POLICY IF EXISTS "View food price observations for authenticated" ON public.food_price_observations;
DROP POLICY IF EXISTS "Authenticated read food_price_observations" ON public.food_price_observations;
DROP POLICY IF EXISTS "Scoped read food_price_observations" ON public.food_price_observations;
CREATE POLICY "Scoped read food_price_observations"
    ON public.food_price_observations FOR SELECT
    TO authenticated
    USING (
        organization_id IS NULL
        OR private.is_org_member(organization_id, auth.uid())
        OR private.is_admin(auth.uid())
    );

-- 9. Políticas de Gerenciamento de Tabelas Filhas para Alimentos Customizados (professional_custom)
-- 9.1. food_nutrients (escrita restrita a nutricionistas autorizados, administradores ou backend confiável)
DROP POLICY IF EXISTS "Professionals manage custom food nutrients" ON public.food_nutrients;
DROP POLICY IF EXISTS "Authorized nutritionists manage custom food nutrients" ON public.food_nutrients;
CREATE POLICY "Authorized nutritionists manage custom food nutrients"
    ON public.food_nutrients FOR ALL
    TO authenticated
    USING (
        private.is_nutritionist_or_admin(auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.foods f
            WHERE f.id = food_nutrients.food_id
            AND f.source_type = 'professional_custom'
            AND (
                f.created_by = auth.uid()
                OR (f.organization_id IS NOT NULL AND private.is_org_member(f.organization_id, auth.uid()))
                OR private.is_admin(auth.uid())
            )
        )
    )
    WITH CHECK (
        private.is_nutritionist_or_admin(auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.foods f
            WHERE f.id = food_nutrients.food_id
            AND f.source_type = 'professional_custom'
            AND (
                f.created_by = auth.uid()
                OR (f.organization_id IS NOT NULL AND private.is_org_member(f.organization_id, auth.uid()))
                OR private.is_admin(auth.uid())
            )
        )
    );

-- 9.2. food_household_measures
DROP POLICY IF EXISTS "Professionals manage custom food household measures" ON public.food_household_measures;
CREATE POLICY "Professionals manage custom food household measures"
    ON public.food_household_measures FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.foods f
            WHERE f.id = food_household_measures.food_id
            AND f.source_type = 'professional_custom'
            AND (
                f.created_by = auth.uid()
                OR (f.organization_id IS NOT NULL AND private.is_org_member(f.organization_id, auth.uid()))
                OR private.is_admin(auth.uid())
            )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.foods f
            WHERE f.id = food_household_measures.food_id
            AND f.source_type = 'professional_custom'
            AND (
                f.created_by = auth.uid()
                OR (f.organization_id IS NOT NULL AND private.is_org_member(f.organization_id, auth.uid()))
                OR private.is_admin(auth.uid())
            )
        )
    );

-- 9.3. food_aliases
DROP POLICY IF EXISTS "Professionals manage custom food aliases" ON public.food_aliases;
CREATE POLICY "Professionals manage custom food aliases"
    ON public.food_aliases FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.foods f
            WHERE f.id = food_aliases.food_id
            AND f.source_type = 'professional_custom'
            AND (
                f.created_by = auth.uid()
                OR (f.organization_id IS NOT NULL AND private.is_org_member(f.organization_id, auth.uid()))
                OR private.is_admin(auth.uid())
            )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.foods f
            WHERE f.id = food_aliases.food_id
            AND f.source_type = 'professional_custom'
            AND (
                f.created_by = auth.uid()
                OR (f.organization_id IS NOT NULL AND private.is_org_member(f.organization_id, auth.uid()))
                OR private.is_admin(auth.uid())
            )
        )
    );

-- 10. Função Atômica Transacional de Importação Oficial da TACO (RPC)
-- Garante BEGIN -> Validação Invariantes -> INSERT fontes, catálogo, alimentos, nutrientes -> Validação Invariantes -> COMMIT
-- Qualquer falha no pipeline, teste deliberado ou violação de invariante dispara ROLLBACK integral no PostgreSQL
CREATE OR REPLACE FUNCTION public.import_canonical_taco_atomic(
    p_payload JSONB,
    p_simulate_failure_after_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_source_meta JSONB;
    v_foods JSONB;
    v_catalog JSONB;
    v_source_id UUID;
    v_food JSONB;
    v_food_code TEXT;
    v_food_id UUID;
    v_imported_foods INT := 0;
    v_total_nutrients INT := 0;
    v_nut_entry RECORD;
    v_role TEXT;
BEGIN
    v_role := COALESCE(current_setting('request.jwt.claim.role', true), '');

    -- Autorização estrita: apenas service_role, supabase_admin ou conexão direta de superusuário de banco (manutenção/testes)
    -- Usuários autenticados (inclusive administradores) NUNCA podem chamar este RPC diretamente da aplicação
    IF v_role IN ('service_role', 'supabase_admin') THEN
        -- Processo confiável de infraestrutura / Server Action com trusted admin client
        NULL;
    ELSIF session_user IN ('postgres', 'supabase_admin')
          AND COALESCE(current_setting('role', true), 'none') = 'none'
          AND v_role = '' THEN
        -- Conexão direta de superusuário de banco
        NULL;
    ELSE
        RAISE EXCEPTION 'Acesso negado: public.import_canonical_taco_atomic aceita exclusivamente chamadas via service_role ou superusuário de banco. Administradores da aplicação devem invocar a Server Action autorizada.';
    END IF;

    v_source_meta := p_payload->'source';
    v_foods := p_payload->'foods';
    v_catalog := p_payload->'nutrients_catalog';

    IF v_source_meta IS NULL OR v_foods IS NULL OR v_catalog IS NULL THEN
        RAISE EXCEPTION 'Payload de importação inválido: ausência de metadados de source, alimentos ou catálogo de nutrientes.';
    END IF;

    -- Validação de Invariantes Canônicas (Antes de gravar qualquer registro)
    IF jsonb_array_length(v_foods) <> 597 THEN
        RAISE EXCEPTION 'INVARIANT_VIOLATION: Quantidade de alimentos no payload (%) difere da invariante canônica obrigatória de 597 alimentos.', jsonb_array_length(v_foods);
    END IF;

    IF jsonb_array_length(v_catalog) <> 26 THEN
        RAISE EXCEPTION 'INVARIANT_VIOLATION: Quantidade de nutrientes no catálogo (%) difere da invariante canônica obrigatória de 26 nutrientes analíticos.', jsonb_array_length(v_catalog);
    END IF;

    -- 1. Upsert da Fonte Oficial em food_data_sources
    INSERT INTO public.food_data_sources (
        name, version, publisher, reference, license_notes, checksum, is_active
    ) VALUES (
        v_source_meta->>'name',
        v_source_meta->>'version',
        v_source_meta->>'publisher',
        v_source_meta->>'reference',
        COALESCE(v_source_meta->>'license_notes', 'Uso institucional NEPA/UNICAMP'),
        v_source_meta->>'dataset_checksum',
        true
    )
    ON CONFLICT (name, version) DO UPDATE
    SET checksum = EXCLUDED.checksum,
        reference = EXCLUDED.reference,
        license_notes = EXCLUDED.license_notes,
        is_active = true
    RETURNING id INTO v_source_id;

    -- 2. Upsert do Catálogo de Nutrientes (todos os 26 campos analíticos oficiais)
    FOR v_nut_entry IN
        SELECT
            value->>'code' AS code,
            value->>'name' AS name,
            value->>'unit' AS unit,
            value->>'category' AS category,
            (value->>'display_order')::int AS display_order
        FROM jsonb_array_elements(v_catalog)
    LOOP
        INSERT INTO public.nutrients (code, name, unit, category, display_order)
        VALUES (v_nut_entry.code, v_nut_entry.name, v_nut_entry.unit, v_nut_entry.category, v_nut_entry.display_order)
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name, unit = EXCLUDED.unit, category = EXCLUDED.category;
    END LOOP;

    -- 3. Loop atômico de inserção de alimentos e nutrientes
    FOR v_food IN SELECT * FROM jsonb_array_elements(v_foods) LOOP
        v_food_code := v_food->>'source_food_code';

        -- Validação de Invariante: cada alimento canônico DEVE possuir exatamente os 26 campos analíticos
        IF (SELECT count(*) FROM jsonb_each(v_food->'nutrients')) <> 26 THEN
            RAISE EXCEPTION 'INVARIANT_VIOLATION: Alimento % possui contagem de nutrientes divergente de 26.', v_food_code;
        END IF;

        -- Teste de rollback deliberado em falha no meio da importação
        IF p_simulate_failure_after_code IS NOT NULL AND v_food_code > p_simulate_failure_after_code THEN
            RAISE EXCEPTION 'DELIBERATE_TEST_FAILURE: Falha simulada intencional após o alimento % para validação de atomicidade e rollback total.', p_simulate_failure_after_code;
        END IF;

        INSERT INTO public.foods (
            source_id, source_food_code, name, normalized_name, scientific_name,
            food_group, preparation_state, is_generic, is_active,
            source_type, validation_status, engine_eligibility_status,
            energy_consistency_status, description
        ) VALUES (
            v_source_id,
            v_food_code,
            v_food->>'name',
            v_food->>'normalized_name',
            v_food->>'scientific_name',
            v_food->>'food_group',
            v_food->>'preparation_state',
            COALESCE((v_food->>'is_generic')::boolean, true),
            true,
            'official',
            'official_approved',
            COALESCE(v_food->>'engine_eligibility_status', 'eligible_for_engine'),
            v_food->>'energy_consistency_status',
            v_food->>'scientific_name'
        )
        ON CONFLICT (source_id, source_food_code) DO UPDATE
        SET name = EXCLUDED.name,
            normalized_name = EXCLUDED.normalized_name,
            engine_eligibility_status = EXCLUDED.engine_eligibility_status,
            energy_consistency_status = EXCLUDED.energy_consistency_status
        RETURNING id INTO v_food_id;

        v_imported_foods := v_imported_foods + 1;

        -- Nutrientes do alimento com preservação de provenance e semântica canônica no upsert
        FOR v_nut_entry IN
            SELECT
                kv.key AS nut_code,
                n.id AS nutrient_id,
                (kv.value->>'numeric_value')::numeric AS numeric_value,
                kv.value->>'raw_value' AS raw_value,
                kv.value->>'value_status' AS value_status,
                kv.value->>'data_quality' AS data_quality,
                kv.value->>'source_reference' AS source_reference
            FROM jsonb_each(v_food->'nutrients') kv
            JOIN public.nutrients n ON n.code = kv.key
        LOOP
            INSERT INTO public.food_nutrients (
                food_id, nutrient_id, amount_per_100g, numeric_value,
                raw_value, value_status, data_quality, source_reference
            ) VALUES (
                v_food_id,
                v_nut_entry.nutrient_id,
                v_nut_entry.numeric_value,
                v_nut_entry.numeric_value,
                v_nut_entry.raw_value,
                v_nut_entry.value_status,
                v_nut_entry.data_quality,
                v_nut_entry.source_reference
            )
            ON CONFLICT (food_id, nutrient_id) DO UPDATE
            SET amount_per_100g = EXCLUDED.amount_per_100g,
                numeric_value = EXCLUDED.numeric_value,
                raw_value = EXCLUDED.raw_value,
                value_status = EXCLUDED.value_status,
                data_quality = EXCLUDED.data_quality,
                source_reference = EXCLUDED.source_reference;

            v_total_nutrients := v_total_nutrients + 1;
        END LOOP;
    END LOOP;

    -- Validação de Invariantes Canônicas (Após processamento completo)
    IF v_imported_foods <> 597 THEN
        RAISE EXCEPTION 'INVARIANT_VIOLATION: Total de alimentos processados (%) difere da invariante canônica de 597.', v_imported_foods;
    END IF;

    IF v_total_nutrients <> 15522 THEN
        RAISE EXCEPTION 'INVARIANT_VIOLATION: Total de nutrientes persistidos (%) difere da invariante canônica de 15522 (597 alimentos x 26 campos).', v_total_nutrients;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'source_id', v_source_id,
        'imported_foods_count', v_imported_foods,
        'total_nutrients_count', v_total_nutrients,
        'dataset_version', v_source_meta->>'version',
        'checksum', v_source_meta->>'dataset_checksum'
    );
END;
$$;

-- Revogação estrita de execução de usuários da aplicação (anon, authenticated, PUBLIC)
-- Concessão restrita a service_role e superusuários de banco
REVOKE ALL ON FUNCTION public.import_canonical_taco_atomic(JSONB, TEXT) FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.import_canonical_taco_atomic(JSONB, TEXT) TO service_role;
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_admin') THEN
        GRANT EXECUTE ON FUNCTION public.import_canonical_taco_atomic(JSONB, TEXT) TO supabase_admin;
    END IF;
END $$;


