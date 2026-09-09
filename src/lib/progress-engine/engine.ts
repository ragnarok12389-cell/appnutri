import { calculateSha256 } from '@/lib/nutrition-engine/hash';
import {
  AdjustmentProposalDraft,
  PROGRESS_CONFIG_VERSION,
  PROGRESS_ENGINE_VERSION,
  ProgressAnalysisInput,
  ProgressAnalysisResult,
  ProgressCheckIn,
  ProgressReasonCode,
} from '@/types/progress';

function round(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function average(values: Array<number | undefined>): number | null {
  const present = values.filter((value): value is number => value !== undefined);
  if (present.length === 0) return null;
  return round(present.reduce((sum, value) => sum + value, 0) / present.length);
}

function sortCheckIns(checkIns: ProgressCheckIn[]): ProgressCheckIn[] {
  return [...checkIns].sort((left, right) =>
    `${left.check_in_date}:${left.id}`.localeCompare(`${right.check_in_date}:${right.id}`)
  );
}

function canonicalizeInput(input: ProgressAnalysisInput): ProgressAnalysisInput {
  return {
    ...input,
    check_ins: sortCheckIns(input.check_ins),
    workout_session_dates: [...new Set(input.workout_session_dates)].sort(),
    feedback_events: [...input.feedback_events].sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function countFeedback(input: ProgressAnalysisInput, feedbackType: string): number {
  return input.feedback_events.filter((event) => event.feedback_type === feedbackType).length;
}

export function analyzeProgress(rawInput: ProgressAnalysisInput): ProgressAnalysisResult {
  const input = canonicalizeInput(rawInput);
  const inputHash = calculateSha256(input);
  const recentCheckIns = input.check_ins.slice(-3);
  const weightCheckIns = input.check_ins.filter(
    (checkIn): checkIn is ProgressCheckIn & { weight_kg: number } => checkIn.weight_kg !== undefined
  );
  const reasonCodes = new Set<ProgressReasonCode>();
  const proposals: AdjustmentProposalDraft[] = [];

  if (input.check_ins.length < 2) reasonCodes.add('INSUFFICIENT_CHECK_IN_DATA');
  if (weightCheckIns.length >= 2) reasonCodes.add('WEIGHT_TREND_AVAILABLE');

  const averageHunger = average(recentCheckIns.map((checkIn) => checkIn.hunger_level));
  const averageNutritionAdherence = average(
    recentCheckIns.map((checkIn) => checkIn.nutrition_adherence_rating)
  );
  const averageWorkoutAdherence = average(
    recentCheckIns.map((checkIn) => checkIn.workout_adherence_rating)
  );

  if (recentCheckIns.length >= 2 && averageHunger !== null && averageHunger >= 4) {
    reasonCodes.add('RECURRING_HIGH_HUNGER');
    proposals.push({
      domain: 'nutrition',
      proposal_type: 'review_meal_satiety',
      priority: 'medium',
      reason_codes: ['RECURRING_HIGH_HUNGER'],
      summary: 'Revisar saciedade e distribuição das refeições com o nutricionista responsável.',
    });
  }

  if (recentCheckIns.length >= 2 && averageNutritionAdherence !== null && averageNutritionAdherence <= 2.5) {
    reasonCodes.add('LOW_NUTRITION_ADHERENCE');
    proposals.push({
      domain: 'nutrition',
      proposal_type: 'review_nutrition_adherence',
      priority: 'medium',
      reason_codes: ['LOW_NUTRITION_ADHERENCE'],
      summary: 'Revisar barreiras de aderência alimentar sem alterar metas automaticamente.',
    });
  }

  if (recentCheckIns.length >= 2 && averageWorkoutAdherence !== null && averageWorkoutAdherence <= 2.5) {
    reasonCodes.add('LOW_WORKOUT_ADHERENCE');
    proposals.push({
      domain: 'workout',
      proposal_type: 'review_workout_adherence',
      priority: 'medium',
      reason_codes: ['LOW_WORKOUT_ADHERENCE'],
      summary: 'Revisar a viabilidade do programa de treino com profissional habilitado.',
    });
  }

  if (countFeedback(input, 'exercise_discomfort') >= 2) {
    reasonCodes.add('RECURRING_EXERCISE_DISCOMFORT');
    proposals.push({
      domain: 'workout',
      proposal_type: 'review_exercise_discomfort',
      priority: 'high',
      reason_codes: ['RECURRING_EXERCISE_DISCOMFORT'],
      summary: 'Desconforto recorrente requer avaliação por profissional habilitado antes de qualquer ajuste.',
    });
  }

  if (countFeedback(input, 'workout_incomplete') >= 2) {
    reasonCodes.add('RECURRING_INCOMPLETE_WORKOUTS');
    proposals.push({
      domain: 'workout',
      proposal_type: 'review_workout_adherence',
      priority: 'medium',
      reason_codes: ['RECURRING_INCOMPLETE_WORKOUTS'],
      summary: 'Revisar duração e dificuldade do treino com profissional habilitado.',
    });
  }

  if (countFeedback(input, 'schedule_issue') >= 2) {
    reasonCodes.add('RECURRING_SCHEDULE_ISSUES');
    proposals.push({
      domain: 'general',
      proposal_type: 'review_routine_feasibility',
      priority: 'medium',
      reason_codes: ['RECURRING_SCHEDULE_ISSUES'],
      summary: 'Revisar a compatibilidade dos planos com a rotina informada.',
    });
  }

  if (input.check_ins.some((checkIn) => checkIn.concerning_symptoms)) {
    reasonCodes.add('CONCERNING_SYMPTOM_REPORTED');
    proposals.push({
      domain: 'general',
      proposal_type: 'professional_follow_up',
      priority: 'high',
      reason_codes: ['CONCERNING_SYMPTOM_REPORTED'],
      summary: 'O relato requer contato com profissional; o sistema não interpreta nem diagnostica sintomas.',
    });
  }

  const metrics = {
    check_in_count: input.check_ins.length,
    workouts_completed: input.workout_session_dates.length,
    weight_samples: weightCheckIns.length,
    weight_change_kg:
      weightCheckIns.length >= 2
        ? round(weightCheckIns[weightCheckIns.length - 1].weight_kg - weightCheckIns[0].weight_kg)
        : null,
    average_hunger: average(recentCheckIns.map((checkIn) => checkIn.hunger_level)),
    average_energy: average(recentCheckIns.map((checkIn) => checkIn.energy_level)),
    average_sleep_quality: average(recentCheckIns.map((checkIn) => checkIn.sleep_quality)),
    average_nutrition_adherence: averageNutritionAdherence,
    average_workout_adherence: averageWorkoutAdherence,
  };

  const dataQuality: ProgressAnalysisResult['data_quality'] =
    input.check_ins.length >= 3 ? 'sufficient' : input.check_ins.length > 0 ? 'partial' : 'insufficient';
  const outputWithoutHash: Omit<ProgressAnalysisResult, 'output_hash'> = {
    engine_version: PROGRESS_ENGINE_VERSION,
    config_version: PROGRESS_CONFIG_VERSION,
    input_hash: inputHash,
    data_quality: dataQuality,
    metrics,
    reason_codes: [...reasonCodes].sort(),
    proposals,
  };

  return {
    ...outputWithoutHash,
    output_hash: calculateSha256(outputWithoutHash),
  };
}
