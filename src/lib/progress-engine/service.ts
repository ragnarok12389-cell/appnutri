import { createAdminClient } from '@/lib/supabase/admin';
import { analyzeProgress } from './engine';
import { ProgressAnalysisInput, ProgressCheckIn, ProgressFeedbackInput } from '@/types/progress';

function utcDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function subtractUtcDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() - days);
  return copy;
}

export async function runProgressAnalysisForPatient(patientId: string): Promise<string> {
  const admin = createAdminClient();
  const now = new Date();
  const windowEnd = utcDate(now);
  const windowStart = utcDate(subtractUtcDays(now, 27));

  const [checkInsResult, workoutLogsResult, feedbackResult] = await Promise.all([
    admin.from('patient_check_ins').select('*').eq('patient_id', patientId)
      .gte('check_in_date', windowStart).lte('check_in_date', windowEnd)
      .order('check_in_date', { ascending: true }),
    admin.from('workout_execution_logs')
      .select('session_date, workout_exercise_id, workout_exercises ( workout_session_id )')
      .eq('patient_id', patientId).gte('session_date', windowStart).lte('session_date', windowEnd),
    admin.from('ai_feedback_events')
      .select('id, feedback_type, domain, intensity_rating, created_at, status')
      .eq('patient_id', patientId)
      .gte('created_at', `${windowStart}T00:00:00.000Z`).lte('created_at', `${windowEnd}T23:59:59.999Z`)
      .order('created_at', { ascending: true }),
  ]);

  if (checkInsResult.error || workoutLogsResult.error || feedbackResult.error) {
    throw new Error('Não foi possível montar o snapshot autoritativo de progresso.');
  }

  const sessionKeys = new Set<string>();
  for (const log of workoutLogsResult.data ?? []) {
    const exercise = log.workout_exercises as unknown as { workout_session_id: string } | null;
    if (exercise?.workout_session_id) sessionKeys.add(`${log.session_date}:${exercise.workout_session_id}`);
  }

  const checkIns = (checkInsResult.data ?? []).map((row) => ({
    id: row.id,
    patient_id: row.patient_id,
    check_in_date: row.check_in_date,
    weight_kg: row.weight_kg === null ? undefined : Number(row.weight_kg),
    hunger_level: row.hunger_level ?? undefined,
    energy_level: row.energy_level ?? undefined,
    sleep_quality: row.sleep_quality ?? undefined,
    nutrition_adherence_rating: row.nutrition_adherence_rating ?? undefined,
    workout_adherence_rating: row.workout_adherence_rating ?? undefined,
    concerning_symptoms: row.concerning_symptoms,
    notes: row.notes ?? undefined,
    created_at: row.created_at,
  })) satisfies ProgressCheckIn[];

  const feedbackEvents = (feedbackResult.data ?? []).map((row) => ({
    id: row.id,
    feedback_type: row.feedback_type,
    domain: row.domain,
    intensity_rating: row.intensity_rating ?? undefined,
    created_at: row.created_at,
  })) satisfies ProgressFeedbackInput[];

  const input: ProgressAnalysisInput = {
    patient_id: patientId,
    window_start: windowStart,
    window_end: windowEnd,
    check_ins: checkIns,
    workout_session_dates: [...sessionKeys],
    feedback_events: feedbackEvents,
  };
  const result = analyzeProgress(input);
  const feedbackIds = (feedbackResult.data ?? [])
    .filter((event) => event.status === 'recorded')
    .map((event) => event.id);

  const { data: analysisId, error } = await admin.rpc('persist_progress_analysis_atomic', {
    p_patient_id: patientId,
    p_window_start: windowStart,
    p_window_end: windowEnd,
    p_engine_version: result.engine_version,
    p_config_version: result.config_version,
    p_input_hash: result.input_hash,
    p_output_hash: result.output_hash,
    p_input_snapshot: input,
    p_metrics: result.metrics,
    p_reason_codes: result.reason_codes,
    p_data_quality: result.data_quality,
    p_proposals: result.proposals,
    p_feedback_ids: feedbackIds,
  });

  if (error || !analysisId) {
    throw new Error(`Falha ao persistir análise de progresso: ${error?.message ?? 'ID ausente'}`);
  }
  return analysisId as string;
}
