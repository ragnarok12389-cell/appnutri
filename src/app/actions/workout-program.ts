'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { hasRole } from '@/lib/auth/roles';
import { logAuditEvent } from '@/lib/audit/logger';
import {
  WorkoutObjective,
  WorkoutExperienceLevel,
  WorkoutConstraints,
  WorkoutComposerInput,
  Exercise,
  WorkoutProgram,
  ExerciseSubstitutionOption,
} from '@/types/workout-engine';
import { runWorkoutComposer } from '@/lib/workout-engine/engine';
import { CURATED_EXERCISE_CATALOG } from '@/lib/workout-engine/catalog';
import { getExerciseSubstitutionOptions } from '@/lib/workout-engine/substitution';
import { evaluateDoubleProgression } from '@/lib/workout-engine/progression';

export interface ActionResponse<T = unknown> {
  data?: T;
  error?: string;
  success?: boolean;
}

/**
 * Executa a composição determinística de programa de treino para um paciente.
 * Bloqueia expressamente perfis de nutricionistas (segregação estrita CREF/CFN).
 */
export async function generateWorkoutProgramAction(
  patientId: string,
  params: {
    objective: WorkoutObjective;
    experience_level: WorkoutExperienceLevel;
    sessions_per_week: number;
    session_duration_minutes?: number;
    source_profile_version?: number;
    constraints?: Partial<WorkoutConstraints>;
  }
): Promise<ActionResponse<{ programId: string; generation_status: string; output_program_hash: string }>> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Acesso não autorizado: autenticação requerida.' };
  }

  // 1. Segregação Rigorosa de Papéis: Nutricionistas NÃO prescrevem treino
  if (hasRole(user, 'nutritionist')) {
    return {
      error: 'Acesso negado: nutricionistas não possuem competência legal para prescrever ou alterar programas de treino.',
    };
  }

  const adminClient = createAdminClient();

  // 2. Validação do Paciente
  const { data: patientRow, error: patientErr } = await adminClient
    .from('patients')
    .select('id')
    .eq('id', patientId)
    .maybeSingle();

  if (patientErr || !patientRow) {
    return { error: 'Paciente não encontrado no sistema.' };
  }

  const isPatientOwner = user.id === patientRow.id;
  const isAdmin = hasRole(user, 'admin');
  if (!isPatientOwner && !isAdmin) {
    return { error: 'Acesso negado: você não possui autorização para gerar treino para este paciente.' };
  }

  // 3. Catálogo de Exercícios (banco ou catálogo curado em memória)
  const { data: dbCatalog } = await adminClient
    .from('exercise_catalog')
    .select('*')
    .eq('is_active', true);

  const catalog: Exercise[] = (dbCatalog && dbCatalog.length > 0)
    ? (dbCatalog as unknown as Exercise[])
    : CURATED_EXERCISE_CATALOG;

  // 4. Montar Constraints
  const defaultConstraints: WorkoutConstraints = {
    available_equipment: ['barbell', 'dumbbell', 'cable', 'machine', 'bench', 'pull_up_bar', 'bodyweight'],
    favorite_exercises: [],
    exercises_refused: [],
    movement_contraindications: [],
    ...params.constraints,
  };

  // 5. Input Determinístico com Timestamp Congelado
  const composerInput: WorkoutComposerInput = {
    patient_id: patientId,
    objective: params.objective,
    experience_level: params.experience_level,
    sessions_per_week: params.sessions_per_week,
    session_duration_minutes: params.session_duration_minutes ?? 60,
    constraints: defaultConstraints,
    catalog: catalog,
    source_profile_version: params.source_profile_version ?? 1,
    generation_reference_at: new Date().toISOString(),
  };

  // 6. Execução Determinística do Motor
  const result = runWorkoutComposer(composerInput);

  if (!result.success || !result.program) {
    await logAuditEvent({
      actorId: user.id,
      action: 'workout_program.infeasible',
      entityType: 'workout_programs',
      entityId: patientId,
      metadata: { reason_codes: result.infeasible_reason_codes, error: result.error_message },
    });

    return {
      error: `Não foi possível gerar o programa de treino: ${result.error_message || 'Inviável'} (${result.infeasible_reason_codes.join(', ')})`,
    };
  }

  const generatedProgram = result.program;

  // 7. Persistência Atômica no PostgreSQL via RPC (Lock de Concorrência e Superseding)
  const autoApprove = generatedProgram.approval_status === 'approved';
  const { data: savedProgramId, error: rpcError } = await adminClient.rpc('persist_workout_program_atomic', {
    p_program: {
      ...generatedProgram,
      created_by: user.id,
    },
    p_auto_approve: autoApprove,
  });

  if (rpcError || !savedProgramId) {
    return { error: `Erro na persistência atômica do programa de treino: ${rpcError?.message || 'Falha no RPC'}` };
  }

  const programId = savedProgramId as string;

  // 8. Log de Auditoria
  await logAuditEvent({
    actorId: user.id,
    action: generatedProgram.generation_status === 'review_required' ? 'workout_program.review_required' : 'workout_program.generated',
    entityType: 'workout_programs',
    entityId: programId,
    metadata: {
      engine_version: generatedProgram.engine_version,
      objective: generatedProgram.objective,
      sessions_per_week: generatedProgram.sessions_per_week,
      output_program_hash: generatedProgram.output_program_hash,
    },
  });

  return {
    success: true,
    data: {
      programId,
      generation_status: generatedProgram.generation_status,
      output_program_hash: generatedProgram.output_program_hash,
    },
  };
}

