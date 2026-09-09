import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

describe('ETAPA 4: Motor Nutricional - Testes de Segurança, RLS e Segregação Física de Dados Clínicos', () => {
  let db: PGlite;

  const ADMIN_ID = '11111111-1111-4111-a111-111111111111';
  const NUTRI_A_ID = '22222222-2222-4222-a222-222222222222';
  const NUTRI_B_ID = '33333333-3333-4333-a333-333333333333';
  const INFLUENCER_ID = '44444444-4444-4444-a444-444444444444';
  const PATIENT_A_ID = '55555555-5555-4555-a555-555555555555';
  const PATIENT_B_ID = '66666666-6666-4666-a666-666666666666';

  let SNAPSHOT_A_ID: string;
  let SNAPSHOT_B_ID: string;
  let RUN_A_ID: string;
  let RUN_B_ID: string;

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

    // 2. Executar Todas as 11 Migrações
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
      REVOKE INSERT ON public.nutrition_engine_clinical_reviews FROM authenticated, anon, public;
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

    // Nutricionista B
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${NUTRI_B_ID}', 'nutriB@clinic.com', NOW(), '{"full_name": "Dra. Julia Nutri"}');
      UPDATE public.profiles SET role_id = 'nutritionist', is_active = true, status = 'active' WHERE id = '${NUTRI_B_ID}';
      DELETE FROM public.patients WHERE id = '${NUTRI_B_ID}';
      INSERT INTO public.professional_profiles (id, professional_type, license_number)
      VALUES ('${NUTRI_B_ID}', 'nutritionist', 'CRN-2');
    `);

    // Influenciador
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${INFLUENCER_ID}', 'influencer@fit.com', NOW(), '{"full_name": "Fit Influencer"}');
      UPDATE public.profiles SET role_id = 'influencer', is_active = true, status = 'active' WHERE id = '${INFLUENCER_ID}';
      DELETE FROM public.patients WHERE id = '${INFLUENCER_ID}';
      INSERT INTO public.professional_profiles (id, professional_type)
      VALUES ('${INFLUENCER_ID}', 'influencer');
    `);

    // Paciente A
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${PATIENT_A_ID}', 'patientA@test.com', NOW(), '{"full_name": "Paciente Alpha"}');
      UPDATE public.profiles SET role_id = 'patient', is_active = true, status = 'active' WHERE id = '${PATIENT_A_ID}';
    `);

    // Paciente B
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${PATIENT_B_ID}', 'patientB@test.com', NOW(), '{"full_name": "Paciente Beta"}');
      UPDATE public.profiles SET role_id = 'patient', is_active = true, status = 'active' WHERE id = '${PATIENT_B_ID}';
    `);

    // 4. Vínculos Profissionais
    // Nutri A vinculado a Paciente A (ativo)
    await db.exec(`
      INSERT INTO public.professional_patient_links (professional_id, patient_id, link_type, status)
      VALUES ('${NUTRI_A_ID}', '${PATIENT_A_ID}', 'direct', 'active');
    `);

    // Influencer vinculado a Paciente A (ativo)
    await db.exec(`
      INSERT INTO public.professional_patient_links (professional_id, patient_id, link_type, status)
      VALUES ('${INFLUENCER_ID}', '${PATIENT_A_ID}', 'direct', 'active');
    `);

    // Nutri B vinculado a Paciente B (ativo) - Nutri B NÃO tem vínculo com Paciente A
    await db.exec(`
      INSERT INTO public.professional_patient_links (professional_id, patient_id, link_type, status)
      VALUES ('${NUTRI_B_ID}', '${PATIENT_B_ID}', 'direct', 'active');
    `);

    // 5. Inserir Snapshots para Paciente A e B
    const snapARes = await db.query<{ id: string }>(`
      INSERT INTO public.patient_nutrition_snapshots (patient_id, version, snapshot_data, completion_percentage, created_by)
      VALUES ('${PATIENT_A_ID}', 1, '{"current_weight_kg": 75, "height_cm": 178}'::jsonb, 100, '${PATIENT_A_ID}')
      RETURNING id;
    `);
    SNAPSHOT_A_ID = snapARes.rows[0].id;

    const snapBRes = await db.query<{ id: string }>(`
      INSERT INTO public.patient_nutrition_snapshots (patient_id, version, snapshot_data, completion_percentage, created_by)
      VALUES ('${PATIENT_B_ID}', 1, '{"current_weight_kg": 60, "height_cm": 165}'::jsonb, 100, '${PATIENT_B_ID}')
      RETURNING id;
    `);
    SNAPSHOT_B_ID = snapBRes.rows[0].id;

    // 6. Inserir Engine Runs (SEM reason codes clínicos na tabela geral)
    const runARes = await db.query<{ id: string }>(`
      INSERT INTO public.nutrition_engine_runs (
        patient_id, nutrition_snapshot_id, engine_version, config_version, status,
        requires_professional_review, input_hash, output_hash, calculated_by
      ) VALUES (
        '${PATIENT_A_ID}', '${SNAPSHOT_A_ID}', 'nutrition-engine-1.1.0', 'config-1.1.0', 'review_required',
        true, 'hash_in_a', 'hash_out_a', '${NUTRI_A_ID}'
      ) RETURNING id;
    `);
    RUN_A_ID = runARes.rows[0].id;

    // Inserir na tabela fisicamente isolada de revisão clínica
    await db.exec(`
      INSERT INTO public.nutrition_engine_clinical_reviews (
        engine_run_id, patient_id, requires_professional_review, clinical_reason_codes
      ) VALUES (
        '${RUN_A_ID}', '${PATIENT_A_ID}', true, ARRAY['PREGNANCY_REPORTED', 'CLINICAL_CONDITION_REPORTED']
      );
    `);

    await db.exec(`
      INSERT INTO public.nutrition_targets (
        engine_run_id, patient_id, estimated_bmr_kcal, activity_level, activity_factor,
        estimated_tdee_kcal, primary_goal, goal_adjustment_kcal, target_calories_nominal_kcal,
        target_calories_min_kcal, target_calories_max_kcal, protein_g, carbohydrate_g, fat_g,
        protein_kcal, carbohydrate_kcal, fat_kcal, protein_percentage, carbohydrate_percentage, fat_percentage,
        desired_meals_per_day, calories_per_meal_average, normalized_daily_budget, normalized_weekly_budget,
        normalized_monthly_budget, budget_estimate_type, target_was_clamped, clamp_reason,
        macro_reference_weight_kg, macro_reference_weight_strategy
      ) VALUES (
        '${RUN_A_ID}', '${PATIENT_A_ID}', 1720, 'moderate', 1.55, 2666, 'lose_weight', -500, 2166,
        2066, 2266, 150, 235, 66.8, 600, 940, 601.2, 27.7, 43.4, 27.8,
        4, 541.5, 20.0, 140.0, 600.0, 'individual_exact', false, null,
        75.0, 'actual_weight'
      );
    `);

    const runBRes = await db.query<{ id: string }>(`
      INSERT INTO public.nutrition_engine_runs (
        patient_id, nutrition_snapshot_id, engine_version, config_version, status,
        requires_professional_review, input_hash, output_hash, calculated_by
      ) VALUES (
        '${PATIENT_B_ID}', '${SNAPSHOT_B_ID}', 'nutrition-engine-1.1.0', 'config-1.1.0', 'calculated',
        false, 'hash_in_b', 'hash_out_b', '${NUTRI_B_ID}'
      ) RETURNING id;
    `);
    RUN_B_ID = runBRes.rows[0].id;

    await db.exec(`
      INSERT INTO public.nutrition_engine_clinical_reviews (
        engine_run_id, patient_id, requires_professional_review, clinical_reason_codes
      ) VALUES (
        '${RUN_B_ID}', '${PATIENT_B_ID}', false, ARRAY[]::TEXT[]
      );
    `);

    await db.exec(`
      INSERT INTO public.nutrition_targets (
        engine_run_id, patient_id, estimated_bmr_kcal, activity_level, activity_factor,
        estimated_tdee_kcal, primary_goal, goal_adjustment_kcal, target_calories_nominal_kcal,
        target_calories_min_kcal, target_calories_max_kcal, protein_g, carbohydrate_g, fat_g,
        protein_kcal, carbohydrate_kcal, fat_kcal, protein_percentage, carbohydrate_percentage, fat_percentage,
        desired_meals_per_day, calories_per_meal_average, normalized_daily_budget, normalized_weekly_budget,
        normalized_monthly_budget, budget_estimate_type, target_was_clamped, clamp_reason,
        macro_reference_weight_kg, macro_reference_weight_strategy
      ) VALUES (
        '${RUN_B_ID}', '${PATIENT_B_ID}', 1330, 'light', 1.375, 1828, 'maintain_weight', 0, 1828,
        1728, 1928, 90, 230, 60.8, 360, 920, 548, 19.7, 50.3, 30.0,
        3, 609.3, 25.0, 175.0, 750.0, 'individual_exact', false, null,
        60.0, 'actual_weight'
      );
    `);
  });

  describe('1. Isolamento de Leitura de Engine Runs e Nutrition Targets', () => {
    it('Paciente A deve ler exclusivamente seus próprios engine runs e targets', async () => {
      const runs = await asUser(PATIENT_A_ID, () =>
        query('SELECT * FROM public.nutrition_engine_runs;')
      );
      expect(runs.rows).toHaveLength(1);
      expect(runs.rows[0].patient_id).toBe(PATIENT_A_ID);

      const targets = await asUser(PATIENT_A_ID, () =>
        query('SELECT * FROM public.nutrition_targets;')
      );
      expect(targets.rows).toHaveLength(1);
      expect(targets.rows[0].patient_id).toBe(PATIENT_A_ID);
    });

    it('Paciente A não consegue ler engine runs nem targets do Paciente B mesmo com IDs manipulados', async () => {
      const runs = await asUser(PATIENT_A_ID, () =>
        query(`SELECT * FROM public.nutrition_engine_runs WHERE id = '${RUN_B_ID}';`)
      );
      expect(runs.rows).toHaveLength(0);

      const targets = await asUser(PATIENT_A_ID, () =>
        query(`SELECT * FROM public.nutrition_targets WHERE patient_id = '${PATIENT_B_ID}';`)
      );
      expect(targets.rows).toHaveLength(0);
    });

    it('Nutricionista A (vinculado ativo) consegue ler runs e targets do Paciente A', async () => {
      const runs = await asUser(NUTRI_A_ID, () =>
        query(`SELECT * FROM public.nutrition_engine_runs WHERE patient_id = '${PATIENT_A_ID}';`)
      );
      expect(runs.rows).toHaveLength(1);

      const targets = await asUser(NUTRI_A_ID, () =>
        query(`SELECT * FROM public.nutrition_targets WHERE patient_id = '${PATIENT_A_ID}';`)
      );
      expect(targets.rows).toHaveLength(1);
    });

    it('Nutricionista B (não vinculado ao Paciente A) recebe 0 linhas ao consultar Paciente A', async () => {
      const runs = await asUser(NUTRI_B_ID, () =>
        query(`SELECT * FROM public.nutrition_engine_runs WHERE patient_id = '${PATIENT_A_ID}';`)
      );
      expect(runs.rows).toHaveLength(0);

      const targets = await asUser(NUTRI_B_ID, () =>
        query(`SELECT * FROM public.nutrition_targets WHERE patient_id = '${PATIENT_A_ID}';`)
      );
      expect(targets.rows).toHaveLength(0);
    });

    it('Influenciador vinculado lê resumo de engine runs (sem colunas clínicas)', async () => {
      const runs = await asUser(INFLUENCER_ID, () =>
        query('SELECT * FROM public.nutrition_engine_runs WHERE patient_id = \'' + PATIENT_A_ID + '\';')
      );
      expect(runs.rows).toHaveLength(1);
      // Confirma que a tabela geral NÃO possui colunas clínicas
      expect(runs.rows[0]).not.toHaveProperty('review_reason_codes');
      expect(runs.rows[0]).not.toHaveProperty('clinical_review_notes');
    });
  });

  describe('2. Segregação Física e Privacidade RLS de Reason Codes Clínicos', () => {
    it('INFLUENCER recebe 0 linhas ao consultar nutrition_engine_clinical_reviews diretamente no PostgreSQL', async () => {
      const revs = await asUser(INFLUENCER_ID, () =>
        query(`SELECT * FROM public.nutrition_engine_clinical_reviews WHERE patient_id = '${PATIENT_A_ID}';`)
      );
      expect(revs.rows).toHaveLength(0); // RLS bloqueia 100%!
    });

    it('INFLUENCER não consegue ler reason codes clínicos mesmo conhecendo o engine_run_id (IDOR mitigado)', async () => {
      const revs = await asUser(INFLUENCER_ID, () =>
        query(`SELECT * FROM public.nutrition_engine_clinical_reviews WHERE engine_run_id = '${RUN_A_ID}';`)
      );
      expect(revs.rows).toHaveLength(0);
    });

    it('Nutricionista A (vinculado ativo) consegue acessar os reason codes clínicos do Paciente A', async () => {
      const revs = await asUser(NUTRI_A_ID, () =>
        query<{ clinical_reason_codes: string[] }>(
          `SELECT * FROM public.nutrition_engine_clinical_reviews WHERE patient_id = '${PATIENT_A_ID}';`
        )
      );
      expect(revs.rows).toHaveLength(1);
      expect(revs.rows[0].clinical_reason_codes).toContain('PREGNANCY_REPORTED');
      expect(revs.rows[0].clinical_reason_codes).toContain('CLINICAL_CONDITION_REPORTED');
    });

    it('Nutricionista B (não vinculado) recebe 0 linhas ao tentar ler a revisão clínica do Paciente A', async () => {
      const revs = await asUser(NUTRI_B_ID, () =>
        query(`SELECT * FROM public.nutrition_engine_clinical_reviews WHERE patient_id = '${PATIENT_A_ID}';`)
      );
      expect(revs.rows).toHaveLength(0);
    });

    it('Paciente A consegue ler sua própria revisão clínica, mas Paciente B recebe 0 linhas', async () => {
      const ownRev = await asUser(PATIENT_A_ID, () =>
        query(`SELECT * FROM public.nutrition_engine_clinical_reviews WHERE patient_id = '${PATIENT_A_ID}';`)
      );
      expect(ownRev.rows).toHaveLength(1);

      const crossRev = await asUser(PATIENT_B_ID, () =>
        query(`SELECT * FROM public.nutrition_engine_clinical_reviews WHERE patient_id = '${PATIENT_A_ID}';`)
      );
      expect(crossRev.rows).toHaveLength(0);
    });

    it('Nutricionista vinculado NÃO consegue inserir diretamente em nutrition_engine_clinical_reviews via Data API (fabricação de reason codes bloqueada)', async () => {
      await expect(
        asUser(NUTRI_A_ID, () =>
          query(`
            INSERT INTO public.nutrition_engine_clinical_reviews (
              engine_run_id, patient_id, requires_professional_review, clinical_reason_codes
            ) VALUES (
              gen_random_uuid(), '${PATIENT_A_ID}', true, ARRAY['FABRICATED_REASON_CODE']
            );
          `)
        )
      ).rejects.toThrow(/permission denied/i);
    });

    it('Nutricionista vinculado NÃO consegue alterar ou forjar clinical_reason_codes via UPDATE (imutabilidade estrita)', async () => {
      await expect(
        asUser(NUTRI_A_ID, () =>
          query(`
            UPDATE public.nutrition_engine_clinical_reviews
            SET clinical_reason_codes = ARRAY['FABRICATED_FORGED_CODE']
            WHERE patient_id = '${PATIENT_A_ID}';
          `)
        )
      ).rejects.toThrow(/imutáveis/i);
    });

    it('Nutricionista vinculado consegue registrar parecer clínico e assinar a revisão sem alterar reason codes', async () => {
      await asUser(NUTRI_A_ID, () =>
        query(`
          UPDATE public.nutrition_engine_clinical_reviews
          SET clinical_review_notes = 'Revisão clínica concluída com sucesso: liberado para conduta de manutenção.',
              reviewed_by = '${NUTRI_A_ID}',
              reviewed_at = NOW()
          WHERE patient_id = '${PATIENT_A_ID}';
        `)
      );

      const check = await asUser(NUTRI_A_ID, () =>
        query<{ clinical_review_notes: string; clinical_reason_codes: string[] }>(
          `SELECT clinical_review_notes, clinical_reason_codes FROM public.nutrition_engine_clinical_reviews WHERE patient_id = '${PATIENT_A_ID}';`
        )
      );

      expect(check.rows[0].clinical_review_notes).toBe('Revisão clínica concluída com sucesso: liberado para conduta de manutenção.');
      // Reason codes originais permanecem intactos
      expect(check.rows[0].clinical_reason_codes).toContain('PREGNANCY_REPORTED');
    });

    it('Nutricionista B não vinculado recebe 0 linhas ao tentar atualizar revisão clínica do Paciente A', async () => {
      const updateRes = await asUser(NUTRI_B_ID, () =>
        query(`
          UPDATE public.nutrition_engine_clinical_reviews
          SET clinical_review_notes = 'Tentativa não autorizada'
          WHERE patient_id = '${PATIENT_A_ID}';
        `)
      );
      expect(updateRes.affectedRows ?? 0).toBe(0);
    });
  });

  describe('3. Tabela de Anotações Clínicas Profissionais (patient_professional_clinical_notes)', () => {
    it('Nutricionista vinculado consegue inserir e atualizar nota clínica para seu paciente', async () => {
      const insertRes = await asUser(NUTRI_A_ID, () =>
        query<{ id: string }>(`
          INSERT INTO public.patient_professional_clinical_notes (
            patient_id, professional_id, clinical_notes, recommended_caloric_adjustment_kcal
          ) VALUES (
            '${PATIENT_A_ID}', '${NUTRI_A_ID}', 'Paciente necessita atenção com hidratação e adesão', -200
          ) RETURNING id;
        `)
      );
      expect(insertRes.rows).toHaveLength(1);
      const noteId = insertRes.rows[0].id;

      // Update por Nutri A
      await asUser(NUTRI_A_ID, () =>
        query(`UPDATE public.patient_professional_clinical_notes SET clinical_notes = 'Nota clínica atualizada' WHERE id = '${noteId}';`)
      );

      const check = await asUser(NUTRI_A_ID, () =>
        query<{ clinical_notes: string }>(`SELECT clinical_notes FROM public.patient_professional_clinical_notes WHERE id = '${noteId}';`)
      );
      expect(check.rows[0].clinical_notes).toBe('Nota clínica atualizada');
    });

    it('Paciente consegue ler sua nota clínica mas NÃO consegue alterá-la nem deletá-la', async () => {
      const readRes = await asUser(PATIENT_A_ID, () =>
        query('SELECT * FROM public.patient_professional_clinical_notes WHERE patient_id = \'' + PATIENT_A_ID + '\';')
      );
      expect(readRes.rows.length).toBeGreaterThanOrEqual(1);

      const noteId = readRes.rows[0].id;

      // Paciente tenta atualizar a nota
      await asUser(PATIENT_A_ID, () =>
        query(`UPDATE public.patient_professional_clinical_notes SET clinical_notes = 'Tentativa de alteração pelo paciente' WHERE id = '${noteId}';`)
      );

      // Verifica que NÃO foi alterada
      const check = await asUser(NUTRI_A_ID, () =>
        query<{ clinical_notes: string }>(`SELECT clinical_notes FROM public.patient_professional_clinical_notes WHERE id = '${noteId}';`)
      );
      expect(check.rows[0].clinical_notes).toBe('Nota clínica atualizada');

      // Paciente tenta deletar a nota
      await asUser(PATIENT_A_ID, () =>
        query(`DELETE FROM public.patient_professional_clinical_notes WHERE id = '${noteId}';`)
      );

      const checkAfterDel = await asUser(NUTRI_A_ID, () =>
        query<{ id: string }>(`SELECT id FROM public.patient_professional_clinical_notes WHERE id = '${noteId}';`)
      );
      expect(checkAfterDel.rows).toHaveLength(1); // Nota permanece intacta!
    });

    it('Influenciador NÃO consegue ler nem inserir em patient_professional_clinical_notes (0 linhas / RLS block)', async () => {
      // Influenciador tenta ler
      const readRes = await asUser(INFLUENCER_ID, () =>
        query(`SELECT * FROM public.patient_professional_clinical_notes WHERE patient_id = '${PATIENT_A_ID}';`)
      );
      expect(readRes.rows).toHaveLength(0); // ZERO rows permitidas!

      // Influenciador tenta inserir
      await expect(
        asUser(INFLUENCER_ID, () =>
          query(`
            INSERT INTO public.patient_professional_clinical_notes (
              patient_id, professional_id, clinical_notes
            ) VALUES (
              '${PATIENT_A_ID}', '${INFLUENCER_ID}', 'Influencer tentando forjar conduta'
            );
          `)
        )
      ).rejects.toThrow();
    });
  });

  describe('4. Degradação de Vínculo: Vínculo Inactive ou Pending corta acesso imediatamente', () => {
    it('Cortar vínculo de Nutricionista A para inactive bloqueia imediatamente a leitura de engine runs e targets', async () => {
      // Desativa vínculo
      await db.exec(`
        UPDATE public.professional_patient_links
        SET status = 'inactive'
        WHERE professional_id = '${NUTRI_A_ID}' AND patient_id = '${PATIENT_A_ID}';
      `);

      const runs = await asUser(NUTRI_A_ID, () =>
        query(`SELECT * FROM public.nutrition_engine_runs WHERE patient_id = '${PATIENT_A_ID}';`)
      );
      expect(runs.rows).toHaveLength(0);

      const revs = await asUser(NUTRI_A_ID, () =>
        query(`SELECT * FROM public.nutrition_engine_clinical_reviews WHERE patient_id = '${PATIENT_A_ID}';`)
      );
      expect(revs.rows).toHaveLength(0);

      const targets = await asUser(NUTRI_A_ID, () =>
        query(`SELECT * FROM public.nutrition_targets WHERE patient_id = '${PATIENT_A_ID}';`)
      );
      expect(targets.rows).toHaveLength(0);

      // Reativa vínculo
      await db.exec(`
        UPDATE public.professional_patient_links
        SET status = 'active'
        WHERE professional_id = '${NUTRI_A_ID}' AND patient_id = '${PATIENT_A_ID}';
      `);

      const restoredRuns = await asUser(NUTRI_A_ID, () =>
        query(`SELECT * FROM public.nutrition_engine_runs WHERE patient_id = '${PATIENT_A_ID}';`)
      );
      expect(restoredRuns.rows).toHaveLength(1);
    });
  });
});
