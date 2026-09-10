import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { logAuditEvent } from '@/lib/audit/logger';
import { runNutritionEngine } from '@/lib/nutrition-engine/engine';
import { generateDietPlanAction } from '@/app/actions/diet-plan';
import { generateWorkoutProgramAction } from '@/app/actions/workout-program';
import { PatientNutritionProfile, PatientNutritionSensitive } from '@/types/nutrition-profile';
import {
  inferWorkoutEquipment,
  inferWorkoutExperience,
  mapPrimaryGoalToWorkoutObjective,
} from '@/lib/plan-activation/profile-mapping';

export interface PlanActivationResult {
  nutrition: 'calculated' | 'review_required' | 'insufficient_data' | 'failed';
  diet: 'generated' | 'review_required' | 'failed' | 'not_eligible';
  workout: 'generated' | 'review_required' | 'failed' | 'needs_configuration';
  messages: string[];
}

type ActivationInput = {
  patientId: string;
  actorId: string;
  profile: PatientNutritionProfile;
  sensitive: PatientNutritionSensitive | null;
  snapshotId: string;
  sensitiveSnapshotId: string | null;
};

export async function activatePlansAfterCompletedProfile(input: ActivationInput): Promise<PlanActivationResult> {
  try {
    return await activatePlansInternal(input);
  } catch {
    const failed: PlanActivationResult = {
      nutrition: 'failed',
      diet: 'failed',
      workout: 'failed',
      messages: ['A ativação automática encontrou uma falha interna. Seus dados do questionário foram preservados.'],
    };
    const admin = createAdminClient();
    await admin.from('patient_plan_activations').upsert({
      patient_id: input.patientId,
      profile_version: input.profile.version,
      nutrition_status: failed.nutrition,
      diet_status: failed.diet,
      workout_status: failed.workout,
      messages: failed.messages,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      created_by: input.actorId,
    }, { onConflict: 'patient_id,profile_version' });
    await logAuditEvent({
      actorId: input.actorId,
      action: 'plan_activation.failed',
      entityType: 'patient_plan_activations',
      entityId: input.patientId,
      metadata: { patient_id: input.patientId, profile_version: input.profile.version },
      useAdminClient: true,
    });
    return failed;
  }
}

