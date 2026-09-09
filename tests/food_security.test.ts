import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

describe('ETAPA 5: Food Database & Pricing Security Gate (Hardening, Immutability, Cross-Tenant Isolation & RLS)', () => {
  let db: PGlite;

  const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
  const NUTRI_ID = '00000000-0000-0000-0000-000000000002';
  const INFLUENCER_ID = '00000000-0000-0000-0000-000000000003';
  const PATIENT_ID = '00000000-0000-0000-0000-000000000004';
  const NUTRI_B_ID = '00000000-0000-0000-0000-000000000005';
  const ORG_ID = '00000000-0000-0000-0000-000000000010';
  const ORG_B_ID = '00000000-0000-0000-0000-000000000020';

  let SOURCE_TACO_ID: string;
  let SOURCE_CUSTOM_ID: string;
  let OFFICIAL_FOOD_ID: string;
  let NUTRIENT_ENERGY_ID: string;

  async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<{ rows: T[]; affectedRows?: number }> {
    const res = await db.query<T>(sql, params);
    return { rows: res.rows, affectedRows: res.affectedRows };
  }

  async function asUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.sub" = '${userId}'; SET "request.jwt.claim.role" = 'authenticated';`);
    try {
      return await fn();
    } finally {
      await db.exec(`RESET ROLE; RESET "request.jwt.claim.sub"; RESET "request.jwt.claim.role";`);
    }
  }

  beforeAll(async () => {
    db = new PGlite();

    // 1. Mock de auth schema e funções do Supabase
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY,
        email TEXT UNIQUE,
        raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
        email_confirmed_at TIMESTAMPTZ DEFAULT NOW(),
        confirmed_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;

      CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT LANGUAGE sql STABLE AS $$
        SELECT COALESCE(current_setting('request.jwt.claim.role', true), 'authenticated');
      $$;

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role;
        END IF;
      END $$;
    `);

    // 2. Executar Todas as 14 Migrações (incluindo a 14 de isolamento cross-tenant)
    const migrationsDir = path.resolve(__dirname, '../supabase/migrations');
    const migrationFiles = [
      '20260907000001_initial_schema.sql',
      '20260907000002_rbac_and_permissions.sql',
      '20260907000003_rls_policies.sql',
      '20260907000004_audit_and_triggers.sql',
      '20260907000005_seed_initial_data.sql',
      '20260907000006_invites_and_onboarding.sql',
      '20260907000007_atomic_enrollment_and_rpc_wrappers.sql',
      '20260907000008_private_grants_and_email_verification.sql',
      '20260907000009_patient_nutrition_profile.sql',
      '20260908000010_deterministic_nutrition_engine.sql',
      '20260908000011_segregate_clinical_review_and_guardrails.sql',
      '20260908000012_food_database_and_pricing.sql',
      '20260908000013_food_semantics_and_custom_hardening.sql',
      '20260908000014_cross_tenant_and_governance_hardening.sql',
    ];

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await db.exec(sql);
    }

    // Permissões de schema
    await db.exec(`
      GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
      GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated, service_role;
    `);

    // 3. Cadastrar Usuários de Teste com seus respectivos papéis
    // Admin
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${ADMIN_ID}', 'admin@appnutri.com', NOW(), '{"full_name": "Admin Sistema"}');
      UPDATE public.profiles SET role_id = 'admin', is_active = true, status = 'active' WHERE id = '${ADMIN_ID}';
    `);

    // Nutricionista Org A
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${NUTRI_ID}', 'nutri@appnutri.com', NOW(), '{"full_name": "Dra. Nutricionista A"}');
      UPDATE public.profiles SET role_id = 'nutritionist', is_active = true, status = 'active' WHERE id = '${NUTRI_ID}';
      DELETE FROM public.patients WHERE id = '${NUTRI_ID}';
      INSERT INTO public.professional_profiles (id, professional_type, license_number)
      VALUES ('${NUTRI_ID}', 'nutritionist', 'CRN-12345');
    `);

    // Nutricionista Org B (Tenant Concorrente)
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${NUTRI_B_ID}', 'nutrib@concorrente.com', NOW(), '{"full_name": "Dr. Nutricionista B"}');
      UPDATE public.profiles SET role_id = 'nutritionist', is_active = true, status = 'active' WHERE id = '${NUTRI_B_ID}';
      DELETE FROM public.patients WHERE id = '${NUTRI_B_ID}';
      INSERT INTO public.professional_profiles (id, professional_type, license_number)
      VALUES ('${NUTRI_B_ID}', 'nutritionist', 'CRN-67890');
    `);

    // Influencer
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${INFLUENCER_ID}', 'influencer@appnutri.com', NOW(), '{"full_name": "Fitness Influencer"}');
      UPDATE public.profiles SET role_id = 'influencer', is_active = true, status = 'active' WHERE id = '${INFLUENCER_ID}';
      DELETE FROM public.patients WHERE id = '${INFLUENCER_ID}';
      INSERT INTO public.professional_profiles (id, professional_type, niche)
      VALUES ('${INFLUENCER_ID}', 'influencer', 'Fitness');
    `);

    // Paciente
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${PATIENT_ID}', 'patient@appnutri.com', NOW(), '{"full_name": "Paciente Comum"}');
      UPDATE public.profiles SET role_id = 'patient', is_active = true, status = 'active' WHERE id = '${PATIENT_ID}';
    `);

    // Organização A para Nutricionista A e Influenciador
    await db.exec(`
      INSERT INTO public.organizations (id, name, slug, owner_id)
      VALUES ('${ORG_ID}', 'Clínica Vida Ativa', 'clinica-vida-ativa', '${NUTRI_ID}');
      INSERT INTO public.organization_members (organization_id, user_id, role_in_org)
      VALUES ('${ORG_ID}', '${NUTRI_ID}', 'owner'),
             ('${ORG_ID}', '${INFLUENCER_ID}', 'member');
    `);

    // Organização B para Nutricionista B
    await db.exec(`
      INSERT INTO public.organizations (id, name, slug, owner_id)
      VALUES ('${ORG_B_ID}', 'Clínica Concorrente', 'clinica-concorrente', '${NUTRI_B_ID}');
      INSERT INTO public.organization_members (organization_id, user_id, role_in_org)
      VALUES ('${ORG_B_ID}', '${NUTRI_B_ID}', 'owner');
    `);

    // 4. Inserir Fontes e Alimentos como Superuser/Service_role
    const sourceRes = await db.query<{ id: string }>(`
      INSERT INTO public.food_data_sources (name, version, publisher, reference, license_notes)
      VALUES ('TACO', '4.0.0', 'NEPA/UNICAMP', 'Tabela TACO 4ª edição', 'Dados públicos')
      RETURNING id;
    `);
    SOURCE_TACO_ID = sourceRes.rows[0].id;

    const customSourceRes = await db.query<{ id: string }>(`
      INSERT INTO public.food_data_sources (name, version, publisher, reference, license_notes)
      VALUES ('Receitas Clínica', '1.0.0', 'Clínica Vida Ativa', 'Manual de Preparações', 'Uso interno')
      RETURNING id;
    `);
    SOURCE_CUSTOM_ID = customSourceRes.rows[0].id;

    const nutrientRes = await db.query<{ id: string }>(`
      INSERT INTO public.nutrients (code, name, unit, category, display_order)
      VALUES ('energy_kcal', 'Energia', 'kcal', 'macro', 1)
      RETURNING id;
    `);
    NUTRIENT_ENERGY_ID = nutrientRes.rows[0].id;

    const foodRes = await db.query<{ id: string }>(`
      INSERT INTO public.foods (
        source_id, source_food_code, name, normalized_name, food_group,
        preparation_state, is_generic, is_active, source_type, validation_status
      ) VALUES (
        '${SOURCE_TACO_ID}', '001', 'Arroz, tipo 1, cru', 'arroz tipo 1 cru', 'Cereais e derivados',
        'raw', true, true, 'official', 'official_approved'
      ) RETURNING id;
    `);
    OFFICIAL_FOOD_ID = foodRes.rows[0].id;

    await db.exec(`
      INSERT INTO public.food_nutrients (
        food_id, nutrient_id, amount_per_100g, numeric_value, raw_value, value_status, data_quality, source_reference
      ) VALUES (
        '${OFFICIAL_FOOD_ID}', '${NUTRIENT_ENERGY_ID}', 358.0, 358.0, '358', 'NUMERIC_VALUE', 'analytical', 'TACO 4ª ed 001'
      );
    `);
  });

  describe('1. Consulta Autenticada e RLS de Alimentos Oficiais', () => {
    it('Qualquer usuário autenticado pode consultar alimentos oficiais ativos', async () => {
      const res = await asUser(PATIENT_ID, () =>
        query<{ id: string; name: string }>(`SELECT id, name FROM public.foods WHERE id = '${OFFICIAL_FOOD_ID}';`)
      );
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0].name).toBe('Arroz, tipo 1, cru');
    });

    it('Qualquer usuário autenticado pode consultar nutrientes de alimentos oficiais', async () => {
      const res = await asUser(PATIENT_ID, () =>
        query<{ amount_per_100g: number }>(`
          SELECT amount_per_100g FROM public.food_nutrients
          WHERE food_id = '${OFFICIAL_FOOD_ID}' AND nutrient_id = '${NUTRIENT_ENERGY_ID}';
        `)
      );
      expect(res.rows).toHaveLength(1);
      expect(Number(res.rows[0].amount_per_100g)).toBe(358.0);
    });
  });

  describe('2. Imutabilidade Absoluta de Dados Oficiais', () => {
    it('Qualquer usuário (inclusive Admin) que tentar alterar dados canônicos de alimento oficial é bloqueado', async () => {
      await expect(
        asUser(ADMIN_ID, () =>
          query(`
            UPDATE public.foods
            SET name = 'Arroz Modificado Ilegitimamente'
            WHERE id = '${OFFICIAL_FOOD_ID}';
          `)
        )
      ).rejects.toThrow('Alteração de dados canônicos da fonte oficial é proibida para usuários da aplicação');
    });

    it('Admin PODE alterar metadados operacionais do alimento oficial (is_active, engine_eligibility_status)', async () => {
      const updateRes = await asUser(ADMIN_ID, () =>
        query(`
          UPDATE public.foods
          SET is_active = false, engine_eligibility_status = 'disabled'
          WHERE id = '${OFFICIAL_FOOD_ID}';
        `)
      );
      expect(updateRes.affectedRows).toBe(1);

      // Restaura para os demais testes
      await asUser(ADMIN_ID, () =>
        query(`
          UPDATE public.foods
          SET is_active = true, engine_eligibility_status = 'eligible_for_engine'
          WHERE id = '${OFFICIAL_FOOD_ID}';
        `)
      );
    });

    it('Qualquer usuário da aplicação tentando excluir alimento oficial é bloqueado', async () => {
      await expect(
        asUser(ADMIN_ID, () =>
          query(`DELETE FROM public.foods WHERE id = '${OFFICIAL_FOOD_ID}';`)
        )
      ).rejects.toThrow('Exclusão de alimento oficial da base TACO é terminantemente proibida.');
    });

    it('Qualquer usuário da aplicação tentando alterar food_nutrients de alimento oficial é bloqueado', async () => {
      await expect(
        asUser(ADMIN_ID, () =>
          query(`
            UPDATE public.food_nutrients
            SET amount_per_100g = 999, numeric_value = 999
            WHERE food_id = '${OFFICIAL_FOOD_ID}' AND nutrient_id = '${NUTRIENT_ENERGY_ID}';
          `)
        )
      ).rejects.toThrow('Alteração direta de nutrientes da fonte oficial TACO é proibida para usuários da aplicação.');
    });
  });

  describe('3. Governança e Blindagem de Alimentos Customizados (professional_custom)', () => {
    it('Alimento customizado NÃO pode utilizar a fonte oficial TACO', async () => {
      await expect(
        asUser(NUTRI_ID, () =>
          query(`
            INSERT INTO public.foods (
              source_id, source_food_code, name, normalized_name, food_group,
              preparation_state, source_type, organization_id, created_by
            ) VALUES (
              '${SOURCE_TACO_ID}', 'CUSTOM-01', 'Shake Proteico Fake TACO', 'shake fake',
              'Bebidas', 'prepared', 'professional_custom', '${ORG_ID}', '${NUTRI_ID}'
            );
          `)
        )
      ).rejects.toThrow('Alimentos customizados não podem ser atribuídos à fonte oficial TACO.');
    });

    it('Alimento customizado deve obrigatoriamente possuir organization_id', async () => {
      await expect(
        asUser(NUTRI_ID, () =>
          query(`
            INSERT INTO public.foods (
              source_id, source_food_code, name, normalized_name, food_group,
              preparation_state, source_type, created_by
            ) VALUES (
              '${SOURCE_CUSTOM_ID}', 'CUSTOM-01', 'Shake Sem Org', 'shake sem org',
              'Bebidas', 'prepared', 'professional_custom', '${NUTRI_ID}'
            );
          `)
        )
      ).rejects.toThrow('Alimentos customizados devem obrigatoriamente pertencer a uma organização.');
    });

    it('Trigger de governança força created_by para auth.uid(), impedindo falsificação de autoria', async () => {
      // Nutricionista A tenta falsificar created_by como sendo Nutricionista B
      const insertRes = await asUser(NUTRI_ID, () =>
        query<{ id: string; created_by: string }>(`
          INSERT INTO public.foods (
            source_id, source_food_code, name, normalized_name, food_group,
            preparation_state, source_type, organization_id, created_by, validation_status
          ) VALUES (
            '${SOURCE_CUSTOM_ID}', 'CUSTOM-FORGE', 'Shake Forjado', 'shake forjado',
            'Bebidas', 'prepared', 'professional_custom', '${ORG_ID}', '${NUTRI_B_ID}', 'draft'
          ) RETURNING id, created_by;
        `)
      );
      expect(insertRes.rows).toHaveLength(1);
      // Deve ter sido forçado para NUTRI_ID (o caller real), e NÃO NUTRI_B_ID
      expect(insertRes.rows[0].created_by).toBe(NUTRI_ID);
    });

    it('Usuário NÃO pode criar alimento customizado sob organization_id de outra organização', async () => {
      // Nutricionista A tenta associar alimento à Organização B
      await expect(
        asUser(NUTRI_ID, () =>
          query(`
            INSERT INTO public.foods (
              source_id, source_food_code, name, normalized_name, food_group,
              preparation_state, source_type, organization_id, validation_status
            ) VALUES (
              '${SOURCE_CUSTOM_ID}', 'CUSTOM-CROSS-ORG', 'Shake Invasor', 'shake invasor',
              'Bebidas', 'prepared', 'professional_custom', '${ORG_B_ID}', 'draft'
            );
          `)
        )
      ).rejects.toThrow('Usuário não pertence à organização informada para o alimento customizado.');
    });

    it('Influenciador NÃO pode validar composição clínica/nutricional de alimento customizado', async () => {
      await expect(
        asUser(INFLUENCER_ID, () =>
          query(`
            INSERT INTO public.foods (
              source_id, source_food_code, name, normalized_name, food_group,
              preparation_state, source_type, organization_id, created_by, validation_status
            ) VALUES (
              '${SOURCE_CUSTOM_ID}', 'CUSTOM-INF', 'Shake Fit', 'shake fit',
              'Bebidas', 'prepared', 'professional_custom', '${ORG_ID}', '${INFLUENCER_ID}', 'verified_by_nutritionist'
            );
          `)
        )
      ).rejects.toThrow(/Influenciadores não possuem autorização clínica/);
    });

    it('Influenciador da mesma organização NÃO pode alterar composição nutricional (food_nutrients)', async () => {
      // Cria alimento pela nutricionista dentro da Org A
      const recipeRes = await asUser(NUTRI_ID, () =>
        query<{ id: string }>(`
          INSERT INTO public.foods (
            source_id, source_food_code, name, normalized_name, food_group,
            preparation_state, source_type, organization_id, is_active, validation_status
          ) VALUES (
            '${SOURCE_CUSTOM_ID}', 'CUSTOM-NUTRI-INF-TEST', 'Suco Funcional Org A', 'suco funcional org a',
            'Bebidas', 'prepared', 'professional_custom', '${ORG_ID}', true, 'draft'
          ) RETURNING id;
        `)
      );
      const recipeId = recipeRes.rows[0].id;

      // 1. Influenciador da mesma organização tentando inserir nutrientes -> REJEITADO
      await expect(
        asUser(INFLUENCER_ID, () =>
          query(`
            INSERT INTO public.food_nutrients (
              food_id, nutrient_id, amount_per_100g, numeric_value, value_status, data_quality
            ) VALUES (
              '${recipeId}', '${NUTRIENT_ENERGY_ID}', 100, 100, 'NUMERIC_VALUE', 'calculated'
            );
          `)
        )
      ).rejects.toThrow();

      // 2. Nutricionista da organização insere nutriente -> SUCESSO
      await asUser(NUTRI_ID, () =>
        query(`
          INSERT INTO public.food_nutrients (
            food_id, nutrient_id, amount_per_100g, numeric_value, value_status, data_quality
          ) VALUES (
            '${recipeId}', '${NUTRIENT_ENERGY_ID}', 120, 120, 'NUMERIC_VALUE', 'calculated'
          );
        `)
      );

      // 3. Influenciador da mesma organização tentando atualizar nutriente existente -> Bloqueado (0 rows afetadas)
      const updateRes = await asUser(INFLUENCER_ID, () =>
        query(`
          UPDATE public.food_nutrients
          SET amount_per_100g = 999
          WHERE food_id = '${recipeId}';
        `)
      );
      expect(updateRes.affectedRows).toBe(0);

      // Confirma que o valor original permanece estritamente inalterado (120, não 999)
      const checkNut = await asUser(NUTRI_ID, () =>
        query<{ amount_per_100g: string }>(`
          SELECT amount_per_100g::text FROM public.food_nutrients WHERE food_id = '${recipeId}';
        `)
      );
      expect(checkNut.rows[0].amount_per_100g).toBe('120.0000');

      // 4. Influenciador da mesma organização tentando deletar nutriente -> Bloqueado (0 rows afetadas)
      const deleteRes = await asUser(INFLUENCER_ID, () =>
        query(`
          DELETE FROM public.food_nutrients
          WHERE food_id = '${recipeId}';
        `)
      );
      expect(deleteRes.affectedRows).toBe(0);

      // Confirma que o nutriente continua existindo intacto
      const checkNutAfterDelete = await asUser(NUTRI_ID, () =>
        query(`SELECT id FROM public.food_nutrients WHERE food_id = '${recipeId}';`)
      );
      expect(checkNutAfterDelete.rows).toHaveLength(1);
    });
  });

  describe('4. Ataques Reais de Isolamento Cross-Tenant (RLS em foods e tabelas filhas)', () => {
    let ORG_A_CUSTOM_FOOD_ID: string;

    beforeAll(async () => {
      // Cria alimento customizado e seus filhos sob a Organização A
      const foodRes = await asUser(NUTRI_ID, () =>
        query<{ id: string }>(`
          INSERT INTO public.foods (
            source_id, source_food_code, name, normalized_name, food_group,
            preparation_state, source_type, organization_id, is_active, validation_status
          ) VALUES (
            '${SOURCE_CUSTOM_ID}', 'ORG-A-RECIPE-01', 'Vitamina Hiperproteica Org A', 'vitamina hiperproteica org a',
            'Bebidas', 'prepared', 'professional_custom', '${ORG_ID}', true, 'draft'
          ) RETURNING id;
        `)
      );
      ORG_A_CUSTOM_FOOD_ID = foodRes.rows[0].id;

      // Adiciona nutrientes da receita
      await asUser(NUTRI_ID, () =>
        query(`
          INSERT INTO public.food_nutrients (food_id, nutrient_id, amount_per_100g, numeric_value, value_status, data_quality)
          VALUES ('${ORG_A_CUSTOM_FOOD_ID}', '${NUTRIENT_ENERGY_ID}', 250, 250, 'NUMERIC_VALUE', 'calculated');
        `)
      );

      // Adiciona medidas caseiras
      await asUser(NUTRI_ID, () =>
        query(`
          INSERT INTO public.food_household_measures (food_id, label, grams, source_reference)
          VALUES ('${ORG_A_CUSTOM_FOOD_ID}', '1 copo grande', 300, 'Receituário Interno Org A');
        `)
      );

      // Adiciona alias
      await asUser(NUTRI_ID, () =>
        query(`
          INSERT INTO public.food_aliases (food_id, alias_name, normalized_alias, alias_type)
          VALUES ('${ORG_A_CUSTOM_FOOD_ID}', 'Shake Secreto A', 'shake secreto a', 'exact');
        `)
      );
    });

    it('Nutricionista da Org A CONSEGUE visualizar seu alimento customizado e suas tabelas filhas', async () => {
      const food = await asUser(NUTRI_ID, () =>
        query(`SELECT id FROM public.foods WHERE id = '${ORG_A_CUSTOM_FOOD_ID}';`)
      );
      expect(food.rows).toHaveLength(1);

      const nuts = await asUser(NUTRI_ID, () =>
        query(`SELECT id FROM public.food_nutrients WHERE food_id = '${ORG_A_CUSTOM_FOOD_ID}';`)
      );
      expect(nuts.rows).toHaveLength(1);

      const measures = await asUser(NUTRI_ID, () =>
        query(`SELECT id FROM public.food_household_measures WHERE food_id = '${ORG_A_CUSTOM_FOOD_ID}';`)
      );
      expect(measures.rows).toHaveLength(1);

      const aliases = await asUser(NUTRI_ID, () =>
        query(`SELECT id FROM public.food_aliases WHERE food_id = '${ORG_A_CUSTOM_FOOD_ID}';`)
      );
      expect(aliases.rows).toHaveLength(1);
    });

    it('Ataque Cross-Tenant: Nutricionista da Org B NÃO PODE ver o alimento customizado da Org A mesmo com is_active=true', async () => {
      const food = await asUser(NUTRI_B_ID, () =>
        query(`SELECT id FROM public.foods WHERE id = '${ORG_A_CUSTOM_FOOD_ID}';`)
      );
      expect(food.rows).toHaveLength(0);
    });

    it('Ataque Cross-Tenant Indireto: Nutricionista da Org B NÃO PODE ler food_nutrients da Org A (sem USING true)', async () => {
      const nuts = await asUser(NUTRI_B_ID, () =>
        query(`SELECT id FROM public.food_nutrients WHERE food_id = '${ORG_A_CUSTOM_FOOD_ID}';`)
      );
      expect(nuts.rows).toHaveLength(0);
    });

    it('Ataque Cross-Tenant Indireto: Nutricionista da Org B NÃO PODE ler food_household_measures da Org A', async () => {
      const measures = await asUser(NUTRI_B_ID, () =>
        query(`SELECT id FROM public.food_household_measures WHERE food_id = '${ORG_A_CUSTOM_FOOD_ID}';`)
      );
      expect(measures.rows).toHaveLength(0);
    });

    it('Ataque Cross-Tenant Indireto: Nutricionista da Org B NÃO PODE ler food_aliases da Org A', async () => {
      const aliases = await asUser(NUTRI_B_ID, () =>
        query(`SELECT id FROM public.food_aliases WHERE food_id = '${ORG_A_CUSTOM_FOOD_ID}';`)
      );
      expect(aliases.rows).toHaveLength(0);
    });
  });

  describe('5. Prevenção de Bypass Inseguro por JWT Vazio', () => {
    it('Conexão sem claim JWT role tentando adulterar alimento oficial deve falhar', async () => {
      await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.role" = ''; SET "request.jwt.claim.sub" = '${ADMIN_ID}';`);
      try {
        await expect(
          query(`UPDATE public.foods SET name = 'Hack Sem Claim' WHERE id = '${OFFICIAL_FOOD_ID}';`)
        ).rejects.toThrow('Alteração de dados canônicos da fonte oficial é proibida para usuários da aplicação');
      } finally {
        await db.exec(`RESET ROLE; RESET "request.jwt.claim.role"; RESET "request.jwt.claim.sub";`);
      }
    });

    it('Conexão sem claim JWT role tentando adulterar food_nutrients oficial deve falhar', async () => {
      await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.role" = ''; SET "request.jwt.claim.sub" = '${ADMIN_ID}';`);
      try {
        await expect(
          query(`UPDATE public.food_nutrients SET amount_per_100g = 0 WHERE food_id = '${OFFICIAL_FOOD_ID}';`)
        ).rejects.toThrow('Alteração direta de nutrientes da fonte oficial TACO é proibida para usuários da aplicação.');
      } finally {
        await db.exec(`RESET ROLE; RESET "request.jwt.claim.role"; RESET "request.jwt.claim.sub";`);
      }
    });
  });

  describe('6. Constraint e Upsert Real em food_data_sources', () => {
    it('Deve executar upsert concorrente real em food_data_sources baseado em ON CONFLICT (name, version)', async () => {
      // Primeiro upsert (já existe 'TACO', '4.0.0' do seed)
      const upsertRes = await query<{ id: string; reference: string }>(`
        INSERT INTO public.food_data_sources (name, version, publisher, reference)
        VALUES ('TACO', '4.0.0', 'NEPA/UNICAMP', 'Referência Atualizada pelo Teste')
        ON CONFLICT (name, version) DO UPDATE
        SET reference = EXCLUDED.reference
        RETURNING id, reference;
      `);

      expect(upsertRes.rows).toHaveLength(1);
      expect(upsertRes.rows[0].id).toBe(SOURCE_TACO_ID);
      expect(upsertRes.rows[0].reference).toBe('Referência Atualizada pelo Teste');
    });
  });

  describe('7. Governança e Proveniência de Preços (food_price_observations)', () => {
    it('Usuário profissional NÃO pode registrar observação arbitrária como official_reference', async () => {
      await expect(
        asUser(NUTRI_ID, () =>
          query(`
            INSERT INTO public.food_price_observations (
              food_id, country, state_region, city, package_size_g, package_price,
              currency, price_per_100g, price_per_kg, source_type
            ) VALUES (
              '${OFFICIAL_FOOD_ID}', 'BRA', 'SP', 'Campinas', 1000, 5.00,
              'BRL', 0.50, 5.00, 'official_reference'
            );
          `)
        )
      ).rejects.toThrow('Apenas administradores podem registrar observações de preço como official_reference.');
    });

    it('Preço privado de organização NÃO pode vazar globalmente para outra organização', async () => {
      // Nutricionista A cadastra preço interno da sua organização
      const obsRes = await asUser(NUTRI_ID, () =>
        query<{ id: string }>(`
          INSERT INTO public.food_price_observations (
            food_id, organization_id, country, state_region, city, package_size_g, package_price,
            currency, price_per_100g, price_per_kg, source_type
          ) VALUES (
            '${OFFICIAL_FOOD_ID}', '${ORG_ID}', 'BRA', 'SP', 'São Paulo', 1000, 10.00,
            'BRL', 1.00, 10.00, 'professional_input'
          ) RETURNING id;
        `)
      );
      const privateObsId = obsRes.rows[0].id;

      // Nutricionista B da Org B NÃO PODE ver a observação privada da Org A
      const leakCheck = await asUser(NUTRI_B_ID, () =>
        query(`SELECT id FROM public.food_price_observations WHERE id = '${privateObsId}';`)
      );
      expect(leakCheck.rows).toHaveLength(0);

      // Nutricionista A da Org A CONSEGUE ver
      const ownerCheck = await asUser(NUTRI_ID, () =>
        query(`SELECT id FROM public.food_price_observations WHERE id = '${privateObsId}';`)
      );
      expect(ownerCheck.rows).toHaveLength(1);
    });
  });
});
