-- ==============================================================================
-- MIGRATION: 20260908000012_food_database_and_pricing.sql
-- DESCRIPTION: Base Estruturada de Alimentos, Nutrientes, Medidas Caseiras,
--              Categorias Funcionais, Tags de Alergênicos e Observações de Preços (ETAPA 5)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. REGISTRY DE FONTES DE DADOS (food_data_sources)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.food_data_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    publisher TEXT NOT NULL,
    reference TEXT,
    license_notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now()),
    checksum TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now()),
    CONSTRAINT uq_food_data_sources_name_version UNIQUE (name, version)
);

COMMENT ON TABLE public.food_data_sources IS 'Registro formal de proveniência de dados alimentares (TACO, USDA, Rótulos, etc.).';

-- ------------------------------------------------------------------------------
-- 2. TABELA DE ALIMENTOS ESTRUTURADOS (foods)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.foods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES public.food_data_sources(id) ON DELETE RESTRICT,
    source_food_code TEXT NOT NULL,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    scientific_name TEXT,
    food_group TEXT NOT NULL,
    description TEXT,
    preparation_state TEXT NOT NULL DEFAULT 'raw',
    brand TEXT,
    is_generic BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    engine_eligibility_status TEXT NOT NULL DEFAULT 'eligible_for_engine',
    energy_consistency_status TEXT NOT NULL DEFAULT 'consistent',
    source_type TEXT NOT NULL DEFAULT 'official_table',
    created_by UUID REFERENCES public.profiles(id),
    organization_id UUID REFERENCES public.organizations(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now()),
    CONSTRAINT uq_foods_source_code UNIQUE (source_id, source_food_code),
    CONSTRAINT chk_food_preparation_state CHECK (
        preparation_state IN ('raw', 'cooked', 'grilled', 'roasted', 'fried', 'prepared', 'industrialized', 'other')
    ),
    CONSTRAINT chk_food_engine_eligibility CHECK (
        engine_eligibility_status IN ('eligible_for_engine', 'needs_review', 'incomplete_nutrition', 'disabled')
    ),
    CONSTRAINT chk_food_energy_consistency CHECK (
        energy_consistency_status IN ('consistent', 'within_tolerance', 'different_from_macro_estimate', 'insufficient_data')
    ),
    CONSTRAINT chk_food_source_type CHECK (
        source_type IN ('official_table', 'manufacturer_label', 'professional_custom')
    )
);

CREATE INDEX IF NOT EXISTS idx_foods_normalized_name ON public.foods(normalized_name);
CREATE INDEX IF NOT EXISTS idx_foods_food_group ON public.foods(food_group);
CREATE INDEX IF NOT EXISTS idx_foods_eligibility ON public.foods(engine_eligibility_status);
CREATE INDEX IF NOT EXISTS idx_foods_source_id ON public.foods(source_id);

COMMENT ON TABLE public.foods IS 'Catálogo central e padronizado de alimentos com rastreabilidade da fonte e estado de preparo.';

-- ------------------------------------------------------------------------------
-- 3. CATÁLOGO DE NUTRIENTES NORMALIZADO (nutrients)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nutrients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'macro',
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now()),
    CONSTRAINT chk_nutrient_category CHECK (
        category IN ('macro', 'mineral', 'vitamin', 'lipid', 'other')
    )
);

CREATE INDEX IF NOT EXISTS idx_nutrients_code ON public.nutrients(code);

COMMENT ON TABLE public.nutrients IS 'Definições padronizadas de nutrientes, unidades de medida e categorização.';

-- ------------------------------------------------------------------------------
-- 4. VALORES NUTRICIONAIS POR ALIMENTO (food_nutrients)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.food_nutrients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    food_id UUID NOT NULL REFERENCES public.foods(id) ON DELETE CASCADE,
    nutrient_id UUID NOT NULL REFERENCES public.nutrients(id) ON DELETE RESTRICT,
    amount_per_100g NUMERIC(10,4), -- NULL significa desconhecido/não analisado. Zero é zero comprovado!
    data_quality TEXT NOT NULL DEFAULT 'analytical',
    source_reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now()),
    CONSTRAINT uq_food_nutrients_food_nutrient UNIQUE (food_id, nutrient_id),
    CONSTRAINT chk_food_nutrient_quality CHECK (
        data_quality IN ('analytical', 'calculated', 'estimated', 'imputed', 'trace', 'not_available', 'not_analyzed')
    )
);

