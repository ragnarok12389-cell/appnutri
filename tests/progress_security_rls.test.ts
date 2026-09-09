import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

describe('ETAPA 9: segurança e persistência de progresso', () => {
  let db: PGlite;
  const NUTRITIONIST = '22222222-2222-4222-a222-222222222222';
  const INFLUENCER = '33333333-3333-4333-a333-333333333333';
  const PATIENT_A = '55555555-5555-4555-a555-555555555555';
  const PATIENT_B = '66666666-6666-4666-a666-666666666666';

  async function asUser<T>(userId: string, callback: () => Promise<T>): Promise<T> {
    await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.sub" = '${userId}'; SET "request.jwt.claim.role" = 'authenticated';`);
    try {
      return await callback();
    } finally {
      await db.exec('RESET ROLE; RESET "request.jwt.claim.sub"; RESET "request.jwt.claim.role";');
    }
  }

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (
        id UUID PRIMARY KEY, email TEXT UNIQUE, email_confirmed_at TIMESTAMPTZ,
        confirmed_at TIMESTAMPTZ, raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      CREATE FUNCTION auth.role() RETURNS TEXT LANGUAGE sql STABLE AS $$
        SELECT COALESCE(current_setting('request.jwt.claim.role', true), 'authenticated')
      $$;
      CREATE ROLE authenticated;
      CREATE ROLE anon;
      CREATE ROLE service_role;
    `);

    const migrationsDir = path.resolve(__dirname, '../supabase/migrations');
    for (const file of fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
      await db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf-8'));
    }

    await db.exec(`
      GRANT USAGE ON SCHEMA public TO authenticated, service_role;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data) VALUES
        ('${NUTRITIONIST}', 'nutritionist@progress.test', NOW(), '{"full_name":"Nutricionista"}'),
        ('${INFLUENCER}', 'influencer@progress.test', NOW(), '{"full_name":"Influenciador"}'),
        ('${PATIENT_A}', 'patient-a@progress.test', NOW(), '{"full_name":"Paciente A"}'),
        ('${PATIENT_B}', 'patient-b@progress.test', NOW(), '{"full_name":"Paciente B"}');

      UPDATE public.profiles SET role_id = 'nutritionist', status = 'active' WHERE id = '${NUTRITIONIST}';
      UPDATE public.profiles SET role_id = 'influencer', status = 'active' WHERE id = '${INFLUENCER}';
      DELETE FROM public.patients WHERE id IN ('${NUTRITIONIST}', '${INFLUENCER}');
      INSERT INTO public.professional_profiles (id, professional_type, license_number)
      VALUES ('${NUTRITIONIST}', 'nutritionist', 'CRN-9000'), ('${INFLUENCER}', 'influencer', NULL);
      INSERT INTO public.professional_patient_links (professional_id, patient_id, status)
      VALUES ('${NUTRITIONIST}', '${PATIENT_A}', 'active'), ('${INFLUENCER}', '${PATIENT_A}', 'active');
    `);
  });

  it('permite check-in próprio e bloqueia inserção cross-tenant', async () => {
    const own = await asUser(PATIENT_A, () => db.query<{ id: string }>(`
      INSERT INTO public.patient_check_ins (patient_id, check_in_date, weight_kg, hunger_level)
      VALUES ('${PATIENT_A}', CURRENT_DATE, 80, 4) RETURNING id
    `));
    expect(own.rows).toHaveLength(1);

    await asUser(PATIENT_B, async () => {
      await expect(db.query(`
        INSERT INTO public.patient_check_ins (patient_id, check_in_date, weight_kg)
        VALUES ('${PATIENT_A}', CURRENT_DATE - 1, 70)
      `)).rejects.toThrow();
    });
  });

  it('protege check-ins contra update e delete', async () => {
    await asUser(PATIENT_A, async () => {
      const updated = await db.query(`UPDATE public.patient_check_ins SET weight_kg = 50 WHERE patient_id = '${PATIENT_A}'`);
      expect(updated.rowCount).toBe(0);
      const deleted = await db.query(`DELETE FROM public.patient_check_ins WHERE patient_id = '${PATIENT_A}'`);
      expect(deleted.rowCount).toBe(0);
    });
    await expect(db.query(`UPDATE public.patient_check_ins SET weight_kg = 50 WHERE patient_id = '${PATIENT_A}'`))
      .rejects.toThrow(/append-only/);
  });

  it('persiste análise e propostas de forma idempotente', async () => {
    const call = () => db.query<{ persist_progress_analysis_atomic: string }>(`
      SELECT public.persist_progress_analysis_atomic(
        '${PATIENT_A}', CURRENT_DATE - 27, CURRENT_DATE,
        '1.0.0', 'progress-config-1.0.0', repeat('a', 64), repeat('b', 64),
        '{"check_ins":[]}'::jsonb, '{"check_in_count":1}'::jsonb,
        ARRAY['RECURRING_HIGH_HUNGER'], 'partial',
        '[{"domain":"nutrition","proposal_type":"review_meal_satiety","priority":"medium","reason_codes":["RECURRING_HIGH_HUNGER"],"summary":"Revisar saciedade."}]'::jsonb,
        ARRAY[]::uuid[]
      )
    `);
    const first = await call();
    const second = await call();
    expect(first.rows[0].persist_progress_analysis_atomic).toBe(second.rows[0].persist_progress_analysis_atomic);

    const analyses = await db.query(`SELECT id FROM public.progress_analyses WHERE patient_id = '${PATIENT_A}'`);
    const proposals = await db.query(`SELECT id FROM public.adjustment_proposals WHERE patient_id = '${PATIENT_A}'`);
    expect(analyses.rows).toHaveLength(1);
    expect(proposals.rows).toHaveLength(1);
  });

  it('permite leitura ao profissional vinculado e bloqueia outro paciente', async () => {
    const linked = await asUser(NUTRITIONIST, () => db.query(`SELECT id FROM public.progress_analyses WHERE patient_id = '${PATIENT_A}'`));
    const otherPatient = await asUser(PATIENT_B, () => db.query(`SELECT id FROM public.progress_analyses WHERE patient_id = '${PATIENT_A}'`));
    const influencer = await asUser(INFLUENCER, () => db.query(`SELECT id FROM public.progress_analyses WHERE patient_id = '${PATIENT_A}'`));
    expect(linked.rows).toHaveLength(1);
    expect(otherPatient.rows).toHaveLength(0);
    expect(influencer.rows).toHaveLength(0);
  });

  it('aceita revisão nutricional vinculada e recusa autoridade do influencer', async () => {
    const proposal = await db.query<{ id: string }>(`SELECT id FROM public.adjustment_proposals WHERE patient_id = '${PATIENT_A}'`);
    const proposalId = proposal.rows[0].id;

    await expect(db.query(`SELECT public.review_adjustment_proposal('${proposalId}', '${INFLUENCER}', 'dismissed', NULL)`))
      .rejects.toThrow(/not authorized/);

    const reviewed = await db.query<{ review_adjustment_proposal: boolean }>(`
      SELECT public.review_adjustment_proposal('${proposalId}', '${NUTRITIONIST}', 'accepted_for_review', 'Avaliar rotina alimentar')
    `);
    expect(reviewed.rows[0].review_adjustment_proposal).toBe(true);
  });

  it('não permite que nutricionista decida proposta de treino', async () => {
    await db.query(`
      SELECT public.persist_progress_analysis_atomic(
        '${PATIENT_A}', CURRENT_DATE - 27, CURRENT_DATE,
        '1.0.0', 'progress-config-1.0.0', repeat('c', 64), repeat('d', 64),
        '{"feedback_events":[]}'::jsonb, '{"workouts_completed":1}'::jsonb,
        ARRAY['RECURRING_INCOMPLETE_WORKOUTS'], 'partial',
        '[{"domain":"workout","proposal_type":"review_workout_adherence","priority":"medium","reason_codes":["RECURRING_INCOMPLETE_WORKOUTS"],"summary":"Revisar treino."}]'::jsonb,
        ARRAY[]::uuid[]
      )
    `);
    const proposal = await db.query<{ id: string }>(`
      SELECT id FROM public.adjustment_proposals
      WHERE patient_id = '${PATIENT_A}' AND domain = 'workout'
    `);

    await expect(db.query(`
      SELECT public.review_adjustment_proposal(
        '${proposal.rows[0].id}', '${NUTRITIONIST}', 'accepted_for_review', NULL
      )
    `)).rejects.toThrow(/not authorized/);
  });

  it('mantém RPCs derivadas indisponíveis para authenticated', async () => {
    const grants = await db.query<{ grantee: string }>(`
      SELECT grantee FROM information_schema.routine_privileges
      WHERE routine_schema = 'public'
        AND routine_name IN ('persist_progress_analysis_atomic', 'review_adjustment_proposal')
        AND grantee IN ('PUBLIC', 'authenticated', 'anon')
    `);
    expect(grants.rows).toHaveLength(0);
  });
});
