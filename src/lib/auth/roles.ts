import { UserRole, isProfessionalRole } from '@/types/roles';
import { AppPermission, ROLE_DEFAULT_PERMISSIONS } from '@/types/permissions';
import { AuthUser } from '@/types/auth';

/**
 * Verifica se um usuário possui um dos papéis permitidos.
 */
export function hasRole(user: AuthUser | null | undefined, allowedRoles: UserRole | UserRole[]): boolean {
  if (!user || !user.profile?.role_id) return false;
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return roles.includes(user.profile.role_id);
}

/**
 * Determina se o usuário possui determinada permissão granular.
 * Verifica primeiro overrides específicos em user.permissions, e caso não haja,
 * recorre à matriz de permissões padrão da role.
 */
export function hasPermission(user: AuthUser | null | undefined, permission: AppPermission): boolean {
  if (!user || !user.profile?.role_id) return false;
  
  // Administrador tem todas as permissões
  if (user.profile.role_id === 'admin') return true;

  // Verifica se o usuário tem a permissão direta
  if (user.permissions && user.permissions.includes(permission)) {
    return true;
  }

  // Consulta tabela de permissões padrão da role
  const defaultPermissions = ROLE_DEFAULT_PERMISSIONS[user.profile.role_id] || [];
  return defaultPermissions.includes(permission);
}

/**
 * Validação explícita de que nutricionistas e influencers possuem papéis distintos.
 */
export function isNutritionist(user: AuthUser | null | undefined): boolean {
  return hasRole(user, 'nutritionist');
}

export function isInfluencer(user: AuthUser | null | undefined): boolean {
  return hasRole(user, 'influencer');
}

export function isPatient(user: AuthUser | null | undefined): boolean {
  return hasRole(user, 'patient');
}

export function isAdmin(user: AuthUser | null | undefined): boolean {
  return hasRole(user, 'admin');
}

export function isProfessional(user: AuthUser | null | undefined): boolean {
  if (!user || !user.profile?.role_id) return false;
  return isProfessionalRole(user.profile.role_id);
}
