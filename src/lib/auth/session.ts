import { createClient } from '@/lib/supabase/server';
import { AuthUser } from '@/types/auth';
import { Profile, Organization } from '@/types/database';
import { AppPermission, ROLE_DEFAULT_PERMISSIONS } from '@/types/permissions';

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return null;
    }

    // Busca o perfil associado ao usuário
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || !profile.is_active || profile.status === 'pending_verification') {
      return null;
    }

    // Busca permissões granulares específicas concedidas diretamente
    const { data: userPermissionsData } = await supabase
      .from('user_permissions')
      .select('permission_id, is_granted')
      .eq('user_id', user.id);

    const grantedOverrides = new Set<AppPermission>();
    const revokedOverrides = new Set<AppPermission>();

    (userPermissionsData || []).forEach((up: { permission_id: string; is_granted: boolean }) => {
      if (up.is_granted) {
        grantedOverrides.add(up.permission_id as AppPermission);
      } else {
        revokedOverrides.add(up.permission_id as AppPermission);
      }
    });

    // Calcula lista final de permissões
    const defaultPerms = ROLE_DEFAULT_PERMISSIONS[profile.role_id as keyof typeof ROLE_DEFAULT_PERMISSIONS] || [];
    const effectivePermissions = Array.from(
      new Set([
        ...defaultPerms.filter((p) => !revokedOverrides.has(p)),
        ...Array.from(grantedOverrides),
      ])
    );

    // Busca organização primária caso o usuário pertença a alguma
    let currentOrganization: Organization | null = null;
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id, organizations(*)')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (membership && membership.organizations) {
      currentOrganization = membership.organizations as unknown as Organization;
    }

    return {
      id: user.id,
      email: user.email || profile.email,
      profile: profile as Profile,
      permissions: effectivePermissions,
      currentOrganization,
    };
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'digest' in err) {
      throw err;
    }
    console.error('Erro ao recuperar usuário atual da sessão:', err);
    return null;
  }
}
