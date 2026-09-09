export type UserRole = 'admin' | 'nutritionist' | 'influencer' | 'patient';

export const USER_ROLES: Record<Uppercase<UserRole>, UserRole> = {
  ADMIN: 'admin',
  NUTRITIONIST: 'nutritionist',
  INFLUENCER: 'influencer',
  PATIENT: 'patient',
} as const;

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  nutritionist: 'Nutricionista',
  influencer: 'Influenciador',
  patient: 'Paciente',
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && ['admin', 'nutritionist', 'influencer', 'patient'].includes(value);
}

export function isProfessionalRole(role: UserRole): boolean {
  return role === 'nutritionist' || role === 'influencer';
}
