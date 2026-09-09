'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { isPatient, isNutritionist, isInfluencer } from '@/lib/auth/roles';
import {
  patientOnboardingSchema,
  nutritionistOnboardingSchema,
  influencerOnboardingSchema,
  PatientOnboardingInput,
  NutritionistOnboardingInput,
  InfluencerOnboardingInput,
} from '@/lib/validations/onboarding';
import { logAuditEvent } from '@/lib/audit/logger';

export interface OnboardingActionResponse {
  success?: boolean;
  error?: string;
}

/**
 * Salva ou atualiza os dados do questionário básico de onboarding do paciente.
 */
export async function submitPatientOnboardingAction(
  input: PatientOnboardingInput
): Promise<OnboardingActionResponse> {
  const user = await getCurrentUser();
  if (!user || !isPatient(user)) {
    return { error: 'Acesso não autorizado. Apenas pacientes podem preencher este onboarding.' };
  }

  const parsed = patientOnboardingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Dados inválidos no onboarding.' };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('patient_onboarding')
    .upsert({
      id: user.id,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      birth_date: parsed.data.birth_date || null,
      gender: parsed.data.gender || null,
      height_cm: parsed.data.height_cm || null,
      weight_kg: parsed.data.weight_kg || null,
      country: parsed.data.country,
      city: parsed.data.city || null,
      timezone: parsed.data.timezone,
      primary_goal: parsed.data.primary_goal,
      is_completed: true,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    return { error: 'Não foi possível salvar o onboarding do paciente.' };
  }

  await logAuditEvent({
    actorId: user.id,
    action: 'patient.onboarding_completed',
    entityType: 'patient_onboarding',
    entityId: user.id,
    metadata: {
      primary_goal: parsed.data.primary_goal,
    },
  });

  return { success: true };
}

/**
 * Salva os dados de perfil profissional de um nutricionista (CRN, UF, bio, especialidades).
 */
export async function submitNutritionistOnboardingAction(
  input: NutritionistOnboardingInput
): Promise<OnboardingActionResponse> {
  const user = await getCurrentUser();
  if (!user || !isNutritionist(user)) {
    return { error: 'Acesso restrito a nutricionistas.' };
  }

  const parsed = nutritionistOnboardingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Dados inválidos no cadastro profissional.' };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('professional_profiles')
    .update({
      license_number: parsed.data.license_number,
      license_state: parsed.data.license_state,
      bio: parsed.data.bio || null,
      specialties: parsed.data.specialties,
      is_onboarding_completed: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) {
    return { error: 'Erro ao salvar perfil profissional do nutricionista.' };
  }

  await logAuditEvent({
    actorId: user.id,
    action: 'nutritionist.onboarding_completed',
    entityType: 'professional_profiles',
    entityId: user.id,
  });

  return { success: true };
}

/**
 * Salva os dados de perfil profissional de um influenciador (nicho, redes sociais, bio).
 */
export async function submitInfluencerOnboardingAction(
  input: InfluencerOnboardingInput
): Promise<OnboardingActionResponse> {
  const user = await getCurrentUser();
  if (!user || !isInfluencer(user)) {
    return { error: 'Acesso restrito a influenciadores.' };
  }

  const parsed = influencerOnboardingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Dados inválidos no cadastro do influenciador.' };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('professional_profiles')
    .update({
      niche: parsed.data.niche,
      bio: parsed.data.bio || null,
      social_links: parsed.data.social_links,
      is_onboarding_completed: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) {
    return { error: 'Erro ao salvar perfil do influenciador.' };
  }

  await logAuditEvent({
    actorId: user.id,
    action: 'influencer.onboarding_completed',
    entityType: 'professional_profiles',
    entityId: user.id,
  });

  return { success: true };
}
