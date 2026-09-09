import { describe, it, expect } from 'vitest';
import { parseAndNormalizeTacoDataset } from '../src/lib/foods/importer/import-pipeline';

describe('ETAPA 5: Testes do Dataset Completo Oficial da TACO (597 alimentos)', () => {
  const completeData = parseAndNormalizeTacoDataset('official_complete');

  it('deve conter exatamente todos os 597 alimentos oficiais da publicação NEPA/UNICAMP', () => {
    expect(completeData.foods).toHaveLength(597);
  });

  it('não deve conter nenhum source_food_code duplicado', () => {
    const codes = completeData.foods.map((f) => f.source_food_code);
    const uniqueCodes = new Set(codes);
    expect(codes.length).toBe(uniqueCodes.size);
    expect(codes.length).toBe(597);
  });

  it('todos os códigos devem ser numéricos de 3 dígitos consecutivos de 001 a 597', () => {
    for (let i = 1; i <= 597; i++) {
      const expectedCode = String(i).padStart(3, '0');
      const food = completeData.foods.find((f) => f.source_food_code === expectedCode);
      expect(food).toBeDefined();
    }
  });

  it('nenhum nutriente numérico pode conter valores negativos impossíveis', () => {
    for (const food of completeData.foods) {
      for (const [nutCode, nutEntry] of Object.entries(food.nutrients)) {
        if (nutEntry.numeric_value !== null) {
          expect(
            nutEntry.numeric_value,
            `Alimento ${food.source_food_code} com nutriente ${nutCode} negativo: ${nutEntry.numeric_value}`
          ).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('deve preservar a semântica analítica oficial da TACO no dataset completo', () => {
    let traceCount = 0;
    let notApplicableCount = 0;
    let underReevalCount = 0;
    let notRequestedCount = 0;
    let knownZeroCount = 0;
    let numericValueCount = 0;

    for (const food of completeData.foods) {
      for (const nut of Object.values(food.nutrients)) {
        if (nut.value_status === 'TRACE') {
          traceCount++;
          expect(nut.numeric_value).toBeNull();
          expect(nut.data_quality).toBe('trace');
        } else if (nut.value_status === 'NOT_APPLICABLE') {
          notApplicableCount++;
          expect(nut.numeric_value).toBeNull();
          expect(nut.data_quality).toBe('not_applicable');
        } else if (nut.value_status === 'UNDER_REEVALUATION') {
          underReevalCount++;
          expect(nut.numeric_value).toBeNull();
          expect(nut.data_quality).toBe('under_reevaluation');
        } else if (nut.value_status === 'NOT_REQUESTED') {
          notRequestedCount++;
          expect(nut.numeric_value).toBeNull();
          expect(nut.data_quality).toBe('not_requested');
        } else if (nut.value_status === 'KNOWN_NUMERIC_ZERO') {
          knownZeroCount++;
          expect(nut.numeric_value).toBe(0.0);
          expect(nut.data_quality).toBe('analytical');
        } else if (nut.value_status === 'NUMERIC_VALUE') {
          numericValueCount++;
          expect(nut.numeric_value).toBeGreaterThan(0);
          expect(nut.data_quality).toBe('analytical');
        }
      }
    }

    expect(traceCount).toBe(1704);
    expect(notApplicableCount).toBe(907);
    expect(underReevalCount).toBe(72);
    expect(notRequestedCount).toBe(907);
    // 174 zeros laboratoriais comprovados. Os 4 valores com artefato numérico negativo da TACO (ex: -0.02 em carboidratos por diferença)
    // são estritamente rejeitados como UNKNOWN conforme exigência da auditoria (nunca convertidos em zero)
    expect(knownZeroCount).toBe(174);
    expect(numericValueCount).toBe(11754);

    // Validação específica das células negativas da fonte rejeitadas como UNKNOWN
    const food288 = completeData.foods.find((f) => f.source_food_code === '288');
    expect(food288?.nutrients.carbohydrate_g.value_status).toBe('UNKNOWN');
    expect(food288?.nutrients.carbohydrate_g.numeric_value).toBeNull();
  });

  it('deve classificar elegibilidade e consistência calórica no dataset completo com números auditados', () => {
    let eligible = 0;
    let incomplete = 0;
    let consistent = 0;
    let withinTol = 0;
    let divergent = 0;

    for (const food of completeData.foods) {
      if (food.engine_eligibility_status === 'eligible_for_engine') {
        eligible++;
      } else if (food.engine_eligibility_status === 'incomplete_nutrition') {
        incomplete++;
      }

      if (food.energy_consistency_status === 'consistent') {
        consistent++;
      } else if (food.energy_consistency_status === 'within_tolerance') {
        withinTol++;
      } else if (food.energy_consistency_status === 'different_from_macro_estimate') {
        divergent++;
      }
    }

    // 544 elegíveis (os 4 alimentos com carboidrato negativo na TACO tornaram-se incomplete_nutrition para revisão clínica)
    expect(eligible).toBe(544);
    expect(incomplete).toBe(53);
    expect(consistent).toBe(397);
    expect(withinTol).toBe(110);
    expect(divergent).toBe(37);
  });

  it('o importador do dataset completo deve ser estritamente idempotente', () => {
    const run1 = parseAndNormalizeTacoDataset('official_complete');
    const run2 = parseAndNormalizeTacoDataset('official_complete');

    expect(run1.checksum).toBe(run2.checksum);
    expect(run1.foods.length).toBe(run2.foods.length);
    expect(run1.foods[0].source_food_code).toBe(run2.foods[0].source_food_code);
    expect(run1.foods[596].source_food_code).toBe(run2.foods[596].source_food_code);
  });

  it('deve preservar acentuação UTF-8 correta nos nomes dos alimentos', () => {
    const pinhao = completeData.foods.find((f) => f.source_food_code === '595');
    const pupunha = completeData.foods.find((f) => f.source_food_code === '596');

    expect(pinhao?.name).toBe('Pinhão, cozido');
    expect(pupunha?.name).toBe('Pupunha, cozida');
  });

  it('deve certificar que a proveniência é exclusivamente oficial do NEPA/UNICAMP com checksum verificado', () => {
    expect(completeData.source.name).toContain('TACO');
    expect(completeData.source.publisher).toContain('NEPA');
    expect(completeData.source.domain).toBe('nepa.unicamp.br');
    expect(completeData.source.source_file).toBe('taco_nepa_oficial.xlsx');
    expect(completeData.source.source_file_checksum).toBe('A66B8EC528DAEABC63BC2B015FC9BD8C6D76B941C2FC0ED93A4311D449302D14');

    // Confirma reconciliação canônica intra-arquivo para o alimento 540 (Feijoada)
    const feijoada = completeData.foods.find((f) => f.source_food_code === '540');
    expect(feijoada?.name).toBe('Feijoada');
    expect(feijoada?.food_group).toBe('Alimentos preparados');
  });

  it('deve executar importação oficial duas vezes em banco de dados de teste (PGlite) e confirmar o mesmo estado final idêntico', async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const fs = await import('fs');
    const path = await import('path');

    const testDb = new PGlite();

    // Mock de auth e roles para ambiente PGlite
    await testDb.exec(`
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

    // Executar migrações
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
      await testDb.exec(sql);
    }

    const normalizedData = parseAndNormalizeTacoDataset('official_complete');

    // Payload canônico completo com os 26 nutrientes oficiais
    const payload = {
      source: normalizedData.source,
      nutrients_catalog: normalizedData.nutrients_catalog,
      foods: normalizedData.foods,
    };

    // 1. TESTE DE FECHAMENTO DO RPC PARA USUÁRIOS DA APLICAÇÃO (ADMIN DIRETO -> DENIED)
    // O RPC public.import_canonical_taco_atomic aceita exclusivamente service_role ou superusuário de banco.
    // Qualquer usuário autenticado (inclusive com perfil admin) que tente chamá-lo diretamente deve ter a execução negada.
    const ADMIN_TEST_USER_ID = '00000000-0000-0000-0000-000000000099';
    await testDb.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${ADMIN_TEST_USER_ID}', 'admin_direct@appnutri.com')
      ON CONFLICT (id) DO NOTHING;
      INSERT INTO public.profiles (id, role_id, full_name, email)
      VALUES ('${ADMIN_TEST_USER_ID}', 'admin', 'Admin Aplicação', 'admin_direct@appnutri.com')
      ON CONFLICT (id) DO UPDATE SET role_id = 'admin';
    `);

    let adminDirectRpcFailed = false;
    try {
      await testDb.exec(`
        SET ROLE authenticated;
        SET "request.jwt.claim.sub" = '${ADMIN_TEST_USER_ID}';
        SET "request.jwt.claim.role" = 'authenticated';
      `);
      await testDb.query('SELECT public.import_canonical_taco_atomic($1::jsonb);', [
        JSON.stringify(payload),
      ]);
    } catch (err: unknown) {
      adminDirectRpcFailed = true;
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/Acesso negado|permission denied/i);
    } finally {
      await testDb.exec(`
        RESET ROLE;
        RESET "request.jwt.claim.sub";
        RESET "request.jwt.claim.role";
      `);
    }

    expect(adminDirectRpcFailed).toBe(true);
    const countAfterAdminDirect = await testDb.query<{ c: string }>('SELECT count(*)::text as c FROM public.foods;');
    expect(countAfterAdminDirect.rows[0].c).toBe('0');

    // 2. TESTE DE ATOMICIDADE REAL E ROLLBACK INTEGRAL
    // Simula uma falha intencional no meio da importação (após o alimento 300).
    // O PostgreSQL deve abortar e fazer ROLLBACK integral de toda a transação.
    let intentionalFailureCaught = false;
    try {
      await testDb.query('SELECT public.import_canonical_taco_atomic($1::jsonb, $2);', [
        JSON.stringify(payload),
        '300',
      ]);
    } catch (err: unknown) {
      intentionalFailureCaught = true;
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toContain('DELIBERATE_TEST_FAILURE');
    }

    expect(intentionalFailureCaught).toBe(true);

    // Validação estrita: zero alterações parciais no banco de dados após a falha
    const countFoodsFail = await testDb.query<{ c: string }>('SELECT count(*)::text as c FROM public.foods;');
    const countNutsFail = await testDb.query<{ c: string }>('SELECT count(*)::text as c FROM public.food_nutrients;');
    const countSourcesFail = await testDb.query<{ c: string }>('SELECT count(*)::text as c FROM public.food_data_sources;');

    expect(countFoodsFail.rows[0].c).toBe('0');
    expect(countNutsFail.rows[0].c).toBe('0');
    expect(countSourcesFail.rows[0].c).toBe('0');

    // 3. TESTES DE VALIDAÇÃO DE INVARIANTES NA TRANSAÇÃO POSTGRESQL (ROLLBACK INTEGRAL)
    // 3.1. Payload com 596 alimentos (deve falhar e deixar zero alterações)
    let fail596Caught = false;
    const payload596 = {
      ...payload,
      foods: payload.foods.slice(0, 596),
    };
    try {
      await testDb.query('SELECT public.import_canonical_taco_atomic($1::jsonb);', [
        JSON.stringify(payload596),
      ]);
    } catch (err: unknown) {
      fail596Caught = true;
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toContain('INVARIANT_VIOLATION');
      expect(msg).toContain('596');
    }
    expect(fail596Caught).toBe(true);
    const countFoods596 = await testDb.query<{ c: string }>('SELECT count(*)::text as c FROM public.foods;');
    expect(countFoods596.rows[0].c).toBe('0');

    // 3.2. Payload com catálogo incompleto de 25 nutrientes (deve falhar e deixar zero alterações)
    let fail25CatCaught = false;
    const payload25Cat = {
      ...payload,
      nutrients_catalog: payload.nutrients_catalog.slice(0, 25),
    };
    try {
      await testDb.query('SELECT public.import_canonical_taco_atomic($1::jsonb);', [
        JSON.stringify(payload25Cat),
      ]);
    } catch (err: unknown) {
      fail25CatCaught = true;
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toContain('INVARIANT_VIOLATION');
      expect(msg).toContain('25');
    }
    expect(fail25CatCaught).toBe(true);
    const countNuts25 = await testDb.query<{ c: string }>('SELECT count(*)::text as c FROM public.food_nutrients;');
    expect(countNuts25.rows[0].c).toBe('0');

    // 3.3. Payload com alimento contendo nutriente ausente (25 nutrientes em vez de 26)
    let failMissingNutCaught = false;
    const foodWithMissingNut = {
      ...payload.foods[0],
      nutrients: { ...payload.foods[0].nutrients },
    };
    delete (foodWithMissingNut.nutrients as Record<string, unknown>)['moisture_pct'];
    const payloadMissingNut = {
      ...payload,
      foods: [foodWithMissingNut, ...payload.foods.slice(1)],
    };
    try {
      await testDb.query('SELECT public.import_canonical_taco_atomic($1::jsonb);', [
        JSON.stringify(payloadMissingNut),
      ]);
    } catch (err: unknown) {
      failMissingNutCaught = true;
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toContain('INVARIANT_VIOLATION');
      expect(msg).toContain('001');
    }
    expect(failMissingNutCaught).toBe(true);
    const countFoodsMissingNut = await testDb.query<{ c: string }>('SELECT count(*)::text as c FROM public.foods;');
    expect(countFoodsMissingNut.rows[0].c).toBe('0');

    interface AtomicRpcResult {
      success: boolean;
      imported_foods_count: number;
      total_nutrients_count: number;
      source_id: string;
      dataset_version: string;
      checksum: string;
    }

    // 4. IMPORTAÇÃO OFICIAL COMPLETA ATÔMICA (597 alimentos × 26 nutrientes = 15.522 registros)
    // Execução 1
    const res1 = await testDb.query<{ import_canonical_taco_atomic: AtomicRpcResult }>(
      'SELECT public.import_canonical_taco_atomic($1::jsonb);',
      [JSON.stringify(payload)]
    );

    const data1 = res1.rows[0].import_canonical_taco_atomic;
    expect(data1.success).toBe(true);
    expect(data1.imported_foods_count).toBe(597);
    expect(data1.total_nutrients_count).toBe(15522);

    const countFoods1 = await testDb.query<{ c: string }>('SELECT count(*)::text as c FROM public.foods WHERE source_type = \'official\';');
    const countNuts1 = await testDb.query<{ c: string }>('SELECT count(*)::text as c FROM public.food_nutrients;');
    const countSources1 = await testDb.query<{ c: string }>('SELECT count(*)::text as c FROM public.food_data_sources;');
    const countCatalog1 = await testDb.query<{ c: string }>('SELECT count(*)::text as c FROM public.nutrients;');

    expect(countFoods1.rows[0].c).toBe('597');
    expect(countNuts1.rows[0].c).toBe('15522');
    expect(countSources1.rows[0].c).toBe('1');
    expect(countCatalog1.rows[0].c).toBe('26');

    // Execução 2 (Idempotência completa atômica: mesmo estado final)
    const res2 = await testDb.query<{ import_canonical_taco_atomic: AtomicRpcResult }>(
      'SELECT public.import_canonical_taco_atomic($1::jsonb);',
      [JSON.stringify(payload)]
    );

    const data2 = res2.rows[0].import_canonical_taco_atomic;
    expect(data2.success).toBe(true);
    expect(data2.imported_foods_count).toBe(597);
    expect(data2.total_nutrients_count).toBe(15522);

    const countFoods2 = await testDb.query<{ c: string }>('SELECT count(*)::text as c FROM public.foods WHERE source_type = \'official\';');
    const countNuts2 = await testDb.query<{ c: string }>('SELECT count(*)::text as c FROM public.food_nutrients;');
    const countSources2 = await testDb.query<{ c: string }>('SELECT count(*)::text as c FROM public.food_data_sources;');

    // Estado final rigorosamente idêntico comprovado: zero duplicações
    expect(countFoods2.rows[0].c).toBe('597');
    expect(countNuts2.rows[0].c).toBe('15522');
    expect(countSources2.rows[0].c).toBe('1');

    // 5. TESTE DE PRESERVAÇÃO INTEGRAL DE PROVENANCE NO UPSERT
    // Garante que raw_value e source_reference são atualizados simultaneamente no ON CONFLICT ... DO UPDATE,
    // eliminando qualquer possibilidade de combinação de valor novo com raw/provenance antigos.
    const modifiedPayload = JSON.parse(JSON.stringify(payload));
    modifiedPayload.foods[0].nutrients['moisture_pct'] = {
      raw_value: '88.5',
      numeric_value: 88.5,
      value_status: 'NUMERIC_VALUE',
      data_quality: 'analytical',
      source_reference: 'Reanálise Oficial NEPA 2026 - Lote Auditado',
    };

    const resReimport = await testDb.query<{ import_canonical_taco_atomic: AtomicRpcResult }>(
      'SELECT public.import_canonical_taco_atomic($1::jsonb);',
      [JSON.stringify(modifiedPayload)]
    );
    expect(resReimport.rows[0].import_canonical_taco_atomic.imported_foods_count).toBe(597);

    const food001Nut = await testDb.query<{
      raw_value: string;
      numeric_value: string;
      source_reference: string;
    }>(`
      SELECT fn.raw_value, fn.numeric_value::text, fn.source_reference
      FROM public.food_nutrients fn
      JOIN public.foods f ON f.id = fn.food_id
      JOIN public.nutrients n ON n.id = fn.nutrient_id
      WHERE f.source_food_code = '001' AND n.code = 'moisture_pct';
    `);

    expect(food001Nut.rows[0].numeric_value).toBe('88.5000');
    expect(food001Nut.rows[0].raw_value).toBe('88.5');
    expect(food001Nut.rows[0].source_reference).toBe('Reanálise Oficial NEPA 2026 - Lote Auditado');
  }, 120000);
});

