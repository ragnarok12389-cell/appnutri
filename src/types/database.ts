import { UserRole } from './roles';

export type ProfileStatus = 'pending_verification' | 'active' | 'inactive' | 'suspended';

export interface Profile {
  id: string; // matches auth.users.id
  role_id: UserRole;
  full_name: string;
  email: string;
  avatar_url: string | null;
  phone: string | null;
  is_active: boolean;
  status: ProfileStatus;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role_in_org: 'owner' | 'admin' | 'member';
  created_at: string;
  updated_at: string;
}

export interface ProfessionalProfile {
  id: string; // matches profile.id
  professional_type: 'nutritionist' | 'influencer';
  license_number: string | null;
  license_state: string | null;
  bio: string | null;
  specialties: string[] | null;
  social_links: Record<string, string>;
  niche: string | null;
  is_onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Patient {
  id: string; // matches profile.id
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type LinkStatus = 'active' | 'inactive' | 'transferred' | 'pending' | 'pending_verification';
export type LinkType = 'direct' | 'organization' | 'influencer_referral';

export interface ProfessionalPatientLink {
  id: string;
  professional_id: string;
  patient_id: string;
  organization_id: string | null;
  is_primary: boolean;
  status: LinkStatus;
  link_type: LinkType;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export interface ProfessionalInvite {
  id: string;
  email: string;
  role_id: 'nutritionist' | 'influencer';
  organization_id: string | null;
  token_hash: string;
  created_by: string;
  expires_at: string;
  accepted_by: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface PatientInvite {
  id: string;
  professional_id: string;
  organization_id: string | null;
  email: string | null;
  token_hash: string;
  status: InviteStatus;
  expires_at: string;
  accepted_by: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export type PatientGoal = 'lose_weight' | 'gain_muscle' | 'maintain_weight' | 'improve_health' | 'improve_performance';

export interface PatientOnboarding {
  id: string; // matches patient.id
  first_name: string;
  last_name: string;
  birth_date: string | null;
  gender: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null;
  height_cm: number | null;
  weight_kg: number | null;
  country: string;
  city: string | null;
  timezone: string;
  primary_goal: PatientGoal;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  organization_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}
