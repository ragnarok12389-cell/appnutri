import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { calculateNutritionProfileCompleteness } from '../src/lib/nutrition/completeness';
import {
  step1BodySchema,
  step6BudgetSchema,
  step3RoutineSchema,
} from '../src/lib/validations/nutrition-profile';

describe('ETAPA 3: Perfil Nutricional, Segregação de Dados Clínicos & Hardening RLS', () => {
  let db: PGlite;

  const ADMIN_ID = '11111111-1111-4111-a111-111111111111';
  const NUTRI_A_ID = '22222222-2222-4222-a222-222222222222';
  const NUTRI_B_ID = '33333333-3333-4333-a333-333333333333';
  const INFLUENCER_A_ID = '44444444-4444-4444-a444-444444444444';
  const INFLUENCER_B_ID = '88888888-8888-4888-a888-888888888888';
  const PATIENT_A_ID = '55555555-5555-4555-a555-555555555555';
  const PATIENT_B_ID = '66666666-6666-4666-a666-666666666666';
  const PATIENT_UNCONFIRMED_ID = '77777777-7777-4777-a777-777777777777';

  async function asUser<T>(userId: string, callback: () => Promise<T>): Promise<T> {
    await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.sub" = '${userId}';`);
    try {
      return await callback();
    } finally {
      await db.exec(`RESET ROLE; RESET "request.jwt.claim.sub";`);
    }
  }

  async function query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string) {
    return await db.query<T>(sql);
  }

  beforeAll(async () => {
    db = new PGlite();

    // 1. Setup Mock do Supabase Auth
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;

      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY,
        email TEXT UNIQUE,
        email_confirmed_at TIMESTAMPTZ,
        confirmed_at TIMESTAMPTZ,
        raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
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

    // 2. Executar Todas as 9 Migrações
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
    ];

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await db.exec(sql);
    }

    // Permissões
    await db.exec(`
      GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
      GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated, service_role;
    `);

    // 3. Cadastrar Usuários de Teste
    // Admin
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${ADMIN_ID}', 'admin@test.com', NOW(), '{"full_name": "Admin Master"}');
      UPDATE public.profiles SET role_id = 'admin', is_active = true, status = 'active' WHERE id = '${ADMIN_ID}';
    `);

    // Nutricionista A
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${NUTRI_A_ID}', 'nutriA@clinic.com', NOW(), '{"full_name": "Dr. Carlos Nutri"}');
      UPDATE public.profiles SET role_id = 'nutritionist', is_active = true, status = 'active' WHERE id = '${NUTRI_A_ID}';
      DELETE FROM public.patients WHERE id = '${NUTRI_A_ID}';
      INSERT INTO public.professional_profiles (id, professional_type, license_number)
      VALUES ('${NUTRI_A_ID}', 'nutritionist', 'CRN-1');
    `);

    // Nutricionista B (Não vinculado a Paciente A)
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${NUTRI_B_ID}', 'nutriB@clinic.com', NOW(), '{"full_name": "Dra. Beatriz Nutri"}');
      UPDATE public.profiles SET role_id = 'nutritionist', is_active = true, status = 'active' WHERE id = '${NUTRI_B_ID}';
      DELETE FROM public.patients WHERE id = '${NUTRI_B_ID}';
      INSERT INTO public.professional_profiles (id, professional_type, license_number)
      VALUES ('${NUTRI_B_ID}', 'nutritionist', 'CRN-2');
    `);

    // Influencer A
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${INFLUENCER_A_ID}', 'influencerA@social.com', NOW(), '{"full_name": "Lucas Fit"}');
      UPDATE public.profiles SET role_id = 'influencer', is_active = true, status = 'active' WHERE id = '${INFLUENCER_A_ID}';
      DELETE FROM public.patients WHERE id = '${INFLUENCER_A_ID}';
      INSERT INTO public.professional_profiles (id, professional_type, niche)
      VALUES ('${INFLUENCER_A_ID}', 'influencer', 'Fitness');
    `);

    // Influencer B (Não vinculado a Paciente A)
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${INFLUENCER_B_ID}', 'influencerB@social.com', NOW(), '{"full_name": "Renato Influencer"}');
      UPDATE public.profiles SET role_id = 'influencer', is_active = true, status = 'active' WHERE id = '${INFLUENCER_B_ID}';
      DELETE FROM public.patients WHERE id = '${INFLUENCER_B_ID}';
      INSERT INTO public.professional_profiles (id, professional_type, niche)
      VALUES ('${INFLUENCER_B_ID}', 'influencer', 'Musculação');
    `);

    // Paciente A
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${PATIENT_A_ID}', 'patientA@user.com', NOW(), '{"full_name": "Paciente A"}');
      UPDATE public.profiles SET is_active = true, status = 'active' WHERE id = '${PATIENT_A_ID}';
    `);

    // Paciente B
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${PATIENT_B_ID}', 'patientB@user.com', NOW(), '{"full_name": "Paciente B"}');
      UPDATE public.profiles SET is_active = true, status = 'active' WHERE id = '${PATIENT_B_ID}';
    `);

    // Paciente Unconfirmed
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${PATIENT_UNCONFIRMED_ID}', 'unconfirmed@user.com', NULL, '{"full_name": "Paciente Unconfirmed"}');
      UPDATE public.profiles SET is_active = false, status = 'pending_verification' WHERE id = '${PATIENT_UNCONFIRMED_ID}';
    `);

    // Vínculos:
    // Nutri A <-> Paciente A (ACTIVE)
    await db.exec(`
      INSERT INTO public.professional_patient_links (professional_id, patient_id, is_primary, status)
      VALUES ('${NUTRI_A_ID}', '${PATIENT_A_ID}', true, 'active');
    `);

    // Influencer A <-> Paciente A (ACTIVE)
    await db.exec(`
      INSERT INTO public.professional_patient_links (professional_id, patient_id, is_primary, status, link_type)
      VALUES ('${INFLUENCER_A_ID}', '${PATIENT_A_ID}', false, 'active', 'influencer_referral');
    `);

    // Nutri A <-> Paciente Unconfirmed (PENDING_VERIFICATION)
    await db.exec(`
      INSERT INTO public.professional_patient_links (professional_id, patient_id, is_primary, status)
      VALUES ('${NUTRI_A_ID}', '${PATIENT_UNCONFIRMED_ID}', true, 'pending_verification');
    `);
  });

  // ============================================================================
  // 1. CÁLCULO DETERMINÍSTICO DE COMPLETUDE & VALIDAÇÃO ZOD
  // ============================================================================

  it('1. Deve calcular completude deterministica corretamente (0%, parcial e 100%)', () => {
    expect(calculateNutritionProfileCompleteness({})).toBe(0);

    const partial = {
      height_cm: 175,
      current_weight_kg: 80,
      birth_date: '1995-05-15',
      biological_sex: 'male' as const,
      primary_goal: 'lose_weight' as const,
    };
    // 5 campos de 20 = 25%
    expect(calculateNutritionProfileCompleteness(partial)).toBe(25);

    const full = {
      height_cm: 175,
      current_weight_kg: 80,
      birth_date: '1995-05-15',
      biological_sex: 'male' as const,
      primary_goal: 'lose_weight' as const,
      wake_time: '06:00',
      sleep_time: '22:00',
      work_type: 'sedentary' as const,
      activity_level: 'moderate' as const,
      desired_meals_per_day: 4,
      dietary_pattern: 'omnivore' as const,
      preferred_protein_sources: ['Frango', 'Ovos'],
      preferred_carbohydrate_sources: ['Arroz', 'Batata'],
      food_budget_amount: 600,
      food_budget_period: 'monthly' as const,
      number_of_people_in_household: 1,
      city: 'São Paulo',
      cooking_skill_level: 'basic' as const,
      water_intake_liters: 2.5,
      primary_challenges: ['consistency' as const],
    };
    // Todos os 20 preenchidos = 100%
    expect(calculateNutritionProfileCompleteness(full)).toBe(100);
  });

  it('2. Schemas Zod devem rejeitar valores absurdos e aceitar intervalos plausíveis', () => {
    // Altura fora do plausível
    expect(step1BodySchema.safeParse({ height_cm: 30 }).success).toBe(false);
    expect(step1BodySchema.safeParse({ height_cm: 300 }).success).toBe(false);
    expect(step1BodySchema.safeParse({ height_cm: 175 }).success).toBe(true);

    // Peso fora do plausível
    expect(step1BodySchema.safeParse({ current_weight_kg: 10 }).success).toBe(false);
    expect(step1BodySchema.safeParse({ current_weight_kg: 500 }).success).toBe(false);
    expect(step1BodySchema.safeParse({ current_weight_kg: 78.5 }).success).toBe(true);

    // Orçamento negativo
    expect(step6BudgetSchema.safeParse({ food_budget_amount: -50 }).success).toBe(false);
    expect(step6BudgetSchema.safeParse({ food_budget_amount: 600, food_budget_period: 'monthly' }).success).toBe(true);

    // Dias de treino fora de 0-7
    expect(step3RoutineSchema.safeParse({ training_days_per_week: 9 }).success).toBe(false);
    expect(step3RoutineSchema.safeParse({ training_days_per_week: 4 }).success).toBe(true);
  });

  // ============================================================================
  // 2. CONSTRAINTS DO BANCO DE DADOS POSTGRESQL
  // ============================================================================

  it('3. PostgreSQL deve rejeitar violações de constraint no patient_nutrition_profiles', async () => {
    // Altura < 50
    await expect(
      db.exec(`
        INSERT INTO public.patient_nutrition_profiles (id, height_cm)
        VALUES ('${PATIENT_A_ID}', 30);
      `)
    ).rejects.toThrow();

    // Peso < 20
    await expect(
      db.exec(`
        INSERT INTO public.patient_nutrition_profiles (id, current_weight_kg)
        VALUES ('${PATIENT_A_ID}', 10);
      `)
    ).rejects.toThrow();

    // Orçamento negativo
    await expect(
      db.exec(`
        INSERT INTO public.patient_nutrition_profiles (id, food_budget_amount)
        VALUES ('${PATIENT_A_ID}', -100);
      `)
    ).rejects.toThrow();
  });

  // ============================================================================
  // 3. SALVAMENTO PARCIAL & SEGREGAÇÃO FÍSICA DE DADOS SENSÍVEIS
  // ============================================================================

  it('4. Paciente A deve conseguir salvar seu perfil geral e dados clínicos segregados', async () => {
    await asUser(PATIENT_A_ID, async () => {
      // Salva dados gerais na tabela patient_nutrition_profiles
      await db.exec(`
        INSERT INTO public.patient_nutrition_profiles (
          id, height_cm, current_weight_kg, birth_date, biological_sex, completion_percentage
        ) VALUES (
          '${PATIENT_A_ID}', 180, 85.0, '1992-04-10', 'male', 20
        )
        ON CONFLICT (id) DO UPDATE SET
          height_cm = EXCLUDED.height_cm,
          current_weight_kg = EXCLUDED.current_weight_kg,
          birth_date = EXCLUDED.birth_date,
          biological_sex = EXCLUDED.biological_sex,
          completion_percentage = EXCLUDED.completion_percentage;
      `);

      // Salva dados clínicos sensíveis na tabela segregada patient_nutrition_sensitive
      await db.exec(`
        INSERT INTO public.patient_nutrition_sensitive (
          patient_id, food_allergies, food_intolerances, medical_dietary_notes, clinical_dietary_restrictions, last_updated_by
        ) VALUES (
          '${PATIENT_A_ID}', ARRAY['Camarão', 'Amendoim'], ARRAY['Lactose'], 'Diagnóstico prévio de gastrite crônica moderada', ARRAY['Evitar frutos do mar'], '${PATIENT_A_ID}'
        )
        ON CONFLICT (patient_id) DO UPDATE SET
          food_allergies = EXCLUDED.food_allergies,
          food_intolerances = EXCLUDED.food_intolerances,
          medical_dietary_notes = EXCLUDED.medical_dietary_notes,
          clinical_dietary_restrictions = EXCLUDED.clinical_dietary_restrictions;
      `);

      const generalRes = await query(`SELECT height_cm, current_weight_kg, completion_percentage FROM public.patient_nutrition_profiles WHERE id = '${PATIENT_A_ID}';`);
      expect(Number(generalRes.rows[0].height_cm)).toBe(180);
      expect(Number(generalRes.rows[0].current_weight_kg)).toBe(85.0);

      const sensRes = await query(`SELECT food_allergies, medical_dietary_notes FROM public.patient_nutrition_sensitive WHERE patient_id = '${PATIENT_A_ID}';`);
      expect(sensRes.rows.length).toBe(1);
      expect(sensRes.rows[0].medical_dietary_notes).toContain('gastrite');
      expect((sensRes.rows[0].food_allergies as string[])).toContain('Camarão');
    });
  });

  // ============================================================================
  // 4. VERSIONAMENTO POR SNAPSHOTS SEGREGADOS (GERAIS VS SENSÍVEIS)
  // ============================================================================

  it('5. Conclusão do perfil deve gerar Snapshot Geral e Snapshot Clínico Sensível de Versão 1', async () => {
    await asUser(PATIENT_A_ID, async () => {
      // Atualiza perfil geral para concluído
      await db.exec(`
        UPDATE public.patient_nutrition_profiles
        SET is_completed = true,
            version = 1,
            primary_goal = 'lose_weight',
            food_budget_amount = 750,
            completion_percentage = 95
        WHERE id = '${PATIENT_A_ID}';
      `);

      // Snapshot Geral (NÃO CONTÉM DADOS SENSÍVEIS)
      await db.exec(`
        INSERT INTO public.patient_nutrition_snapshots (
          patient_id, version, snapshot_data, completion_percentage, created_by, change_summary
        ) VALUES (
          '${PATIENT_A_ID}',
          1,
          '{"height_cm": 180, "current_weight_kg": 85, "primary_goal": "lose_weight", "food_budget_amount": 750}'::jsonb,
          95,
          '${PATIENT_A_ID}',
          'Versão 1 inicial congelada'
        );
      `);

      // Snapshot Sensível Clínico (CONFINADO EM TABELA RESTRITA)
      await db.exec(`
        INSERT INTO public.patient_nutrition_sensitive_snapshots (
          patient_id, version, snapshot_data, created_by
        ) VALUES (
          '${PATIENT_A_ID}',
          1,
          '{"food_allergies": ["Camarão", "Amendoim"], "medical_dietary_notes": "Gastrite crônica"}'::jsonb,
          '${PATIENT_A_ID}'
        );
      `);

      const generalSnap = await query(`SELECT version, change_summary, snapshot_data FROM public.patient_nutrition_snapshots WHERE patient_id = '${PATIENT_A_ID}' AND version = 1;`);
      expect(generalSnap.rows.length).toBe(1);
      expect((generalSnap.rows[0].snapshot_data as Record<string, unknown>).food_allergies).toBeUndefined();

      const sensSnap = await query(`SELECT version, snapshot_data FROM public.patient_nutrition_sensitive_snapshots WHERE patient_id = '${PATIENT_A_ID}' AND version = 1;`);
      expect(sensSnap.rows.length).toBe(1);
      expect((sensSnap.rows[0].snapshot_data as Record<string, unknown>).medical_dietary_notes).toBe('Gastrite crônica');
    });
  });

  // ============================================================================
  // 5. HARDENING TOTAL CONTRA INFLUENCIADOR (BYPASS DE INTERFACE & POSTGREST)
  // ============================================================================

  it('6. INFLUENCER A: Consulta direta a patient_nutrition_sensitive do paciente vinculado DEVE RETORNAR 0 LINHAS', async () => {
    await asUser(INFLUENCER_A_ID, async () => {
      // Tentativa de leitura direta de dados sensíveis do paciente vinculado
      const res = await query(`SELECT * FROM public.patient_nutrition_sensitive WHERE patient_id = '${PATIENT_A_ID}';`);
      expect(res.rows.length).toBe(0);
    });
  });

  it('7. INFLUENCER A: Tentativa de ler colunas sensíveis em patient_nutrition_profiles DEVE FALHAR (coluna inexistente)', async () => {
    await asUser(INFLUENCER_A_ID, async () => {
      // Como as colunas foram fisicamente removidas do perfil geral, a consulta nem compila no postgres
      await expect(
        query(`SELECT food_allergies FROM public.patient_nutrition_profiles WHERE id = '${PATIENT_A_ID}';`)
      ).rejects.toThrow();

      await expect(
        query(`SELECT medical_dietary_notes FROM public.patient_nutrition_profiles WHERE id = '${PATIENT_A_ID}';`)
      ).rejects.toThrow();
    });
  });

  it('8. INFLUENCER A: Tentativa de UPDATE em patient_nutrition_sensitive DEVE SER TOTALMENTE BLOQUEADA (0 linhas)', async () => {
    await asUser(INFLUENCER_A_ID, async () => {
      await db.exec(`
        UPDATE public.patient_nutrition_sensitive
        SET medical_dietary_notes = 'Alterado por influencer malicioso'
        WHERE patient_id = '${PATIENT_A_ID}';
      `);
    });

    // Confirma que os dados originais permanecem intactos
    const check = await query(`SELECT medical_dietary_notes FROM public.patient_nutrition_sensitive WHERE patient_id = '${PATIENT_A_ID}';`);
    expect(check.rows[0].medical_dietary_notes).toContain('gastrite');
    expect(check.rows[0].medical_dietary_notes).not.toContain('influencer');
  });

  it('9. INFLUENCER A: Tentativa de UPDATE no perfil nutricional geral DEVE SER BLOQUEADA (0 linhas afetadas)', async () => {
    await asUser(INFLUENCER_A_ID, async () => {
      await db.exec(`
        UPDATE public.patient_nutrition_profiles
        SET primary_goal = 'gain_muscle'
        WHERE id = '${PATIENT_A_ID}';
      `);
    });

    // Confirma que Paciente A não teve seu objetivo alterado pelo influenciador
    const check = await query(`SELECT primary_goal FROM public.patient_nutrition_profiles WHERE id = '${PATIENT_A_ID}';`);
    expect(check.rows[0].primary_goal).toBe('lose_weight');
  });

  it('10. INFLUENCER A: Tentativa de SELECT em patient_nutrition_sensitive_snapshots DEVE RETORNAR 0 LINHAS', async () => {
    await asUser(INFLUENCER_A_ID, async () => {
      const res = await query(`SELECT * FROM public.patient_nutrition_sensitive_snapshots WHERE patient_id = '${PATIENT_A_ID}';`);
      expect(res.rows.length).toBe(0);
    });
  });

  it('11. INFLUENCER A: Pode ler patient_nutrition_snapshots geral, mas snapshot NÃO CONTÉM DADOS SENSÍVEIS', async () => {
    await asUser(INFLUENCER_A_ID, async () => {
      const res = await query(`SELECT * FROM public.patient_nutrition_snapshots WHERE patient_id = '${PATIENT_A_ID}';`);
      expect(res.rows.length).toBe(1);
      const data = res.rows[0].snapshot_data as Record<string, unknown>;
      // Verifica ausência absoluta de alergias, intolerâncias e notas médicas
      expect(data.food_allergies).toBeUndefined();
      expect(data.food_intolerances).toBeUndefined();
      expect(data.medical_dietary_notes).toBeUndefined();
      expect(data.primary_goal).toBe('lose_weight');
    });
  });

  it('12. INFLUENCER B (Não vinculado): NÃO deve conseguir ler nem perfil geral nem sensível (0 linhas)', async () => {
    await asUser(INFLUENCER_B_ID, async () => {
      const general = await query(`SELECT * FROM public.patient_nutrition_profiles WHERE id = '${PATIENT_A_ID}';`);
      expect(general.rows.length).toBe(0);

      const sensitive = await query(`SELECT * FROM public.patient_nutrition_sensitive WHERE patient_id = '${PATIENT_A_ID}';`);
      expect(sensitive.rows.length).toBe(0);
    });
  });

  // ============================================================================
  // 6. ACESSO PROFISSIONAL CLÍNICO (NUTRICIONISTA A VS NUTRICIONISTA B)
  // ============================================================================

  it('13. NUTRICIONISTA A (vinculado ativo): DEVE conseguir ler perfil geral e dados clínicos sensíveis', async () => {
    await asUser(NUTRI_A_ID, async () => {
      const general = await query(`SELECT id, current_weight_kg, primary_goal FROM public.patient_nutrition_profiles WHERE id = '${PATIENT_A_ID}';`);
      expect(general.rows.length).toBe(1);
      expect(general.rows[0].primary_goal).toBe('lose_weight');

      const sensitive = await query(`SELECT patient_id, medical_dietary_notes, food_allergies FROM public.patient_nutrition_sensitive WHERE patient_id = '${PATIENT_A_ID}';`);
      expect(sensitive.rows.length).toBe(1);
      expect(sensitive.rows[0].medical_dietary_notes).toContain('gastrite');
      expect((sensitive.rows[0].food_allergies as string[])).toContain('Camarão');
    });
  });

  it('14. NUTRICIONISTA B (NÃO vinculado): NÃO DEVE conseguir ler nem perfil geral nem dados sensíveis', async () => {
    await asUser(NUTRI_B_ID, async () => {
      const general = await query(`SELECT * FROM public.patient_nutrition_profiles WHERE id = '${PATIENT_A_ID}';`);
      expect(general.rows.length).toBe(0);

      const sensitive = await query(`SELECT * FROM public.patient_nutrition_sensitive WHERE patient_id = '${PATIENT_A_ID}';`);
      expect(sensitive.rows.length).toBe(0);
    });
  });

  // ============================================================================
  // 7. ISOLAMENTO DO PACIENTE (ANTI-IDOR EM DADOS GERAIS E SENSÍVEIS)
  // ============================================================================

  it('15. PACIENTE A: Acessa seus próprios dados clínicos e perfil geral', async () => {
    await asUser(PATIENT_A_ID, async () => {
      const general = await query(`SELECT id FROM public.patient_nutrition_profiles WHERE id = '${PATIENT_A_ID}';`);
      expect(general.rows.length).toBe(1);

      const sensitive = await query(`SELECT patient_id, medical_dietary_notes FROM public.patient_nutrition_sensitive WHERE patient_id = '${PATIENT_A_ID}';`);
      expect(sensitive.rows.length).toBe(1);
      expect(sensitive.rows[0].medical_dietary_notes).toContain('gastrite');
    });
  });

  it('16. PACIENTE A: NÃO DEVE conseguir ler nem alterar dados sensíveis de PACIENTE B (0 linhas)', async () => {
    // Cria dados para Paciente B
    await db.exec(`
      INSERT INTO public.patient_nutrition_profiles (id, height_cm, current_weight_kg, primary_goal)
      VALUES ('${PATIENT_B_ID}', 165, 60.0, 'gain_muscle');

      INSERT INTO public.patient_nutrition_sensitive (patient_id, food_allergies, medical_dietary_notes)
      VALUES ('${PATIENT_B_ID}', ARRAY['Glúten'], 'Doença celíaca diagnosticada');
    `);

    await asUser(PATIENT_A_ID, async () => {
      // Tentativa de leitura
      const readSens = await query(`SELECT * FROM public.patient_nutrition_sensitive WHERE patient_id = '${PATIENT_B_ID}';`);
      expect(readSens.rows.length).toBe(0);

      // Tentativa de alteração
      await db.exec(`
        UPDATE public.patient_nutrition_sensitive
        SET medical_dietary_notes = 'Invasão por Paciente A'
        WHERE patient_id = '${PATIENT_B_ID}';
      `);
    });

    // Confirma que Paciente B não foi alterado
    const checkB = await query(`SELECT medical_dietary_notes FROM public.patient_nutrition_sensitive WHERE patient_id = '${PATIENT_B_ID}';`);
    expect(checkB.rows[0].medical_dietary_notes).toBe('Doença celíaca diagnosticada');
  });

  // ============================================================================
  // 8. BLOQUEIO POR STATUS DO VÍNCULO (PENDING_VERIFICATION, INACTIVE, TRANSFERRED)
  // ============================================================================

  it('17. Vínculo pending_verification NÃO CONCEDE ACESSO ao perfil geral nem a dados sensíveis', async () => {
    // Insere perfil e dados sensíveis para paciente unconfirmed
    await db.exec(`
      INSERT INTO public.patient_nutrition_profiles (id, height_cm, current_weight_kg, primary_goal)
      VALUES ('${PATIENT_UNCONFIRMED_ID}', 170, 70.0, 'improve_health');

      INSERT INTO public.patient_nutrition_sensitive (patient_id, food_allergies, medical_dietary_notes)
      VALUES ('${PATIENT_UNCONFIRMED_ID}', ARRAY['Soja'], 'Observação confidencial');
    `);

    await asUser(NUTRI_A_ID, async () => {
      const general = await query(`SELECT * FROM public.patient_nutrition_profiles WHERE id = '${PATIENT_UNCONFIRMED_ID}';`);
      expect(general.rows.length).toBe(0);

      const sensitive = await query(`SELECT * FROM public.patient_nutrition_sensitive WHERE patient_id = '${PATIENT_UNCONFIRMED_ID}';`);
      expect(sensitive.rows.length).toBe(0);
    });
  });

  it('18. Vínculos com status inactive ou transferred BLOQUEIAM ACESSO imediatamente', async () => {
    // Altera status do vínculo Nutri A <-> Paciente A para 'inactive'
    await db.exec(`
      UPDATE public.professional_patient_links
      SET status = 'inactive'
      WHERE professional_id = '${NUTRI_A_ID}' AND patient_id = '${PATIENT_A_ID}';
    `);

    await asUser(NUTRI_A_ID, async () => {
      const sensitive = await query(`SELECT * FROM public.patient_nutrition_sensitive WHERE patient_id = '${PATIENT_A_ID}';`);
      expect(sensitive.rows.length).toBe(0);

      const general = await query(`SELECT * FROM public.patient_nutrition_profiles WHERE id = '${PATIENT_A_ID}';`);
      expect(general.rows.length).toBe(0);
    });

    // Altera status para 'transferred'
    await db.exec(`
      UPDATE public.professional_patient_links
      SET status = 'transferred'
      WHERE professional_id = '${NUTRI_A_ID}' AND patient_id = '${PATIENT_A_ID}';
    `);

    await asUser(NUTRI_A_ID, async () => {
      const sensitive = await query(`SELECT * FROM public.patient_nutrition_sensitive WHERE patient_id = '${PATIENT_A_ID}';`);
      expect(sensitive.rows.length).toBe(0);
    });

    // Restaura para 'active' para manter consistência caso outros testes necessitem
    await db.exec(`
      UPDATE public.professional_patient_links
      SET status = 'active'
      WHERE professional_id = '${NUTRI_A_ID}' AND patient_id = '${PATIENT_A_ID}';
    `);
  });
});
