'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/roles';
import { logAuditEvent } from '@/lib/audit/logger';
import {
  NutritionEngineInput,
  NutritionTargetData,
  NutritionEngineRunRow,
  NutritionEngineClinicalReviewRow,
} from '@/types/nutrition-engine';

export interface ActionResponse<T = unknown> {
  data?: T;
  error?: string;
  success?: boolean;
}

export interface LatestNutritionTargetResponse {
  run: NutritionEngineRunRow;
  clinicalReview: NutritionEngineClinicalReviewRow | null;
  targets: NutritionTargetData | null;
  displayReasonCodes: string[];
}

import { runNutritionEngine } from '@/lib/nutrition-engine/engine';

/**
 * Executa o cálculo determinístico do motor nutricional para um paciente.
 * Requer permissão explícita 'nutrition_engine.run' (Admin ou Nutricionista vinculado ativo).
 * Influenciadores e pacientes NÃO possuem autoridade para executar o motor.
 */
export async function executeNutritionEngineAction(
  patientId: string
): Promise<ActionResponse<{ runId: string; status: string; requires_professional_review: boolean }>> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Acesso não autorizado: autenticação requerida.' };
  }

  // Validação de RBAC
  if (!hasPermission(user, 'nutrition_engine.run')) {
    return { error: 'Acesso negado: você não possui autorização para acionar o motor nutricional.' };
  }

  const supabase = await createClient();

  // 1. Busca o snapshot não-sensível mais recente fechado
  const { data: snapshot, error: snapError } = await supabase
    .from('patient_nutrition_snapshots')
    .select('*')
    .eq('patient_id', patientId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (snapError || !snapshot) {
    return { error: 'Nenhum snapshot de perfil nutricional encontrado para processamento.' };
  }

  // 2. Busca o snapshot sensível correspondente (se existir)
  const { data: sensitiveSnapshot } = await supabase
    .from('patient_nutrition_sensitive_snapshots')
    .select('*')
    .eq('patient_id', patientId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 3. Execução Determinística e Offline do Motor
  const engineInput: NutritionEngineInput = {
    patient_id: patientId,
    snapshot: snapshot.snapshot_data,
    sensitive_snapshot: sensitiveSnapshot?.snapshot_data || null,
  };

  const engineResult = runNutritionEngine(engineInput);

  // 4. Invalida execuções anteriores ativas marcando-as como superseded
  await supabase
    .from('nutrition_engine_runs')
    .update({ status: 'superseded' })
    .eq('patient_id', patientId)
    .in('status', ['calculated', 'review_required']);

  // 5. Registra o Run Imutável na tabela geral nutrition_engine_runs (SEM reason codes clínicos)
  const { data: run, error: runError } = await supabase
    .from('nutrition_engine_runs')
    .insert({
      patient_id: patientId,
      nutrition_snapshot_id: snapshot.id,
      sensitive_snapshot_id: sensitiveSnapshot?.id || null,
      engine_version: engineResult.engine_version,
      config_version: engineResult.config_version,
      status: engineResult.status,
      requires_professional_review: engineResult.requires_professional_review,
      input_hash: engineResult.input_hash,
      output_hash: engineResult.output_hash,
      calculated_by: user.id,
    })
    .select('id')
    .single();

  if (runError || !run) {
    return { error: 'Falha ao registrar a execução do motor nutricional no banco de dados.' };
  }

  // 6. Registra na tabela fisicamente segregada nutrition_engine_clinical_reviews
  // EXCLUSIVAMENTE pelo backend confiável (Service Role / Admin) para assegurar
  // que nenhum profissional consiga fabricar reason codes diretamente pela Data API.
  let clinicalError = null;
  try {
    const adminDb = createAdminClient();
    const { error } = await adminDb.from('nutrition_engine_clinical_reviews').insert({
      engine_run_id: run.id,
      patient_id: patientId,
      requires_professional_review: engineResult.clinical_review.requires_professional_review,
      clinical_reason_codes: engineResult.clinical_review.clinical_reason_codes,
      clinical_review_notes: engineResult.clinical_review.clinical_review_notes || null,
    });
    clinicalError = error;
  } catch (err) {
    clinicalError = err;
  }

  if (clinicalError) {
    return { error: 'Falha ao persistir a revisão clínica segregada.' };
  }

  // 7. Se alvos foram calculados, persiste na tabela nutrition_targets
  if (engineResult.targets) {
    const { error: targetError } = await supabase.from('nutrition_targets').insert({
      engine_run_id: run.id,
      patient_id: patientId,
      ...engineResult.targets,
      constraints_data: engineResult.constraints,
    });

    if (targetError) {
      return { error: 'Falha ao persistir as metas nutricionais calculadas.' };
    }
  }

  // 8. Auditoria segura
  await logAuditEvent({
    actorId: user.id,
    action: engineResult.requires_professional_review
      ? 'nutrition_engine.review_required'
      : engineResult.status === 'insufficient_data'
      ? 'nutrition_engine.failed'
      : 'nutrition_engine.completed',
    entityType: 'nutrition_engine_runs',
    entityId: run.id,
    metadata: {
      patient_id: patientId,
      engine_version: engineResult.engine_version,
      status: engineResult.status,
      requires_professional_review: engineResult.requires_professional_review,
      reasons_count: engineResult.clinical_review.clinical_reason_codes.length,
    },
  });

  return {
    success: true,
    data: {
      runId: run.id,
      status: engineResult.status,
      requires_professional_review: engineResult.requires_professional_review,
    },
  };
}

/**
 * Consulta a execução e alvos mais recentes do paciente.
 * Aplica segregação estrita de razão clínica para influenciadores.
 */
export async function getLatestNutritionTargetAction(
  targetPatientId?: string
): Promise<ActionResponse<LatestNutritionTargetResponse | null>> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Acesso não autorizado: autenticação requerida.' };
  }

  const patientId = targetPatientId || user.id;

  if (patientId !== user.id && !hasPermission(user, 'nutrition_engine.view')) {
    return { error: 'Permissão negada para visualizar alvos nutricionais deste paciente.' };
  }

  const supabase = await createClient();

  // Busca a execução mais recente
  const { data: latestRun, error: runError } = await supabase
    .from('nutrition_engine_runs')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runError) {
    return { error: 'Erro ao consultar execuções do motor.' };
  }

  if (!latestRun) {
    return { success: true, data: null };
  }

  // Busca os alvos vinculados a essa execução
  const { data: targets, error: targetsError } = await supabase
    .from('nutrition_targets')
    .select('*')
    .eq('engine_run_id', latestRun.id)
    .maybeSingle();

  if (targetsError) {
    return { error: 'Erro ao consultar metas calculadas.' };
  }

  // Segregação Física e Arquitetural para Influenciadores:
  // Se o usuário não é o próprio paciente nem nutricionista habilitado,
  // NÃO consulta a tabela nutrition_engine_clinical_reviews.
  const canViewClinical = user.id === patientId || hasPermission(user, 'nutrition_sensitive.view');

  let clinicalReview: NutritionEngineClinicalReviewRow | null = null;
  let displayReasonCodes: string[] = [];

  if (canViewClinical) {
    const { data: rev } = await supabase
      .from('nutrition_engine_clinical_reviews')
      .select('*')
      .eq('engine_run_id', latestRun.id)
      .maybeSingle();

    clinicalReview = rev as NutritionEngineClinicalReviewRow | null;
    displayReasonCodes = clinicalReview?.clinical_reason_codes || [];
  } else if (latestRun.requires_professional_review) {
    // Para influenciador: estado genérico sem revelar diagnóstico ou condição clínica
    displayReasonCodes = ['REVISAO_PROFISSIONAL_NECESSARIA'];
  }

  return {
    success: true,
    data: {
      run: latestRun as NutritionEngineRunRow,
      clinicalReview,
      targets: targets as NutritionTargetData | null,
      displayReasonCodes,
    },
  };
}

