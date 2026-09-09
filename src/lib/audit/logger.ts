import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface AuditLogParams {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  organizationId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
  useAdminClient?: boolean;
}

/**
 * Registra eventos de auditoria centralizados para rastreabilidade de conformidade e segurança.
 */
export async function logAuditEvent(params: AuditLogParams): Promise<string | null> {
  try {
    const supabase = params.useAdminClient ? createAdminClient() : await createClient();

    const { data, error } = await supabase
      .from('audit_logs')
      .insert({
        actor_id: params.actorId || null,
        action: params.action,
        entity_type: params.entityType,
        entity_id: params.entityId || null,
        organization_id: params.organizationId || null,
        metadata: params.metadata || {},
        ip_address: params.ipAddress || null,
        user_agent: params.userAgent || null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Falha ao registrar log de auditoria no banco:', error);
      return null;
    }

    return data?.id || null;
  } catch (err) {
    console.error('Exceção ao emitir evento de auditoria:', err);
    return null;
  }
}
