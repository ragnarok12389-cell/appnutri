/**
 * Motor Mestre Determinístico de Treino — AppNutri (ETAPA 7)
 * Versionado, reproduzível, sem IA generativa (WORKOUT_ENGINE_VERSION = '1.0.0').
 * Orquestra filtragem de hard constraints, templates de split, solver multiobjetivo,
 * ordenação contínua versionada e cálculo de hashes criptográficos estáveis.
 * Preserva identidade formal do catálogo e snapshots históricos por exercício.
 */

import {
  WorkoutComposerInput,
  WorkoutComposerResult,
  WorkoutProgram,
  WorkoutProgramDay,
  WorkoutSession,
  WorkoutInfeasibleReasonCode,
  WorkoutGenerationStatus,
  WorkoutApprovalStatus,
} from '@/types/workout-engine';
import {
  WORKOUT_ENGINE_VERSION,
  WORKOUT_CONFIG_VERSION,
} from './config';
import {
  EXERCISE_CATALOG_VERSION,
  EXERCISE_CATALOG_CHECKSUM,
  EXERCISE_CATALOG_PROVENANCE,
} from './catalog';
import { getSplitTemplate } from './split-templates';
import { filterCandidateExercises } from './candidate-filter';
import { solveSessionExercises } from './solver';
import { computeWorkoutInputHash, computeWorkoutOutputHash } from './hash';