/**
 * Adiciona observação clínica do profissional de saúde (nutricionista vinculado).
 * O paciente não pode apagar nem sobrescrever essas anotações.
 */
export async function addProfessionalClinicalNoteAction(
  patientId: string,
  clinicalNotes: string,
  recommendedCaloricAdjustmentKcal?: number,
  recommendedProteinGPerKg?: number
): Promise<ActionResponse<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Acesso não autorizado: autenticação requerida.' };
  }

  if (!hasPermission(user, 'nutrition.edit')) {
    return { error: 'Apenas nutricionistas autorizados podem inserir anotações clínicas.' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('patient_professional_clinical_notes')
    .insert({
      patient_id: patientId,
      professional_id: user.id,
      clinical_notes: clinicalNotes,
      recommended_caloric_adjustment_kcal: recommendedCaloricAdjustmentKcal || null,
      recommended_protein_g_per_kg: recommendedProteinGPerKg || null,
    })
    .select('id')
    .single();

  if (error || !data) {
    return { error: 'Falha ao salvar anotação clínica profissional.' };
  }

  await logAuditEvent({
    actorId: user.id,
    action: 'nutrition_profile.edit',
    entityType: 'patient_professional_clinical_notes',
    entityId: data.id,
    metadata: {
      patient_id: patientId,
      has_caloric_adjustment: Boolean(recommendedCaloricAdjustmentKcal),
    },
  });

    return {
    success: true,
    data: { id: data.id },
  };
}

/**
 * Registra o parecer de revisão clínica de uma execução do motor nutricional por um nutricionista vinculado.
 * Atualiza exclusivamente as anotações clínicas (clinical_review_notes) e assinatura da revisão
 * (reviewed_by, reviewed_at), preservando os reason codes automáticos que são estritamente imutáveis.
 */
export async function submitClinicalReviewAction(
  engineRunId: string,
  clinicalReviewNotes: string
): Promise<ActionResponse<{ success: boolean }>> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Acesso não autorizado: autenticação requerida.' };
  }

  if (!hasPermission(user, 'nutrition_engine.review')) {
    return { error: 'Apenas nutricionistas autorizados podem submeter revisões clínicas.' };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('nutrition_engine_clinical_reviews')
    .update({
      clinical_review_notes: clinicalReviewNotes,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('engine_run_id', engineRunId);

  if (error) {
    return { error: 'Falha ao registrar revisão clínica no banco de dados.' };
  }

  await logAuditEvent({
    actorId: user.id,
    action: 'nutrition_engine.review',
    entityType: 'nutrition_engine_clinical_reviews',
    entityId: engineRunId,
    metadata: {
      engine_run_id: engineRunId,
      reviewed_at: new Date().toISOString(),
    },
  });

  return { success: true, data: { success: true } };
}

