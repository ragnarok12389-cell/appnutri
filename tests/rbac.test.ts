import { describe, it, expect } from 'vitest';
import { USER_ROLES, isUserRole, isProfessionalRole } from '@/types/roles';
import { ROLE_DEFAULT_PERMISSIONS, ALL_PERMISSIONS, AppPermission } from '@/types/permissions';
import { hasRole, hasPermission, isNutritionist, isInfluencer, isPatient, isAdmin } from '@/lib/auth/roles';
import { AuthUser } from '@/types/auth';

describe('RBAC Foundation & Role Distinctness', () => {
  it('should define all 4 required roles distinctly', () => {
    expect(USER_ROLES.ADMIN).toBe('admin');
    expect(USER_ROLES.NUTRITIONIST).toBe('nutritionist');
    expect(USER_ROLES.INFLUENCER).toBe('influencer');
    expect(USER_ROLES.PATIENT).toBe('patient');

    expect(isUserRole('admin')).toBe(true);
    expect(isUserRole('nutritionist')).toBe(true);
    expect(isUserRole('influencer')).toBe(true);
    expect(isUserRole('patient')).toBe(true);
    expect(isUserRole('superhacker')).toBe(false);
  });

  it('should identify professional roles correctly', () => {
    expect(isProfessionalRole('nutritionist')).toBe(true);
    expect(isProfessionalRole('influencer')).toBe(true);
    expect(isProfessionalRole('patient')).toBe(false);
    expect(isProfessionalRole('admin')).toBe(false);
  });

  it('CRITICAL: nutritionist and influencer must NEVER share identical permissions', () => {
    const nutriPerms = ROLE_DEFAULT_PERMISSIONS.nutritionist;
    const influencerPerms = ROLE_DEFAULT_PERMISSIONS.influencer;

    // Nutritionist MUST have clinical editing capabilities
    expect(nutriPerms).toContain('nutrition.edit');
    expect(nutriPerms).not.toContain('workout.edit');
    expect(nutriPerms).toContain('patient.edit');

    // Influencer MUST NOT have clinical editing capabilities
    expect(influencerPerms).not.toContain('nutrition.edit');
    expect(influencerPerms).not.toContain('workout.edit');
    expect(influencerPerms).not.toContain('patient.edit');

    // Both should be able to view their linked patients
    expect(nutriPerms).toContain('patient.view');
    expect(influencerPerms).toContain('patient.view');
  });

  it('admin must possess all platform permissions', () => {
    const adminPerms = ROLE_DEFAULT_PERMISSIONS.admin;
    for (const perm of ALL_PERMISSIONS) {
      expect(adminPerms).toContain(perm);
    }
  });

  it('patient should only have consumer-facing permissions', () => {
    const patientPerms = ROLE_DEFAULT_PERMISSIONS.patient;
    expect(patientPerms).toContain('nutrition.view');
    expect(patientPerms).toContain('workout.view');
    expect(patientPerms).toContain('progress.view');
    expect(patientPerms).toContain('ai.use');

    expect(patientPerms).not.toContain('patient.view');
    expect(patientPerms).not.toContain('nutrition.edit');
    expect(patientPerms).not.toContain('users.manage');
  });
});

describe('User Authorization Utility Functions', () => {
  const createMockUser = (role: 'admin' | 'nutritionist' | 'influencer' | 'patient', overrides: AppPermission[] = []): AuthUser => ({
    id: 'user-uuid-1234',
    email: 'test@example.com',
    profile: {
      id: 'user-uuid-1234',
      role_id: role,
      full_name: 'Test User',
      email: 'test@example.com',
      avatar_url: null,
      phone: null,
      is_active: true,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    permissions: overrides,
    currentOrganization: null,
  });

  it('hasRole should match exact and array roles', () => {
    const nutriUser = createMockUser('nutritionist');
    expect(hasRole(nutriUser, 'nutritionist')).toBe(true);
    expect(hasRole(nutriUser, ['admin', 'nutritionist'])).toBe(true);
    expect(hasRole(nutriUser, 'influencer')).toBe(false);
    expect(hasRole(nutriUser, 'admin')).toBe(false);

    expect(isNutritionist(nutriUser)).toBe(true);
    expect(isInfluencer(nutriUser)).toBe(false);
    expect(isAdmin(nutriUser)).toBe(false);
    expect(isPatient(nutriUser)).toBe(false);
  });

  it('admin should always have any permission via hasPermission', () => {
    const adminUser = createMockUser('admin');
    expect(hasPermission(adminUser, 'users.manage')).toBe(true);
    expect(hasPermission(adminUser, 'nutrition.edit')).toBe(true);
    expect(hasPermission(adminUser, 'ai.manage')).toBe(true);
  });

  it('hasPermission should respect granular overrides', () => {
    // Influencer without override cannot edit nutrition
    const influencerUser = createMockUser('influencer');
    expect(hasPermission(influencerUser, 'nutrition.edit')).toBe(false);

    // Influencer granted specific override
    const influencerWithGrant = createMockUser('influencer', ['nutrition.edit']);
    expect(hasPermission(influencerWithGrant, 'nutrition.edit')).toBe(true);
  });
});
