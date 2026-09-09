import { redirect } from 'next/navigation';
import { getCurrentUser } from './session';
import { hasRole, hasPermission } from './roles';
import { UserRole } from '@/types/roles';
import { AppPermission } from '@/types/permissions';
import { AuthUser } from '@/types/auth';

/**
 * Garante que a requisição seja de um usuário autenticado e ativo.
 * Caso contrário, redireciona para a página de login.
 */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }
  return user;
}

/**
 * Garante que o usuário possua um dos papéis (roles) autorizados.
 * Não confia em cabeçalhos ou client-side; valida o perfil carregado do banco.
 */
export async function requireRole(allowedRoles: UserRole | UserRole[]): Promise<AuthUser> {
  const user = await requireAuth();
  
  if (!hasRole(user, allowedRoles)) {
    redirect('/unauthorized');
  }
  
  return user;
}

/**
 * Garante que o usuário possua uma permissão granular específica.
 */
export async function requirePermission(permission: AppPermission): Promise<AuthUser> {
  const user = await requireAuth();
  
  if (!hasPermission(user, permission)) {
    redirect('/unauthorized');
  }
  
  return user;
}