CREATE INDEX IF NOT EXISTS idx_food_nutrients_food ON public.food_nutrients(food_id);
CREATE INDEX IF NOT EXISTS idx_food_nutrients_nutrient ON public.food_nutrients(nutrient_id);

COMMENT ON TABLE public.food_nutrients IS 'Composição quantitativa de nutrientes por 100g de alimento com metadados de qualidade analítica.';

-- ------------------------------------------------------------------------------
-- 5. MEDIDAS CASEIRAS EM GRAMAS (food_household_measures)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.food_household_measures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    food_id UUID NOT NULL REFERENCES public.foods(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    grams NUMERIC(8,2) NOT NULL,
    source TEXT NOT NULL DEFAULT 'TACO/IBGE',
    is_estimated BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now())
);

CREATE INDEX IF NOT EXISTS idx_household_measures_food ON public.food_household_measures(food_id);

COMMENT ON TABLE public.food_household_measures IS 'Conversão de medidas caseiras populares (colher, concha, fatia) para gramas exatas.';

-- ------------------------------------------------------------------------------
-- 6. ALIASES E SINÔNIMOS DE BUSCA (food_aliases)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.food_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    food_id UUID NOT NULL REFERENCES public.foods(id) ON DELETE CASCADE,
    alias_name TEXT NOT NULL,
    normalized_alias TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now())
);

CREATE INDEX IF NOT EXISTS idx_food_aliases_food ON public.food_aliases(food_id);
CREATE INDEX IF NOT EXISTS idx_food_aliases_normalized ON public.food_aliases(normalized_alias);

COMMENT ON TABLE public.food_aliases IS 'Termos de busca alternativos e populares associados a um alimento específico.';

