import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { EXERCISE_CATALOG_CHECKSUM } from '@/lib/workout-engine/catalog';

describe('ETAPA 7: Workout Engine — Segurança, RLS, Imutabilidade, Logs de Execução e Governança', () => {
  let db: PGlite;

  const ADMIN_ID = '11111111-1111-4111-a111-111111111111';
  const NUTRI_A_ID = '22222222-2222-4222-a222-222222222222';
  const PATIENT_A_ID = '55555555-5555-4555-a555-555555555555';
  const PATIENT_B_ID = '66666666-6666-4666-a666-666666666666';
  const INFLUENCER_ID = '77777777-7777-4777-a777-777777777777';

  let PROGRAM_A_ID: string;
  let EXERCISE_ID: string;
  let WORKOUT_EXERCISE_ID: string;

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

    // Setup Mock Supabase Auth
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

    // Executar Todas as 16 Migrações
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
      '20260909000016_deterministic_workout_engine.sql',
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

    // Cadastrar Usuários de Teste
    await db.exec(`
      -- Admin
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${ADMIN_ID}', 'admin@workout.com', NOW(), '{"full_name": "Admin Sistema"}');
      UPDATE public.profiles SET role_id = 'admin', is_active = true, status = 'active' WHERE id = '${ADMIN_ID}';

      -- Nutricionista
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${NUTRI_A_ID}', 'nutri@workout.com', NOW(), '{"full_name": "Nutricionista Ana"}');
      UPDATE public.profiles SET role_id = 'nutritionist', is_active = true, status = 'active' WHERE id = '${NUTRI_A_ID}';
      DELETE FROM public.patients WHERE id = '${NUTRI_A_ID}';
      INSERT INTO public.professional_profiles (id, professional_type, license_number)
      VALUES ('${NUTRI_A_ID}', 'nutritionist', 'CRN-12345');

      -- Influencer
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${INFLUENCER_ID}', 'influencer@workout.com', NOW(), '{"full_name": "Influencer Fitness"}');
      UPDATE public.profiles SET role_id = 'influencer', is_active = true, status = 'active' WHERE id = '${INFLUENCER_ID}';
      DELETE FROM public.patients WHERE id = '${INFLUENCER_ID}';

      -- Paciente A
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${PATIENT_A_ID}', 'patientA@workout.com', NOW(), '{"full_name": "Paciente Alpha"}');
      UPDATE public.profiles SET role_id = 'patient', is_active = true, status = 'active' WHERE id = '${PATIENT_A_ID}';

      -- Paciente B
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${PATIENT_B_ID}', 'patientB@workout.com', NOW(), '{"full_name": "Paciente Beta"}');
      UPDATE public.profiles SET role_id = 'patient', is_active = true, status = 'active' WHERE id = '${PATIENT_B_ID}';

      -- Vínculo Nutricionista -> Paciente A
      INSERT INTO public.professional_patient_links (professional_id, patient_id, status)
      VALUES ('${NUTRI_A_ID}', '${PATIENT_A_ID}', 'active');
    `);

    // Inserir Exercício no Catálogo
    const exRes = await db.query<{ id: string }>(`
      INSERT INTO public.exercise_catalog (
        code, name, normalized_name, movement_pattern, primary_muscle_groups,
        required_equipment, complexity_level, is_unilateral, is_compound
      ) VALUES (
        'BENCH_PRESS_TEST', 'Supino Teste', 'supino teste', 'push_horizontal',
        ARRAY['chest'], ARRAY['barbell', 'bench'], 'intermediate', false, true
      ) RETURNING id;
    `);
    EXERCISE_ID = exRes.rows[0].id;

    // Criar Programa de Treino Ativo e Aprovado para Paciente A
    const progRes = await db.query<{ id: string }>(`
      INSERT INTO public.workout_programs (
        patient_id, engine_version, config_version, catalog_version, catalog_checksum,
        input_snapshot_hash, output_program_hash, objective, experience_level,
        sessions_per_week, split_type, generation_status, approval_status,
        version, is_active, generation_reference_at
      ) VALUES (
        '${PATIENT_A_ID}', '1.0.0', 'config-1.0.0', '1.0.0', '${EXERCISE_CATALOG_CHECKSUM}',
        'hash_in_test', 'hash_out_test', 'hypertrophy', 'intermediate',
        4, 'upper_lower', 'calculated', 'approved', 1, true, NOW()
      ) RETURNING id;
    `);
    PROGRAM_A_ID = progRes.rows[0].id;

    // Criar Sessão e Exercício
    const dayRes = await db.query<{ id: string }>(`
      INSERT INTO public.workout_program_days (workout_program_id, day_of_week, day_label, is_rest_day)
      VALUES ('${PROGRAM_A_ID}', 1, 'Segunda-feira', false) RETURNING id;
    `);
    const dayId = dayRes.rows[0].id;

    const sessRes = await db.query<{ id: string }>(`
      INSERT INTO public.workout_sessions (workout_program_day_id, session_order, name, session_focus, estimated_duration_minutes)
      VALUES ('${dayId}', 1, 'Sessão A', 'upper', 60) RETURNING id;
    `);
    const sessId = sessRes.rows[0].id;

    const weRes = await db.query<{ id: string }>(`
      INSERT INTO public.workout_exercises (
        workout_session_id, exercise_id, exercise_order, exercise_name, movement_pattern,
        prescribed_sets, min_reps, max_reps, target_rir, rest_seconds
      ) VALUES (
        '${sessId}', '${EXERCISE_ID}', 1, 'Supino Teste', 'push_horizontal', 3, 8, 12, 2, 90
      ) RETURNING id;
    `);
    WORKOUT_EXERCISE_ID = weRes.rows[0].id;
  });

  it('Paciente A deve conseguir ler seu próprio programa ativo e aprovado', async () => {
    const res = await asUser(PATIENT_A_ID, async () => {
      return await db.query<{ id: string }>('SELECT * FROM public.workout_programs WHERE id = $1', [PROGRAM_A_ID]);
    });
    expect(res.rows.length).toBe(1);
    expect(res.rows[0].id).toBe(PROGRAM_A_ID);
  });

  it('Paciente B não deve enxergar o treino do Paciente A (Isolamento Cross-Patient)', async () => {
    const res = await asUser(PATIENT_B_ID, async () => {
      return await db.query('SELECT * FROM public.workout_programs WHERE id = $1', [PROGRAM_A_ID]);
    });
    expect(res.rows.length).toBe(0);
  });

  it('Paciente não deve enxergar programas com approval_status = draft ou review_required', async () => {
    // Criar programa em rascunho para Paciente A
    const draftRes = await db.query<{ id: string }>(`
      INSERT INTO public.workout_programs (
        patient_id, engine_version, config_version, input_snapshot_hash, output_program_hash,
        objective, experience_level, sessions_per_week, split_type, generation_status,
        approval_status, version, is_active, generation_reference_at
      ) VALUES (
        '${PATIENT_A_ID}', '1.0.0', 'config-1.0.0', 'hash_draft', 'hash_draft_out',
        'hypertrophy', 'intermediate', 4, 'upper_lower', 'review_required',
        'draft', 2, false, NOW()
      ) RETURNING id;
    `);
    const draftId = draftRes.rows[0].id;

    const res = await asUser(PATIENT_A_ID, async () => {
      return await db.query('SELECT * FROM public.workout_programs WHERE id = $1', [draftId]);
    });
    expect(res.rows.length).toBe(0);
  });

  it('Nutricionista NÃO PODE criar programas de treino (Segregação de Competência Profissional)', async () => {
    await asUser(NUTRI_A_ID, async () => {
      await expect(
        db.query(`
          INSERT INTO public.workout_programs (
            patient_id, engine_version, config_version, input_snapshot_hash, output_program_hash,
            objective, experience_level, sessions_per_week, split_type, generation_status,
            approval_status, version, is_active, generation_reference_at
          ) VALUES (
            '${PATIENT_A_ID}', '1.0.0', 'config-1.0.0', 'hash_nutri', 'hash_nutri_out',
            'hypertrophy', 'intermediate', 4, 'upper_lower', 'calculated',
            'approved', 3, false, NOW()
          );
        `)
      ).rejects.toThrow();
    });
  });

  it('Nutricionista Vinculado PODE ler o programa ativo do paciente para suporte calórico', async () => {
    const res = await asUser(NUTRI_A_ID, async () => {
      return await db.query<{ id: string }>('SELECT * FROM public.workout_programs WHERE id = $1', [PROGRAM_A_ID]);
    });
    expect(res.rows.length).toBe(1);
    expect(res.rows[0].id).toBe(PROGRAM_A_ID);
  });

  it('Influencer não possui acesso de leitura ou escrita a treinos', async () => {
    const res = await asUser(INFLUENCER_ID, async () => {
      return await db.query('SELECT * FROM public.workout_programs WHERE id = $1', [PROGRAM_A_ID]);
    });
    expect(res.rows.length).toBe(0);
  });

  it('Trigger de imutabilidade deve impedir UPDATE em programa aprovado', async () => {
    await asUser(ADMIN_ID, async () => {
      await expect(
        db.query(`
          UPDATE public.workout_programs
          SET objective = 'strength_foundation'
          WHERE id = '${PROGRAM_A_ID}';
        `)
      ).rejects.toThrow(/strictly immutable/);
    });
  });

  it('Segurança de Execução: Paciente A pode inserir log de treino no seu próprio programa', async () => {
    const logRes = await asUser(PATIENT_A_ID, async () => {
      return await db.query<{ id: string }>(`
        INSERT INTO public.workout_execution_logs (
          patient_id, workout_exercise_id, session_date, set_number, weight_kg, weight_unit, reps_completed, actual_rir
        ) VALUES (
          '${PATIENT_A_ID}', '${WORKOUT_EXERCISE_ID}', '2026-09-09', 1, 80.0, 'kg', 10, 2
        ) RETURNING id;
      `);
    });
    expect(logRes.rows.length).toBe(1);
    expect(logRes.rows[0].id).toBeDefined();
  });

  it('Segurança de Execução [NEGATIVO RLS]: Paciente A NÃO pode registrar log para o Paciente B', async () => {
    await asUser(PATIENT_A_ID, async () => {
      await expect(
        db.query(`
          INSERT INTO public.workout_execution_logs (
            patient_id, workout_exercise_id, session_date, set_number, weight_kg, weight_unit, reps_completed
          ) VALUES (
            '${PATIENT_B_ID}', '${WORKOUT_EXERCISE_ID}', '2026-09-09', 1, 80.0, 'kg', 10
          );
        `)
      ).rejects.toThrow();
    });
  });

  it('Segurança de Execução [NEGATIVO RLS]: Paciente B NÃO pode registrar log para exercício do Paciente A', async () => {
    await asUser(PATIENT_B_ID, async () => {
      await expect(
        db.query(`
          INSERT INTO public.workout_execution_logs (
            patient_id, workout_exercise_id, session_date, set_number, weight_kg, weight_unit, reps_completed
          ) VALUES (
            '${PATIENT_B_ID}', '${WORKOUT_EXERCISE_ID}', '2026-09-09', 1, 80.0, 'kg', 10
          );
        `)
      ).rejects.toThrow();
    });
  });

  it('Segurança de Execução [NEGATIVO CHECK CONSTRAINTS]: Deve rejeitar payload inválido (carga negativa, reps negativas, unidade inválida)', async () => {
    // Carga negativa
    await asUser(PATIENT_A_ID, async () => {
      await expect(
        db.query(`
          INSERT INTO public.workout_execution_logs (
            patient_id, workout_exercise_id, session_date, set_number, weight_kg, weight_unit, reps_completed
          ) VALUES (
            '${PATIENT_A_ID}', '${WORKOUT_EXERCISE_ID}', '2026-09-09', 1, -10.0, 'kg', 10
          );
        `)
      ).rejects.toThrow();
    });

    // Repetições negativas
    await asUser(PATIENT_A_ID, async () => {
      await expect(
        db.query(`
          INSERT INTO public.workout_execution_logs (
            patient_id, workout_exercise_id, session_date, set_number, weight_kg, weight_unit, reps_completed
          ) VALUES (
            '${PATIENT_A_ID}', '${WORKOUT_EXERCISE_ID}', '2026-09-09', 1, 80.0, 'kg', -1
          );
        `)
      ).rejects.toThrow();
    });

    // Unidade inválida (não permitida)
    await asUser(PATIENT_A_ID, async () => {
      await expect(
        db.query(`
          INSERT INTO public.workout_execution_logs (
            patient_id, workout_exercise_id, session_date, set_number, weight_kg, weight_unit, reps_completed
          ) VALUES (
            '${PATIENT_A_ID}', '${WORKOUT_EXERCISE_ID}', '2026-09-09', 1, 80.0, 'stone', 10
          );
        `)
      ).rejects.toThrow();
    });
  });

  it('Comprovação Estrutural de Ownership: Foreign Keys provam relação auth.users -> public.profiles -> public.patients', async () => {
    // 1. Verificar FK de public.patients.id para public.profiles(id)
    const fkPatientRes = await db.query<{ column_name: string; foreign_table_name: string }>(`
      SELECT
        kcu.column_name, ccu.table_name AS foreign_table_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'patients' AND tc.constraint_type = 'FOREIGN KEY';
    `);
    expect(fkPatientRes.rows.some(r => r.foreign_table_name === 'profiles' && r.column_name === 'id')).toBe(true);

    // 2. Verificar FK de public.profiles.id para auth.users(id)
    const fkProfileRes = await db.query<{ column_name: string; foreign_table_name: string }>(`
      SELECT
        kcu.column_name, ccu.table_name AS foreign_table_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'profiles' AND tc.constraint_type = 'FOREIGN KEY';
    `);
    expect(fkProfileRes.rows.some(r => r.foreign_table_name === 'users' && r.column_name === 'id')).toBe(true);

    // 3. Testar função private.is_patient_owner
    const isOwnerRes = await db.query<{ is_patient_owner: boolean }>(
      `SELECT private.is_patient_owner($1, $2) AS is_patient_owner;`,
      [PATIENT_A_ID, PATIENT_A_ID]
    );
    expect(isOwnerRes.rows[0].is_patient_owner).toBe(true);

    const isNotOwnerRes = await db.query<{ is_patient_owner: boolean }>(
      `SELECT private.is_patient_owner($1, $2) AS is_patient_owner;`,
      [PATIENT_A_ID, PATIENT_B_ID]
    );
    expect(isNotOwnerRes.rows[0].is_patient_owner).toBe(false);

    const isNotOwnerAdminRes = await db.query<{ is_patient_owner: boolean }>(
      `SELECT private.is_patient_owner($1, $2) AS is_patient_owner;`,
      [PATIENT_A_ID, ADMIN_ID]
    );
    expect(isNotOwnerAdminRes.rows[0].is_patient_owner).toBe(false);
  });

  it('Blindagem de Execução: Inserir logged_at no futuro NÃO aumenta a janela de edição (regra de created_at no banco)', async () => {
    // 1. Paciente insere log com logged_at no futuro (10 dias à frente)
    const logRes = await asUser(PATIENT_A_ID, async () => {
      return await db.query<{ id: string; created_at: string; logged_at: string }>(`
        INSERT INTO public.workout_execution_logs (
          patient_id, workout_exercise_id, session_date, set_number, weight_kg, weight_unit, reps_completed, actual_rir, logged_at
        ) VALUES (
          '${PATIENT_A_ID}', '${WORKOUT_EXERCISE_ID}', '2026-09-09', 2, 85.0, 'kg', 8, 2, NOW() + INTERVAL '10 days'
        ) RETURNING id, created_at, logged_at;
      `);
    });
    const logId = logRes.rows[0].id;
    expect(logId).toBeDefined();

    // 2. Simular que o log foi criado há mais de 1 hora (created_at expirado)
    await db.exec(`
      UPDATE public.workout_execution_logs
      SET created_at = NOW() - INTERVAL '2 hours'
      WHERE id = '${logId}';
    `);

    // 3. Paciente tenta editar o log aproveitando o logged_at que está 10 dias no futuro
    const updateRes = await asUser(PATIENT_A_ID, async () => {
      return await db.query(`
        UPDATE public.workout_execution_logs
        SET reps_completed = 10, notes = 'Tentando burlar janela de 1h com logged_at futuro'
        WHERE id = '${logId}';
      `);
    });

    // 4. A autorização falha (0 rows affected) porque o RLS depende EXCLUSIVAMENTE de created_at gerado pelo PostgreSQL
    expect(updateRes.rowCount).toBe(0);

    // 5. Garantir que o valor permaneceu inalterado (8 reps)
    const checkRes = await db.query<{ reps_completed: number }>(
      `SELECT reps_completed FROM public.workout_execution_logs WHERE id = '${logId}'`
    );
    expect(checkRes.rows[0].reps_completed).toBe(8);
  });

  it('Blindagem de Execução: Edição permitida apenas dentro da janela de 1 hora de created_at para campos autorizados', async () => {
    // 1. Inserir log recente (created_at = NOW())
    const logRes = await asUser(PATIENT_A_ID, async () => {
      return await db.query<{ id: string }>(`
        INSERT INTO public.workout_execution_logs (
          patient_id, workout_exercise_id, session_date, set_number, weight_kg, weight_unit, reps_completed, actual_rir
        ) VALUES (
          '${PATIENT_A_ID}', '${WORKOUT_EXERCISE_ID}', '2026-09-09', 3, 90.0, 'kg', 6, 1
        ) RETURNING id;
      `);
    });
    const logId = logRes.rows[0].id;

    // 2. Atualizar campos de execução permitidos dentro da janela de 1h
    const updateRes = await asUser(PATIENT_A_ID, async () => {
      return await db.query(`
        UPDATE public.workout_execution_logs
        SET reps_completed = 7, notes = 'Correção legítima imediata'
        WHERE id = '${logId}';
      `);
    });
    expect(updateRes.rowCount).toBe(1);

    const checkRes = await db.query<{ reps_completed: number; notes: string }>(
      `SELECT reps_completed, notes FROM public.workout_execution_logs WHERE id = '${logId}'`
    );
    expect(checkRes.rows[0].reps_completed).toBe(7);
    expect(checkRes.rows[0].notes).toBe('Correção legítima imediata');
  });

  it('Blindagem de Execução: Impedir alteração de patient_id (mover log para outro paciente)', async () => {
    const logRes = await asUser(PATIENT_A_ID, async () => {
      return await db.query<{ id: string }>(`
        INSERT INTO public.workout_execution_logs (
          patient_id, workout_exercise_id, session_date, set_number, weight_kg, weight_unit, reps_completed
        ) VALUES (
          '${PATIENT_A_ID}', '${WORKOUT_EXERCISE_ID}', '2026-09-09', 4, 90.0, 'kg', 6
        ) RETURNING id;
      `);
    });
    const logId = logRes.rows[0].id;

    // Tentativa de mover o log para o Paciente B é bloqueada pelo trigger de imutabilidade
    await asUser(PATIENT_A_ID, async () => {
      await expect(
        db.query(`
          UPDATE public.workout_execution_logs
          SET patient_id = '${PATIENT_B_ID}'
          WHERE id = '${logId}';
        `)
      ).rejects.toThrow(/Cannot modify patient_id/);
    });
  });

  it('Blindagem de Execução: Impedir alteração de workout_exercise_id (mover log para outro exercício/programa)', async () => {
    // Criar outro exercício para simular o alvo
    const otherExRes = await db.query<{ id: string }>(`
      INSERT INTO public.exercise_catalog (
        code, name, normalized_name, movement_pattern, primary_muscle_groups,
        required_equipment, complexity_level, is_unilateral, is_compound
      ) VALUES (
        'SQUAT_TEST_IMMUT', 'Agachamento Teste Imut', 'agachamento teste imut', 'squat',
        ARRAY['quadriceps'], ARRAY['barbell'], 'intermediate', false, true
      ) RETURNING id;
    `);
    const otherExId = otherExRes.rows[0].id;

    const otherProgDayRes = await db.query<{ id: string }>(`
      INSERT INTO public.workout_program_days (workout_program_id, day_of_week, day_label, is_rest_day)
      VALUES ('${PROGRAM_A_ID}', 3, 'Quarta-feira', false) RETURNING id;
    `);
    const otherSessRes = await db.query<{ id: string }>(`
      INSERT INTO public.workout_sessions (workout_program_day_id, session_order, name, session_focus, estimated_duration_minutes)
      VALUES ('${otherProgDayRes.rows[0].id}', 1, 'Sessão B', 'lower', 60) RETURNING id;
    `);
    const otherWeRes = await db.query<{ id: string }>(`
      INSERT INTO public.workout_exercises (
        workout_session_id, exercise_id, exercise_order, exercise_name, movement_pattern,
        prescribed_sets, min_reps, max_reps, rest_seconds
      ) VALUES (
        '${otherSessRes.rows[0].id}', '${otherExId}', 1, 'Agachamento Teste', 'squat', 3, 8, 12, 90
      ) RETURNING id;
    `);
    const otherWorkoutExerciseId = otherWeRes.rows[0].id;

    const logRes = await asUser(PATIENT_A_ID, async () => {
      return await db.query<{ id: string }>(`
        INSERT INTO public.workout_execution_logs (
          patient_id, workout_exercise_id, session_date, set_number, weight_kg, weight_unit, reps_completed
        ) VALUES (
          '${PATIENT_A_ID}', '${WORKOUT_EXERCISE_ID}', '2026-09-09', 5, 95.0, 'kg', 5
        ) RETURNING id;
      `);
    });
    const logId = logRes.rows[0].id;

    // Tentativa de alterar workout_exercise_id
    await asUser(PATIENT_A_ID, async () => {
      await expect(
        db.query(`
          UPDATE public.workout_execution_logs
          SET workout_exercise_id = '${otherWorkoutExerciseId}'
          WHERE id = '${logId}';
        `)
      ).rejects.toThrow(/Cannot modify workout_exercise_id/);
    });
  });

  it('Blindagem de Execução: Impedir alteração de created_at e primary key id no UPDATE', async () => {
    const logRes = await asUser(PATIENT_A_ID, async () => {
      return await db.query<{ id: string }>(`
        INSERT INTO public.workout_execution_logs (
          patient_id, workout_exercise_id, session_date, set_number, weight_kg, weight_unit, reps_completed
        ) VALUES (
          '${PATIENT_A_ID}', '${WORKOUT_EXERCISE_ID}', '2026-09-09', 6, 100.0, 'kg', 5
        ) RETURNING id;
      `);
    });
    const logId = logRes.rows[0].id;

    // Tentativa de alterar created_at
    await asUser(PATIENT_A_ID, async () => {
      await expect(
        db.query(`
          UPDATE public.workout_execution_logs
          SET created_at = NOW() + INTERVAL '1 hour'
          WHERE id = '${logId}';
        `)
      ).rejects.toThrow(/Cannot modify created_at/);
    });

    // Tentativa de alterar id
    await asUser(PATIENT_A_ID, async () => {
      await expect(
        db.query(`
          UPDATE public.workout_execution_logs
          SET id = '99999999-9999-9999-9999-999999999999'
          WHERE id = '${logId}';
        `)
      ).rejects.toThrow(/Cannot modify identity primary key id/);
    });
  });

  it('Blindagem de Execução: Proibir deleção direta de logs de execução por usuários autenticados (RLS e integridade)', async () => {
    const logRes = await asUser(PATIENT_A_ID, async () => {
      return await db.query<{ id: string }>(`
        INSERT INTO public.workout_execution_logs (
          patient_id, workout_exercise_id, session_date, set_number, weight_kg, weight_unit, reps_completed
        ) VALUES (
          '${PATIENT_A_ID}', '${WORKOUT_EXERCISE_ID}', '2026-09-09', 7, 105.0, 'kg', 4
        ) RETURNING id;
      `);
    });
    const logId = logRes.rows[0].id;

    // Tentativa de DELETE por paciente autenticado afeta 0 linhas (bloqueado por RLS)
    const delRes = await asUser(PATIENT_A_ID, async () => {
      return await db.query(`
        DELETE FROM public.workout_execution_logs
        WHERE id = '${logId}';
      `);
    });
    expect(delRes.rowCount).toBe(0);

    // O log permanece 100% íntegro na tabela
    const checkRes = await db.query<{ id: string }>(
      `SELECT id FROM public.workout_execution_logs WHERE id = '${logId}'`
    );
    expect(checkRes.rows.length).toBe(1);
  });

  it('Segurança de Execução: Eventos de progressão são computados estritamente pelo motor (Paciente não pode inserir diretamente)', async () => {
    await asUser(PATIENT_A_ID, async () => {
      await expect(
        db.query(`
          INSERT INTO public.workout_progression_events (
            patient_id, exercise_id, event_type, previous_load_kg, recommended_load_kg, rationale
          ) VALUES (
            '${PATIENT_A_ID}', '${EXERCISE_ID}', 'load_increase_recommended', 80.0, 85.0, 'Adulteração não autorizada'
          );
        `)
      ).rejects.toThrow();
    });
  });

  it('Autoridade de Aprovação: Admin e Nutricionista NÃO podem auto-aprovar programa com status review_required', async () => {
    // Criar programa com review_required
    const rrProgRes = await db.query<{ id: string }>(`
      INSERT INTO public.workout_programs (
        patient_id, engine_version, config_version, catalog_version, catalog_checksum,
        input_snapshot_hash, output_program_hash, objective, experience_level,
        sessions_per_week, split_type, generation_status, approval_status,
        version, is_active, generation_reference_at
      ) VALUES (
        '${PATIENT_A_ID}', '1.0.0', 'config-1.0.0', '1.0.0', '${EXERCISE_CATALOG_CHECKSUM}',
        'hash_in_rr', 'hash_out_rr', 'hypertrophy', 'intermediate',
        4, 'upper_lower', 'review_required', 'draft', 3, false, NOW()
      ) RETURNING id;
    `);
    const rrProgId = rrProgRes.rows[0].id;

    // Admin operacional tentando aprovar sem permissão profissional específica de Educação Física:
    // Bloqueado pelo RLS (can_manage_workout_program retorna FALSE para review_required quando não há CREF/workout.review)
    const adminRes = await asUser(ADMIN_ID, async () => {
      return await db.query(`
        UPDATE public.workout_programs
        SET approval_status = 'approved', is_active = true
        WHERE id = '${rrProgId}';
      `);
    });
    expect(adminRes.rowCount).toBe(0);

    // Nutricionista tentando aprovar: bloqueado pelo RLS (0 rows updated)
    const nutriRes = await asUser(NUTRI_A_ID, async () => {
      return await db.query(`
        UPDATE public.workout_programs
        SET approval_status = 'approved', is_active = true
        WHERE id = '${rrProgId}';
      `);
    });
    expect(nutriRes.rowCount).toBe(0);

    // O programa permanece rigorosamente em draft e inativo
    const checkRes = await db.query<{ approval_status: string; is_active: boolean }>(
      `SELECT approval_status, is_active FROM public.workout_programs WHERE id = '${rrProgId}'`
    );
    expect(checkRes.rows[0].approval_status).toBe('draft');
    expect(checkRes.rows[0].is_active).toBe(false);
  });

  it('persist_workout_program_atomic deve substituir atômica e deterministicamente o plano ativo', async () => {
    const newProgramPayload = {
      patient_id: PATIENT_A_ID,
      engine_version: '1.0.0',
      config_version: 'config-1.0.0',
      catalog_version: '1.0.0',
      catalog_checksum: EXERCISE_CATALOG_CHECKSUM,
      catalog_provenance: { source: 'curated_catalog', schema_version: '1.0.0' },
      source_profile_version: 1,
      input_snapshot_hash: 'hash_new_in',
      output_program_hash: 'hash_new_out',
      objective: 'hypertrophy',
      experience_level: 'intermediate',
      sessions_per_week: 3,
      session_duration_minutes: 60,
      split_type: 'full_body',
      generation_status: 'calculated',
      approval_status: 'approved',
      generation_reference_at: new Date().toISOString(),
      days: [
        {
          day_of_week: 1,
          day_label: 'Segunda-feira',
          is_rest_day: false,
          sessions: [
            {
              session_order: 1,
              name: 'Sessão Full Body',
              session_focus: 'full_body',
              estimated_duration_minutes: 60,
              warmup_protocol: [],
              cooldown_protocol: [],
              exercises: [
                {
                  exercise_id: EXERCISE_ID,
                  exercise_order: 1,
                  exercise_name: 'Supino Teste',
                  movement_pattern: 'push_horizontal',
                  exercise_snapshot_hash: 'snapshot_hash_1',
                  primary_muscle_groups: ['chest'],
                  secondary_muscle_groups: ['triceps', 'shoulders'],
                  required_equipment: ['barbell', 'bench'],
                  complexity_level: 'intermediate',
                  is_unilateral: false,
                  is_compound: true,
                  catalog_source_version: '1.0.0',
                  prescribed_sets: 3,
                  min_reps: 8,
                  max_reps: 12,
                  target_rir: 2,
                  target_rpe: 8.0,
                  rest_seconds: 90,
                  warmup_sets: 1,
                  progression_strategy: 'double_progression',
                },
              ],
            },
          ],
        },
      ],
    };

    const rpcRes = await db.query<{ persist_workout_program_atomic: string }>(
      `SELECT public.persist_workout_program_atomic($1::jsonb, true) as persist_workout_program_atomic;`,
      [JSON.stringify(newProgramPayload)]
    );

    const newProgId = rpcRes.rows[0].persist_workout_program_atomic;
    expect(newProgId).toBeDefined();

    // Conferir que o plano anterior foi desativado e superseded_by foi preenchido
    const oldProgRes = await db.query<{ is_active: boolean; superseded_by: string }>(
      `SELECT is_active, superseded_by FROM public.workout_programs WHERE id = $1`,
      [PROGRAM_A_ID]
    );
    expect(oldProgRes.rows[0].is_active).toBe(false);
    expect(oldProgRes.rows[0].superseded_by).toBe(newProgId);

    // Conferir que o novo plano está ativo
    const newProgCheck = await db.query<{ is_active: boolean; catalog_version: string }>(
      `SELECT is_active, catalog_version FROM public.workout_programs WHERE id = $1`,
      [newProgId]
    );
    expect(newProgCheck.rows[0].is_active).toBe(true);
    expect(newProgCheck.rows[0].catalog_version).toBe('1.0.0');

    // Garantir índice parcial único (apenas 1 ativo)
    const activeCountRes = await db.query<{ count: string }>(
      `SELECT count(*) FROM public.workout_programs WHERE patient_id = $1 AND is_active = true`,
      [PATIENT_A_ID]
    );
    expect(Number(activeCountRes.rows[0].count)).toBe(1);
  });

  it('persist_workout_program_atomic [SAFETY GATE]: Não pode auto-aprovar ou ativar planos com review_required ou infeasible', async () => {
    const rrPayload = {
      patient_id: PATIENT_A_ID,
      generation_status: 'review_required',
      approval_status: 'draft',
      input_snapshot_hash: 'hash_rr',
      output_program_hash: 'hash_rr_out',
      objective: 'hypertrophy',
      experience_level: 'intermediate',
      sessions_per_week: 3,
      split_type: 'full_body',
    };

    // Tentativa de passar p_auto_approve = true em review_required
    await expect(
      db.query(`SELECT public.persist_workout_program_atomic($1::jsonb, true);`, [JSON.stringify(rrPayload)])
    ).rejects.toThrow(/SAFETY_VIOLATION/);

    const infeasiblePayload = {
      patient_id: PATIENT_A_ID,
      generation_status: 'infeasible',
      approval_status: 'draft',
      input_snapshot_hash: 'hash_inf',
      output_program_hash: 'hash_inf_out',
      objective: 'hypertrophy',
      experience_level: 'intermediate',
      sessions_per_week: 3,
      split_type: 'full_body',
    };

    await expect(
      db.query(`SELECT public.persist_workout_program_atomic($1::jsonb, true);`, [JSON.stringify(infeasiblePayload)])
    ).rejects.toThrow(/SAFETY_VIOLATION/);
  });

  it('persist_workout_program_atomic: deve rejeitar paciente inexistente com PATIENT_NOT_FOUND', async () => {
    const nonexistentPatientPayload = {
      patient_id: '00000000-0000-0000-0000-000000000999',
      generation_status: 'calculated',
      approval_status: 'draft',
      input_snapshot_hash: 'hash_fake',
      output_program_hash: 'hash_fake_out',
      objective: 'hypertrophy',
      experience_level: 'intermediate',
      sessions_per_week: 3,
      split_type: 'full_body',
    };

    await expect(
      db.query(`SELECT public.persist_workout_program_atomic($1::jsonb, false);`, [JSON.stringify(nonexistentPatientPayload)])
    ).rejects.toThrow(/PATIENT_NOT_FOUND/);
  });

  it('persist_workout_program_atomic: deve rejeitar source_profile que não pertence ao paciente com INVALID_SOURCE_PROFILE', async () => {
    // Tentar vincular perfil físico de outro paciente ou inexistente
    const invalidProfilePayload = {
      patient_id: PATIENT_A_ID,
      source_profile_id: '00000000-0000-0000-0000-000000000888',
      generation_status: 'calculated',
      approval_status: 'draft',
      input_snapshot_hash: 'hash_bad_prof',
      output_program_hash: 'hash_bad_prof_out',
      objective: 'hypertrophy',
      experience_level: 'intermediate',
      sessions_per_week: 3,
      split_type: 'full_body',
    };

    await expect(
      db.query(`SELECT public.persist_workout_program_atomic($1::jsonb, false);`, [JSON.stringify(invalidProfilePayload)])
    ).rejects.toThrow(/INVALID_SOURCE_PROFILE/);
  });

  it('persist_workout_program_atomic: deve rejeitar exercício inexistente ou inativo no payload com INVALID_EXERCISE', async () => {
    const invalidExPayload = {
      patient_id: PATIENT_A_ID,
      generation_status: 'calculated',
      approval_status: 'draft',
      input_snapshot_hash: 'hash_bad_ex',
      output_program_hash: 'hash_bad_ex_out',
      objective: 'hypertrophy',
      experience_level: 'intermediate',
      sessions_per_week: 3,
      split_type: 'full_body',
      days: [
        {
          day_of_week: 1,
          day_label: 'Segunda-feira',
          is_rest_day: false,
          sessions: [
            {
              session_order: 1,
              name: 'Sessão Teste',
              session_focus: 'full_body',
              exercises: [
                {
                  exercise_id: '00000000-0000-0000-0000-000000000777', // Exercício fantasma inexistente
                  exercise_order: 1,
                  exercise_name: 'Exercício Fantasma',
                  movement_pattern: 'squat',
                  prescribed_sets: 3,
                  min_reps: 8,
                  max_reps: 12,
                },
              ],
            },
          ],
        },
      ],
    };

    await expect(
      db.query(`SELECT public.persist_workout_program_atomic($1::jsonb, false);`, [JSON.stringify(invalidExPayload)])
    ).rejects.toThrow(/INVALID_EXERCISE/);
  });

  it('persist_workout_program_atomic: invocação direta por paciente autenticado deve ser terminantemente rejeitada', async () => {
    const payload = {
      patient_id: PATIENT_A_ID,
      generation_status: 'calculated',
      approval_status: 'draft',
      input_snapshot_hash: 'hash_test',
      output_program_hash: 'hash_test_out',
      objective: 'hypertrophy',
      experience_level: 'intermediate',
      sessions_per_week: 3,
      split_type: 'full_body',
    };

    await asUser(PATIENT_A_ID, async () => {
      await expect(
        db.query(`SELECT public.persist_workout_program_atomic($1::jsonb, false);`, [JSON.stringify(payload)])
      ).rejects.toThrow(/Acesso negado/);
    });
  });
});
