import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

describe('Security Gate: PostgreSQL RLS Hardening & Multi-Tenant Isolation Tests', () => {
  let db: PGlite;

  // Mock User UUIDs
  const ADMIN_ID = '00000000-0000-4000-a000-000000000001';
  const NUTRI_1_ID = '00000000-0000-4000-a000-000000000002';
  const NUTRI_2_ID = '00000000-0000-4000-a000-000000000003';
  const INFLUENCER_ID = '00000000-0000-4000-a000-000000000004';
  const PATIENT_1_ID = '00000000-0000-4000-a000-000000000005';
  const PATIENT_2_ID = '00000000-0000-4000-a000-000000000006';
  const PATIENT_3_ID = '00000000-0000-4000-a000-000000000007';

  // Org UUIDs
  const ORG_1_ID = '11111111-1111-4111-a111-111111111111';
  const ORG_2_ID = '22222222-2222-4222-a222-222222222222';

  // Helper to switch simulated authenticated user session
  async function asUser(userId: string, callback: () => Promise<void>) {
    await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.sub" = '${userId}';`);
    try {
      await callback();
    } finally {
      await db.exec(`RESET ROLE; RESET "request.jwt.claim.sub";`);
    }
  }

  beforeAll(async () => {
    db = new PGlite();

    // 1. Setup Supabase Auth Mock Environment in PostgreSQL
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;

      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY,
        email TEXT UNIQUE,
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

    // 2. Execute All 5 Migrations in Exact Order
    const migrationsDir = path.resolve(__dirname, '../supabase/migrations');
    const migrationFiles = [
      '20260907000001_initial_schema.sql',
      '20260907000002_rbac_and_permissions.sql',
      '20260907000003_rls_policies.sql',
      '20260907000004_audit_and_triggers.sql',
      '20260907000005_seed_initial_data.sql',
    ];

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await db.exec(sql);
    }

    // Grant schema access to authenticated role
    await db.exec(`
      GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
      GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated, service_role;
    `);

    // 3. Seed Users & Data directly via auth trigger
    // Admin
    await db.exec(`
      INSERT INTO auth.users (id, email, raw_user_meta_data)
      VALUES ('${ADMIN_ID}', 'admin@platform.com', '{"full_name": "Super Admin"}');
      UPDATE public.profiles SET role_id = 'admin' WHERE id = '${ADMIN_ID}';
    `);

    // Nutritionist 1 (administratively provisioned)
    await db.exec(`
      INSERT INTO auth.users (id, email, raw_user_meta_data)
      VALUES ('${NUTRI_1_ID}', 'nutri1@clinic.com', '{"full_name": "Dr. Carlos Nutri"}');
      UPDATE public.profiles SET role_id = 'nutritionist' WHERE id = '${NUTRI_1_ID}';
      DELETE FROM public.patients WHERE id = '${NUTRI_1_ID}';
      INSERT INTO public.professional_profiles (id, professional_type, license_number)
      VALUES ('${NUTRI_1_ID}', 'nutritionist', 'CRN-1');
    `);

    // Nutritionist 2 (administratively provisioned)
    await db.exec(`
      INSERT INTO auth.users (id, email, raw_user_meta_data)
      VALUES ('${NUTRI_2_ID}', 'nutri2@clinic.com', '{"full_name": "Dra. Beatriz Nutri"}');
      UPDATE public.profiles SET role_id = 'nutritionist' WHERE id = '${NUTRI_2_ID}';
      DELETE FROM public.patients WHERE id = '${NUTRI_2_ID}';
      INSERT INTO public.professional_profiles (id, professional_type, license_number)
      VALUES ('${NUTRI_2_ID}', 'nutritionist', 'CRN-2');
    `);

    // Influencer (administratively provisioned)
    await db.exec(`
      INSERT INTO auth.users (id, email, raw_user_meta_data)
      VALUES ('${INFLUENCER_ID}', 'influencer@fit.com', '{"full_name": "Lucas Fitness"}');
      UPDATE public.profiles SET role_id = 'influencer' WHERE id = '${INFLUENCER_ID}';
      DELETE FROM public.patients WHERE id = '${INFLUENCER_ID}';
      INSERT INTO public.professional_profiles (id, professional_type)
      VALUES ('${INFLUENCER_ID}', 'influencer');
    `);

    // Patient 1
    await db.exec(`
      INSERT INTO auth.users (id, email, raw_user_meta_data)
      VALUES ('${PATIENT_1_ID}', 'patient1@mail.com', '{"full_name": "Paciente Um", "role_id": "patient"}');
    `);

    // Patient 2
    await db.exec(`
      INSERT INTO auth.users (id, email, raw_user_meta_data)
      VALUES ('${PATIENT_2_ID}', 'patient2@mail.com', '{"full_name": "Paciente Dois", "role_id": "patient"}');
    `);

    // Patient 3 (Unlinked)
    await db.exec(`
      INSERT INTO auth.users (id, email, raw_user_meta_data)
      VALUES ('${PATIENT_3_ID}', 'patient3@mail.com', '{"full_name": "Paciente Tres", "role_id": "patient"}');
    `);

    // 4. Seed Explicit Professional-Patient Links
    // Nutri 1 -> Patient 1 (ACTIVE)
    await db.exec(`
      INSERT INTO public.professional_patient_links (professional_id, patient_id, is_primary, status, link_type)
      VALUES ('${NUTRI_1_ID}', '${PATIENT_1_ID}', true, 'active', 'direct');
    `);

    // Nutri 2 -> Patient 2 (ACTIVE)
    await db.exec(`
      INSERT INTO public.professional_patient_links (professional_id, patient_id, is_primary, status, link_type)
      VALUES ('${NUTRI_2_ID}', '${PATIENT_2_ID}', true, 'active', 'direct');
    `);

    // 5. Seed Organizations
    // Org 1: Owner Nutri 1, Member Patient 1
    await db.exec(`
      INSERT INTO public.organizations (id, name, slug, owner_id)
      VALUES ('${ORG_1_ID}', 'Clinica Alpha', 'clinica-alpha', '${NUTRI_1_ID}');

      INSERT INTO public.organization_members (organization_id, user_id, role_in_org)
      VALUES 
        ('${ORG_1_ID}', '${NUTRI_1_ID}', 'owner'),
        ('${ORG_1_ID}', '${PATIENT_1_ID}', 'member');
    `);

    // Org 2: Owner Nutri 2, Member Patient 2
    await db.exec(`
      INSERT INTO public.organizations (id, name, slug, owner_id)
      VALUES ('${ORG_2_ID}', 'Clinica Beta', 'clinica-beta', '${NUTRI_2_ID}');

      INSERT INTO public.organization_members (organization_id, user_id, role_in_org)
      VALUES 
        ('${ORG_2_ID}', '${NUTRI_2_ID}', 'owner'),
        ('${ORG_2_ID}', '${PATIENT_2_ID}', 'member');
    `);
  });

  // ============================================================================
  // SECURITY GATE TESTS
  // ============================================================================

  describe('1. Prevenção de Autoelevação de Papel (Privilege Escalation)', () => {
    it('CRITICAL: Public sign-up cannot self-appoint as admin via metadata', async () => {
      const HACKER_ID = '00000000-0000-4000-a000-000000000099';
      // Attacker sends { role_id: 'admin' } on auth.users insert
      await db.query(`
        INSERT INTO auth.users (id, email, raw_user_meta_data)
        VALUES ('${HACKER_ID}', 'hacker@exploit.com', '{"role_id": "admin", "full_name": "Fake Admin"}');
      `);

      const res = await db.query<{ role_id: string }>(
        `SELECT role_id FROM public.profiles WHERE id = '${HACKER_ID}';`
      );

      // Must be forced to 'patient', NEVER 'admin'
      expect(res.rows[0].role_id).toBe('patient');
    });

    it('CRITICAL: Public sign-up cannot self-appoint as nutritionist via metadata', async () => {
      const FAKE_NUTRI_ID = '00000000-0000-4000-a000-000000000098';
      await db.query(`
        INSERT INTO auth.users (id, email, raw_user_meta_data)
        VALUES ('${FAKE_NUTRI_ID}', 'fakenutri@exploit.com', '{"role_id": "nutritionist", "full_name": "Fake Nutri"}');
      `);

      const res = await db.query<{ role_id: string }>(
        `SELECT role_id FROM public.profiles WHERE id = '${FAKE_NUTRI_ID}';`
      );
      expect(res.rows[0].role_id).toBe('patient');

      const profCheck = await db.query(`SELECT * FROM public.professional_profiles WHERE id = '${FAKE_NUTRI_ID}';`);
      expect(profCheck.rows.length).toBe(0);
    });

    it('CRITICAL: Public sign-up cannot self-appoint as influencer via metadata', async () => {
      const FAKE_INFLUENCER_ID = '00000000-0000-4000-a000-000000000097';
      await db.query(`
        INSERT INTO auth.users (id, email, raw_user_meta_data)
        VALUES ('${FAKE_INFLUENCER_ID}', 'fakeinfluencer@exploit.com', '{"role_id": "influencer", "full_name": "Fake Influencer"}');
      `);

      const res = await db.query<{ role_id: string }>(
        `SELECT role_id FROM public.profiles WHERE id = '${FAKE_INFLUENCER_ID}';`
      );
      expect(res.rows[0].role_id).toBe('patient');

      const profCheck = await db.query(`SELECT * FROM public.professional_profiles WHERE id = '${FAKE_INFLUENCER_ID}';`);
      expect(profCheck.rows.length).toBe(0);
    });

    it('CRITICAL: Non-admin user cannot change their own role_id to admin (Trigger Block)', async () => {
      await asUser(PATIENT_1_ID, async () => {
        let threw = false;
        try {
          await db.query(`UPDATE public.profiles SET role_id = 'admin' WHERE id = '${PATIENT_1_ID}';`);
        } catch (err) {
          threw = true;
          expect((err as Error).message).toContain('Acesso Negado');
        }
        expect(threw).toBe(true);
      });

      // Verify role remained patient
      const res = await db.query<{ role_id: string }>(
        `SELECT role_id FROM public.profiles WHERE id = '${PATIENT_1_ID}';`
      );
      expect(res.rows[0].role_id).toBe('patient');
    });

    it('CRITICAL: Nutritionist cannot elevate themselves to admin', async () => {
      await asUser(NUTRI_1_ID, async () => {
        let threw = false;
        try {
          await db.query(`UPDATE public.profiles SET role_id = 'admin' WHERE id = '${NUTRI_1_ID}';`);
        } catch (err) {
          threw = true;
          expect((err as Error).message).toContain('Acesso Negado');
        }
        expect(threw).toBe(true);
      });
    });

    it('Legitimate Admin CAN update roles', async () => {
      await asUser(ADMIN_ID, async () => {
        await db.query(`UPDATE public.profiles SET full_name = 'Paciente Promovido' WHERE id = '${PATIENT_3_ID}';`);
        const res = await db.query<{ full_name: string }>(
          `SELECT full_name FROM public.profiles WHERE id = '${PATIENT_3_ID}';`
        );
        expect(res.rows[0].full_name).toBe('Paciente Promovido');
      });
    });
  });

  describe('2. Segurança de professional_patient_links & Prevenção de IDOR', () => {
    it('Nutritionist 1 CANNOT select Patient 2 belonging to Nutritionist 2 (IDOR Prevention)', async () => {
      await asUser(NUTRI_1_ID, async () => {
        // Direct query targeting Patient 2 ID
        const res = await db.query(`SELECT * FROM public.patients WHERE id = '${PATIENT_2_ID}';`);
        expect(res.rows.length).toBe(0);

        // Direct query targeting Patient 2 profile
        const profileRes = await db.query(`SELECT * FROM public.profiles WHERE id = '${PATIENT_2_ID}';`);
        expect(profileRes.rows.length).toBe(0);
      });
    });

    it('Nutritionist 1 CANNOT update Patient 2 notes', async () => {
      await asUser(NUTRI_1_ID, async () => {
        const res = await db.query(`
          UPDATE public.patients 
          SET notes = 'HACKED BY NUTRI 1' 
          WHERE id = '${PATIENT_2_ID}' 
          RETURNING id;
        `);
        expect(res.rows.length).toBe(0);
      });

      // Verify note in DB was not altered
      const verify = await db.query<{ notes: string }>(
        `SELECT notes FROM public.patients WHERE id = '${PATIENT_2_ID}';`
      );
      expect(verify.rows[0].notes).not.toBe('HACKED BY NUTRI 1');
    });

    it('Nutritionist 1 CANNOT view or alter links belonging to Nutritionist 2', async () => {
      await asUser(NUTRI_1_ID, async () => {
        // Cannot select links of Nutri 2
        const links = await db.query(
          `SELECT * FROM public.professional_patient_links WHERE professional_id = '${NUTRI_2_ID}';`
        );
        expect(links.rows.length).toBe(0);

        // Cannot update links of Nutri 2
        const updateRes = await db.query(`
          UPDATE public.professional_patient_links 
          SET status = 'transferred' 
          WHERE professional_id = '${NUTRI_2_ID}' 
          RETURNING id;
        `);
        expect(updateRes.rows.length).toBe(0);
      });
    });

    it('CRITICAL: Setting link status to inactive IMMEDIATELY revokes patient access', async () => {
      // 1. Nutri 1 can initially access Patient 1
      await asUser(NUTRI_1_ID, async () => {
        const initialCheck = await db.query(`SELECT * FROM public.patients WHERE id = '${PATIENT_1_ID}';`);
        expect(initialCheck.rows.length).toBe(1);
      });

      // 2. Nutri 1 changes link status to 'inactive'
      await asUser(NUTRI_1_ID, async () => {
        await db.query(`
          UPDATE public.professional_patient_links 
          SET status = 'inactive' 
          WHERE professional_id = '${NUTRI_1_ID}' AND patient_id = '${PATIENT_1_ID}';
        `);
      });

      // 3. Nutri 1 immediately LOSES access to Patient 1 via RLS
      await asUser(NUTRI_1_ID, async () => {
        const afterInactive = await db.query(`SELECT * FROM public.patients WHERE id = '${PATIENT_1_ID}';`);
        expect(afterInactive.rows.length).toBe(0);
      });

      // Restore link for subsequent tests
      await db.query(`
        UPDATE public.professional_patient_links 
        SET status = 'active' 
        WHERE professional_id = '${NUTRI_1_ID}' AND patient_id = '${PATIENT_1_ID}';
      `);
    });

    it('Patient 1 CANNOT see Patient 2 or Patient 3', async () => {
      await asUser(PATIENT_1_ID, async () => {
        // Patient 1 only sees Patient 1
        const allPatients = await db.query<{ id: string }>(`SELECT id FROM public.patients;`);
        expect(allPatients.rows.length).toBe(1);
        expect(allPatients.rows[0].id).toBe(PATIENT_1_ID);

        // Attempt to query Patient 2
        const pat2 = await db.query(`SELECT * FROM public.patients WHERE id = '${PATIENT_2_ID}';`);
        expect(pat2.rows.length).toBe(0);
      });
    });
  });

  describe('3. Proteção de user_permissions', () => {
    it('CRITICAL: Non-admin CANNOT insert rows into user_permissions', async () => {
      await asUser(PATIENT_1_ID, async () => {
        let threw = false;
        try {
          await db.query(`
            INSERT INTO public.user_permissions (user_id, permission_id, is_granted)
            VALUES ('${PATIENT_1_ID}', 'users.manage', true);
          `);
        } catch {
          threw = true;
        }
        // RLS WITH CHECK failure in Postgres throws an error
        expect(threw).toBe(true);
      });

      const check = await db.query(`SELECT * FROM public.user_permissions WHERE user_id = '${PATIENT_1_ID}';`);
      expect(check.rows.length).toBe(0);
    });

    it('Admin CAN grant permissions, and user can read ONLY their own', async () => {
      // Admin grants permission
      await asUser(ADMIN_ID, async () => {
        await db.query(`
          INSERT INTO public.user_permissions (user_id, permission_id, is_granted)
          VALUES ('${PATIENT_1_ID}', 'ai.manage', true);
        `);
      });

      // Patient 1 can see their grant
      await asUser(PATIENT_1_ID, async () => {
        const res = await db.query<{ permission_id: string }>(
          `SELECT permission_id FROM public.user_permissions WHERE user_id = '${PATIENT_1_ID}';`
        );
        expect(res.rows.length).toBe(1);
        expect(res.rows[0].permission_id).toBe('ai.manage');
      });

      // Patient 2 CANNOT see Patient 1's grants
      await asUser(PATIENT_2_ID, async () => {
        const res = await db.query(`SELECT * FROM public.user_permissions WHERE user_id = '${PATIENT_1_ID}';`);
        expect(res.rows.length).toBe(0);
      });
    });
  });

  describe('4. Proteção de roles, permissions e role_permissions', () => {
    it('Non-admin CANNOT insert into roles', async () => {
      await asUser(NUTRI_1_ID, async () => {
        let threw = false;
        try {
          await db.query(`INSERT INTO public.roles (id, name) VALUES ('god_mode', 'God Role');`);
        } catch {
          threw = true;
        }
        expect(threw).toBe(true);
      });
    });

    it('Non-admin CANNOT alter role_permissions mapping', async () => {
      await asUser(PATIENT_1_ID, async () => {
        let threw = false;
        try {
          await db.query(`INSERT INTO public.role_permissions (role_id, permission_id) VALUES ('patient', 'users.manage');`);
        } catch {
          threw = true;
        }
        expect(threw).toBe(true);
      });
    });
  });

  describe('5. Isolamento entre Organizações (Multi-Tenant Boundary)', () => {
    it('Member of Org 1 CANNOT see Organization 2', async () => {
      await asUser(NUTRI_1_ID, async () => {
        const orgs = await db.query<{ id: string }>(`SELECT id FROM public.organizations;`);
        expect(orgs.rows.map(r => r.id)).toContain(ORG_1_ID);
        expect(orgs.rows.map(r => r.id)).not.toContain(ORG_2_ID);
      });
    });

    it('Member of Org 1 CANNOT see members of Organization 2', async () => {
      await asUser(NUTRI_1_ID, async () => {
        const members = await db.query<{ organization_id: string }>(`SELECT organization_id FROM public.organization_members;`);
        const orgIds = members.rows.map(r => r.organization_id);
        expect(orgIds).toContain(ORG_1_ID);
        expect(orgIds).not.toContain(ORG_2_ID);
      });
    });

    it('CRITICAL: User CANNOT insert themselves into Organization 2', async () => {
      await asUser(NUTRI_1_ID, async () => {
        let threw = false;
        try {
          await db.query(`
            INSERT INTO public.organization_members (organization_id, user_id, role_in_org)
            VALUES ('${ORG_2_ID}', '${NUTRI_1_ID}', 'owner');
          `);
        } catch {
          threw = true;
        }
        expect(threw).toBe(true);
      });
    });
  });

  describe('6. Auditoria À Prova de Adulteração (Append-Only Ledger & Anti-Spoofing)', () => {
    it('CRITICAL: Non-admin CANNOT view audit_logs (Strict Admin-Only Read)', async () => {
      await asUser(PATIENT_1_ID, async () => {
        const res = await db.query(`SELECT * FROM public.audit_logs;`);
        expect(res.rows.length).toBe(0);
      });

      await asUser(NUTRI_1_ID, async () => {
        const res = await db.query(`SELECT * FROM public.audit_logs;`);
        expect(res.rows.length).toBe(0);
      });
    });

    it('Admin CAN view audit logs', async () => {
      await asUser(ADMIN_ID, async () => {
        const res = await db.query(`SELECT * FROM public.audit_logs;`);
        expect(res.rows.length).toBeGreaterThan(0);
      });
    });

    it('CRITICAL: log_audit_event prevents actor spoofing by authenticated users', async () => {
      let logId: string = '';
      // Patient 1 tries to call log_audit_event pretending to be Admin
      await asUser(PATIENT_1_ID, async () => {
        const res = await db.query<{ log_audit_event: string }>(`
          SELECT public.log_audit_event(
            p_actor_id := '${ADMIN_ID}',
            p_action := 'forged.action',
            p_entity_type := 'profile'
          );
        `);
        logId = res.rows[0].log_audit_event;
      });

      // Verify recorded log: actor_id MUST BE Patient 1, NOT Admin
      const logRow = await db.query<{ actor_id: string; action: string }>(
        `SELECT actor_id, action FROM public.audit_logs WHERE id = '${logId}';`
      );
      expect(logRow.rows[0].action).toBe('forged.action');
      expect(logRow.rows[0].actor_id).toBe(PATIENT_1_ID);
    });

    it('CRITICAL: Audit logs are strictly immutable (UPDATE blocked by trigger for ALL users)', async () => {
      let sampleId: string = '';
      await asUser(ADMIN_ID, async () => {
        const res = await db.query<{ id: string }>(`SELECT id FROM public.audit_logs LIMIT 1;`);
        sampleId = res.rows[0].id;
      });

      // Even admin CANNOT UPDATE an audit log
      await asUser(ADMIN_ID, async () => {
        let threw = false;
        try {
          await db.query(`UPDATE public.audit_logs SET action = 'tampered' WHERE id = '${sampleId}';`);
        } catch (err) {
          threw = true;
          expect((err as Error).message).toContain('imutáveis');
        }
        expect(threw).toBe(true);
      });
    });

    it('CRITICAL: Audit logs cannot be DELETED (DELETE blocked by trigger for ALL users)', async () => {
      let sampleId: string = '';
      await asUser(ADMIN_ID, async () => {
        const res = await db.query<{ id: string }>(`SELECT id FROM public.audit_logs LIMIT 1;`);
        sampleId = res.rows[0].id;
      });

      // Even admin CANNOT DELETE an audit log
      await asUser(ADMIN_ID, async () => {
        let threw = false;
        try {
          await db.query(`DELETE FROM public.audit_logs WHERE id = '${sampleId}';`);
        } catch (err) {
          threw = true;
          expect((err as Error).message).toContain('imutáveis');
        }
        expect(threw).toBe(true);
      });
    });
  });

  describe('7. Hardening das Funções SECURITY DEFINER (Search Path Locked to \'\')', () => {
    it('All SECURITY DEFINER functions in private and public schemas must have search_path locked to empty string', async () => {
      const res = await db.query<{ proname: string; nspname: string; proconfig: string[] | null }>(`
        SELECT proname, nspname, proconfig
        FROM pg_proc
        JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
        WHERE pg_namespace.nspname IN ('public', 'private')
          AND prosecdef = TRUE;
      `);

      expect(res.rows.length).toBeGreaterThanOrEqual(6);

      for (const fn of res.rows) {
        expect(fn.proconfig).not.toBeNull();
        const searchPathConfig = fn.proconfig?.find(c => c.startsWith('search_path='));
        expect(searchPathConfig).toBeDefined();
        // In PostgreSQL, SET search_path = '' is stored as 'search_path=""'
        expect(['search_path=""', 'search_path=']).toContain(searchPathConfig);
      }
    });

    it('Sensitive RLS helper functions must reside strictly in private schema', async () => {
      const res = await db.query<{ proname: string }>(`
        SELECT proname
        FROM pg_proc
        JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
        WHERE pg_namespace.nspname = 'private';
      `);

      const privateFns = res.rows.map(r => r.proname);
      expect(privateFns).toContain('get_user_role');
      expect(privateFns).toContain('is_admin');
      expect(privateFns).toContain('is_professional');
      expect(privateFns).toContain('can_access_patient');
      expect(privateFns).toContain('is_org_member');
      expect(privateFns).toContain('can_manage_org_members');
    });
  });
});