export function runWorkoutComposer(input: WorkoutComposerInput): WorkoutComposerResult {
  const infeasibleReasons: WorkoutInfeasibleReasonCode[] = [];

  // 1. Validação de Dados do Perfil
  if (!input.patient_id || !input.objective || !input.experience_level) {
    return {
      success: false,
      generation_status: 'infeasible',
      infeasible_reason_codes: ['INSUFFICIENT_PROFILE_DATA'],
      error_message: 'Dados obrigatórios do perfil de treino estão ausentes.',
    };
  }

  // 2. Validação da Frequência Semanal (2 a 6 dias)
  if (input.sessions_per_week < 2 || input.sessions_per_week > 6) {
    return {
      success: false,
      generation_status: 'infeasible',
      infeasible_reason_codes: ['FREQUENCY_UNSUPPORTED'],
      error_message: 'Frequência semanal não suportada. Deve ser entre 2 e 6 sessões.',
    };
  }

  // 3. Validação de Equipamentos Disponíveis
  if (!input.constraints.available_equipment || input.constraints.available_equipment.length === 0) {
    return {
      success: false,
      generation_status: 'infeasible',
      infeasible_reason_codes: ['INSUFFICIENT_EQUIPMENT'],
      error_message: 'Nenhum equipamento disponível foi informado no inventário do paciente.',
    };
  }

  // 4. SYMPTOM != AUTOMATIC DIAGNOSIS:
  // Condições ou sintomas clínicos não avaliados exigem revisão prévia de profissional habilitado (REVIEW_REQUIRED).
  // O motor não tenta adivinhar ou diagnosticar patologias.
  const criticalConditions = [
    'acute_disc_herniation',
    'severe_cardiovascular_risk',
    'post_surgery_unreleased',
    'severe_spine_fracture',
    'unassessed_clinical_symptoms',
  ];
  const requiresReview =
    Boolean(input.constraints.has_unassessed_clinical_symptoms) ||
    input.constraints.movement_contraindications.some((c) =>
      criticalConditions.includes(c.toLowerCase())
    );

  // 5. Filtragem Eliminatória de Hard Constraints
  const { eligible } = filterCandidateExercises(
    input.catalog,
    input.constraints,
    input.experience_level
  );

  if (eligible.length < 3) {
    infeasibleReasons.push('NO_COMPATIBLE_EXERCISES');
    return {
      success: false,
      generation_status: 'infeasible',
      infeasible_reason_codes: infeasibleReasons,
      error_message: 'Número insuficiente de exercícios compatíveis com os equipamentos e restrições.',
    };
  }

  // 6. Resgate do Template de Divisão Semanal
  const splitTemplate = getSplitTemplate(input.sessions_per_week);
  if (!splitTemplate) {
    return {
      success: false,
      generation_status: 'infeasible',
      infeasible_reason_codes: ['FREQUENCY_UNSUPPORTED'],
      error_message: `Não foi encontrado template de divisão para ${input.sessions_per_week} sessões semanais.`,
    };
  }

  // 7. Determinação de Séries por Exercício
  const setsPerExercise = input.experience_level === 'advanced' ? 4 : 3;

  // 8. Montagem Determinística dos Dias e Sessões
  const programDays: WorkoutProgramDay[] = [];

  for (const dayTemplate of splitTemplate.days) {
    if (dayTemplate.is_rest_day || !dayTemplate.slots || dayTemplate.slots.length === 0) {
      programDays.push({
        day_of_week: dayTemplate.day_of_week,
        day_label: dayTemplate.day_label,
        is_rest_day: true,
        sessions: [],
      });
      continue;
    }

    // Resolver exercícios para a sessão do dia com snapshots históricos
    const prescribedExercises = solveSessionExercises(
      dayTemplate.slots,
      eligible,
      input.constraints,
      input.experience_level,
      input.objective,
      setsPerExercise
    );

    if (prescribedExercises.length === 0) {
      infeasibleReasons.push('NO_COMPATIBLE_EXERCISES');
    }

    const session: WorkoutSession = {
      session_order: 1,
      name: dayTemplate.session_name ?? `Treino ${dayTemplate.day_label}`,
      session_focus: dayTemplate.session_focus ?? 'general',
      estimated_duration_minutes: input.session_duration_minutes ?? 60,
      warmup_protocol: [
        { step: '5 minutos de ativação cardiovascular leve e mobilidade articular dinâmica', duration_seconds: 300 },
        { step: '1 a 2 séries de aquecimento específico com carga progressiva no primeiro exercício', duration_seconds: 180 },
      ],
      cooldown_protocol: [
        { step: '3 minutos de descompressão respiratória e alongamento suave dos grupos solicitados', duration_seconds: 180 },
      ],
      exercises: prescribedExercises,
    };

    programDays.push({
      day_of_week: dayTemplate.day_of_week,
      day_label: dayTemplate.day_label,
      is_rest_day: false,
      sessions: [session],
    });
  }

  if (infeasibleReasons.length > 0) {
    return {
      success: false,
      generation_status: 'infeasible',
      infeasible_reason_codes: infeasibleReasons,
      error_message: 'Não foi possível preencher todas as sessões de treino com os exercícios disponíveis.',
    };
  }

  // 9. Determinar Status de Geração e Aprovação
  const generationStatus: WorkoutGenerationStatus = requiresReview ? 'review_required' : 'calculated';
  const approvalStatus: WorkoutApprovalStatus = requiresReview ? 'draft' : 'approved';

  const generationRef =
    input.generation_reference_at ?? new Date('2026-09-09T00:00:00.000Z').toISOString();

  const catalogVersion = input.catalog_version ?? EXERCISE_CATALOG_VERSION;
  const catalogChecksum = input.catalog_checksum ?? EXERCISE_CATALOG_CHECKSUM;
  const catalogProvenance = input.catalog_provenance ?? EXERCISE_CATALOG_PROVENANCE;

  // 10. Montar o Objeto do Programa
  const program: WorkoutProgram = {
    id: `prog-${input.patient_id}-${input.sessions_per_week}d`,
    patient_id: input.patient_id,
    engine_version: WORKOUT_ENGINE_VERSION,
    config_version: WORKOUT_CONFIG_VERSION,
    catalog_version: catalogVersion,
    catalog_checksum: catalogChecksum,
    catalog_provenance: catalogProvenance,
    source_profile_version: input.source_profile_version ?? 1,
    input_snapshot_hash: '',
    output_program_hash: '',
    objective: input.objective,
    experience_level: input.experience_level,
    sessions_per_week: input.sessions_per_week,
    session_duration_minutes: input.session_duration_minutes ?? 60,
    split_type: splitTemplate.split_type,
    generation_status: generationStatus,
    approval_status: approvalStatus,
    rejection_reason: null,
    infeasible_reason_codes: requiresReview ? ['REVIEW_REQUIRED'] : [],
    version: 1,
    is_active: approvalStatus === 'approved',
    generation_reference_at: generationRef,
    days: programDays,
  };

  // 11. Hashing Determinístico
  program.input_snapshot_hash = computeWorkoutInputHash(input);
  program.output_program_hash = computeWorkoutOutputHash(program);

  return {
    success: true,
    generation_status: generationStatus,
    infeasible_reason_codes: program.infeasible_reason_codes,
    program,
  };
}