/**
 * Consulta o programa de treino ativo de um paciente.
 */
export async function getActiveWorkoutProgramAction(
  patientId: string
): Promise<ActionResponse<WorkoutProgram | null>> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Acesso não autorizado: autenticação requerida.' };
  }

  const supabase = await createClient();

  const { data: programRow, error: progError } = await supabase
    .from('workout_programs')
    .select(`
      *,
      workout_program_days (
        *,
        workout_sessions (
          *,
          workout_exercises (
            *
          )
        )
      )
    `)
    .eq('patient_id', patientId)
    .eq('is_active', true)
    .maybeSingle();

  if (progError) {
    return { error: `Erro ao buscar programa de treino: ${progError.message}` };
  }

  if (!programRow) {
    return { data: null };
  }

  // Mapear estrutura para o tipo WorkoutProgram
  const days = ((programRow.workout_program_days as Array<Record<string, unknown>>) || []).map((d) => ({
    id: d.id as string,
    workout_program_id: d.workout_program_id as string,
    day_of_week: d.day_of_week as number,
    day_label: d.day_label as string,
    is_rest_day: d.is_rest_day as boolean,
    sessions: ((d.workout_sessions as Array<Record<string, unknown>>) || []).map((s) => ({
      id: s.id as string,
      workout_program_day_id: s.workout_program_day_id as string,
      session_order: s.session_order as number,
      name: s.name as string,
      session_focus: s.session_focus as string,
      estimated_duration_minutes: s.estimated_duration_minutes as number,
      warmup_protocol: (s.warmup_protocol as Array<{ step: string; duration_seconds?: number }>) || [],
      cooldown_protocol: (s.cooldown_protocol as Array<{ step: string; duration_seconds?: number }>) || [],
      exercises: ((s.workout_exercises as Array<Record<string, unknown>>) || []).map((e) => ({
        id: e.id as string,
        workout_session_id: e.workout_session_id as string,
        exercise_id: e.exercise_id as string,
        exercise_order: e.exercise_order as number,
        exercise_name: (e.exercise_name as string) || 'Exercício',
        movement_pattern: e.movement_pattern,
        prescribed_sets: e.prescribed_sets as number,
        min_reps: e.min_reps as number,
        max_reps: e.max_reps as number,
        target_rir: e.target_rir as number | null,
        target_rpe: e.target_rpe as number | null,
        rest_seconds: e.rest_seconds as number,
        warmup_sets: e.warmup_sets as number,
        progression_strategy: e.progression_strategy,
        notes: e.notes as string | null,
      })),
    })),
  }));

  const program: WorkoutProgram = {
    ...programRow,
    days,
  } as unknown as WorkoutProgram;

  return { data: program };
}

/**
 * Registra a execução real de um exercício pelo paciente e avalia Double Progression.
 */
