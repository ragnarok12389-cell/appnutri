'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/auth/roles';
import { logAuditEvent } from '@/lib/audit/logger';

export interface ToggleStatusResponse {
  success?: boolean;
  error?: string;
}

/**
 * Ativa ou desativa o acesso de um profissional. Exclusivo para ADMIN.
 */
export async function toggleProfessionalStatusAction(
  professionalId: string,
  isActive: boolean
): Promise<ToggleStatusResponse> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return { error: 'Acesso restrito a administradores.' };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('profiles')
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('id', professionalId)
    .in('role_id', ['nutritionist', 'influencer']);

  if (error) {
    return { error: 'Não foi possível atualizar o status do profissional.' };
  }

  await logAuditEvent({
    actorId: user.id,
    action: isActive ? 'admin.professional_activated' : 'admin.professional_deactivated',
    entityType: 'profiles',
    entityId: professionalId,
    metadata: { is_active: isActive },
  });

  return { success: true };
}
