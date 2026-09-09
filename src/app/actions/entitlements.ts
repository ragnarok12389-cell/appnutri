'use server';

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { hasRole } from '@/lib/auth/roles';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAuditEvent } from '@/lib/audit/logger';
import { ProductCatalogItem, UserEntitlement } from '@/types/entitlements';

interface ActionResponse<T> { success?: boolean; data?: T; error?: string }

const GrantSchema = z.object({
  patient_id: z.string().uuid(),
  product_code: z.string().regex(/^[a-z][a-z0-9_]{2,49}$/),
  external_reference: z.string().trim().min(3).max(120),
  valid_until: z.iso.datetime().optional(),
});

const RevokeSchema = z.object({
  entitlement_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

async function loadCatalogAndEntitlements(adminMode: boolean): Promise<{
  products: ProductCatalogItem[];
  entitlements: UserEntitlement[];
}> {
  const supabase = adminMode ? createAdminClient() : await createClient();
  const [productsResult, featuresResult, entitlementsResult] = await Promise.all([
    supabase.from('products').select('*').order('name'),
    supabase.from('product_features').select('product_id, feature_key').order('feature_key'),
    supabase.from('user_entitlements').select('*, products ( code, name )').order('created_at', { ascending: false }),
  ]);
  if (productsResult.error || featuresResult.error || entitlementsResult.error) {
    throw new Error('Não foi possível carregar o catálogo de acesso.');
  }

  const features = new Map<string, string[]>();
  for (const feature of featuresResult.data ?? []) {
    features.set(feature.product_id, [...(features.get(feature.product_id) ?? []), feature.feature_key]);
  }
  const patientIds = [...new Set((entitlementsResult.data ?? []).map((item) => item.patient_id))];
  const profileMap = new Map<string, { full_name: string; email: string }>();
  if (adminMode && patientIds.length > 0) {
    const profiles = await createAdminClient().from('profiles').select('id, full_name, email').in('id', patientIds);
    if (profiles.error) throw new Error('Não foi possível carregar os pacientes dos entitlements.');
    for (const profile of profiles.data ?? []) profileMap.set(profile.id, profile);
  }

  return {
    products: (productsResult.data ?? []).map((product) => ({ ...product, features: features.get(product.id) ?? [] })) as ProductCatalogItem[],
    entitlements: (entitlementsResult.data ?? []).map((item) => {
      const product = item.products as unknown as { code: string; name: string };
      const profile = profileMap.get(item.patient_id);
      return {
        ...item,
        product_code: product.code,
        product_name: product.name,
        patient_name: profile?.full_name,
        patient_email: profile?.email,
      };
    }) as UserEntitlement[],
  };
}

export async function getMyEntitlementsAction(): Promise<ActionResponse<UserEntitlement[]>> {
  const user = await getCurrentUser();
  if (!user || !hasRole(user, 'patient')) return { error: 'Acesso restrito ao paciente.' };
  try { return { success: true, data: (await loadCatalogAndEntitlements(false)).entitlements }; }
  catch (error) { return { error: error instanceof Error ? error.message : 'Falha ao carregar acessos.' }; }
}

export async function getAdminEntitlementsAction(): Promise<ActionResponse<{
  products: ProductCatalogItem[]; entitlements: UserEntitlement[];
}>> {
  const user = await getCurrentUser();
  if (!user || !hasRole(user, 'admin')) return { error: 'Acesso administrativo necessário.' };
  try { return { success: true, data: await loadCatalogAndEntitlements(true) }; }
  catch (error) { return { error: error instanceof Error ? error.message : 'Falha ao carregar acessos.' }; }
}

export async function grantEntitlementAction(input: unknown): Promise<ActionResponse<{ entitlement_id: string }>> {
  const user = await getCurrentUser();
  if (!user || !hasRole(user, 'admin')) return { error: 'Acesso administrativo necessário.' };
  const parsed = GrantSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Concessão inválida.' };
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('grant_user_entitlement', {
    p_patient_id: parsed.data.patient_id,
    p_product_code: parsed.data.product_code,
    p_actor_id: user.id,
    p_source: 'admin',
    p_external_reference: parsed.data.external_reference,
    p_valid_until: parsed.data.valid_until ?? null,
  });
  if (error || !data) return { error: 'Não foi possível conceder o produto.' };
  await logAuditEvent({ actorId: user.id, action: 'entitlement.granted', entityType: 'user_entitlements', entityId: data as string, metadata: { product_code: parsed.data.product_code }, useAdminClient: true });
  return { success: true, data: { entitlement_id: data as string } };
}

export async function revokeEntitlementAction(input: unknown): Promise<ActionResponse<{ revoked: boolean }>> {
  const user = await getCurrentUser();
  if (!user || !hasRole(user, 'admin')) return { error: 'Acesso administrativo necessário.' };
  const parsed = RevokeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Revogação inválida.' };
  const { data, error } = await createAdminClient().rpc('revoke_user_entitlement', {
    p_entitlement_id: parsed.data.entitlement_id, p_actor_id: user.id, p_reason: parsed.data.reason,
  });
  if (error || data !== true) return { error: 'Entitlement não encontrado ou já encerrado.' };
  await logAuditEvent({ actorId: user.id, action: 'entitlement.revoked', entityType: 'user_entitlements', entityId: parsed.data.entitlement_id, useAdminClient: true });
  return { success: true, data: { revoked: true } };
}