export async function logWorkoutExecutionAction(
  patientId: string,
  logData: {
    workout_program_id?: string;
    workout_session_id?: string;
    workout_exercise_id?: string;
    exercise_id: string;
    set_number: number;
    weight_kg: number;
    reps_completed: number;
    actual_rir?: number | null;
    actual_rpe?: number | null;
    notes?: string | null;
  }
): Promise<ActionResponse<{ logId: string; progression_event?: Record<string, unknown> }>> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Acesso não autorizado: autenticação requerida.' };
  }

  const supabase = await createClient();
  const adminClient = createAdminClient();

  const { data: insertedLog, error: logError } = await supabase
    .from('workout_execution_logs')
    .insert({
      patient_id: patientId,
      workout_program_id: logData.workout_program_id,
      workout_session_id: logData.workout_session_id,
      workout_exercise_id: logData.workout_exercise_id,
      exercise_id: logData.exercise_id,
      set_number: logData.set_number,
      weight_kg: logData.weight_kg,
      reps_completed: logData.reps_completed,
      actual_rir: logData.actual_rir,
      actual_rpe: logData.actual_rpe,
      notes: logData.notes,
    })
    .select('id')
    .single();

  if (logError || !insertedLog) {
    return { error: `Falha ao registrar execução: ${logError?.message || 'Erro desconhecido'}` };
  }

  // Avaliação determinística de progressão após registro
  const { data: recentLogs } = await adminClient
    .from('workout_execution_logs')
    .select('*')
    .eq('patient_id', patientId)
    .eq('exercise_id', logData.exercise_id)
    .order('completed_at', { ascending: true })
    .limit(20);

  let progressionEvent: Record<string, unknown> | undefined;

  if (recentLogs && recentLogs.length >= 2) {
    const formattedLogs = recentLogs.map((l) => ({
      session_date: (l.completed_at as string).substring(0, 10),
      set_number: l.set_number as number,
      weight: Number(l.weight_kg),
      unit: (l.weight_unit as 'kg' | 'lb') || 'kg',
      reps_completed: l.reps_completed as number,
      actual_rir: l.actual_rir as number | null,
    }));

    const progEvaluation = evaluateDoubleProgression({
      exercise_id: logData.exercise_id,
      required_equipment: ['barbell'],
      prescribed_sets: 3,
      min_reps: 8,
      max_reps: 12,
      target_rir: 2,
      recent_logs: formattedLogs,
    });

    if (progEvaluation.should_increase_load) {
      const { data: insertedEvent } = await adminClient
        .from('workout_progression_events')
        .insert({
          patient_id: patientId,
          workout_program_id: logData.workout_program_id,
          exercise_id: logData.exercise_id,
          event_type: progEvaluation.progression_type === 'unquantified_load_increase' ? 'unquantified_load_increase' : 'load_increase_recommended',
          previous_load_kg: progEvaluation.current_weight,
          recommended_load_kg: progEvaluation.recommended_weight,
          load_unit: progEvaluation.unit,
          rationale: progEvaluation.details,
          is_applied: false,
        })
        .select('*')
        .single();

      if (insertedEvent) {
        progressionEvent = insertedEvent as unknown as Record<string, unknown>;
      }
    }
  }

  return {
    success: true,
    data: {
      logId: insertedLog.id,
      progression_event: progressionEvent,
    },
  };
}

/**
 * Consulta determinística de opções para substituição de exercício.
 */
export async function getExerciseSubstitutionsAction(
  exerciseId: string,
  constraints?: Partial<WorkoutConstraints>
): Promise<ActionResponse<ExerciseSubstitutionOption[]>> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Acesso não autorizado: autenticação requerida.' };
  }

  const adminClient = createAdminClient();

  // Buscar exercício no catálogo
  const { data: dbCatalog } = await adminClient
    .from('exercise_catalog')
    .select('*')
    .eq('is_active', true);

  const catalog: Exercise[] = (dbCatalog && dbCatalog.length > 0)
    ? (dbCatalog as unknown as Exercise[])
    : CURATED_EXERCISE_CATALOG;

  const originalExercise = catalog.find((e) => e.id === exerciseId);
  if (!originalExercise) {
    return { error: 'Exercício não encontrado no catálogo.' };
  }

  const effectiveConstraints: WorkoutConstraints = {
    available_equipment: ['barbell', 'dumbbell', 'cable', 'machine', 'bench', 'pull_up_bar', 'bodyweight'],
    favorite_exercises: [],
    exercises_refused: [],
    movement_contraindications: [],
    ...constraints,
  };

  const options = getExerciseSubstitutionOptions(
    originalExercise,
    effectiveConstraints,
    catalog,
    'intermediate'
  );

  return {
    success: true,
    data: options,
  };
}
