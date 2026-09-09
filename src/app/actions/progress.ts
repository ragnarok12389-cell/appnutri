'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import { hasPermission, hasRole } from '@/lib/auth/roles';
import { logAuditEvent } from '@/lib/audit/logger';
import { runProgressAnalysisForPatient } from '@/lib/progress-engine/service';
import {
  CheckInInput,
  CheckInInputSchema,
  ProgressCheckIn,
  ReviewAdjustmentProposalSchema,
} from '@/types/progress';

interface ActionResponse<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

export interface ProgressDashboardData {
  check_ins: ProgressCheckIn[];
  latest_analysis: {
    id: string;
    data_quality: 'insufficient' | 'partial' | 'sufficient';
    metrics: Record<string, number | null>;
    reason_codes: string[];
    created_at: string;
  } | null;
  proposals: Array<{
    id: string;
    domain: 'nutrition' | 'workout' | 'general';
    proposal_type: string;
    priority: 'low' | 'medium' | 'high';
    summary: string;
    status: 'pending_review' | 'accepted_for_review' | 'dismissed';
    created_at: string;
  }>;
}

function utcDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

async function canAccessPatient(userId: string, patientId: string): Promise<boolean> {
  if (userId === patientId) return true;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('professional_patient_links')
    .select('id')
    .eq('professional_id', userId)
    .eq('patient_id', patientId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  return !error && Boolean(data);
}

export async function recordPatientCheckInAction(
  input: CheckInInput
): Promise<ActionResponse<{ check_in_id: string; analysis_id?: string; analysis_pending: boolean }>> {
  const user = await getCurrentUser();
  if (!user || !hasRole(user, 'patient')) return { error: 'Acesso restrito ao paciente autenticado.' };

  const parsed = CheckInInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check-in inválido.' };
  if (parsed.data.check_in_date > utcDate()) return { error: 'A data do check-in não pode estar no futuro.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('patient_check_ins')
    .insert({ patient_id: user.id, ...parsed.data })
    .select('id')
    .single();

  if (error || !data) {
    const duplicate = error?.code === '23505';
    return { error: duplicate ? 'Já existe um check-in nesta data.' : 'Não foi possível registrar o check-in.' };
  }

  let analysisId: string | undefined;
  try {
    analysisId = await runProgressAnalysisForPatient(user.id);
  } catch {
    // O check-in é histórico válido mesmo se a análise derivada precisar ser reprocessada.
  }

  await logAuditEvent({
    actorId: user.id,
    action: 'progress.check_in_recorded',
    entityType: 'patient_check_ins',
    entityId: data.id,
    metadata: { check_in_date: parsed.data.check_in_date, analysis_id: analysisId ?? null },
  });

  return {
    success: true,
    data: { check_in_id: data.id, analysis_id: analysisId, analysis_pending: !analysisId },
  };
}

export async function getProgressDashboardAction(
  targetPatientId?: string
): Promise<ActionResponse<ProgressDashboardData>> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Autenticação requerida.' };
  const patientId = targetPatientId ?? user.id;

  if (patientId !== user.id && !hasRole(user, ['nutritionist', 'admin'])) {
    return { error: 'Este perfil não possui acesso a check-ins individuais.' };
  }
  const authorizedPatient = hasRole(user, 'admin') || (await canAccessPatient(user.id, patientId));
  if (!hasPermission(user, 'progress.view') || !authorizedPatient) {
    return { error: 'Você não possui acesso ao progresso deste paciente.' };
  }

  const supabase = await createClient();
  const [checkIns, analyses, proposals] = await Promise.all([
    supabase.from('patient_check_ins').select('*').eq('patient_id', patientId).order('check_in_date', { ascending: false }).limit(12),
    supabase.from('progress_analyses').select('id, data_quality, metrics, reason_codes, created_at').eq('patient_id', patientId).order('created_at', { ascending: false }).limit(1),
    supabase.from('adjustment_proposals').select('id, domain, proposal_type, priority, summary, status, created_at').eq('patient_id', patientId).order('created_at', { ascending: false }).limit(20),
  ]);

  if (checkIns.error || analyses.error || proposals.error) return { error: 'Não foi possível carregar o progresso.' };

  return {
    success: true,
    data: {
      check_ins: (checkIns.data ?? []).map((row) => ({
        ...row,
        weight_kg: row.weight_kg === null ? undefined : Number(row.weight_kg),
      })) as ProgressCheckIn[],
      latest_analysis: (analyses.data?.[0] as ProgressDashboardData['latest_analysis']) ?? null,
      proposals: (proposals.data ?? []) as ProgressDashboardData['proposals'],
    },
  };
}

export async function reviewAdjustmentProposalAction(
  input: unknown
): Promise<ActionResponse<{ reviewed: boolean }>> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Autenticação requerida.' };
  const parsed = ReviewAdjustmentProposalSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Revisão inválida.' };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('review_adjustment_proposal', {
    p_proposal_id: parsed.data.proposal_id,
    p_reviewer_id: user.id,
    p_decision: parsed.data.decision,
    p_notes: parsed.data.notes ?? null,
  });

  if (error || data !== true) return { error: 'Proposta indisponível ou sem autorização para este domínio.' };

  await logAuditEvent({
    actorId: user.id,
    action: 'progress.adjustment_proposal_reviewed',
    entityType: 'adjustment_proposals',
    entityId: parsed.data.proposal_id,
    metadata: { decision: parsed.data.decision },
    useAdminClient: true,
  });
  return { success: true, data: { reviewed: true } };
}