async function activatePlansInternal(input: ActivationInput): Promise<PlanActivationResult> {
  const admin = createAdminClient();
  const messages: string[] = [];
  const activationKey = {
    patient_id: input.patientId,
    profile_version: input.profile.version,
  };
  await admin.from('patient_plan_activations').upsert({
    ...activationKey,
    nutrition_status: 'processing',
    diet_status: 'processing',
    workout_status: 'processing',
    messages: [],
    started_at: new Date().toISOString(),
    completed_at: null,
    created_by: input.actorId,
  }, { onConflict: 'patient_id,profile_version' });

  const engine = runNutritionEngine({
    patient_id: input.patientId,
    snapshot: input.profile,
    sensitive_snapshot: input.sensitive,
  });

  await admin.from('nutrition_engine_runs').update({ status: 'superseded' }).eq('patient_id', input.patientId).in('status', ['calculated', 'review_required']);
  const runInsert = await admin.from('nutrition_engine_runs').insert({
    patient_id: input.patientId,
    nutrition_snapshot_id: input.snapshotId,
    sensitive_snapshot_id: input.sensitiveSnapshotId,
    engine_version: engine.engine_version,
    config_version: engine.config_version,
    status: engine.status,
    requires_professional_review: engine.requires_professional_review,
    input_hash: engine.input_hash,
    output_hash: engine.output_hash,
    calculated_by: input.actorId,
  }).select('id').single();

  if (runInsert.error || !runInsert.data) {
    const failed: PlanActivationResult = { nutrition: 'failed', diet: 'not_eligible', workout: 'failed', messages: ['Falha ao registrar o cálculo nutricional.'] };
    await persistActivationResult(admin, activationKey, failed);
    return failed;
  }

  const runId = runInsert.data.id;
  const clinicalReviewInsert = await admin.from('nutrition_engine_clinical_reviews').insert({
    engine_run_id: runId,
    patient_id: input.patientId,
    requires_professional_review: engine.clinical_review.requires_professional_review,
    clinical_reason_codes: engine.clinical_review.clinical_reason_codes,
    clinical_review_notes: null,
  });

  if (clinicalReviewInsert.error) {
    messages.push('O cálculo foi salvo, mas o registro de revisão clínica falhou.');
  }

  let targetsPersisted = false;
  if (engine.targets) {
    const targetInsert = await admin.from('nutrition_targets').insert({
      engine_run_id: runId,
      patient_id: input.patientId,
      ...engine.targets,
      constraints_data: engine.constraints,
    });
    targetsPersisted = !targetInsert.error;
    if (!targetsPersisted) messages.push('Os alvos nutricionais não puderam ser registrados.');
  }

  await logAuditEvent({
    actorId: input.actorId,
    action: engine.requires_professional_review ? 'nutrition_engine.review_required' : engine.status === 'calculated' ? 'nutrition_engine.completed' : 'nutrition_engine.failed',
    entityType: 'nutrition_engine_runs',
    entityId: runId,
    metadata: { patient_id: input.patientId, automatic_activation: true, status: engine.status },
    useAdminClient: true,
  });

  let diet: PlanActivationResult['diet'] = 'not_eligible';
  if (targetsPersisted && ['calculated', 'review_required'].includes(engine.status)) {
    const generatedDiet = await generateDietPlanAction(input.patientId);
    if (generatedDiet.success) diet = generatedDiet.data?.generation_status === 'review_required' ? 'review_required' : 'generated';
    else {
      diet = 'failed';
      messages.push(generatedDiet.error ?? 'O plano alimentar não pôde ser gerado.');
    }
  } else {
    messages.push('O plano alimentar aguarda dados nutricionais suficientes.');
  }

  let workout: PlanActivationResult['workout'] = 'needs_configuration';
  const requestedDays = input.profile.training_days_per_week ?? 0;
  if (input.actorId !== input.patientId) {
    messages.push('O treino deve ser ativado pelo próprio paciente ou por um profissional habilitado de educação física.');
  } else if (requestedDays >= 2) {
    const clinicalReviewRequired = Boolean(
      input.sensitive?.has_reported_clinical_condition ||
      input.sensitive?.is_pregnant ||
      input.sensitive?.is_breastfeeding ||
      input.sensitive?.has_eating_disorder_history
    );
    const generatedWorkout = await generateWorkoutProgramAction(input.patientId, {
      objective: mapPrimaryGoalToWorkoutObjective(input.profile.primary_goal),
      experience_level: inferWorkoutExperience(input.profile),
      sessions_per_week: Math.min(6, requestedDays),
      session_duration_minutes: input.profile.training_duration_minutes ?? 45,
      source_profile_version: input.profile.version,
      constraints: {
        available_equipment: inferWorkoutEquipment(input.profile),
        has_unassessed_clinical_symptoms: clinicalReviewRequired,
      },
    });
    if (generatedWorkout.success) workout = generatedWorkout.data?.generation_status === 'review_required' ? 'review_required' : 'generated';
    else {
      workout = 'failed';
      messages.push(generatedWorkout.error ?? 'O treino não pôde ser gerado.');
    }
  } else {
    messages.push('Informe pelo menos dois dias de treino por semana para gerar o programa.');
  }

  const result: PlanActivationResult = {
    nutrition: engine.status === 'calculated' || engine.status === 'review_required' || engine.status === 'insufficient_data' ? engine.status : 'failed',
    diet,
    workout,
    messages,
  };
  await persistActivationResult(admin, activationKey, result);
  return result;
}

async function persistActivationResult(
  admin: ReturnType<typeof createAdminClient>,
  key: { patient_id: string; profile_version: number },
  result: PlanActivationResult
) {
  await admin.from('patient_plan_activations').update({
    nutrition_status: result.nutrition,
    diet_status: result.diet,
    workout_status: result.workout,
    messages: result.messages,
    completed_at: new Date().toISOString(),
  }).eq('patient_id', key.patient_id).eq('profile_version', key.profile_version);
}