-- ------------------------------------------------------------------------------
-- 7. CATEGORIAS FUNCIONAIS DETERMINÍSTICAS (food_categories)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.food_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS public.food_category_mappings (
    food_id UUID NOT NULL REFERENCES public.foods(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES public.food_categories(id) ON DELETE CASCADE,
    PRIMARY KEY (food_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_food_cat_map_cat ON public.food_category_mappings(category_id);

COMMENT ON TABLE public.food_categories IS 'Categorias funcionais internas (protein_source, carb_source, vegetable, fruit, etc.).';

-- ------------------------------------------------------------------------------
-- 8. TAGS DE ALIMENTAÇÃO E ALERGÊNICOS COM TRI-STATE (food_tags)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.food_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'allergen',
    CONSTRAINT chk_food_tag_category CHECK (
        category IN ('dietary', 'allergen', 'lifestyle')
    )
);

CREATE TABLE IF NOT EXISTS public.food_tag_mappings (
    food_id UUID NOT NULL REFERENCES public.foods(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES public.food_tags(id) ON DELETE CASCADE,
    value TEXT NOT NULL DEFAULT 'unknown',
    PRIMARY KEY (food_id, tag_id),
    CONSTRAINT chk_food_tag_value CHECK (value IN ('true', 'false', 'unknown'))
);

CREATE INDEX IF NOT EXISTS idx_food_tag_map_tag ON public.food_tag_mappings(tag_id);

COMMENT ON TABLE public.food_tag_mappings IS 'Mapeamento de restrições alimentares e alergênicos estruturados com valor tri-state.';

-- ------------------------------------------------------------------------------
-- 9. OBSERVAÇÕES E HISTÓRICO DE PREÇOS (food_price_observations)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.food_price_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    food_id UUID NOT NULL REFERENCES public.foods(id) ON DELETE CASCADE,
    country TEXT NOT NULL DEFAULT 'BRA',
    state_region TEXT,
    city TEXT,
    retailer TEXT,
    brand TEXT,
    package_size_g NUMERIC(10,2) NOT NULL,
    package_price NUMERIC(10,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'BRL',
    price_per_100g NUMERIC(10,4) NOT NULL,
    price_per_kg NUMERIC(10,2) NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now()),
    valid_until TIMESTAMPTZ,
    source_type TEXT NOT NULL DEFAULT 'manual_admin',
    source_reference TEXT,
    confidence NUMERIC(3,2) NOT NULL DEFAULT 1.0,
    entered_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now()),
    CONSTRAINT chk_price_source_type CHECK (
        source_type IN ('manual_admin', 'professional_input', 'retailer_api', 'public_dataset', 'receipt', 'user_report', 'partner_feed')
    ),
    CONSTRAINT chk_price_confidence CHECK (
        confidence >= 0.0 AND confidence <= 1.0
    )
);

CREATE INDEX IF NOT EXISTS idx_food_price_food ON public.food_price_observations(food_id);
CREATE INDEX IF NOT EXISTS idx_food_price_location ON public.food_price_observations(country, state_region, city);
CREATE INDEX IF NOT EXISTS idx_food_price_observed_at ON public.food_price_observations(observed_at DESC);

COMMENT ON TABLE public.food_price_observations IS 'Histórico contextual de preços de alimentos com data, localidade e grau de confiança.';

-- ------------------------------------------------------------------------------
-- 10. DISPONIBILIDADE REGIONAL E SAZONAL (food_availability)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.food_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    food_id UUID NOT NULL REFERENCES public.foods(id) ON DELETE CASCADE,
    country TEXT NOT NULL DEFAULT 'BRA',
    state_region TEXT,
    city TEXT,
    availability_status TEXT NOT NULL DEFAULT 'available',
    source TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.timezone('utc', pg_catalog.now()),
    CONSTRAINT chk_availability_status CHECK (
        availability_status IN ('available', 'seasonal', 'scarce', 'unavailable')
    )
);

CREATE INDEX IF NOT EXISTS idx_food_availability_food ON public.food_availability(food_id);

-- ------------------------------------------------------------------------------
-- 11. HABILITAR ROW LEVEL SECURITY (RLS) EM TODAS AS TABELAS
-- ------------------------------------------------------------------------------
ALTER TABLE public.food_data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_nutrients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_household_measures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_category_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_tag_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_price_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_availability ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 12. POLICIES RLS DE LEITURA (SELECT)
-- ------------------------------------------------------------------------------
-- Usuários autenticados podem ler catálogos oficiais e preços
CREATE POLICY "View food data sources for authenticated"
    ON public.food_data_sources FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "View foods for authenticated"
    ON public.foods FOR SELECT
    TO authenticated
    USING (
        source_type = 'official_table'
        OR is_active = true
        OR created_by = auth.uid()
        OR private.is_admin(auth.uid())
    );

CREATE POLICY "View nutrients for authenticated"
    ON public.nutrients FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "View food nutrients for authenticated"
    ON public.food_nutrients FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "View household measures for authenticated"
    ON public.food_household_measures FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "View food aliases for authenticated"
    ON public.food_aliases FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "View food categories for authenticated"
    ON public.food_categories FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "View food category mappings for authenticated"
    ON public.food_category_mappings FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "View food tags for authenticated"
    ON public.food_tags FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "View food tag mappings for authenticated"
    ON public.food_tag_mappings FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "View food price observations for authenticated"
    ON public.food_price_observations FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "View food availability for authenticated"
    ON public.food_availability FOR SELECT
    TO authenticated
    USING (true);

-- ------------------------------------------------------------------------------
-- 13. POLICIES RLS DE ESCRITA (INSERT, UPDATE, DELETE)
-- ------------------------------------------------------------------------------
-- Apenas ADMIN ou SERVICE_ROLE podem modificar fontes e alimentos oficiais TACO
CREATE POLICY "Admin manage food data sources"
    ON public.food_data_sources FOR ALL
    TO authenticated
    USING (private.is_admin(auth.uid()))
    WITH CHECK (private.is_admin(auth.uid()));

