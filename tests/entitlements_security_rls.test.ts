import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

describe('ETAPA 10: produtos e entitlements', () => {
  let db: PGlite;
  const ADMIN = '11111111-1111-4111-a111-111111111111';
  const PATIENT_A = '55555555-5555-4555-a555-555555555555';
  const PATIENT_B = '66666666-6666-4666-a666-666666666666';
  let premiumEntitlementId: string;

  async function asUser<T>(userId: string, callback: () => Promise<T>): Promise<T> {
    await db.exec(`SET ROLE authenticated; SET "request.jwt.claim.sub" = '${userId}'; SET "request.jwt.claim.role" = 'authenticated';`);
    try { return await callback(); }
    finally { await db.exec('RESET ROLE; RESET "request.jwt.claim.sub"; RESET "request.jwt.claim.role";'); }
  }

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT UNIQUE, email_confirmed_at TIMESTAMPTZ,
        confirmed_at TIMESTAMPTZ, raw_user_meta_data JSONB DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS TEXT LANGUAGE sql STABLE AS $$ SELECT COALESCE(current_setting('request.jwt.claim.role', true), 'authenticated') $$;
      CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    `);
    const dir = path.resolve(__dirname, '../supabase/migrations');
    for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()) {
      await db.exec(fs.readFileSync(path.join(dir, file), 'utf-8'));
    }
    await db.exec(`
      GRANT USAGE ON SCHEMA public TO authenticated, service_role;
      GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO authenticated;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
      INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data) VALUES
        ('${ADMIN}', 'admin@entitlements.test', NOW(), '{"full_name":"Admin"}'),
        ('${PATIENT_A}', 'a@entitlements.test', NOW(), '{"full_name":"A"}'),
        ('${PATIENT_B}', 'b@entitlements.test', NOW(), '{"full_name":"B"}');
      UPDATE public.profiles SET role_id = 'admin', status = 'active' WHERE id = '${ADMIN}';
      DELETE FROM public.patients WHERE id = '${ADMIN}';
    `);
  });

  it('concede produto essencial automaticamente e permite consulta própria', async () => {
    const result = await asUser(PATIENT_A, () => db.query<{ has_my_entitlement: boolean }>(
      `SELECT public.has_my_entitlement('progress.basic')`
    ));
    expect(result.rows[0].has_my_entitlement).toBe(true);
  });

  it('isola entitlements entre pacientes e bloqueia concessão pelo cliente', async () => {
    const crossTenant = await asUser(PATIENT_B, () => db.query(
      `SELECT id FROM public.user_entitlements WHERE patient_id = '${PATIENT_A}'`
    ));
    expect(crossTenant.rows).toHaveLength(0);

    await asUser(PATIENT_A, async () => {
      await expect(db.query(`SELECT public.grant_user_entitlement(
        '${PATIENT_A}', 'appnutri_premium', '${ADMIN}', 'admin', 'forged', NULL
      )`)).rejects.toThrow();
    });
  });

  it('concede premium de forma idempotente com snapshot de recursos', async () => {
    const grant = () => db.query<{ grant_user_entitlement: string }>(`SELECT public.grant_user_entitlement(
      '${PATIENT_A}', 'appnutri_premium', '${ADMIN}', 'admin', 'manual-order-1', NULL
    )`);
    const first = await grant();
    const second = await grant();
    premiumEntitlementId = first.rows[0].grant_user_entitlement;
    expect(premiumEntitlementId).toBe(second.rows[0].grant_user_entitlement);

    const snapshot = await db.query<{ feature_snapshot: Record<string, unknown> }>(
      `SELECT feature_snapshot FROM public.user_entitlements WHERE id = '${premiumEntitlementId}'`
    );
    expect(snapshot.rows[0].feature_snapshot).toHaveProperty('progress.advanced');
  });

  it('mudança posterior no produto não altera o snapshot concedido', async () => {
    await db.exec(`INSERT INTO public.product_features (product_id, feature_key)
      SELECT id, 'future.feature' FROM public.products WHERE code = 'appnutri_premium'`);
    const snapshot = await db.query<{ feature_snapshot: Record<string, unknown> }>(
      `SELECT feature_snapshot FROM public.user_entitlements WHERE id = '${premiumEntitlementId}'`
    );
    expect(snapshot.rows[0].feature_snapshot).not.toHaveProperty('future.feature');
  });

  it('revogação remove acesso e preserva evento histórico', async () => {
    const revoked = await db.query<{ revoke_user_entitlement: boolean }>(`SELECT public.revoke_user_entitlement(
      '${premiumEntitlementId}', '${ADMIN}', 'Encerramento manual'
    )`);
    expect(revoked.rows[0].revoke_user_entitlement).toBe(true);
    const access = await asUser(PATIENT_A, () => db.query<{ has_my_entitlement: boolean }>(
      `SELECT public.has_my_entitlement('progress.advanced')`
    ));
    expect(access.rows[0].has_my_entitlement).toBe(false);
    const events = await db.query(`SELECT id FROM public.entitlement_events WHERE entitlement_id = '${premiumEntitlementId}'`);
    expect(events.rows).toHaveLength(2);
  });
});
