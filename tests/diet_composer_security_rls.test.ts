import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

describe('ETAPA 6: Diet Composer - Segurança, RLS, Imutabilidade e Governança de Planos Alimentares', () => {
  let db: PGlite;

  const ADMIN_ID = '11111111-1111-4111-a111-111111111111';
  const NUTRI_A_ID = '22222222-2222-4222-a222-222222222222';
  const NUTRI_B_ID = '33333333-3333-4333-a333-333333333333';
  const INFLUENCER_ID = '44444444-4444-4444-a444-444444444444';
  const PATIENT_A_ID = '55555555-5555-4555-a555-555555555555';
  const PATIENT_B_ID = '66666666-6666-4666-a666-666666666666';

  let PLAN_A_ID: string;
  let PLAN_B_ID: string;
  let MEAL_A_ID: string;
  let ITEM_A_ID: string;
  let RUN_A_ID: string;
  let TARGET_A_ID: string;
  let RUN_B_ID: string;
  let TARGET_B_ID: string;
  let FOOD_ID: string;

  async function asUser<T>(userId: string, callback: () => Promise<T>): Promise<T> {
    await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.sub" = '${userId}'; SET "request.jwt.claim.role" = 'authenticated';`);
    try {
      return await callback();
    } finally {
      await db.exec(`RESET ROLE; RESET "request.jwt.claim.sub"; RESET "request.jwt.claim.role";`);
    }
  }

  beforeAll(async () => {
    db = new PGlite();

    // 1. Setup Mock Supabase Auth
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

    // 2. Executar Todas as 15 Migrações
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
      '20260908000015_deterministic_diet_plans.sql',
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
      VALUES ('${ADMIN_ID}', 'admin@diet.com', NOW(), '{"full_name": "Admin Sistema"}');
      UPDATE public.profiles SET role_id = 'admin', is_active = true, status = 'active' WHERE id = '${ADMIN_ID}';
    `);

    // Nutricionista A
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${NUTRI_A_ID}', 'nutriA@diet.com', NOW(), '{"full_name": "Dra. Ana Nutricionista"}');
      UPDATE public.profiles SET role_id = 'nutritionist', is_active = true, status = 'active' WHERE id = '${NUTRI_A_ID}';
      DELETE FROM public.patients WHERE id = '${NUTRI_A_ID}';
      INSERT INTO public.professional_profiles (id, professional_type, license_number)
      VALUES ('${NUTRI_A_ID}', 'nutritionist', 'CRN-1111');
    `);

    // Nutricionista B
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${NUTRI_B_ID}', 'nutriB@diet.com', NOW(), '{"full_name": "Dr. Bruno Nutricionista"}');
      UPDATE public.profiles SET role_id = 'nutritionist', is_active = true, status = 'active' WHERE id = '${NUTRI_B_ID}';
      DELETE FROM public.patients WHERE id = '${NUTRI_B_ID}';
      INSERT INTO public.professional_profiles (id, professional_type, license_number)
      VALUES ('${NUTRI_B_ID}', 'nutritionist', 'CRN-2222');
    `);

    // Influencer
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${INFLUENCER_ID}', 'influencer@diet.com', NOW(), '{"full_name": "Fit Coach"}');
      UPDATE public.profiles SET role_id = 'influencer', is_active = true, status = 'active' WHERE id = '${INFLUENCER_ID}';
      DELETE FROM public.patients WHERE id = '${INFLUENCER_ID}';
      INSERT INTO public.professional_profiles (id, professional_type)
      VALUES ('${INFLUENCER_ID}', 'influencer');
    `);

    // Paciente A
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${PATIENT_A_ID}', 'patientA@diet.com', NOW(), '{"full_name": "Paciente Alpha"}');
      UPDATE public.profiles SET role_id = 'patient', is_active = true, status = 'active' WHERE id = '${PATIENT_A_ID}';
    `);

    // Paciente B
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${PATIENT_B_ID}', 'patientB@diet.com', NOW(), '{"full_name": "Paciente Beta"}');
      UPDATE public.profiles SET role_id = 'patient', is_active = true, status = 'active' WHERE id = '${PATIENT_B_ID}';
    `);

    // Vínculo Nutri A <-> Paciente A
    await db.exec(`
      INSERT INTO public.professional_patient_links (professional_id, patient_id, link_type, status)
      VALUES ('${NUTRI_A_ID}', '${PATIENT_A_ID}', 'direct', 'active');
    `);

    // 4. Inserir Dados Base de Teste (Fonte, Alimento, Alvo)
    const sourceRes = await db.query<{ id: string }>(`
      INSERT INTO public.food_data_sources (name, version, publisher)
      VALUES ('TACO', '4.0.0', 'NEPA')
      RETURNING id;
    `);
    const sourceId = sourceRes.rows[0].id;

    const foodRes = await db.query<{ id: string }>(`
      INSERT INTO public.foods (source_id, source_food_code, name, normalized_name, food_group, is_active, engine_eligibility_status)
      VALUES ('${sourceId}', 'SEC_001', 'Arroz Cozido', 'arroz cozido', 'Cereais', true, 'eligible_for_engine')
      RETURNING id;
    `);
    FOOD_ID = foodRes.rows[0].id;
    const foodId = FOOD_ID;

    // Snapshots para Paciente A e B
    const snapARes = await db.query<{ id: string }>(`
      INSERT INTO public.patient_nutrition_snapshots (patient_id, version, snapshot_data, completion_percentage)
      VALUES ('${PATIENT_A_ID}', 1, '{"weight": 75}'::jsonb, 100)
      RETURNING id;
    `);
    const snapAId = snapARes.rows[0].id;

    const snapBRes = await db.query<{ id: string }>(`
      INSERT INTO public.patient_nutrition_snapshots (patient_id, version, snapshot_data, completion_percentage)
      VALUES ('${PATIENT_B_ID}', 1, '{"weight": 60}'::jsonb, 100)
      RETURNING id;
    `);
    const snapBId = snapBRes.rows[0].id;

    // Engine Runs
    const runARes = await db.query<{ id: string }>(`
      INSERT INTO public.nutrition_engine_runs (
        patient_id, nutrition_snapshot_id, engine_version, status, input_hash, output_hash
      )
      VALUES (
        '${PATIENT_A_ID}', '${snapAId}', '1.0.0', 'calculated', 'in_hash_a', 'out_hash_a'
      )
      RETURNING id;
    `);
    RUN_A_ID = runARes.rows[0].id;
    const runAId = RUN_A_ID;

    const runBRes = await db.query<{ id: string }>(`
      INSERT INTO public.nutrition_engine_runs (
        patient_id, nutrition_snapshot_id, engine_version, status, input_hash, output_hash
      )
      VALUES (
        '${PATIENT_B_ID}', '${snapBId}', '1.0.0', 'calculated', 'in_hash_b', 'out_hash_b'
      )
      RETURNING id;
    `);
    const runBId = runBRes.rows[0].id;
    RUN_B_ID = runBId;

    // Nutrition Targets
    const targetARes = await db.query<{ id: string }>(`
      INSERT INTO public.nutrition_targets (
        patient_id, engine_run_id, estimated_bmr_kcal, activity_level, activity_factor,
        estimated_tdee_kcal, primary_goal, goal_adjustment_kcal,
        target_calories_nominal_kcal, target_calories_min_kcal, target_calories_max_kcal,
        protein_g, carbohydrate_g, fat_g, protein_kcal, carbohydrate_kcal, fat_kcal,
        protein_percentage, carbohydrate_percentage, fat_percentage,
        desired_meals_per_day, calories_per_meal_average,
        normalized_daily_budget, normalized_weekly_budget, normalized_monthly_budget, budget_estimate_type
      )
      VALUES (
        '${PATIENT_A_ID}', '${runAId}', 1700, 'moderate', 1.55,
        2400, 'maintain_weight', 0,
        2000, 1900, 2100,
        150, 225, 55, 600, 900, 495,
        30.0, 45.0, 25.0,
        4, 500,
        40.0, 280.0, 1200.0, 'individual_exact'
      )
      RETURNING id;
    `);
    TARGET_A_ID = targetARes.rows[0].id;
    const targetAId = TARGET_A_ID;

    const targetBRes = await db.query<{ id: string }>(`
      INSERT INTO public.nutrition_targets (
        patient_id, engine_run_id, estimated_bmr_kcal, activity_level, activity_factor,
        estimated_tdee_kcal, primary_goal, goal_adjustment_kcal,
        target_calories_nominal_kcal, target_calories_min_kcal, target_calories_max_kcal,
        protein_g, carbohydrate_g, fat_g, protein_kcal, carbohydrate_kcal, fat_kcal,
        protein_percentage, carbohydrate_percentage, fat_percentage,
        desired_meals_per_day, calories_per_meal_average,
        normalized_daily_budget, normalized_weekly_budget, normalized_monthly_budget, budget_estimate_type
      )
      VALUES (
        '${PATIENT_B_ID}', '${runBId}', 1400, 'light', 1.375,
        1900, 'lose_weight', -300,
        1600, 1500, 1700,
        120, 180, 44, 480, 720, 396,
        30.0, 45.0, 25.0,
        4, 400,
        35.0, 245.0, 1050.0, 'individual_exact'
      )
      RETURNING id;
    `);
    TARGET_B_ID = targetBRes.rows[0].id;
    const targetBId = TARGET_B_ID;

    // Inserir Planos como service_role / superuser
    const planARes = await db.query<{ id: string }>(`
      INSERT INTO public.diet_plans (
        patient_id, source_nutrition_engine_run_id, source_nutrition_target_id,
        composer_version, food_dataset_version, food_dataset_checksum, price_engine_version,
        input_snapshot_hash, output_plan_hash, generation_status, approval_status, is_active, version, day_count
      )
      VALUES (
        '${PATIENT_A_ID}', '${runAId}', '${targetAId}',
        '1.0.0', '4.0.0', 'chk123', '1.0.0',
        'in_plan_a', 'out_plan_a', 'calculated', 'approved', true, 1, 7
      )
      RETURNING id;
    `);
    PLAN_A_ID = planARes.rows[0].id;

    const planBRes = await db.query<{ id: string }>(`
      INSERT INTO public.diet_plans (
        patient_id, source_nutrition_engine_run_id, source_nutrition_target_id,
        composer_version, food_dataset_version, food_dataset_checksum, price_engine_version,
        input_snapshot_hash, output_plan_hash, generation_status, approval_status, is_active, version, day_count
      )
      VALUES (
        '${PATIENT_B_ID}', '${runBId}', '${targetBId}',
        '1.0.0', '4.0.0', 'chk123', '1.0.0',
        'in_plan_b', 'out_plan_b', 'calculated', 'approved', true, 1, 7
      )
      RETURNING id;
    `);
    PLAN_B_ID = planBRes.rows[0].id;

    // Day, Meal e Item do Plano A
    const dayRes = await db.query<{ id: string }>(`
      INSERT INTO public.diet_plan_days (
        diet_plan_id, day_of_week, day_label,
        target_calories_kcal, target_protein_g, target_carbohydrate_g, target_fat_g,
        actual_calories_kcal, actual_protein_g, actual_carbohydrate_g, actual_fat_g,
        calories_delta_pct, protein_delta_pct, carbohydrate_delta_pct, fat_delta_pct
      )
      VALUES (
        '${PLAN_A_ID}', 1, 'Segunda-feira',
        2000, 150, 225, 55,
        1995, 149, 224, 54,
        -0.25, -0.67, -0.44, -1.82
      )
      RETURNING id;
    `);
    const dayId = dayRes.rows[0].id;

    const mealRes = await db.query<{ id: string }>(`
      INSERT INTO public.diet_meals (
        diet_plan_day_id, meal_order, meal_type, meal_name,
        target_calories_kcal, target_protein_g, target_carbohydrate_g, target_fat_g,
        actual_calories_kcal, actual_protein_g, actual_carbohydrate_g, actual_fat_g
      )
      VALUES (
        '${dayId}', 1, 'lunch', 'Almoço',
        600, 45, 68, 16,
        590, 44, 67, 15
      )
      RETURNING id;
    `);
    MEAL_A_ID = mealRes.rows[0].id;

    const itemRes = await db.query<{ id: string }>(`
      INSERT INTO public.diet_meal_items (
        diet_meal_id, food_id, item_order, food_name, source_type, source_version, grams,
        energy_kcal, protein_g, carbohydrate_g, fat_g, composition_snapshot_hash
      )
      VALUES (
        '${MEAL_A_ID}', '${foodId}', 1, 'Arroz Cozido', 'official', '4.0.0', 150.0,
        192.0, 3.75, 42.15, 0.35, 'snap_item_a'
      )
      RETURNING id;
    `);
    ITEM_A_ID = itemRes.rows[0].id;
  });

  it('1. Paciente A vê apenas o seu próprio plano alimentar e itens', async () => {
    await asUser(PATIENT_A_ID, async () => {
      const plans = await db.query<{ id: string; patient_id: string }>('SELECT * FROM public.diet_plans');
      expect(plans.rows.length).toBe(1);
      expect(plans.rows[0].id).toBe(PLAN_A_ID);
      expect(plans.rows[0].patient_id).toBe(PATIENT_A_ID);

      const items = await db.query<{ id: string }>('SELECT * FROM public.diet_meal_items');
      expect(items.rows.length).toBe(1);
      expect(items.rows[0].id).toBe(ITEM_A_ID);
    });
  });

  it('2. Paciente A NÃO vê o plano do Paciente B (RLS estrito cross-patient)', async () => {
    await asUser(PATIENT_A_ID, async () => {
      const plansB = await db.query(`SELECT * FROM public.diet_plans WHERE id = '${PLAN_B_ID}'`);
      expect(plansB.rows.length).toBe(0);
    });
  });

  it('3. Nutricionista vinculada A vê plano do Paciente A', async () => {
    await asUser(NUTRI_A_ID, async () => {
      const plans = await db.query<{ id: string; patient_id: string }>(`SELECT * FROM public.diet_plans WHERE patient_id = '${PATIENT_A_ID}'`);
      expect(plans.rows.length).toBe(1);
      expect(plans.rows[0].id).toBe(PLAN_A_ID);
    });
  });

  it('4. Nutricionista B (SEM vínculo ativo) NÃO pode ver plano do Paciente A', async () => {
    await asUser(NUTRI_B_ID, async () => {
      const plans = await db.query(`SELECT * FROM public.diet_plans WHERE patient_id = '${PATIENT_A_ID}'`);
      expect(plans.rows.length).toBe(0);
    });
  });

  it('5. Influenciador não possui permissões clínicas e vê zero planos', async () => {
    await asUser(INFLUENCER_ID, async () => {
      const plans = await db.query('SELECT * FROM public.diet_plans');
      expect(plans.rows.length).toBe(0);

      // Tentativa de inserir review clínica é bloqueada por RLS
      await expect(
        db.query(`
          INSERT INTO public.diet_plan_reviews (diet_plan_id, reviewer_id, decision)
          VALUES ('${PLAN_A_ID}', '${INFLUENCER_ID}', 'approved')
        `)
      ).rejects.toThrow();
    });
  });

  it('6. Nutricionista A pode registrar revisão clínica no plano do seu paciente vinculado', async () => {
    await asUser(NUTRI_A_ID, async () => {
      const reviewRes = await db.query<{ id: string }>(`
        INSERT INTO public.diet_plan_reviews (diet_plan_id, reviewer_id, decision, review_notes)
        VALUES ('${PLAN_A_ID}', '${NUTRI_A_ID}', 'approved', 'Plano revisado e clinicamente validado.')
        RETURNING id;
      `);
      expect(reviewRes.rows.length).toBe(1);
      expect(reviewRes.rows[0].id).toBeDefined();
    });
  });

  it('7. Nutricionista B NÃO pode revisar o plano do Paciente A (sem vínculo)', async () => {
    await asUser(NUTRI_B_ID, async () => {
      await expect(
        db.query(`
          INSERT INTO public.diet_plan_reviews (diet_plan_id, reviewer_id, decision)
          VALUES ('${PLAN_A_ID}', '${NUTRI_B_ID}', 'approved')
        `)
      ).rejects.toThrow();
    });
  });

  it('8. Imutabilidade: Atualização direta em plano ou itens gera erro via trigger', async () => {
    // Tentativa de alterar um plano aprovado/salvo como usuário autenticado
    await asUser(NUTRI_A_ID, async () => {
      await expect(
        db.query(`
          UPDATE public.diet_plans SET day_count = 5 WHERE id = '${PLAN_A_ID}'
        `)
      ).rejects.toThrow(/Cannot modify existing diet plan/i);

      // Tentativa de alterar gramas de um item de plano
      await expect(
        db.query(`
          UPDATE public.diet_meal_items SET grams = 300 WHERE id = '${ITEM_A_ID}'
        `)
      ).rejects.toThrow(/Cannot modify items of existing diet plan/i);
    });
  });

  it('9. Concorrência: Apenas 1 plano ativo permitido por paciente via índice único parcial', async () => {
    await expect(
      db.query(`
        INSERT INTO public.diet_plans (
          patient_id, source_nutrition_engine_run_id, source_nutrition_target_id,
          composer_version, food_dataset_version, food_dataset_checksum, price_engine_version,
          input_snapshot_hash, output_plan_hash, generation_status, approval_status, is_active, version, day_count
        )
        VALUES (
          '${PATIENT_A_ID}', '${RUN_A_ID}', '${TARGET_A_ID}',
          '1.0.0', '4.0.0', 'chk123', '1.0.0',
          'in_plan_a2', 'out_plan_a2', 'calculated', 'approved', true, 2, 7
        )
      `)
    ).rejects.toThrow(/duplicate key value violates unique constraint "uq_active_diet_plan_per_patient"/i);
  });

  it('10. Admin do sistema tem governança e vê todos os planos', async () => {
    await asUser(ADMIN_ID, async () => {
      const plans = await db.query('SELECT * FROM public.diet_plans');
      expect(plans.rows.length).toBe(2);
    });
  });

  it('11. Lifecycle: Planos com approval_status = draft ou is_active = false são ESTRITAMENTE INVISÍVEIS ao paciente, mas visíveis ao nutricionista', async () => {
    // Insere um plano em rascunho / pendente de revisão para o Paciente A
    const draftRes = await db.query<{ id: string }>(`
      INSERT INTO public.diet_plans (
        patient_id, source_nutrition_engine_run_id, source_nutrition_target_id,
        composer_version, food_dataset_version, food_dataset_checksum, price_engine_version,
        input_snapshot_hash, output_plan_hash, generation_status, approval_status, is_active, version, day_count
      )
      VALUES (
        '${PATIENT_A_ID}', '${RUN_A_ID}', '${TARGET_A_ID}',
        '1.0.0', '4.0.0', 'chk123', '1.0.0',
        'in_plan_draft', 'out_plan_draft', 'review_required', 'draft', false, 2, 7
      )
      RETURNING id;
    `);
    const draftPlanId = draftRes.rows[0].id;

    // Paciente consulta seus planos: o draft NÃO aparece
    await asUser(PATIENT_A_ID, async () => {
      const plans = await db.query<{ id: string }>(`SELECT * FROM public.diet_plans WHERE id = '${draftPlanId}'`);
      expect(plans.rows.length).toBe(0);
    });

    // Nutricionista vinculado consulta planos do paciente: o draft APARECE para revisão
    await asUser(NUTRI_A_ID, async () => {
      const plans = await db.query<{ id: string }>(`SELECT * FROM public.diet_plans WHERE id = '${draftPlanId}'`);
      expect(plans.rows.length).toBe(1);
      expect(plans.rows[0].id).toBe(draftPlanId);
    });
  });

  it('12. RPC Atômico: persist_diet_plan_atomic persiste plano em transação real, bloqueia concorrência e superseda anterior', async () => {
    const planPayload = {
      patient_id: PATIENT_B_ID,
      source_nutrition_engine_run_id: RUN_B_ID,
      source_nutrition_target_id: TARGET_B_ID,
      composer_version: '1.0.0',
      composer_config_version: 'config-1.0.0',
      food_dataset_version: '4.0.0',
      food_dataset_checksum: 'chk_atomic',
      price_engine_version: '1.0.0',
      generation_reference_at: '2026-09-08T12:00:00.000Z',
      input_snapshot_hash: 'in_atomic_b',
      output_plan_hash: 'out_atomic_b',
      generation_status: 'calculated',
      approval_status: 'approved',
      rejection_reason: null,
      infeasible_reason_codes: [],
      day_count: 7,
      daily_budget_target: 40.0,
      estimated_daily_cost: 35.0,
      estimated_weekly_cost: 245.0,
      budget_confidence: 0.9,
      budget_status: 'within_budget',
      currency: 'BRL',
      price_coverage_percentage: 90.0,
      version: 2,
      is_active: true,
      days: [
        {
          day_of_week: 1,
          day_label: 'Segunda-feira',
          target_calories_kcal: 2000,
          target_protein_g: 150,
          target_carbohydrate_g: 225,
          target_fat_g: 55,
          actual_calories_kcal: 1990,
          actual_protein_g: 148,
          actual_carbohydrate_g: 224,
          actual_fat_g: 54,
          actual_fiber_g: 25,
          actual_sodium_mg: 1500,
          calories_delta_pct: -0.5,
          protein_delta_pct: -1.3,
          carbohydrate_delta_pct: -0.4,
          fat_delta_pct: -1.8,
          adherence_status: 'within_tolerance',
          estimated_cost: 35.0,
          meals: [
            {
              meal_order: 1,
              meal_type: 'lunch',
              meal_name: 'Almoço Atômico',
              scheduled_time: '12:30',
              target_calories_kcal: 600,
              target_protein_g: 45,
              target_carbohydrate_g: 68,
              target_fat_g: 16,
              actual_calories_kcal: 595,
              actual_protein_g: 44,
              actual_carbohydrate_g: 67,
              actual_fat_g: 15,
              actual_fiber_g: 8,
              actual_sodium_mg: 400,
              estimated_cost: 12.0,
              items: [
                {
                  food_id: FOOD_ID,
                  item_order: 1,
                  food_name: 'Arroz Integral',
                  source_id: null,
                  source_food_code: '001',
                  source_type: 'official',
                  source_version: '4.0.0',
                  grams: 150,
                  energy_kcal: 186,
                  protein_g: 3.9,
                  carbohydrate_g: 38.7,
                  fat_g: 1.5,
                  fiber_g: 4.0,
                  sodium_mg: 1.5,
                  household_measure_label: 'colher',
                  household_measure_quantity: 6,
                  price_estimate: 1.2,
                  price_confidence: 0.95,
                  price_source_level: 'national',
                  currency: 'BRL',
                  composition_snapshot_hash: 'hash_atom_item',
                },
              ],
            },
          ],
        },
      ],
    };

    const rpcRes = await db.query<{ persist_diet_plan_atomic: string }>(`
      SELECT public.persist_diet_plan_atomic(
        $1::jsonb,
        true
      );
    `, [JSON.stringify(planPayload)]);

    const newPlanId = rpcRes.rows[0].persist_diet_plan_atomic;
    expect(newPlanId).toBeDefined();

    // Verifica que o plano antigo PLAN_B_ID foi desativado e supersedado
    const oldPlanRes = await db.query<{ is_active: boolean; superseded_by: string }>(`
      SELECT is_active, superseded_by FROM public.diet_plans WHERE id = '${PLAN_B_ID}'
    `);
    expect(oldPlanRes.rows[0].is_active).toBe(false);
    expect(oldPlanRes.rows[0].superseded_by).toBe(newPlanId);

    // Verifica que o novo plano está ativo
    const newPlanRes = await db.query<{ is_active: boolean; version: number }>(`
      SELECT is_active, version FROM public.diet_plans WHERE id = '${newPlanId}'
    `);
    expect(newPlanRes.rows[0].is_active).toBe(true);
    expect(newPlanRes.rows[0].version).toBe(2);

    // Verifica que os itens foram inseridos com provenance completa
    const itemRes = await db.query<{ source_food_code: string; currency: string }>(`
      SELECT source_food_code, currency FROM public.diet_meal_items
      WHERE diet_meal_id IN (
        SELECT id FROM public.diet_meals WHERE diet_plan_day_id IN (
          SELECT id FROM public.diet_plan_days WHERE diet_plan_id = '${newPlanId}'
        )
      )
    `);
    expect(itemRes.rows.length).toBe(1);
    expect(itemRes.rows[0].source_food_code).toBe('001');
    expect(itemRes.rows[0].currency).toBe('BRL');
  });

  it('13. RPC Atômico: chamadas diretas por authenticated, anon ou pacientes são terminantemente bloqueadas por permissões (REVOKE)', async () => {
    // Paciente autenticado tentando chamar o RPC diretamente
    await asUser(PATIENT_A_ID, async () => {
      await expect(
        db.query(`SELECT public.persist_diet_plan_atomic('{}'::jsonb, false)`)
      ).rejects.toThrow(/Acesso negado: public.persist_diet_plan_atomic aceita exclusivamente chamadas via service_role ou superusuário de banco/i);
    });

    // Nutricionista autenticada tentando chamar o RPC diretamente (deve passar pela Server Action)
    await asUser(NUTRI_A_ID, async () => {
      await expect(
        db.query(`SELECT public.persist_diet_plan_atomic('{}'::jsonb, false)`)
      ).rejects.toThrow(/Acesso negado: public.persist_diet_plan_atomic aceita exclusivamente chamadas via service_role ou superusuário de banco/i);
    });

    // Admin autenticado tentando chamar o RPC diretamente pelo cliente anon/auth
    await asUser(ADMIN_ID, async () => {
      await expect(
        db.query(`SELECT public.persist_diet_plan_atomic('{}'::jsonb, false)`)
      ).rejects.toThrow(/Acesso negado: public.persist_diet_plan_atomic aceita exclusivamente chamadas via service_role ou superusuário de banco/i);
    });
  });

  it('14. RPC Atômico: rejeição estrita de payload adulterado ou forja cross-patient no banco', async () => {
    // 14.1. Forja Cross-Patient: Paciente A tentando associar Run do Paciente B
    const crossRunPayload = {
      patient_id: PATIENT_A_ID,
      source_nutrition_engine_run_id: RUN_B_ID, // pertence ao Paciente B!
      source_nutrition_target_id: TARGET_A_ID,
      composer_version: '1.0.0',
      food_dataset_version: '4.0.0',
      food_dataset_checksum: 'chk_cross',
      price_engine_version: '1.0.0',
      input_snapshot_hash: 'in_cross',
      output_plan_hash: 'out_cross',
      generation_status: 'calculated',
    };
    await expect(
      db.query(`SELECT public.persist_diet_plan_atomic($1::jsonb, false)`, [JSON.stringify(crossRunPayload)])
    ).rejects.toThrow(/CROSS_PATIENT_FORGERY/i);

    // 14.2. Forja Cross-Patient: Paciente B tentando associar Target do Paciente A
    const crossTargetPayload = {
      patient_id: PATIENT_B_ID,
      source_nutrition_engine_run_id: RUN_B_ID,
      source_nutrition_target_id: TARGET_A_ID, // pertence ao Paciente A!
      composer_version: '1.0.0',
      food_dataset_version: '4.0.0',
      food_dataset_checksum: 'chk_cross',
      price_engine_version: '1.0.0',
      input_snapshot_hash: 'in_cross',
      output_plan_hash: 'out_cross',
      generation_status: 'calculated',
    };
    await expect(
      db.query(`SELECT public.persist_diet_plan_atomic($1::jsonb, false)`, [JSON.stringify(crossTargetPayload)])
    ).rejects.toThrow(/CROSS_PATIENT_FORGERY/i);

    // 14.3. Status proibido: tentar persistir plano 'blocked' ou 'insufficient_data'
    const blockedPayload = {
      patient_id: PATIENT_A_ID,
      source_nutrition_engine_run_id: RUN_A_ID,
      source_nutrition_target_id: TARGET_A_ID,
      composer_version: '1.0.0',
      food_dataset_version: '4.0.0',
      food_dataset_checksum: 'chk_cross',
      price_engine_version: '1.0.0',
      input_snapshot_hash: 'in_blocked',
      output_plan_hash: 'out_blocked',
      generation_status: 'blocked',
    };
    await expect(
      db.query(`SELECT public.persist_diet_plan_atomic($1::jsonb, false)`, [JSON.stringify(blockedPayload)])
    ).rejects.toThrow(/CANNOT_PERSIST_BLOCKED_OR_INSUFFICIENT/i);

    // 14.4. Violação de Safety Gate: tentar auto-aprovar plano com status 'review_required'
    const safetyViolationPayload = {
      patient_id: PATIENT_A_ID,
      source_nutrition_engine_run_id: RUN_A_ID,
      source_nutrition_target_id: TARGET_A_ID,
      composer_version: '1.0.0',
      food_dataset_version: '4.0.0',
      food_dataset_checksum: 'chk_cross',
      price_engine_version: '1.0.0',
      input_snapshot_hash: 'in_rev',
      output_plan_hash: 'out_rev',
      generation_status: 'review_required',
      approval_status: 'approved', // Proibido!
    };
    await expect(
      db.query(`SELECT public.persist_diet_plan_atomic($1::jsonb, true)`, [JSON.stringify(safetyViolationPayload)])
    ).rejects.toThrow(/SAFETY_VIOLATION/i);
  });

  it('15. Concorrência na PRIMEIRA geração: serialização por paciente via advisory lock e lock da linha do paciente', async () => {
    // Cria Paciente C do zero, sem nenhum plano alimentar pré-existente
    const PATIENT_C_ID = '77777777-7777-4777-a777-777777777777';
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${PATIENT_C_ID}', 'patient_c@test.com') ON CONFLICT DO NOTHING;
      INSERT INTO public.profiles (id, role_id, full_name, email) VALUES ('${PATIENT_C_ID}', 'patient', 'Paciente C', 'patient_c@test.com') ON CONFLICT DO NOTHING;
      INSERT INTO public.patients (id) VALUES ('${PATIENT_C_ID}') ON CONFLICT DO NOTHING;
    `);

    const snapCRes = await db.query<{ id: string }>(`
      INSERT INTO public.patient_nutrition_snapshots (patient_id, version, snapshot_data, completion_percentage)
      VALUES ('${PATIENT_C_ID}', 1, '{"weight": 60}'::jsonb, 100)
      RETURNING id;
    `);
    const snapCId = snapCRes.rows[0].id;

    const runCRes = await db.query<{ id: string }>(`
      INSERT INTO public.nutrition_engine_runs (
        patient_id, nutrition_snapshot_id, engine_version, status, input_hash, output_hash
      )
      VALUES ('${PATIENT_C_ID}', '${snapCId}', '1.0.0', 'calculated', 'in_c', 'out_c')
      RETURNING id;
    `);
    const runCId = runCRes.rows[0].id;

    const targetCRes = await db.query<{ id: string }>(`
      INSERT INTO public.nutrition_targets (
        patient_id, engine_run_id, estimated_bmr_kcal, activity_level, activity_factor,
        estimated_tdee_kcal, primary_goal, goal_adjustment_kcal,
        target_calories_nominal_kcal, target_calories_min_kcal, target_calories_max_kcal,
        protein_g, carbohydrate_g, fat_g, protein_kcal, carbohydrate_kcal, fat_kcal,
        protein_percentage, carbohydrate_percentage, fat_percentage,
        desired_meals_per_day, calories_per_meal_average,
        normalized_daily_budget, normalized_weekly_budget, normalized_monthly_budget, budget_estimate_type
      )
      VALUES (
        '${PATIENT_C_ID}', '${runCId}', 1400, 'moderate', 1.55, 2170, 'maintain_weight', 0,
        2000, 1900, 2100, 150, 225, 55, 600, 900, 495, 30.0, 45.0, 25.0, 4, 500,
        40.0, 280.0, 1200.0, 'individual_exact'
      )
      RETURNING id;
    `);
    const targetCId = targetCRes.rows[0].id;

    const payloadC1 = {
      patient_id: PATIENT_C_ID,
      source_nutrition_engine_run_id: runCId,
      source_nutrition_target_id: targetCId,
      composer_version: '1.0.0',
      food_dataset_version: '4.0.0',
      food_dataset_checksum: 'chk_c1',
      price_engine_version: '1.0.0',
      input_snapshot_hash: 'in_c1',
      output_plan_hash: 'out_c1',
      generation_status: 'calculated',
      version: 1,
    };

    const payloadC2 = {
      patient_id: PATIENT_C_ID,
      source_nutrition_engine_run_id: runCId,
      source_nutrition_target_id: targetCId,
      composer_version: '1.0.0',
      food_dataset_version: '4.0.0',
      food_dataset_checksum: 'chk_c2',
      price_engine_version: '1.0.0',
      input_snapshot_hash: 'in_c2',
      output_plan_hash: 'out_c2',
      generation_status: 'calculated',
      version: 2,
    };

    // Executa duas gravações consecutivas / concorrentes
    const res1 = await db.query<{ persist_diet_plan_atomic: string }>(
      `SELECT public.persist_diet_plan_atomic($1::jsonb, true)`,
      [JSON.stringify(payloadC1)]
    );
    const planC1Id = res1.rows[0].persist_diet_plan_atomic;

    const res2 = await db.query<{ persist_diet_plan_atomic: string }>(
      `SELECT public.persist_diet_plan_atomic($1::jsonb, true)`,
      [JSON.stringify(payloadC2)]
    );
    const planC2Id = res2.rows[0].persist_diet_plan_atomic;

    // Garante que apenas 1 plano ativo existe no banco para o Paciente C
    const activePlans = await db.query<{ id: string; version: number }>(`
      SELECT id, version FROM public.diet_plans WHERE patient_id = '${PATIENT_C_ID}' AND is_active = TRUE
    `);
    expect(activePlans.rows.length).toBe(1);
    expect(activePlans.rows[0].id).toBe(planC2Id);
    expect(activePlans.rows[0].version).toBe(2);

    // Garante que o plano 1 foi devidamente supersedado pelo plano 2
    const supersededPlans = await db.query<{ id: string; superseded_by: string }>(`
      SELECT id, superseded_by FROM public.diet_plans WHERE id = '${planC1Id}'
    `);
    expect(supersededPlans.rows[0].superseded_by).toBe(planC2Id);
  });

  it('16. Matriz RLS Estrita: Paciente só vê seu plano aprovado e ativo; drafts e superseded são estritamente invisíveis', async () => {
    // Insere um plano rejeitado e um plano superseded para o Paciente A
    await db.exec(`
      INSERT INTO public.diet_plans (
        patient_id, source_nutrition_engine_run_id, source_nutrition_target_id,
        composer_version, food_dataset_version, food_dataset_checksum, price_engine_version,
        input_snapshot_hash, output_plan_hash, generation_status, approval_status, is_active, version, day_count
      )
      VALUES 
        ('${PATIENT_A_ID}', '${RUN_A_ID}', '${TARGET_A_ID}', '1.0.0', '4.0.0', 'chk', '1.0.0', 'in_rej', 'out_rej', 'calculated', 'rejected', false, 3, 7),
        ('${PATIENT_A_ID}', '${RUN_A_ID}', '${TARGET_A_ID}', '1.0.0', '4.0.0', 'chk', '1.0.0', 'in_sup', 'out_sup', 'calculated', 'superseded', false, 4, 7);
    `);

    // Consulta como Paciente A:
    await asUser(PATIENT_A_ID, async () => {
      const patientPlans = await db.query<{ id: string; approval_status: string; is_active: boolean }>(`
        SELECT id, approval_status, is_active FROM public.diet_plans
      `);
      // O paciente A deve ver EXATAMENTE 1 plano (o ativo aprovado PLAN_A_ID), e ZERO planos draft, rejected ou superseded
      expect(patientPlans.rows.length).toBe(1);
      expect(patientPlans.rows[0].id).toBe(PLAN_A_ID);
      expect(patientPlans.rows[0].approval_status).toBe('approved');
      expect(patientPlans.rows[0].is_active).toBe(true);
    });

    // Consulta como Nutricionista Vinculada A:
    await asUser(NUTRI_A_ID, async () => {
      const nutriPlans = await db.query<{ id: string; approval_status: string }>(`
        SELECT id, approval_status FROM public.diet_plans WHERE patient_id = '${PATIENT_A_ID}'
      `);
      // A nutricionista vinculada enxerga todo o histórico clínico do paciente (ativo, draft, rejected, superseded)
      expect(nutriPlans.rows.length).toBeGreaterThan(1);
      const statuses = nutriPlans.rows.map((p) => p.approval_status);
      expect(statuses).toContain('approved');
      expect(statuses).toContain('draft');
      expect(statuses).toContain('rejected');
      expect(statuses).toContain('superseded');
    });

    // Consulta como Nutricionista Desvinculada B:
    await asUser(NUTRI_B_ID, async () => {
      const unlinkedPlans = await db.query(`
        SELECT * FROM public.diet_plans WHERE patient_id = '${PATIENT_A_ID}'
      `);
      expect(unlinkedPlans.rows.length).toBe(0);
    });

    // Consulta como Influencer:
    await asUser(INFLUENCER_ID, async () => {
      const influencerPlans = await db.query(`
        SELECT * FROM public.diet_plans WHERE patient_id = '${PATIENT_A_ID}'
      `);
      expect(influencerPlans.rows.length).toBe(0);
    });
  });
});