CREATE POLICY "Admin manage official foods"
    ON public.foods FOR INSERT
    TO authenticated
    WITH CHECK (
        (source_type = 'official_table' AND private.is_admin(auth.uid()))
        OR (source_type = 'professional_custom' AND private.is_professional(auth.uid()) AND created_by = auth.uid())
    );

CREATE POLICY "Admin or owner update foods"
    ON public.foods FOR UPDATE
    TO authenticated
    USING (
        (source_type = 'official_table' AND private.is_admin(auth.uid()))
        OR (source_type = 'professional_custom' AND created_by = auth.uid())
    )
    WITH CHECK (
        (source_type = 'official_table' AND private.is_admin(auth.uid()))
        OR (source_type = 'professional_custom' AND created_by = auth.uid())
    );

CREATE POLICY "Admin or owner delete foods"
    ON public.foods FOR DELETE
    TO authenticated
    USING (
        (source_type = 'official_table' AND private.is_admin(auth.uid()))
        OR (source_type = 'professional_custom' AND created_by = auth.uid())
    );

CREATE POLICY "Admin manage nutrients"
    ON public.nutrients FOR ALL
    TO authenticated
    USING (private.is_admin(auth.uid()))
    WITH CHECK (private.is_admin(auth.uid()));

CREATE POLICY "Admin manage food nutrients"
    ON public.food_nutrients FOR ALL
    TO authenticated
    USING (private.is_admin(auth.uid()))
    WITH CHECK (private.is_admin(auth.uid()));

CREATE POLICY "Admin manage household measures"
    ON public.food_household_measures FOR ALL
    TO authenticated
    USING (private.is_admin(auth.uid()))
    WITH CHECK (private.is_admin(auth.uid()));

CREATE POLICY "Admin manage food aliases"
    ON public.food_aliases FOR ALL
    TO authenticated
    USING (private.is_admin(auth.uid()))
    WITH CHECK (private.is_admin(auth.uid()));

CREATE POLICY "Admin manage categories"
    ON public.food_categories FOR ALL
    TO authenticated
    USING (private.is_admin(auth.uid()))
    WITH CHECK (private.is_admin(auth.uid()));

CREATE POLICY "Admin manage category mappings"
    ON public.food_category_mappings FOR ALL
    TO authenticated
    USING (private.is_admin(auth.uid()))
    WITH CHECK (private.is_admin(auth.uid()));

CREATE POLICY "Admin manage food tags"
    ON public.food_tags FOR ALL
    TO authenticated
    USING (private.is_admin(auth.uid()))
    WITH CHECK (private.is_admin(auth.uid()));

CREATE POLICY "Admin manage tag mappings"
    ON public.food_tag_mappings FOR ALL
    TO authenticated
    USING (private.is_admin(auth.uid()))
    WITH CHECK (private.is_admin(auth.uid()));

-- Observações de preço: ADMIN pode tudo; PROFISSIONAL pode registrar observações de campo
CREATE POLICY "Authorized insert price observations"
    ON public.food_price_observations FOR INSERT
    TO authenticated
    WITH CHECK (
        private.is_admin(auth.uid())
        OR (
            private.is_professional(auth.uid())
            AND source_type IN ('professional_input', 'user_report')
            AND (entered_by IS NULL OR entered_by = auth.uid())
        )
    );

CREATE POLICY "Admin update price observations"
    ON public.food_price_observations FOR UPDATE
    TO authenticated
    USING (private.is_admin(auth.uid()))
    WITH CHECK (private.is_admin(auth.uid()));

CREATE POLICY "Admin delete price observations"
    ON public.food_price_observations FOR DELETE
    TO authenticated
    USING (private.is_admin(auth.uid()));

CREATE POLICY "Admin manage food availability"
    ON public.food_availability FOR ALL
    TO authenticated
    USING (private.is_admin(auth.uid()))
    WITH CHECK (private.is_admin(auth.uid()));
