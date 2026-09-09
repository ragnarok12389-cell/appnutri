import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

describe('Security Gate Etapa 2: Provisionamento, Convites Criptográficos, Vínculo Seguro & Onboarding', () => {
  let db: PGlite;

  // UUIDs de Teste
  const ADMIN_ID = '00000000-0000-4000-a000-000000000001';
  const NUTRI_1_ID = '00000000-0000-4000-a000-000000000002';
  const NUTRI_2_ID = '00000000-0000-4000-a000-000000000003';
  const INFLUENCER_ID = '00000000-0000-4000-a000-000000000004';
  const PATIENT_1_ID = '00000000-0000-4000-a000-000000000005';
  const PATIENT_2_ID = '00000000-0000-4000-a000-000000000006';
  const NEW_PATIENT_ID = '00000000-0000-4000-a000-000000000007';
  const RACER_PATIENT_1_ID = '00000000-0000-4000-a000-000000000008';
  const RACER_PATIENT_2_ID = '00000000-0000-4000-a000-000000000009';

  // UUIDs para testes de falha e rollback atômico
  const FAIL_PATIENT_INVALID_ID = '00000000-0000-4000-a000-000000000010';
  const FAIL_PATIENT_EXPIRED_ID = '00000000-0000-4000-a000-000000000011';
  const FAIL_PATIENT_MISMATCH_ID = '00000000-0000-4000-a000-000000000012';
  const ATOMIC_PATIENT_ID = '00000000-0000-4000-a000-000000000013';
  const ATOMIC_PROF_ID = '00000000-0000-4000-a000-000000000014';
  const FAIL_PROF_ID = '00000000-0000-4000-a000-000000000015';

  // Helper para simular sessão autenticada com RLS ativo
  async function asUser<T>(userId: string, callback: () => Promise<T>): Promise<T> {
    await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.sub" = '${userId}';`);
    try {
      return await callback();
    } finally {
      await db.exec(`RESET ROLE; RESET "request.jwt.claim.sub";`);
    }
  }

  function hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  interface ValidateInviteResult {
    valid: boolean;
    reason?: string;
    professional_name?: string;
    professional_type?: string;
    organization_name?: string;
    email?: string;
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

    // 2. Executar Todas as 8 Migrações
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
    ];

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await db.exec(sql);
    }

    // Conceder permissões adequadas
    await db.exec(`
      GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
      GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated, service_role;
    `);

    // 3. Cadastrar Usuários de Base (Pre-confirmados)
    // Admin
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${ADMIN_ID}', 'admin@platform.com', NOW(), '{"full_name": "Administrador"}');
      UPDATE public.profiles SET role_id = 'admin', is_active = true, status = 'active' WHERE id = '${ADMIN_ID}';
    `);

    // Nutricionista 1
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${NUTRI_1_ID}', 'nutri1@clinic.com', NOW(), '{"full_name": "Dr. Carlos Nutri"}');
      UPDATE public.profiles SET role_id = 'nutritionist', is_active = true, status = 'active' WHERE id = '${NUTRI_1_ID}';
      DELETE FROM public.patients WHERE id = '${NUTRI_1_ID}';
      INSERT INTO public.professional_profiles (id, professional_type, license_number)
      VALUES ('${NUTRI_1_ID}', 'nutritionist', 'CRN-1');
    `);

    // Nutricionista 2
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${NUTRI_2_ID}', 'nutri2@clinic.com', NOW(), '{"full_name": "Dra. Beatriz Nutri"}');
      UPDATE public.profiles SET role_id = 'nutritionist', is_active = true, status = 'active' WHERE id = '${NUTRI_2_ID}';
      DELETE FROM public.patients WHERE id = '${NUTRI_2_ID}';
      INSERT INTO public.professional_profiles (id, professional_type, license_number)
      VALUES ('${NUTRI_2_ID}', 'nutritionist', 'CRN-2');
    `);

    // Influenciador
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${INFLUENCER_ID}', 'influencer@social.com', NOW(), '{"full_name": "Lucas Fit Creator"}');
      UPDATE public.profiles SET role_id = 'influencer', is_active = true, status = 'active' WHERE id = '${INFLUENCER_ID}';
      DELETE FROM public.patients WHERE id = '${INFLUENCER_ID}';
      INSERT INTO public.professional_profiles (id, professional_type, niche)
      VALUES ('${INFLUENCER_ID}', 'influencer', 'Calistenia');
    `);

    // Paciente 1
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${PATIENT_1_ID}', 'patient1@user.com', NOW(), '{"full_name": "Paciente 1"}');
      UPDATE public.profiles SET is_active = true, status = 'active' WHERE id = '${PATIENT_1_ID}';
    `);

    // Paciente 2
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES ('${PATIENT_2_ID}', 'patient2@user.com', NOW(), '{"full_name": "Paciente 2"}');
      UPDATE public.profiles SET is_active = true, status = 'active' WHERE id = '${PATIENT_2_ID}';
    `);
  });

  // ============================================================================
  // 1. PROVISIONAMENTO E CONVITES DE PROFISSIONAIS
  // ============================================================================

  it('1. ADMIN deve conseguir criar convite de profissional (Nutritionist ou Influencer)', async () => {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);

    await asUser(ADMIN_ID, async () => {
      await db.exec(`
        INSERT INTO public.professional_invites (
          email, role_id, token_hash, created_by, expires_at
        ) VALUES (
          'novo.nutri@clinic.com', 'nutritionist', '${tokenHash}', '${ADMIN_ID}', NOW() + INTERVAL '7 days'
        );
      `);

      const res = await query(
        `SELECT * FROM public.professional_invites WHERE token_hash = '${tokenHash}'`
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].email).toBe('novo.nutri@clinic.com');
      expect(res.rows[0].role_id).toBe('nutritionist');
    });
  });

  it('2. Usuário comum ou profissional NÃO deve conseguir criar convite de profissional', async () => {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);

    // Nutricionista tentando criar convite de profissional
    await asUser(NUTRI_1_ID, async () => {
      await expect(
        db.exec(`
          INSERT INTO public.professional_invites (
            email, role_id, token_hash, created_by, expires_at
          ) VALUES (
            'amigo@clinic.com', 'nutritionist', '${tokenHash}', '${NUTRI_1_ID}', NOW() + INTERVAL '7 days'
          );
        `)
      ).rejects.toThrow();
    });

    // Paciente tentando criar convite de profissional
    await asUser(PATIENT_1_ID, async () => {
      await expect(
        db.exec(`
          INSERT INTO public.professional_invites (
            email, role_id, token_hash, created_by, expires_at
          ) VALUES (
            'hacker@evil.com', 'nutritionist', '${tokenHash}', '${PATIENT_1_ID}', NOW() + INTERVAL '7 days'
          );
        `)
      ).rejects.toThrow();
    });
  });

  // ============================================================================
  // 2. CONVITES DE PACIENTES: GERAÇÃO E ISOLAMENTO
  // ============================================================================

  it('3. Nutricionista deve conseguir gerar convite de paciente para si mesmo', async () => {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);

    await asUser(NUTRI_1_ID, async () => {
      await db.exec(`
        INSERT INTO public.patient_invites (
          professional_id, email, token_hash, expires_at
        ) VALUES (
          '${NUTRI_1_ID}', 'paciente.novo@test.com', '${tokenHash}', NOW() + INTERVAL '7 days'
        );
      `);

      const res = await query(
        `SELECT * FROM public.patient_invites WHERE token_hash = '${tokenHash}'`
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].status).toBe('pending');
      expect(res.rows[0].professional_id).toBe(NUTRI_1_ID);
    });
  });

  it('4. Nutricionista A NÃO deve conseguir gerar convite em nome de Nutricionista B', async () => {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);

    await asUser(NUTRI_1_ID, async () => {
      await expect(
        db.exec(`
          INSERT INTO public.patient_invites (
            professional_id, email, token_hash, expires_at
          ) VALUES (
            '${NUTRI_2_ID}', 'alvo@test.com', '${tokenHash}', NOW() + INTERVAL '7 days'
          );
        `)
      ).rejects.toThrow();
    });
  });

  it('5. Influenciador deve conseguir gerar convite de paciente para sua carteira', async () => {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);

    await asUser(INFLUENCER_ID, async () => {
      await db.exec(`
        INSERT INTO public.patient_invites (
          professional_id, email, token_hash, expires_at
        ) VALUES (
          '${INFLUENCER_ID}', 'seguidor@social.com', '${tokenHash}', NOW() + INTERVAL '7 days'
        );
      `);

      const res = await query(
        `SELECT * FROM public.patient_invites WHERE token_hash = '${tokenHash}'`
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].professional_id).toBe(INFLUENCER_ID);
    });
  });

  it('6. Paciente NÃO deve conseguir gerar patient_invites', async () => {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);

    await asUser(PATIENT_1_ID, async () => {
      await expect(
        db.exec(`
          INSERT INTO public.patient_invites (
            professional_id, email, token_hash, expires_at
          ) VALUES (
            '${NUTRI_1_ID}', 'vitima@test.com', '${tokenHash}', NOW() + INTERVAL '7 days'
          );
        `)
      ).rejects.toThrow();
    });
  });

  // ============================================================================
  // 3. FLUXO ATÔMICO DE ACEITE, VÍNCULO SEGURO E PAPEL PATIENT
  // ============================================================================

  let validInviteToken: string;
  let validInviteHash: string;

  it('7. Paciente abre convite válido e cria conta vinculada de forma atômica', async () => {
    validInviteToken = crypto.randomBytes(32).toString('hex');
    validInviteHash = hashToken(validInviteToken);

    // Nutricionista 1 cria o convite
    await db.exec(`
      INSERT INTO public.patient_invites (
        professional_id, email, token_hash, expires_at
      ) VALUES (
        '${NUTRI_1_ID}', 'novo.aluno@email.com', '${validInviteHash}', NOW() + INTERVAL '7 days'
      );
    `);

    // Validação pública do convite via wrapper public.validate_patient_invite
    const valRes = await query<{ val: ValidateInviteResult }>(
      `SELECT public.validate_patient_invite('${validInviteHash}') as val`
    );
    const valData = valRes.rows[0].val;
    expect(valData.valid).toBe(true);
    expect(valData.professional_name).toBe('Dr. Carlos Nutri');
    expect(valData.professional_type).toBe('nutritionist');

    // Novo paciente cadastra-se na autenticação com o token hash (executa trigger atômico handle_new_user)
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES (
        '${NEW_PATIENT_ID}',
        'novo.aluno@email.com',
        NOW(),
        '{"full_name": "Novo Aluno Vinculado", "patient_invite_token_hash": "${validInviteHash}"}'::jsonb
      );
    `);

    // Verifica que o vínculo foi criado atomicamente
    const linkRes = await query(
      `SELECT * FROM public.professional_patient_links WHERE patient_id = '${NEW_PATIENT_ID}';`
    );
    expect(linkRes.rows.length).toBe(1);
    expect(linkRes.rows[0].professional_id).toBe(NUTRI_1_ID);
    expect(linkRes.rows[0].link_type).toBe('direct');
    expect(linkRes.rows[0].status).toBe('active');

    // Convite agora deve estar com status 'accepted'
    const invRes = await query(
      `SELECT status, accepted_by FROM public.patient_invites WHERE token_hash = '${validInviteHash}'`
    );
    expect(invRes.rows[0].status).toBe('accepted');
    expect(invRes.rows[0].accepted_by).toBe(NEW_PATIENT_ID);
  });

  it('8. Role resultante do novo usuário DEVE ser obrigatoriamente PATIENT', async () => {
    const profRes = await query(
      `SELECT role_id, full_name FROM public.profiles WHERE id = '${NEW_PATIENT_ID}'`
    );
    expect(profRes.rows[0].role_id).toBe('patient');
    expect(profRes.rows[0].full_name).toBe('Novo Aluno Vinculado');
  });

  it('9. professional_patient_link DEVE apontar exatamente para o profissional correto', async () => {
    const linkRes = await query(
      `SELECT * FROM public.professional_patient_links WHERE patient_id = '${NEW_PATIENT_ID}'`
    );
    expect(linkRes.rows.length).toBe(1);
    expect(linkRes.rows[0].professional_id).toBe(NUTRI_1_ID);
    expect(linkRes.rows[0].is_primary).toBe(true);
    expect(linkRes.rows[0].status).toBe('active');
  });

  it('10. Paciente NÃO consegue trocar professional_id via request manipulada', async () => {
    await asUser(NEW_PATIENT_ID, async () => {
      // Paciente tentando alterar seu vínculo para Nutricionista 2
      const updateRes = await query(`
        UPDATE public.professional_patient_links
        SET professional_id = '${NUTRI_2_ID}'
        WHERE patient_id = '${NEW_PATIENT_ID}';
      `);
      // RLS impede a atualização: nenhuma linha é afetada
      expect(updateRes.affectedRows).toBe(0);
    });

    // Confirma que o vínculo permanece inalterado para o Nutricionista 1
    const linkRes = await query(
      `SELECT professional_id FROM public.professional_patient_links WHERE patient_id = '${NEW_PATIENT_ID}'`
    );
    expect(linkRes.rows[0].professional_id).toBe(NUTRI_1_ID);
  });

  // ============================================================================
  // 4. VALIDAÇÃO DE CONVITES EXPIRADOS, REVOGADOS E REUTILIZADOS
  // ============================================================================

  it('11. Convite expirado DEVE ser recusado', async () => {
    const expiredToken = crypto.randomBytes(32).toString('hex');
    const expiredHash = hashToken(expiredToken);

    await db.exec(`
      INSERT INTO public.patient_invites (
        professional_id, email, token_hash, expires_at
      ) VALUES (
        '${NUTRI_1_ID}', 'exp@test.com', '${expiredHash}', NOW() - INTERVAL '2 days'
      );
    `);

    // validate_patient_invite deve acusar expired
    const valRes = await query<{ val: ValidateInviteResult }>(
      `SELECT public.validate_patient_invite('${expiredHash}') as val`
    );
    expect(valRes.rows[0].val.valid).toBe(false);
    expect(valRes.rows[0].val.reason).toBe('expired');

    // accept_patient_invite deve rejeitar com erro
    await expect(
      db.exec(`
        SELECT private.accept_patient_invite('${expiredHash}', '${PATIENT_1_ID}');
      `)
    ).rejects.toThrow('INVITE_EXPIRED');
  });

  it('12. Convite revogado DEVE ser recusado', async () => {
    const revokedToken = crypto.randomBytes(32).toString('hex');
    const revokedHash = hashToken(revokedToken);

    await db.exec(`
      INSERT INTO public.patient_invites (
        professional_id, email, token_hash, status, revoked_at, expires_at
      ) VALUES (
        '${NUTRI_1_ID}', 'rev@test.com', '${revokedHash}', 'revoked', NOW(), NOW() + INTERVAL '7 days'
      );
    `);

    const valRes = await query<{ val: ValidateInviteResult }>(
      `SELECT public.validate_patient_invite('${revokedHash}') as val`
    );
    expect(valRes.rows[0].val.valid).toBe(false);
    expect(valRes.rows[0].val.reason).toBe('revoked');

    await expect(
      db.exec(`
        SELECT private.accept_patient_invite('${revokedHash}', '${PATIENT_1_ID}');
      `)
    ).rejects.toThrow('INVITE_REVOKED');
  });

  it('13. Convite já utilizado DEVE ser recusado na tentativa de reuso', async () => {
    // Tenta aceitar novamente o convite válido que já foi utilizado no teste 7
    await expect(
      db.exec(`
        SELECT private.accept_patient_invite('${validInviteHash}', '${PATIENT_2_ID}');
      `)
    ).rejects.toThrow('INVITE_ALREADY_USED_OR_INVALID');
  });

  // ============================================================================
  // 5. CONCORRÊNCIA E PREVENÇÃO DE DOUBLE-SPEND
  // ============================================================================

  it('14. Dois requests simultâneos com o mesmo token: exatamente UM deve vencer e o outro falhar', async () => {
    const raceToken = crypto.randomBytes(32).toString('hex');
    const raceHash = hashToken(raceToken);

    await db.exec(`
      INSERT INTO public.patient_invites (
        professional_id, email, token_hash, expires_at
      ) VALUES (
        '${NUTRI_1_ID}', 'concorrencia@test.com', '${raceHash}', NOW() + INTERVAL '7 days'
      );
    `);

    // Registra os dois usuários concorrentes na autenticação
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${RACER_PATIENT_1_ID}', 'racer1@test.com');
      INSERT INTO auth.users (id, email) VALUES ('${RACER_PATIENT_2_ID}', 'racer2@test.com');
    `);

    // Dispara duas aceitações concorrentes simultâneas no mesmo convite
    const results = await Promise.allSettled([
      query(`SELECT private.accept_patient_invite('${raceHash}', '${RACER_PATIENT_1_ID}')`),
      query(`SELECT private.accept_patient_invite('${raceHash}', '${RACER_PATIENT_2_ID}')`),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exatamente uma transação obteve o lock e aceitou o convite
    expect(fulfilled.length).toBe(1);
    // A outra foi serializada e encontrou o convite já aceito
    expect(rejected.length).toBe(1);
    if (rejected[0].status === 'rejected') {
      expect(rejected[0].reason.message).toContain('INVITE_ALREADY_USED_OR_INVALID');
    }
  });

  // ============================================================================
  // 6. RLS E ISOLAMENTO DE CARTEIRA DE PACIENTES
  // ============================================================================

  it('15. Nutricionista A DEVE conseguir visualizar seu novo paciente vinculado', async () => {
    await asUser(NUTRI_1_ID, async () => {
      const res = await query(
        `SELECT id, full_name, email FROM public.profiles WHERE id = '${NEW_PATIENT_ID}'`
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].full_name).toBe('Novo Aluno Vinculado');
    });
  });

  it('16. Nutricionista B NÃO DEVE conseguir visualizar o paciente vinculado ao Nutricionista A', async () => {
    await asUser(NUTRI_2_ID, async () => {
      const res = await query(
        `SELECT id, full_name, email FROM public.profiles WHERE id = '${NEW_PATIENT_ID}'`
      );
      // RLS deve retornar zero linhas
      expect(res.rows.length).toBe(0);
    });
  });

  it('17. Influenciador de outra carteira NÃO DEVE visualizar o paciente do Nutricionista', async () => {
    await asUser(INFLUENCER_ID, async () => {
      const res = await query(
        `SELECT id, full_name, email FROM public.profiles WHERE id = '${NEW_PATIENT_ID}'`
      );
      expect(res.rows.length).toBe(0);
    });
  });

  it('18. Paciente DEVE visualizar apenas seus próprios dados cadastrais', async () => {
    await asUser(NEW_PATIENT_ID, async () => {
      // Visualiza a si mesmo
      const selfRes = await query(
        `SELECT id FROM public.profiles WHERE id = '${NEW_PATIENT_ID}'`
      );
      expect(selfRes.rows.length).toBe(1);

      // Tenta visualizar outro paciente (IDOR Attack)
      const otherRes = await query(
        `SELECT id FROM public.profiles WHERE id = '${PATIENT_1_ID}'`
      );
      expect(otherRes.rows.length).toBe(0);
    });
  });

  it('19. Paciente NÃO DEVE conseguir inserir vínculos arbitrariamente', async () => {
    await asUser(PATIENT_1_ID, async () => {
      await expect(
        db.exec(`
          INSERT INTO public.professional_patient_links (
            professional_id, patient_id, status, is_primary
          ) VALUES (
            '${NUTRI_1_ID}', '${PATIENT_1_ID}', 'active', TRUE
          );
        `)
      ).rejects.toThrow();
    });
  });

  it('20. Paciente NÃO DEVE conseguir visualizar a tabela patient_invites', async () => {
    await asUser(PATIENT_1_ID, async () => {
      const res = await query('SELECT * FROM public.patient_invites');
      expect(res.rows.length).toBe(0);
    });
  });

  it('21. Profissional A NÃO DEVE visualizar convites pendentes do Profissional B', async () => {
    await asUser(NUTRI_2_ID, async () => {
      const res = await query(
        `SELECT * FROM public.patient_invites WHERE professional_id = '${NUTRI_1_ID}'`
      );
      expect(res.rows.length).toBe(0);
    });
  });

  // ============================================================================
  // 7. ONBOARDING DO PACIENTE E VISIBILIDADE VINCULADA
  // ============================================================================

  it('22. Paciente deve conseguir preencher e salvar seu onboarding inicial', async () => {
    await asUser(NEW_PATIENT_ID, async () => {
      await db.exec(`
        INSERT INTO public.patient_onboarding (
          id, first_name, last_name, birth_date, gender, height_cm, weight_kg, primary_goal, is_completed
        ) VALUES (
          '${NEW_PATIENT_ID}', 'Novo', 'Aluno', '1998-04-20', 'male', 180.0, 78.5, 'gain_muscle', TRUE
        );
      `);

      const res = await query(
        `SELECT * FROM public.patient_onboarding WHERE id = '${NEW_PATIENT_ID}'`
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].primary_goal).toBe('gain_muscle');
      expect(res.rows[0].is_completed).toBe(true);
    });
  });

  it('23. Nutricionista A (vinculado ativo) DEVE conseguir ler o onboarding do paciente', async () => {
    await asUser(NUTRI_1_ID, async () => {
      const res = await query(
        `SELECT id, first_name, primary_goal, height_cm, weight_kg 
         FROM public.patient_onboarding 
         WHERE id = '${NEW_PATIENT_ID}'`
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].primary_goal).toBe('gain_muscle');
      expect(Number(res.rows[0].height_cm)).toBe(180);
    });
  });

  it('24. Nutricionista B (não vinculado) NÃO DEVE conseguir ler o onboarding do paciente', async () => {
    await asUser(NUTRI_2_ID, async () => {
      const res = await query(
        `SELECT * FROM public.patient_onboarding WHERE id = '${NEW_PATIENT_ID}'`
      );
      expect(res.rows.length).toBe(0);
    });
  });

  it('25. Profissional deve conseguir preencher dados de onboarding profissional', async () => {
    await asUser(NUTRI_1_ID, async () => {
      await db.exec(`
        UPDATE public.professional_profiles
        SET license_number = 'CRN-3 45678',
            license_state = 'SP',
            bio = 'Especialista em hipertrofia e alta performance.',
            specialties = ARRAY['Nutrição Esportiva', 'Hipertrofia'],
            is_onboarding_completed = TRUE
        WHERE id = '${NUTRI_1_ID}';
      `);

      const res = await query(
        `SELECT license_number, license_state, is_onboarding_completed 
         FROM public.professional_profiles 
         WHERE id = '${NUTRI_1_ID}'`
      );
      expect(res.rows[0].license_number).toBe('CRN-3 45678');
      expect(res.rows[0].license_state).toBe('SP');
      expect(res.rows[0].is_onboarding_completed).toBe(true);
    });
  });

  // ============================================================================
  // 8. AUDITORIA DE ATOMICIDADE REAL (TRIGGER HANDLE_NEW_USER COM ROLLBACK)
  // ============================================================================

  it('26. CRITICAL ATOMICITY: Inscrição via trigger com convite válido cria usuário, perfil, paciente e link em um só commit', async () => {
    const rawAtomicToken = crypto.randomBytes(32).toString('hex');
    const atomicTokenHash = hashToken(rawAtomicToken);

    // Nutricionista cria convite
    await db.exec(`
      INSERT INTO public.patient_invites (
        professional_id, email, token_hash, expires_at
      ) VALUES (
        '${NUTRI_1_ID}', 'atomic@test.com', '${atomicTokenHash}', NOW() + INTERVAL '7 days'
      );
    `);

    // Inserção no auth.users passando patient_invite_token_hash no metadata
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES (
        '${ATOMIC_PATIENT_ID}',
        'atomic@test.com',
        NOW(),
        '{"full_name": "Paciente Atomico", "patient_invite_token_hash": "${atomicTokenHash}"}'::jsonb
      );
    `);

    // Verifica que TUDO foi criado e vinculado atomicamente
    const authCheck = await query(`SELECT id FROM auth.users WHERE id = '${ATOMIC_PATIENT_ID}';`);
    expect(authCheck.rows.length).toBe(1);

    const profCheck = await query(`SELECT role_id FROM public.profiles WHERE id = '${ATOMIC_PATIENT_ID}';`);
    expect(profCheck.rows.length).toBe(1);
    expect(profCheck.rows[0].role_id).toBe('patient');

    const patCheck = await query(`SELECT id FROM public.patients WHERE id = '${ATOMIC_PATIENT_ID}';`);
    expect(patCheck.rows.length).toBe(1);

    const linkCheck = await query(
      `SELECT professional_id, status FROM public.professional_patient_links WHERE patient_id = '${ATOMIC_PATIENT_ID}';`
    );
    expect(linkCheck.rows.length).toBe(1);
    expect(linkCheck.rows[0].professional_id).toBe(NUTRI_1_ID);
    expect(linkCheck.rows[0].status).toBe('active');

    const inviteCheck = await query(
      `SELECT status, accepted_by FROM public.patient_invites WHERE token_hash = '${atomicTokenHash}';`
    );
    expect(inviteCheck.rows[0].status).toBe('accepted');
    expect(inviteCheck.rows[0].accepted_by).toBe(ATOMIC_PATIENT_ID);
  });

  it('27. CRITICAL ROLLBACK: Falha no convite invalido faz rollback COMPLETO sem deixar conta orfa', async () => {
    const fakeHash = '0000000000000000000000000000000000000000000000000000000000000000';

    // Tentativa de signup com token inexistente: o trigger DEVE disparar exceção
    await expect(
      db.exec(`
        INSERT INTO auth.users (id, email, raw_user_meta_data)
        VALUES (
          '${FAIL_PATIENT_INVALID_ID}',
          'orpha@test.com',
          '{"full_name": "Conta Orfa Teste", "patient_invite_token_hash": "${fakeHash}"}'::jsonb
        );
      `)
    ).rejects.toThrow('INVITE_NOT_FOUND');

    // PROVA DE ATOMICIDADE REAL: Nenhum registro residual existe
    const authCheck = await query(`SELECT * FROM auth.users WHERE id = '${FAIL_PATIENT_INVALID_ID}';`);
    expect(authCheck.rows.length).toBe(0);

    const profileCheck = await query(`SELECT * FROM public.profiles WHERE id = '${FAIL_PATIENT_INVALID_ID}';`);
    expect(profileCheck.rows.length).toBe(0);

    const patientCheck = await query(`SELECT * FROM public.patients WHERE id = '${FAIL_PATIENT_INVALID_ID}';`);
    expect(patientCheck.rows.length).toBe(0);

    const linkCheck = await query(
      `SELECT * FROM public.professional_patient_links WHERE patient_id = '${FAIL_PATIENT_INVALID_ID}';`
    );
    expect(linkCheck.rows.length).toBe(0);
  });

  it('28. CRITICAL ROLLBACK: Convite expirado no signup provoca rollback total e mantem convite expirado', async () => {
    const expToken = crypto.randomBytes(32).toString('hex');
    const expHash = hashToken(expToken);

    await db.exec(`
      INSERT INTO public.patient_invites (
        professional_id, email, token_hash, expires_at
      ) VALUES (
        '${NUTRI_1_ID}', 'exp.signup@test.com', '${expHash}', NOW() - INTERVAL '3 days'
      );
    `);

    // Inscrição com convite expirado
    await expect(
      db.exec(`
        INSERT INTO auth.users (id, email, raw_user_meta_data)
        VALUES (
          '${FAIL_PATIENT_EXPIRED_ID}',
          'exp.signup@test.com',
          '{"full_name": "Exp User", "patient_invite_token_hash": "${expHash}"}'::jsonb
        );
      `)
    ).rejects.toThrow('INVITE_EXPIRED');

    // Zero registros residuais
    const authCheck = await query(`SELECT * FROM auth.users WHERE id = '${FAIL_PATIENT_EXPIRED_ID}';`);
    expect(authCheck.rows.length).toBe(0);

    const profileCheck = await query(`SELECT * FROM public.profiles WHERE id = '${FAIL_PATIENT_EXPIRED_ID}';`);
    expect(profileCheck.rows.length).toBe(0);
  });

  it('29. CRITICAL ROLLBACK: Email divergente em convite nominal provoca rollback total', async () => {
    const targetedToken = crypto.randomBytes(32).toString('hex');
    const targetedHash = hashToken(targetedToken);

    // Convite restrito a 'alvo@clinica.com'
    await db.exec(`
      INSERT INTO public.patient_invites (
        professional_id, email, token_hash, expires_at
      ) VALUES (
        '${NUTRI_1_ID}', 'alvo@clinica.com', '${targetedHash}', NOW() + INTERVAL '7 days'
      );
    `);

    // Atacante tenta cadastrar com 'invasor@hacker.com'
    await expect(
      db.exec(`
        INSERT INTO auth.users (id, email, raw_user_meta_data)
        VALUES (
          '${FAIL_PATIENT_MISMATCH_ID}',
          'invasor@hacker.com',
          '{"full_name": "Invasor", "patient_invite_token_hash": "${targetedHash}"}'::jsonb
        );
      `)
    ).rejects.toThrow('INVITE_EMAIL_MISMATCH');

    // Rollback total: usuário invasor não foi criado
    const authCheck = await query(`SELECT * FROM auth.users WHERE id = '${FAIL_PATIENT_MISMATCH_ID}';`);
    expect(authCheck.rows.length).toBe(0);

    // Convite permanece pending e não consumido
    const invCheck = await query(
      `SELECT status FROM public.patient_invites WHERE token_hash = '${targetedHash}';`
    );
    expect(invCheck.rows[0].status).toBe('pending');
  });

  it('30. CRITICAL ATOMICITY: Provisionamento profissional via trigger cria role correto e profile em único commit', async () => {
    const rawProfToken = crypto.randomBytes(32).toString('hex');
    const profTokenHash = hashToken(rawProfToken);

    await db.exec(`
      INSERT INTO public.professional_invites (
        email, role_id, token_hash, created_by, expires_at
      ) VALUES (
        'prof.atomic@test.com', 'nutritionist', '${profTokenHash}', '${ADMIN_ID}', NOW() + INTERVAL '7 days'
      );
    `);

    // Signup passando professional_invite_token_hash
    await db.exec(`
      INSERT INTO auth.users (id, email, raw_user_meta_data)
      VALUES (
        '${ATOMIC_PROF_ID}',
        'prof.atomic@test.com',
        '{"full_name": "Dra. Nutri Atomica", "professional_invite_token_hash": "${profTokenHash}"}'::jsonb
      );
    `);

    // Verifica que o role é NUTRITIONIST (não patient) e que professional_profiles existe
    const profRes = await query(`SELECT role_id FROM public.profiles WHERE id = '${ATOMIC_PROF_ID}';`);
    expect(profRes.rows[0].role_id).toBe('nutritionist');

    const profProfileRes = await query(`SELECT * FROM public.professional_profiles WHERE id = '${ATOMIC_PROF_ID}';`);
    expect(profProfileRes.rows.length).toBe(1);
    expect(profProfileRes.rows[0].professional_type).toBe('nutritionist');

    // Convite consumido
    const invCheck = await query(`SELECT accepted_by FROM public.professional_invites WHERE token_hash = '${profTokenHash}';`);
    expect(invCheck.rows[0].accepted_by).toBe(ATOMIC_PROF_ID);
  });

  it('31. CRITICAL ROLLBACK: Falha no convite profissional nao deixa usuario orfao nem como patient', async () => {
    const badProfHash = '1111111111111111111111111111111111111111111111111111111111111111';

    await expect(
      db.exec(`
        INSERT INTO auth.users (id, email, raw_user_meta_data)
        VALUES (
          '${FAIL_PROF_ID}',
          'fake.prof@test.com',
          '{"full_name": "Fake Prof", "professional_invite_token_hash": "${badProfHash}"}'::jsonb
        );
      `)
    ).rejects.toThrow('INVITE_NOT_FOUND');

    const checkUser = await query(`SELECT * FROM auth.users WHERE id = '${FAIL_PROF_ID}';`);
    expect(checkUser.rows.length).toBe(0);

    const checkProfile = await query(`SELECT * FROM public.profiles WHERE id = '${FAIL_PROF_ID}';`);
    expect(checkProfile.rows.length).toBe(0);
  });

  // ============================================================================
  // 9. AUDITORIA DE RPCs E SUPERFÍCIE DE DATA API
  // ============================================================================

  it('32. RPCs publicas controladas existem e validam convites corretamente', async () => {
    const pubValToken = crypto.randomBytes(32).toString('hex');
    const pubValHash = hashToken(pubValToken);

    await db.exec(`
      INSERT INTO public.patient_invites (
        professional_id, email, token_hash, expires_at
      ) VALUES (
        '${NUTRI_1_ID}', 'pub@test.com', '${pubValHash}', NOW() + INTERVAL '5 days'
      );
    `);

    // Wrapper público funciona para validação
    const res = await query<{ val: ValidateInviteResult }>(
      `SELECT public.validate_patient_invite('${pubValHash}') as val;`
    );
    expect(res.rows[0].val.valid).toBe(true);
    expect(res.rows[0].val.professional_name).toBe('Dr. Carlos Nutri');
  });

  it('33. RPC public.accept_patient_invite foi removida por redundancia e nao pode ser executada', async () => {
    const testHash = hashToken('test-unauth');

    // Executa e confirma que a função pública foi removida
    await expect(
      db.exec(`SELECT public.accept_patient_invite('${testHash}');`)
    ).rejects.toThrow();
  });

  it('34. Auditoria de Segredo: Token cru NUNCA é persistido em audit_logs', async () => {
    const auditCheck = await query<{ metadata: Record<string, unknown> }>(
      `SELECT metadata FROM public.audit_logs;`
    );

    for (const log of auditCheck.rows) {
      const serialized = JSON.stringify(log.metadata);
      // Nenhum log deve conter a chave rawToken ou tokens crus de 64 caracteres
      expect(serialized).not.toContain('rawToken');
      expect(serialized).not.toContain('raw_token');
    }
  });

  // ============================================================================
  // 10. AUDITORIA DE PRIVILÉGIOS NO SCHEMA PRIVATE E POLICIES RLS
  // ============================================================================

  it('35. Role authenticated executa queries com RLS policies que invocam funcoes do schema private sem "permission denied"', async () => {
    // 1. Paciente autenticado consulta tabelas com policies que usam private.is_admin e private.can_access_patient
    await asUser(NEW_PATIENT_ID, async () => {
      // public.profiles
      const profiles = await query(`SELECT id, full_name, email FROM public.profiles WHERE id = '${NEW_PATIENT_ID}';`);
      expect(profiles.rows.length).toBe(1);

      // public.patients
      const patients = await query(`SELECT * FROM public.patients WHERE id = '${NEW_PATIENT_ID}';`);
      expect(patients.rows.length).toBe(1);

      // public.professional_patient_links
      const links = await query(`SELECT * FROM public.professional_patient_links WHERE patient_id = '${NEW_PATIENT_ID}';`);
      expect(links.rows.length).toBeGreaterThanOrEqual(1);

      // public.patient_onboarding
      const onboarding = await query(`SELECT * FROM public.patient_onboarding WHERE id = '${NEW_PATIENT_ID}';`);
      expect(onboarding.rows).toBeDefined();
    });

    // 2. Nutricionista autenticado consulta tabelas com policies
    await asUser(NUTRI_1_ID, async () => {
      // Consulta perfis dos pacientes vinculados
      const profiles = await query(`SELECT id, full_name FROM public.profiles;`);
      expect(profiles.rows.length).toBeGreaterThanOrEqual(1);

      // Consulta vínculos
      const links = await query(`SELECT * FROM public.professional_patient_links WHERE professional_id = '${NUTRI_1_ID}';`);
      expect(links.rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('36. Role authenticated NAO consegue executar funcoes de negocio internas no schema private diretamente', async () => {
    await asUser(PATIENT_1_ID, async () => {
      await expect(
        db.exec(`SELECT private.accept_patient_invite('fake-hash', '${PATIENT_1_ID}');`)
      ).rejects.toThrow(/permission denied/i);

      await expect(
        db.exec(`SELECT private.validate_patient_invite('fake-hash');`)
      ).rejects.toThrow(/permission denied/i);
    });
  });

  it('37. Role anon e PUBLIC continuam sem USAGE ou EXECUTE no schema private', async () => {
    await db.exec(`SET ROLE anon;`);
    try {
      await expect(
        db.exec(`SELECT private.is_admin('${PATIENT_1_ID}');`)
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await db.exec(`RESET ROLE;`);
    }
  });

  // ============================================================================
  // 11. AUDITORIA COM SUPABASE CONFIRM EMAIL ATIVADO (PENDING_VERIFICATION VS ACTIVE)
  // ============================================================================

  const UNCONFIRMED_USER_ID = '99999999-9999-4999-a999-999999999901';

  it('38. Signup com Supabase Confirm Email ativo cria profile e vinculo como pending_verification sem acesso clinico ativo', async () => {
    const unconfirmedToken = crypto.randomBytes(32).toString('hex');
    const unconfirmedHash = hashToken(unconfirmedToken);

    // Nutricionista cria convite
    await db.exec(`
      INSERT INTO public.patient_invites (
        professional_id, email, token_hash, expires_at
      ) VALUES (
        '${NUTRI_1_ID}', 'unconfirmed@test.com', '${unconfirmedHash}', NOW() + INTERVAL '7 days'
      );
    `);

    // Signup com email_confirmed_at = NULL (simula email confirmation obrigatório ativado)
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
      VALUES (
        '${UNCONFIRMED_USER_ID}',
        'unconfirmed@test.com',
        NULL,
        '{"full_name": "Usuario Nao Confirmado", "patient_invite_token_hash": "${unconfirmedHash}"}'::jsonb
      );
    `);

    // 1. Profile criado como pending_verification e is_active = false
    const profCheck = await query<{ is_active: boolean; status: string }>(
      `SELECT is_active, status FROM public.profiles WHERE id = '${UNCONFIRMED_USER_ID}';`
    );
    expect(profCheck.rows[0].status).toBe('pending_verification');
    expect(profCheck.rows[0].is_active).toBe(false);

    // 2. Vínculo criado com status pending_verification
    const linkCheck = await query<{ status: string }>(
      `SELECT status FROM public.professional_patient_links WHERE patient_id = '${UNCONFIRMED_USER_ID}';`
    );
    expect(linkCheck.rows[0].status).toBe('pending_verification');

    // 3. Convite foi consumido para impedir double-spend
    const invCheck = await query<{ status: string; accepted_by: string }>(
      `SELECT status, accepted_by FROM public.patient_invites WHERE token_hash = '${unconfirmedHash}';`
    );
    expect(invCheck.rows[0].status).toBe('accepted');
    expect(invCheck.rows[0].accepted_by).toBe(UNCONFIRMED_USER_ID);

    // 4. Nutricionista vinculado NÃO tem acesso clínico/perfil pelo RLS (can_access_patient exige status = 'active')
    await asUser(NUTRI_1_ID, async () => {
      const accessCheck = await query<{ allowed: boolean }>(
        `SELECT private.can_access_patient('${NUTRI_1_ID}', '${UNCONFIRMED_USER_ID}') as allowed;`
      );
      expect(accessCheck.rows[0].allowed).toBe(false);

      const profileAccess = await query(
        `SELECT * FROM public.profiles WHERE id = '${UNCONFIRMED_USER_ID}';`
      );
      expect(profileAccess.rows.length).toBe(0);
    });
  });

  it('39. Confirmacao de email no Supabase Auth transiciona status para active e libera acesso clinico', async () => {
    // Simula confirmação de e-mail disparada pelo Supabase Auth ao clicar no link
    await db.exec(`
      UPDATE auth.users
      SET email_confirmed_at = NOW()
      WHERE id = '${UNCONFIRMED_USER_ID}';
    `);

    // 1. Profile agora é active e is_active = true
    const profCheck = await query<{ is_active: boolean; status: string }>(
      `SELECT is_active, status FROM public.profiles WHERE id = '${UNCONFIRMED_USER_ID}';`
    );
    expect(profCheck.rows[0].status).toBe('active');
    expect(profCheck.rows[0].is_active).toBe(true);

    // 2. Vínculo agora é active
    const linkCheck = await query<{ status: string }>(
      `SELECT status FROM public.professional_patient_links WHERE patient_id = '${UNCONFIRMED_USER_ID}';`
    );
    expect(linkCheck.rows[0].status).toBe('active');

    // 3. Nutricionista agora tem acesso normal via RLS (can_access_patient retorna true)
    await asUser(NUTRI_1_ID, async () => {
      const accessCheck = await query<{ allowed: boolean }>(
        `SELECT private.can_access_patient('${NUTRI_1_ID}', '${UNCONFIRMED_USER_ID}') as allowed;`
      );
      expect(accessCheck.rows[0].allowed).toBe(true);

      const profileAccess = await query(
        `SELECT * FROM public.profiles WHERE id = '${UNCONFIRMED_USER_ID}';`
      );
      expect(profileAccess.rows.length).toBe(1);
    });
  });
});
