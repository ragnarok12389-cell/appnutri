import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

describe('ETAPA 8: AI Companion — Segurança, RLS, Imutabilidade e Governança de Conversas', () => {
  let db: PGlite;

  const ADMIN_ID = '11111111-1111-4111-a111-111111111111';
  const NUTRI_A_ID = '22222222-2222-4222-a222-222222222222';
  const PATIENT_A_ID = '55555555-5555-4555-a555-555555555555';
  const PATIENT_B_ID = '66666666-6666-4666-a666-666666666666';

  let CONVERSATION_A_ID: string;

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

    // Mock Supabase Auth
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

    // Executar Todas as 17 Migrações
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
      '20260909000017_ai_companion_and_orchestration.sql',
      '20260909000018_ai_companion_runtime_hardening.sql',
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

    // Inserir Usuários
    await db.exec(`
      -- Admin
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${ADMIN_ID}', 'admin@ai.com', NOW(), '{"full_name": "Admin Sistema"}');
      UPDATE public.profiles SET role_id = 'admin', is_active = true, status = 'active' WHERE id = '${ADMIN_ID}';

      -- Nutricionista
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${NUTRI_A_ID}', 'nutri@ai.com', NOW(), '{"full_name": "Nutricionista Ana"}');
      UPDATE public.profiles SET role_id = 'nutritionist', is_active = true, status = 'active' WHERE id = '${NUTRI_A_ID}';
      DELETE FROM public.patients WHERE id = '${NUTRI_A_ID}';
      INSERT INTO public.professional_profiles (id, professional_type, license_number)
      VALUES ('${NUTRI_A_ID}', 'nutritionist', 'CRN-54321');

      -- Paciente A
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${PATIENT_A_ID}', 'patientA@ai.com', NOW(), '{"full_name": "Paciente Alpha"}');
      UPDATE public.profiles SET role_id = 'patient', is_active = true, status = 'active' WHERE id = '${PATIENT_A_ID}';

      -- Paciente B
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${PATIENT_B_ID}', 'patientB@ai.com', NOW(), '{"full_name": "Paciente Beta"}');
      UPDATE public.profiles SET role_id = 'patient', is_active = true, status = 'active' WHERE id = '${PATIENT_B_ID}';

      -- Vínculo Nutricionista -> Paciente A
      INSERT INTO public.professional_patient_links (professional_id, patient_id, status)
      VALUES ('${NUTRI_A_ID}', '${PATIENT_A_ID}', 'active');
    `);
  });

  it('Paciente A deve conseguir criar conversa própria no AI Companion', async () => {
    const res = await asUser(PATIENT_A_ID, async () => {
      return await db.query<{ id: string }>(`
        INSERT INTO public.ai_conversations (patient_id, title)
        VALUES ('${PATIENT_A_ID}', 'Minha Conversa')
        RETURNING id;
      `);
    });

    expect(res.rows.length).toBe(1);
    CONVERSATION_A_ID = res.rows[0].id;
    expect(CONVERSATION_A_ID).toBeDefined();
  });

  it('Isolamento Cross-Tenant: Paciente B NÃO enxerga as conversas do Paciente A', async () => {
    const res = await asUser(PATIENT_B_ID, async () => {
      return await db.query('SELECT * FROM public.ai_conversations WHERE id = $1', [CONVERSATION_A_ID]);
    });
    expect(res.rows.length).toBe(0);
  });

  it('Paciente A pode inserir mensagem na sua própria conversa', async () => {
    const msgRes = await asUser(PATIENT_A_ID, async () => {
      return await db.query<{ id: string }>(`
        INSERT INTO public.ai_messages (conversation_id, patient_id, role, content)
        VALUES ('${CONVERSATION_A_ID}', '${PATIENT_A_ID}', 'user', 'Olá assistente!')
        RETURNING id;
      `);
    });

    expect(msgRes.rows.length).toBe(1);
  });

  it('Segurança RLS: Paciente B NÃO consegue inserir mensagens na conversa do Paciente A', async () => {
    await asUser(PATIENT_B_ID, async () => {
      await expect(
        db.query(`
          INSERT INTO public.ai_messages (conversation_id, patient_id, role, content)
          VALUES ('${CONVERSATION_A_ID}', '${PATIENT_B_ID}', 'user', 'Tentativa de injeção cross-tenant')
        `)
      ).rejects.toThrow();
    });
  });

  it('Trigger de Imutabilidade: Mensagens do chat NÃO podem sofrer UPDATE', async () => {
    // Insere mensagem como Paciente A
    const msgRes = await asUser(PATIENT_A_ID, async () => {
      return await db.query<{ id: string }>(`
        INSERT INTO public.ai_messages (conversation_id, patient_id, role, content)
        VALUES ('${CONVERSATION_A_ID}', '${PATIENT_A_ID}', 'user', 'Mensagem original imutável')
        RETURNING id;
      `);
    });
    const msgId = msgRes.rows[0].id;

    // Tentativa de UPDATE deve ser bloqueada pelo trigger de imutabilidade
    await asUser(PATIENT_A_ID, async () => {
      await expect(
        db.query(`
          UPDATE public.ai_messages
          SET content = 'Mensagem alterada maliciosamente'
          WHERE id = '${msgId}'
        `)
      ).rejects.toThrow(/estritamente imutáveis/);
    });
  });

  it('Trigger de Imutabilidade: Mensagens do chat NÃO podem sofrer DELETE direto', async () => {
    const msgRes = await asUser(PATIENT_A_ID, async () => {
      return await db.query<{ id: string }>(`
        INSERT INTO public.ai_messages (conversation_id, patient_id, role, content)
        VALUES ('${CONVERSATION_A_ID}', '${PATIENT_A_ID}', 'user', 'Mensagem que não pode ser apagada')
        RETURNING id;
      `);
    });
    const msgId = msgRes.rows[0].id;

    // Tentativa de DELETE é bloqueada por RLS / Trigger
    const delRes = await asUser(PATIENT_A_ID, async () => {
      return await db.query(`DELETE FROM public.ai_messages WHERE id = '${msgId}'`);
    });
    expect(delRes.rowCount).toBe(0);

    // Mensagem permanece no banco
    const checkRes = await db.query('SELECT * FROM public.ai_messages WHERE id = $1', [msgId]);
    expect(checkRes.rows.length).toBe(1);
  });

  it('Paciente A pode registrar feedback estruturado', async () => {
    const fbRes = await asUser(PATIENT_A_ID, async () => {
      return await db.query<{ id: string }>(`
        INSERT INTO public.ai_feedback_events (
          patient_id, conversation_id, feedback_type, domain, intensity_rating, notes
        ) VALUES (
          '${PATIENT_A_ID}', '${CONVERSATION_A_ID}', 'hunger_satiety', 'nutrition', 4, 'Fome após almoço'
        ) RETURNING id;
      `);
    });

    expect(fbRes.rows.length).toBe(1);
    expect(fbRes.rows[0].id).toBeDefined();
  });

  it('Nutricionista com vínculo ativo PODE visualizar feedbacks do seu paciente', async () => {
    const res = await asUser(NUTRI_A_ID, async () => {
      return await db.query<{ id: string }>(`
        SELECT * FROM public.ai_feedback_events WHERE patient_id = '${PATIENT_A_ID}'
      `);
    });

    expect(res.rows.length).toBeGreaterThan(0);
  });

  it('Rate limit persistente deve permitir exatamente 20 consumos e bloquear o seguinte', async () => {
    const decisions: boolean[] = [];
    for (let index = 0; index < 21; index++) {
      const result = await db.query<{ allowed: boolean }>(`
        SELECT allowed
        FROM public.consume_ai_rate_limit('${PATIENT_A_ID}', 20, 600)
      `);
      decisions.push(result.rows[0].allowed);
    }

    expect(decisions.filter(Boolean)).toHaveLength(20);
    expect(decisions[20]).toBe(false);
  });
});
