'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/roles';
import { logAuditEvent } from '@/lib/audit/logger';
import { calculateNutritionProfileCompleteness } from '@/lib/nutrition/completeness';
import {
  step1BodySchema,
  step2GoalSchema,
  step3RoutineSchema,
  step4MealsSchema,
  step5PreferencesSchema,
  step6BudgetSchema,
  step7KitchenSchema,
} from '@/lib/validations/nutrition-profile';
import {
  PatientNutritionProfile,
  PatientNutritionSensitive,
  PatientNutritionSnapshot,
  FullPatientNutritionData,
} from '@/types/nutrition-profile';
import { activatePlansAfterCompletedProfile, PlanActivationResult } from '@/lib/plan-activation/service';

export interface ActionResponse<T = unknown> {
  success?: boolean;
  data?: T;
  error?: string;
}

/**
 * Salva parcialmente uma das 7 etapas do Perfil Nutricional.
 * A autoridade de identidade é SEMPRE validada via auth.uid() no servidor.
 * Dados clínicos e sensíveis (alergias, intolerâncias, notas médicas) são
 * fisicamente isolados na tabela `patient_nutrition_sensitive`.
 */
export async function saveNutritionProfileStepAction(
  step: number,
  inputData: Record<string, unknown>,
  targetPatientId?: string
): Promise<ActionResponse<{ completionPercentage: number; profile: PatientNutritionProfile }>> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Acesso não autorizado: autenticação requerida.' };
  }

  // Define paciente alvo com segurança
  let patientId = user.id;
  if (targetPatientId && targetPatientId !== user.id) {
    // Apenas nutricionista ou admin com permissão de edição pode alterar perfil de terceiro
    if (!hasPermission(user, 'nutrition_profile.edit')) {
      return { error: 'Permissão negada para editar o perfil nutricional deste paciente.' };
    }
    patientId = targetPatientId;
  }

  // Validação Zod modular baseada na etapa
  let parsedData: Record<string, unknown> = {};
  switch (step) {
    case 1: {
      const res = step1BodySchema.safeParse(inputData);
      if (!res.success) return { error: res.error.issues[0]?.message || 'Dados corporais inválidos.' };
      parsedData = res.data;
      break;
    }
    case 2: {
      const res = step2GoalSchema.safeParse(inputData);
      if (!res.success) return { error: res.error.issues[0]?.message || 'Dados de objetivo inválidos.' };
      parsedData = res.data;
      break;
    }
    case 3: {
      const res = step3RoutineSchema.safeParse(inputData);
      if (!res.success) return { error: res.error.issues[0]?.message || 'Dados de rotina inválidos.' };
      parsedData = res.data;
      break;
    }
    case 4: {
      const res = step4MealsSchema.safeParse(inputData);
      if (!res.success) return { error: res.error.issues[0]?.message || 'Dados de refeições inválidos.' };
      parsedData = res.data;
      break;
    }
    case 5: {
      const res = step5PreferencesSchema.safeParse(inputData);
      if (!res.success) return { error: res.error.issues[0]?.message || 'Preferências alimentares inválidas.' };
      parsedData = res.data;
      break;
    }
    case 6: {
      const res = step6BudgetSchema.safeParse(inputData);
      if (!res.success) return { error: res.error.issues[0]?.message || 'Dados de orçamento inválidos.' };
      parsedData = res.data;
      break;
    }
    case 7: {
      const res = step7KitchenSchema.safeParse(inputData);
      if (!res.success) return { error: res.error.issues[0]?.message || 'Dados de preparo e hábitos inválidos.' };
      parsedData = res.data;
      break;
    }
    default:
      return { error: 'Etapa do questionário inválida.' };
  }

  const supabase = await createClient();

  // Se for a etapa 5, isola os dados clínicos sensíveis para persistência física segregada
  if (step === 5) {
    const sensitiveData = {
      patient_id: patientId,
      food_allergies: (parsedData.food_allergies as string[]) || [],
      food_intolerances: (parsedData.food_intolerances as string[]) || [],
      medical_dietary_notes: (parsedData.medical_dietary_notes as string) || null,
      clinical_dietary_restrictions:
        ((parsedData.clinical_dietary_restrictions || parsedData.dietary_restrictions) as string[]) || [],
      last_updated_by: user.id,
      updated_at: new Date().toISOString(),
    };

    const { error: sensError } = await supabase
      .from('patient_nutrition_sensitive')
      .upsert(sensitiveData);

    if (sensError) {
      return { error: 'Falha ao salvar dados clínicos sensíveis.' };
    }

    // Remove campos sensíveis do objeto que vai para a tabela geral
    delete parsedData.food_allergies;
    delete parsedData.food_intolerances;
    delete parsedData.medical_dietary_notes;
    delete parsedData.clinical_dietary_restrictions;
    delete parsedData.dietary_restrictions;
  }

  // 1. Busca perfil atual para fusão de completude
  const { data: currentProfile } = await supabase
    .from('patient_nutrition_profiles')
    .select('*')
    .eq('id', patientId)
    .maybeSingle();

  const merged = {
    ...(currentProfile || {}),
    ...parsedData,
  };

  const newCompletion = calculateNutritionProfileCompleteness(merged);

  // 2. Persiste na tabela geral via Upsert
  const { data: updatedProfile, error: upsertError } = await supabase
    .from('patient_nutrition_profiles')
    .upsert({
      id: patientId,
      ...parsedData,
      completion_percentage: newCompletion,
      last_updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (upsertError || !updatedProfile) {
    return { error: 'Falha ao salvar respostas do perfil nutricional.' };
  }

  // 3. Auditoria segura (sem dump de texto clínico confidencial)
  await logAuditEvent({
    actorId: user.id,
    action: 'nutrition_profile.updated',
    entityType: 'patient_nutrition_profiles',
    entityId: patientId,
    metadata: {
      step,
      completion_percentage: newCompletion,
      updated_by_role: user.profile.role_id,
    },
  });

  return {
    success: true,
    data: {
      completionPercentage: newCompletion,
      profile: updatedProfile as PatientNutritionProfile,
    },
  };
}

/**
 * Conclui o preenchimento do questionário e gera Snapshots Imutáveis de versão
 * (com snapshots gerais e clínicos fisicamente separados).
 */
export async function completeNutritionProfileAction(
  targetPatientId?: string
): Promise<ActionResponse<{ version: number; snapshotId: string; activation: PlanActivationResult }>> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Acesso não autorizado: autenticação requerida.' };
  }

  const patientId = targetPatientId && targetPatientId !== user.id ? targetPatientId : user.id;

  if (targetPatientId && targetPatientId !== user.id && !hasPermission(user, 'nutrition_profile.edit')) {
    return { error: 'Permissão negada para concluir o perfil deste paciente.' };
  }

  const supabase = await createClient();

  // Busca perfil completo ativo
  const { data: profile, error: fetchError } = await supabase
    .from('patient_nutrition_profiles')
    .select('*')
    .eq('id', patientId)
    .single();

  if (fetchError || !profile) {
    return { error: 'Perfil nutricional não encontrado para finalização.' };
  }

  const currentVersion = profile.version || 1;
  const newVersion = currentVersion + (profile.is_completed ? 1 : 0);

  // 1. Atualiza perfil ativo para concluído
  const { error: updateError } = await supabase
    .from('patient_nutrition_profiles')
    .update({
      is_completed: true,
      version: newVersion,
      last_updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', patientId);

  if (updateError) {
    return { error: 'Erro ao marcar perfil nutricional como concluído.' };
  }

  // 2. Cria Snapshot Geral Imutável (dados não-sensíveis)
  const { data: snapshot, error: snapshotError } = await supabase
    .from('patient_nutrition_snapshots')
    .insert({
      patient_id: patientId,
      version: newVersion,
      snapshot_data: profile,
      completion_percentage: profile.completion_percentage,
      created_by: user.id,
      change_summary: `Versão ${newVersion} congelada em ${new Date().toLocaleDateString('pt-BR')}`,
    })
    .select('id')
    .single();

  if (snapshotError || !snapshot) {
    return { error: 'Erro ao registrar histórico de versão do perfil nutricional.' };
  }

  // 3. Cria Snapshot Clínico Sensível Imutável (se houver dados sensíveis)
  const { data: sensitiveData } = await supabase
    .from('patient_nutrition_sensitive')
    .select('*')
    .eq('patient_id', patientId)
    .maybeSingle();

  let sensitiveSnapshotId: string | null = null;
  if (sensitiveData) {
    const { data: sensitiveSnapshot, error: sensitiveSnapshotError } = await supabase
      .from('patient_nutrition_sensitive_snapshots')
      .insert({
        patient_id: patientId,
        version: newVersion,
        snapshot_data: {
          food_allergies: sensitiveData.food_allergies,
          food_intolerances: sensitiveData.food_intolerances,
          medical_dietary_notes: sensitiveData.medical_dietary_notes,
          clinical_dietary_restrictions: sensitiveData.clinical_dietary_restrictions,
        },
        created_by: user.id,
      })
      .select('id')
      .single();
    if (sensitiveSnapshotError || !sensitiveSnapshot) {
      return { error: 'Erro ao registrar o histórico clínico protegido do perfil.' };
    }
    sensitiveSnapshotId = sensitiveSnapshot?.id ?? null;
  }

  // 4. Auditoria
  await logAuditEvent({
    actorId: user.id,
    action: 'nutrition_profile.completed',
    entityType: 'patient_nutrition_profiles',
    entityId: patientId,
    metadata: {
      version: newVersion,
      completion_percentage: profile.completion_percentage,
    },
  });

  await logAuditEvent({
    actorId: user.id,
    action: 'nutrition_profile.version_created',
    entityType: 'patient_nutrition_snapshots',
    entityId: snapshot.id,
    metadata: {
      patient_id: patientId,
      version: newVersion,
    },
  });

  const activation = await activatePlansAfterCompletedProfile({
    patientId,
    actorId: user.id,
    profile: { ...profile, is_completed: true, version: newVersion } as PatientNutritionProfile,
    sensitive: sensitiveData as PatientNutritionSensitive | null,
    snapshotId: snapshot.id,
    sensitiveSnapshotId,
  });

  return {
    success: true,
    data: {
      version: newVersion,
      snapshotId: snapshot.id,
      activation,
    },
  };
}

/**
 * Consulta o perfil nutricional de um paciente com segregação física de dados sensíveis.
 * Influenciadores NÃO recebem dados clínicos sensíveis (medical_dietary_notes, alergias, intolerâncias).
 */
export async function getNutritionProfileForPatientAction(
  targetPatientId?: string
): Promise<ActionResponse<FullPatientNutritionData | null>> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Acesso não autorizado: autenticação requerida.' };
  }

  const patientId = targetPatientId || user.id;

  // Se estiver consultando perfil de outro usuário, exige permissão de visualização
  if (patientId !== user.id && !hasPermission(user, 'nutrition_profile.view')) {
    return { error: 'Permissão negada para visualizar este perfil nutricional.' };
  }

  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from('patient_nutrition_profiles')
    .select('*')
    .eq('id', patientId)
    .maybeSingle();

  if (error) {
    return { error: 'Erro ao carregar perfil nutricional.' };
  }

  if (!profile) {
    return { success: true, data: null };
  }

  const typedProfile = profile as PatientNutritionProfile;

  // Segregação de Dados Sensíveis:
  // Se o usuário logado possui 'nutrition_sensitive.view' ou é o próprio paciente,
  // busca os dados clínicos sensíveis da tabela segregada `patient_nutrition_sensitive`.
  const canViewSensitive = user.id === patientId || hasPermission(user, 'nutrition_sensitive.view');

  if (canViewSensitive) {
    const { data: sensitiveData } = await supabase
      .from('patient_nutrition_sensitive')
      .select('*')
      .eq('patient_id', patientId)
      .maybeSingle();

    return {
      success: true,
      data: {
        ...typedProfile,
        food_allergies: sensitiveData?.food_allergies || [],
        food_intolerances: sensitiveData?.food_intolerances || [],
        medical_dietary_notes: sensitiveData?.medical_dietary_notes || null,
        clinical_dietary_restrictions: sensitiveData?.clinical_dietary_restrictions || [],
      },
    };
  }

  // Usuário SEM permissão de dados sensíveis (ex: Influenciador):
  // Retorna estritamente os dados gerais. Campos sensíveis não chegam ao influenciador.
  return {
    success: true,
    data: {
      ...typedProfile,
      food_allergies: [],
      food_intolerances: [],
      medical_dietary_notes: null,
      clinical_dietary_restrictions: [],
    },
  };
}

/**
 * Consulta a lista de snapshots históricos do paciente (dados gerais).
 */
export async function getNutritionSnapshotsAction(
  targetPatientId?: string
): Promise<ActionResponse<PatientNutritionSnapshot[]>> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Acesso não autorizado: autenticação requerida.' };
  }

  const patientId = targetPatientId || user.id;
  if (patientId !== user.id && !hasPermission(user, 'nutrition_profile.view')) {
    return { error: 'Permissão negada para visualizar o histórico de versões.' };
  }

  const supabase = await createClient();

  const { data: snapshots, error } = await supabase
    .from('patient_nutrition_snapshots')
    .select('*')
    .eq('patient_id', patientId)
    .order('version', { ascending: false });

  if (error) {
    return { error: 'Erro ao carregar histórico de versões.' };
  }

  return {
    success: true,
    data: (snapshots || []) as PatientNutritionSnapshot[],
  };
}
